import { nodeDefinitions, NodeType } from "../../definitions";
import { Graph, GraphValue, GraphNode } from "../graph_types";
import { asFloat, buildNodeShader, packParams, toVec4CPU } from "../node_shader_builder";
import { evaluateUniformNode, getInputChannels, getInputs, getValues, nodeWGSL, topoSort } from "./graph_parser";
import { inputBinding, PARAMS_BINDING, OUTPUT_BINDING, timeBinding } from "../bindings";

export class GraphExecution {
    readonly outputs = new Map<string, GPUTexture>();
    readonly nodePreviews = new Map<number, GPUTexture>();
    readonly textures: GPUTexture[] = [];
    private readonly pipelines = new Map<NodeType, GPUComputePipeline>();
    private readonly buffers: GPUBuffer[] = [];
    private readonly default: GPUTexture;
    private readonly timeBuffer: GPUBuffer;

    private readonly nodeRecords = new Map<number,
                      {pipeline: GPUComputePipeline, bindGroup: GPUBindGroup, paramsBuffer: GPUBuffer}>();

    private readonly animatedNodes = new Set<number>();
    private readonly animatedPreviewNodes = new Map<number, number>();
    private readonly outputPreviewNodeIds = new Set<number>();

    private readonly uniformNodes = new Map<number, GraphValue[]>();
    private readonly animatedUniformNodes: GraphNode[] = []; // topologically ordered
    private readonly animatedUniformBindings: Array<{
        targetNodeId: number;
        socketIndex: number;
        upstreamNodeId: number;
        upstreamSocket: number;
    }> = [];
    

    private constructor(
        private readonly device: GPUDevice,
        private readonly width: number,
        private readonly height: number
    ) {
        this.default = this.createTexture(width, height);
        this.timeBuffer = this.device.createBuffer({
            size: 4,//f32
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        this.buffers.push(this.timeBuffer);
    }

    // Takes in a Graph and executes it on GPU
    // returns a handler to get albedo
    static async create(
        device: GPUDevice,
        graph: Graph,
        width = 512,
        height = 512
    ): Promise<GraphExecution> {
        if (
            !Number.isInteger(width) || !Number.isInteger(height) || 
            width < 1 || height < 1 || width > device.limits.maxTextureDimension2D || height > device.limits.maxTextureDimension2D) {
                throw new Error(`Invalid dimensions for texture`);
            }

            const nodeIds = new Set<number>();
            for (const node of graph.nodes) {
                if (nodeIds.has(node.id)) {
                    throw new Error(`Invalid graph, node ${node.id} is duplicated`);
                }
                nodeIds.add(node.id);
            }

            const execution = new GraphExecution(device, width, height);

            try {
                await execution.run(graph);
                return execution;
            } catch (e) {
                execution.destroy();
                throw e;
            }
    }

    setTime(seconds: number) {
        this.device.queue.writeBuffer(this.timeBuffer, 0, new Float32Array([seconds]));
    }

    destroy(): void {
        for (const texture of this.textures) {
            texture.destroy();
        }
        for (const buf of this.buffers) {
            buf.destroy();
        }
        this.textures.length = 0;
        this.buffers.length = 0;
        this.outputs.clear();
        this.nodePreviews.clear();
        this.pipelines.clear();
        this.nodeRecords.clear();
        this.animatedNodes.clear();
        this.animatedPreviewNodes.clear();
        this.outputPreviewNodeIds.clear();
        this.uniformNodes.clear();
        this.animatedUniformNodes.length = 0;
        this.animatedUniformBindings.length = 0;
    }

    // Creates a new output texture on GPU
    private createTexture(width: number, height: number): GPUTexture {
        const texture = this.device.createTexture({
            size: [width, height],
            format: "rgba16float",
            usage: GPUTextureUsage.STORAGE_BINDING | 
                GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC
        });

        this.textures.push(texture);
        return texture;
    }

    // Helper to return existing compute pipeline, or creates a new one for given node type
    private async getPipeline(type: NodeType): Promise<GPUComputePipeline> {
        if (type == NodeType.Output) {
            throw new Error("Output node does not have an associated compute shader");
        }
        let pipeline = this.pipelines.get(type);
        if (pipeline) {
            return pipeline;
        }

        pipeline = await this.device.createComputePipelineAsync({
            layout: "auto",
            compute: {
                module: this.device.createShaderModule({
                    code: buildNodeShader(
                        nodeDefinitions[type],
                        nodeWGSL[type].source
                    )
                })
            }
        });

        this.pipelines.set(type, pipeline);
        return pipeline;
    }

    // Upload params and binds textures for each node to GPU
    private async encodeNode(
        type: NodeType,
        values: (GraphValue | undefined)[],
        inputs: Map<number, GPUTexture>,
        encoder: GPUCommandEncoder,
        nodeID?: number, // doesnt exist for output fallback
        inputChannels: number[] = []
    ) {
        const pipeline = await this.getPipeline(type);
        const def = nodeDefinitions[type];
        const output = this.createTexture(this.width, this.height);
        const connected = []
        for (let i = 0; i < def.parameters.length; ++i) {
            connected.push(inputs.has(i));
        }
    
        const data = packParams(def, values, connected, inputChannels);
        const buffer = this.device.createBuffer({
            size: data.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // params(0) and output tex(1)
        this.buffers.push(buffer);
        this.device.queue.writeBuffer(buffer, 0, data);
        const entries:GPUBindGroupEntry[] = [
            {binding: PARAMS_BINDING, resource: {buffer}},
            {binding: OUTPUT_BINDING, resource: output.createView()}
        ];

        // input tex(2,3...)
        for (let i = 0; i < def.parameters.length; ++i) {
            if (def.parameters[i].socket) {
                const input = inputs.get(i) ?? this.default;
                entries.push({binding: inputBinding(i), resource: input.createView()});
            }
        }

        // time (last)
        if (def.useUTime) {
            // this.device.queue.writeBuffer(this.timeBuffer, 0, new Float32Array(0)); // temp
            entries.push({binding: timeBinding(def), resource: {buffer: this.timeBuffer}});
        }

        const bindGroup = this.device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries
        });

        // store the node data 
        if (nodeID !== undefined) {
            this.nodeRecords.set(nodeID, {pipeline, bindGroup, paramsBuffer: buffer});
        }

        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(Math.ceil(this.width / 8), Math.ceil(this.height / 8));
        pass.end();

        return output;
    }

    // Execute each node in dependency order and collect the final output texture
    private async run(graph: Graph): Promise<void> {
        const ordered = topoSort(graph);
        if (!ordered.some(node => node.id === graph.outputNodeId && node.typeId === NodeType.Output)) {
            throw new Error("Output node invalid");
        }

        const encoder = this.device.createCommandEncoder();
        const textures = new Map<number, GPUTexture[]>();
        const nDefn = nodeDefinitions[NodeType.Output];
        for (const node of ordered) {
            if (node.typeId == NodeType.Output) {
                const inputs = getInputs(node, textures, this.uniformNodes);
                const values = getValues(node, inputs, this.uniformNodes);
                for (let i = 0; i < nDefn.parameters.length; ++i) {
                    let texture = inputs.get(i);
                    if (!texture) {
                        const syntheticId = -(i + 1);
                        const conn = node.connections.find(c => c.inputSocket === i);
                        const isOutputAnimated = conn !== undefined &&
                            this.animatedUniformNodes.some(u => u.id === conn.upstreamNodeId);

                        // setting as default so unconnected output doesnt crash
                        texture = await this.encodeNode(
                            NodeType.Color,
                            [values[i]],
                            new Map<number, GPUTexture>(),
                            encoder,
                            isOutputAnimated ? syntheticId : undefined
                        );

                        if (isOutputAnimated && conn) {
                            this.animatedUniformBindings.push({
                                targetNodeId: syntheticId,
                                socketIndex: 0,
                                upstreamNodeId: conn.upstreamNodeId,
                                upstreamSocket: conn.upstreamSocket,
                            });
                            this.animatedNodes.add(syntheticId);
                        }
                    }
                    this.outputs.set(nDefn.parameters[i].name, texture);
                }
                const albedo = this.outputs.get("albedo");
                if (!albedo) {
                    throw new Error("Missing albedo output texture");
                }
                this.nodePreviews.set(node.id, albedo);
                this.outputPreviewNodeIds.add(node.id);
                continue;
            }
            const def = nodeDefinitions[node.typeId];

            // a node is uniform if:
            // 1. for its node type, canBeUniform === true
            // 2. every connected upstream node is in uniformNodes
            const isUniform = Boolean(def.evaluateUniform || def.evaluateUniformOutputs) &&
                node.connections.every(c => this.uniformNodes.has(c.upstreamNodeId));

            const isAnimated = def.useUTime ||
                node.connections.some(c => this.animatedNodes.has(c.upstreamNodeId) ||
                this.animatedUniformNodes.some(u => u.id === c.upstreamNodeId)
            );

            if (isUniform) {
                const val = evaluateUniformNode(node, this.uniformNodes, 0);
                this.uniformNodes.set(node.id, val);
                const previewValue: GraphValue = def.packedOutputType
                    ? val.map(asFloat)
                    : val[0];
                if (previewValue === undefined) {
                    throw new Error(`Missing preview output for node ${node.id}`);
                }
                const previewRecordId = -(node.id + 3);
                const previewTexture = await this.encodeNode(
                    NodeType.Color,
                    [previewValue],
                    new Map<number, GPUTexture>(),
                    encoder,
                    previewRecordId
                );
                this.nodePreviews.set(node.id, previewTexture);
                if (isAnimated) {
                    this.animatedUniformNodes.push(node);
                    this.animatedNodes.add(previewRecordId);
                    this.animatedPreviewNodes.set(previewRecordId, node.id);
                }
                continue;
            }
            
            // GPU texture nodes
            const inputs = getInputs(node, textures, this.uniformNodes);
            const values = getValues(node, inputs, this.uniformNodes);

            const texture = await this.encodeNode(
                node.typeId,
                values,
                inputs,
                encoder, 
                node.id, // to store in nodeRecords!
                getInputChannels(node, graph.nodes)
            );

            for (const conn of node.connections) {
                if (this.animatedUniformNodes.some(u => u.id === conn.upstreamNodeId)) {
                    this.animatedUniformBindings.push({
                        targetNodeId: node.id,
                        socketIndex: conn.inputSocket,
                        upstreamNodeId: conn.upstreamNodeId,
                        upstreamSocket: conn.upstreamSocket,
                    });
                }
            }

            // add to animated nodes
            if (isAnimated) {
                this.animatedNodes.add(node.id);
            }
                
            if (!texture) {
                throw new Error(`Error creating texture`);
            }

            if (def.outputs.length > 1 && !def.packedOutputType) {
                throw new Error(`${def.name} has multiple outputs but no packed output format`);
            }
            textures.set(
                node.id,
                def.packedOutputType
                    ? def.outputs.map(() => texture)
                    : [texture]
            );
            this.nodePreviews.set(node.id, texture);
        }

        this.device.queue.submit([encoder.finish()]);
        await this.device.queue.onSubmittedWorkDone();
    }


    updateTime(
        encoder: GPUCommandEncoder,
        time: number,
    ): Set<number> {
        const updatedPreviewIds = new Set<number>();
        if (this.animatedNodes.size === 0 && this.animatedUniformNodes.length === 0) {
            return updatedPreviewIds;
        }

        // write time to buffer
        this.setTime(time);

        // re eval animated uniform nodes on CPU + give to GPU
        for (const uNode of this.animatedUniformNodes) {
            const val = evaluateUniformNode(uNode, this.uniformNodes, time);
            this.uniformNodes.set(uNode.id, val);
        }

        for (const [previewRecordId, nodeId] of this.animatedPreviewNodes) {
            const node = this.animatedUniformNodes.find(candidate => candidate.id === nodeId);
            if (!node) {
                throw new Error(`Missing animated preview node ${nodeId}`);
            }
            const def = nodeDefinitions[node.typeId];
            const values = this.uniformNodes.get(nodeId);
            if (!values) {
                throw new Error(`Missing animated uniform output for node ${nodeId}`);
            }
            const previewValue: GraphValue = def.packedOutputType
                ? values.map(asFloat)
                : values[0];
            if (previewValue === undefined) {
                throw new Error(`Missing animated preview output for node ${nodeId}`);
            }
            const record = this.nodeRecords.get(previewRecordId);
            if (!record) {
                throw new Error(`Missing preview GPU record for node ${nodeId}`);
            }
            this.device.queue.writeBuffer(
                record.paramsBuffer,
                0,
                new Float32Array(toVec4CPU(previewValue))
            );
            updatedPreviewIds.add(nodeId);
        }

        for (const binding of this.animatedUniformBindings) {
            const record = this.nodeRecords.get(binding.targetNodeId)!;
            const val = this.uniformNodes.get(binding.upstreamNodeId)?.[binding.upstreamSocket];
            if (val === undefined) {
                throw new Error(`Missing animated uniform output ${binding.upstreamSocket} from node ${binding.upstreamNodeId}`);
            }
            const packedVec4 = new Float32Array(toVec4CPU(val));
            this.device.queue.writeBuffer(record.paramsBuffer, binding.socketIndex * 16, packedVec4);
            if (binding.targetNodeId >= 0) {
                updatedPreviewIds.add(binding.targetNodeId);
            }
        }

        if (this.animatedNodes.size > 0) {
            const pass = encoder.beginComputePass();
            for (const nodeId of this.animatedNodes) {
                const n = this.nodeRecords.get(nodeId)!;
                pass.setPipeline(n.pipeline);
                pass.setBindGroup(0, n.bindGroup);
                pass.dispatchWorkgroups(Math.ceil(this.width / 8), Math.ceil(this.height / 8));
                
            }
            pass.end();
        }
        for (const nodeId of this.outputPreviewNodeIds) {
            updatedPreviewIds.add(nodeId);
        }
        for (const nodeId of this.animatedNodes) {
            const previewNodeId = this.animatedPreviewNodes.get(nodeId);
            updatedPreviewIds.add(previewNodeId ?? nodeId);
        }
        return updatedPreviewIds;
    }
}