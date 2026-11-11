import { nodeDefinitions, NodeType } from "../../definitions";
import { Graph, GraphValue } from "../graph_types";
import { buildNodeShader, packParams } from "../node_shader_builder";
import { getInputs, getValues, nodeWGSL, topoSort } from "./graph_parser";

export class GraphExecution {
    readonly outputs = new Map<string, GPUTexture>();
    readonly textures: GPUTexture[] = [];
    private readonly pipelines = new Map<NodeType, GPUComputePipeline>();
    private readonly buffers: GPUBuffer[] = [];
    private readonly default: GPUTexture;

    private constructor(
        private readonly device: GPUDevice,
        private readonly width: number,
        private readonly height: number
    ) {
        this.default = this.createTexture(width, height);
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
        this.pipelines.clear();
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
        encoder: GPUCommandEncoder
    ) {
        const pipeline = await this.getPipeline(type);
        const def = nodeDefinitions[type];
        const output = this.createTexture(this.width, this.height);
        const connected = []
        for (let i = 0; i < def.parameters.length; ++i) {
            connected.push(inputs.has(i));
        }

        const data = packParams(def, values, connected);
        const buffer = this.device.createBuffer({
            size: data.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.buffers.push(buffer);
        this.device.queue.writeBuffer(buffer, 0, data);
        const entries:GPUBindGroupEntry[] = [
            {binding: 0, resource: {buffer}},
            {binding: 1, resource: output.createView()}
        ];

        for (let i = 0; i < def.parameters.length; ++i) {
            if (def.parameters[i].socket) {
                const input = inputs.get(i) ?? this.default;
                entries.push({binding: 2 + i, resource: input.createView()});
            }
        }

        const bindGroup = this.device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries
        });

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
        const outputNode = ordered[ordered.length - 1];
        if (!outputNode || outputNode.typeId !== NodeType.Output) {
            throw new Error("Output node invalid");
        }

        const encoder = this.device.createCommandEncoder();
        const textures = new Map<number, GPUTexture>();
        const nDefn = nodeDefinitions[NodeType.Output];
        for (const node of ordered) {
            const inputs = getInputs(node, textures);
            const values = getValues(node, inputs);
            if (node.typeId == NodeType.Output) {
                for (let i = 0; i < nDefn.parameters.length; ++i) {
                    let texture = inputs.get(i);
                    if (!texture) {
                        // setting as default so unconnected output doesnt crash
                        texture = await this.encodeNode(
                            NodeType.Color,
                            [values[i]],
                            new Map<number, GPUTexture>(),
                            encoder
                        );
                    }
                    this.outputs.set(nDefn.parameters[i].name, texture);
                }
            } else {
                const texture = await this.encodeNode(
                    node.typeId,
                    values,
                    inputs,
                    encoder
                );

                if (!texture) {
                    throw new Error(`Error creating texture`);
                }

                textures.set(node.id, texture);
            }
        }

        this.device.queue.submit([encoder.finish()]);
        await this.device.queue.onSubmittedWorkDone();
    }
}