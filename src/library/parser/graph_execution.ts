import { nodeDefinitions, NodeType } from "../../definitions";
import { Graph, GraphValue, GraphNode, ExecutionPlan } from "../graph_types";
import { buildNodeShader, packParams, toVec4CPU } from "../node_shader_builder";
import { compileGraph, evaluateUniformNode, getAffectedNodes, getInputChannels, getInputs, getValues, nodeWGSL, selectStaticNodes, topoSort } from "./graph_parser";
import { inputBinding, PARAMS_BINDING, OUTPUT_BINDING, timeBinding } from "../bindings";
import { estimateNodeCost } from "./node_cost";

export class GraphExecution {
    readonly outputs = new Map<string, GPUTexture>();
    private readonly pipelines = new Map<NodeType, GPUComputePipeline>();
    private readonly buffers: GPUBuffer[] = [];
    private readonly allocatedTextures: GPUTexture[] = [];
    private readonly default: GPUTexture;
    private readonly timeBuffer: GPUBuffer;

    private readonly nodeRecords = new Map<number,
                      {pipeline: GPUComputePipeline, bindGroup: GPUBindGroup, paramsBuffer: GPUBuffer}>();

    private plan!: ExecutionPlan;
    private currentTime = 0;
    private readonly textures = new Map<number, GPUTexture[]>();
    private readonly uniformNodes = new Map<number, GraphValue[]>();
    
    private readonly animatedUniformNodes: GraphNode[] = []; // topologically ordered
    private readonly animatedUniformBindings: Array<{
        targetNodeId: number;
        socketIndex: number;
        upstreamNodeId: number;
        upstreamSocket: number;
    }> = [];
    
    private readonly validResults = new Set<number>();
    private cachedNodes = new Set<number>();
    readonly lastScheduledNodes: number[] = [];

    private readonly warmCosts = new Map<number, number>();

    isProfiling = false;
    profileMs = 0;
    lastDispatchCount = 0;

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
        for (const texture of this.allocatedTextures) {
            texture.destroy();
        }
        for (const buf of this.buffers) {
            buf.destroy();
        }
        this.allocatedTextures.length = 0;
        this.buffers.length = 0;
        this.outputs.clear();
        this.pipelines.clear();
        this.nodeRecords.clear();
        this.uniformNodes.clear();
        this.textures.clear();
        this.validResults.clear();
        this.cachedNodes.clear();
        this.lastScheduledNodes.length = 0;
        this.warmCosts.clear();
    }

    // Creates a new output texture on GPU
    private createTexture(width: number, height: number): GPUTexture {
        const texture = this.device.createTexture({
            size: [width, height],
            format: "rgba16float",
            usage: GPUTextureUsage.STORAGE_BINDING | 
                GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC
        });

        this.allocatedTextures.push(texture);
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
        this.plan = compileGraph(graph); // // topo-sorts
        graph = this.plan.graph; 

        const ordered = this.plan.ordered;
        const outputNode = ordered[ordered.length - 1];
        if (!outputNode || outputNode.typeId !== NodeType.Output) {
            throw new Error("Output node invalid");
        }

        const encoder = this.device.createCommandEncoder();
        const textures = this.textures;
        const nDefn = nodeDefinitions[NodeType.Output];
        for (const node of ordered) {
            if (node.typeId == NodeType.Output) {
                const inputs = getInputs(node, textures, this.uniformNodes);
                const values = getValues(node, inputs, this.uniformNodes);
                for (let i = 0; i < nDefn.parameters.length; ++i) {
                    let texture = inputs.get(i);
                    if (!texture) {

                        // setting as default so unconnected output doesnt crash
                        texture = await this.encodeNode(
                            NodeType.Color,
                            [values[i]],
                            new Map<number, GPUTexture>(),
                            encoder,
                            -(i + 1)
                        );
                    }
                    this.outputs.set(nDefn.parameters[i].name, texture);
                }
                continue;
            }
            const def = nodeDefinitions[node.typeId];

            // a node is uniform if:
            // 1. for its node type, canBeUniform === true
            // 2. every connected upstream node is in uniformNodes
            const isUniform = Boolean(def.evaluateUniform || def.evaluateUniformOutputs) &&
                node.connections.every(c => this.uniformNodes.has(c.upstreamNodeId));

            if (isUniform) {
                const val = evaluateUniformNode(node, this.uniformNodes, 0);
                this.uniformNodes.set(node.id, val);
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
        }

        this.device.queue.submit([encoder.finish()]);
        await this.device.queue.onSubmittedWorkDone();

        this.lastDispatchCount = this.nodeRecords.size;
        this.cachedNodes = selectStaticNodes(this.plan);

        for (const node of ordered) {
            this.validResults.add(node.id);
            this.lastScheduledNodes.push(node.id);
        }
    }


    // Updates time and invalidates animated results from the cache
    updateTime(
        encoder: GPUCommandEncoder,
        time: number,
    ) {
        this.lastDispatchCount = 0;
        if (time !== this.currentTime) {
            this.currentTime = time;

            if (this.plan.timeDependentNodes.size > 0) {
                // write time to buffer
                this.setTime(time);
                for (const id of this.plan.timeDependentNodes) {
                    this.validResults.delete(id);
                }
            }
        }

        const validCachedNodes = new Set<number>();
         for (const id of this.validResults) {
            // Want to add the final output node
            if (this.cachedNodes.has(id) ||
                id === this.plan.graph.outputNodeId) {
                validCachedNodes.add(id);
            }
        }
        
        const scheduled = topoSort(this.plan.graph, validCachedNodes);
        this.lastScheduledNodes.length = 0;

        for (const node of scheduled) {
            if (this.uniformNodes.has(node.id)) {
                this.uniformNodes.set(
                    node.id, evaluateUniformNode(node, this.uniformNodes, time)
                );
            } else {
                const inputs = getInputs(node, this.textures, this.uniformNodes);
                const values = getValues(node, inputs, this.uniformNodes);

                if (node.typeId === NodeType.Output) {
                    const def = nodeDefinitions[NodeType.Output];

                    for (let i = 0; i < def.parameters.length; ++i) {
                        const fallbackId = -(i + 1);

                        if (this.nodeRecords.has(fallbackId)) {
                            this.encodePreparedNode(
                                encoder,
                                fallbackId,
                                NodeType.Color,
                                [values[i]],
                                new Map()
                            );
                        }
                    }
                } else {
                    this.encodePreparedNode(
                        encoder,
                        node.id,
                        node.typeId,
                        values,
                        inputs,
                        getInputChannels(node, this.plan.graph.nodes)
                    );
                }
            }

            this.validResults.add(node.id);
            this.lastScheduledNodes.push(node.id);
        }
    }

    // helper to set cache set
    setCachedNodes(nodes: ReadonlySet<number> = selectStaticNodes(this.plan)): void {
        this.cachedNodes = new Set(nodes);
    }

    // Applies parameter edits, or returns false when a rebuild is required
    updateGraph(graph: Graph): boolean {
        const previous = this.plan.graph;

        if (graph.outputNodeId !== previous.outputNodeId ||
            graph.nodes.length !== previous.nodes.length) {
            return false;
        }

        for (let i = 0; i < graph.nodes.length; ++i) {
            const a = previous.nodes[i];
            const b = graph.nodes[i];

            if (a.id !== b.id || a.typeId !== b.typeId ||
                JSON.stringify(a.connections) !== JSON.stringify(b.connections)) {
                return false;
            }
        }

        const snapshot = structuredClone(graph);
        const changed: number[] = [];

        for (let i = 0; i < snapshot.nodes.length; ++i) {
            const a = previous.nodes[i];
            const b = snapshot.nodes[i];

            if (JSON.stringify(a.parameters) !== JSON.stringify(b.parameters)) {
                a.parameters = b.parameters;
                changed.push(a.id);
            }
        }

        for (const id of getAffectedNodes(this.plan, changed)) {
            this.validResults.delete(id);
            this.warmCosts.delete(id);
        }

        return true;
    }

    // Writes updated parameters to GPU and dispatch new pass 
    // for compute of the given node
    private encodePreparedNode(
        encoder: GPUCommandEncoder,
        id: number,
        type: NodeType,
        values: (GraphValue | undefined)[],
        inputs: Map<number, GPUTexture>,
        inputChannels: number[] = []
    ): void {
        ++this.lastDispatchCount;
        const record = this.nodeRecords.get(id)!;
        const def = nodeDefinitions[type];
        const connected: boolean[] = [];

        for (let i = 0; i < def.parameters.length; ++i) {
            connected.push(inputs.has(i));
        }

        this.device.queue.writeBuffer(
            record.paramsBuffer, 0,
            packParams(def, values, connected, inputChannels)
        );

        const pass = encoder.beginComputePass();
        pass.setPipeline(record.pipeline);
        pass.setBindGroup(0, record.bindGroup);
        pass.dispatchWorkgroups(
            Math.ceil(this.width / 8),
            Math.ceil(this.height / 8)
        );
        pass.end();
    }

    // Methods/helpers for node costs

    // Reports node costs and the most recent evaluation state
    getNodeCosts() {
        const rows = [];
        const scheduled = new Set(this.lastScheduledNodes);

        for (const node of this.plan.ordered) {
            let imageCount = new Set(
                this.textures.get(node.id) ?? []).size;

            if (node.typeId === NodeType.Output) {
                const def = nodeDefinitions[NodeType.Output];

                for (let i = 0; i < def.parameters.length; ++i) {
                    if (this.nodeRecords.has(-(i + 1))) {
                        ++imageCount;
                    }
                }
            }

            const uniform = this.uniformNodes.has(node.id);
            let state = "Skipped";

            if (scheduled.has(node.id)) {
                state = uniform ? "CPU evaluated" : imageCount > 0 ? 
                    "GPU executed" : "Output bound";
            } else if (
                this.validResults.has(node.id) &&
                (this.cachedNodes.has(node.id) || node.typeId === NodeType.Output)
            ) {
                state = "Cached";
            }

            rows.push({
                id: node.id,
                name: nodeDefinitions[node.typeId].name,
                dynamic: this.plan.timeDependentNodes.has(node.id),
                state,
                ...estimateNodeCost(
                    this.width,
                    this.height,
                    imageCount,
                    this.warmCosts.get(node.id)
                ),
            });
        }

        return rows;
    }

    // Rets allocated image bytes (includes defaults and output)
    get allocatedImageBytes(): number {
        return this.allocatedTextures.length * this.width * this.height * 8;
    }

    // Measures costs for each node
    // Some evaluated on CPU evaluators some GPU like FBM
    async profileNodeCosts(): Promise<void> {
        if (this.isProfiling) {
            return;
        }
        this.isProfiling = true;
        const started = performance.now();

        try {
            // Finish pending edits and drain previously submitted work
            const pending = this.device.createCommandEncoder();
            this.updateTime(pending, this.currentTime);
            this.device.queue.submit([pending.finish()]);
            await this.device.queue.onSubmittedWorkDone();

            this.warmCosts.clear();

            for (const node of this.plan.ordered) {
                if (this.uniformNodes.has(node.id)) {
                    let value = this.uniformNodes.get(node.id)!;
                    const start = performance.now();

                    for (let i = 0; i < 2048; ++i) {
                        value = evaluateUniformNode(node, 
                            this.uniformNodes, this.currentTime);
                    }

                    this.warmCosts.set(node.id, 
                        (performance.now() - start) / 2048);
                    this.uniformNodes.set(node.id, value);
                } else if (node.typeId === NodeType.Output) {
                    this.warmCosts.set(node.id, 0);
                }
            }

            for (const [id, record] of this.nodeRecords) {
                const encoder = this.device.createCommandEncoder();
                const pass = encoder.beginComputePass();

                pass.setPipeline(record.pipeline);
                pass.setBindGroup(0, record.bindGroup);

                for (let i = 0; i < 16; ++i) {
                    pass.dispatchWorkgroups(
                        Math.ceil(this.width / 8),
                        Math.ceil(this.height / 8)
                    );
                }

                pass.end();

                const commands = encoder.finish();
                const start = performance.now();
                this.device.queue.submit([commands]);
                await this.device.queue.onSubmittedWorkDone();

                const nodeId = id < 0 ? this.plan.graph.outputNodeId : id;
                const ms = (performance.now() - start) / 16;

                this.warmCosts.set(
                    nodeId,
                    (this.warmCosts.get(nodeId) ?? 0) + ms
                );
            }
        } finally {
            this.profileMs = performance.now() - started;
            this.isProfiling = false;
        }
    }
}