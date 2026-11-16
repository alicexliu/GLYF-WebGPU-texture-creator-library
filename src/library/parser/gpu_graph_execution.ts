import { Graph } from "../graph_types";
import interpreterWGSL from "../node_shaders/gpu.insn.cs.wgsl?raw";
import schedulerWGSL from "../node_shaders/gpu.schedule.cs.wgsl?raw";
import { packGPUGraph } from "./pack_gpu_graph";

export class GPUGraphExecution {
    readonly outputs = new Map<string, GPUTexture>();
    readonly textures: GPUTexture[] = [];
    private readonly buffers: GPUBuffer[] = [];

    private constructor(
        private readonly device: GPUDevice,
        private readonly width: number,
        private readonly height: number
    ) {
    }

    // Takes in a Graph and executes it on GPU
    // returns a handler to get albedo
    static async create(
        device: GPUDevice,
        graph: Graph,
        width = 512,
        height = 512
    ): Promise<GPUGraphExecution> {
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

            const execution = new GPUGraphExecution(device, width, height);

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
    }

    private createBuffer(
        size: number,
        usage: GPUBufferUsageFlags,
        data?: Uint32Array
    ): GPUBuffer {
        size = Math.max(size, 4);
        if (size > this.device.limits.maxBufferSize ||
            ((usage & GPUBufferUsage.STORAGE) !== 0 && size > this.device.limits.maxStorageBufferBindingSize)
        ) {
                throw new Error(`GPU buffer exceeds device limits`);
        }
        const buffer = this.device.createBuffer({
            size,
            usage,
            mappedAtCreation: data != undefined
        });

        this.buffers.push(buffer);
        if (data != undefined) {
            new Uint32Array(buffer.getMappedRange()).set(data);
            buffer.unmap();
        }
        return buffer;
    }

    private createTexture():GPUTexture {
        const texture = this.device.createTexture({
            size: [this.width, this.height],
            format: "rgba16float",
            usage: GPUTextureUsage.STORAGE_BINDING | 
                GPUTextureUsage.TEXTURE_BINDING | 
                GPUTextureUsage.COPY_SRC
        });

        this.textures.push(texture);
        return texture;
    }

    private packAndGenBufs(graph: Graph) {
        const packed = packGPUGraph(graph);
        const instructionBuffer = this.createBuffer(
            packed.insns.byteLength,
            GPUBufferUsage.STORAGE,
            packed.insns
        );

        const inputBuffer = this.createBuffer(
            packed.inputIndices.byteLength,
            GPUBufferUsage.STORAGE,
            packed.inputIndices
        );

        const parameterBuffer = this.createBuffer(
            packed.parameters.byteLength,
            GPUBufferUsage.STORAGE,
            packed.parameters
        );

        const stateBuffer = this.createBuffer(
            packed.nodeCount * 4,
            GPUBufferUsage.STORAGE
        );

        const info = new Uint32Array([
            this.width,
            this.height,
            packed.nodeCount,
            packed.outputIndex
        ]);

        const infoBuffer = this.createBuffer(
            info.byteLength,
            GPUBufferUsage.UNIFORM,
            info
        );

        const intermediateBuffer = this.createBuffer(
            packed.nodeCount * this.width * this.height * 8,
            GPUBufferUsage.STORAGE
        );

        const queue = new Uint32Array(3 + packed.nodeCount);
        queue[0] = Math.ceil(this.width / 8);
        queue[1] = Math.ceil(this.height / 8);
        queue[2] = 0;

        const queueBuffer = this.createBuffer(
            queue.byteLength,
            GPUBufferUsage.STORAGE |
            GPUBufferUsage.INDIRECT |
            GPUBufferUsage.COPY_DST,
            queue
        );

        const albedo = this.createTexture();
        const normal = this.createTexture();
        this.outputs.set("albedo", albedo);
        this.outputs.set("normal", normal);

        return {
            nodeCount: packed.nodeCount,
            instructionBuffer,
            inputBuffer,
            parameterBuffer,
            infoBuffer,
            intermediateBuffer,
            queueBuffer,
            albedo,
            normal,
            stateBuffer
        };
    }

    static dispatch(
        pipeline: GPUComputePipeline,
        bindGroup: GPUBindGroup,
        encoder: GPUCommandEncoder,
        x: number,
        y = 1,
        z = 1
    ): void {
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(x, y, z);
        pass.end();
    };

    // Execute each node in dependency order and collect the final output texture
    private async run(graph: Graph): Promise<void> {
        // create gpu buffers from the graph 
        const r = this.packAndGenBufs(graph);

        if (r.nodeCount > this.device.limits.maxComputeWorkgroupsPerDimension) {
            throw new Error("Graph exceeds the initial scheduler's node limit");
        }

        // load or create gpu pipelines
        let pending = pipelineCache.get(this.device);

        if (!pending) {
            pending = createGraphPipelines(this.device);
            pipelineCache.set(this.device, pending);
        }

        const p = await pending;

        const bufferEntries = (buffers: GPUBuffer[]): GPUBindGroupEntry[] =>
            buffers.map((buffer, binding) => ({
                binding,
                resource: { buffer },
            }));

        // connect gpu shaders to buffers
        const schedulerGroup = this.device.createBindGroup({
            layout: p.schedulerLayout,
            entries: bufferEntries([
                r.instructionBuffer,
                r.inputBuffer,
                r.infoBuffer,
                r.stateBuffer,
                r.queueBuffer,
            ]),
        });

        const commonBuffers = [
            r.instructionBuffer,
            r.inputBuffer,
            r.parameterBuffer,
            r.infoBuffer,
            r.intermediateBuffer,
        ];

        const interpreterGroup = this.device.createBindGroup({
            layout: p.interpreter.getBindGroupLayout(0),
            entries: bufferEntries([
                ...commonBuffers,
                r.queueBuffer,
            ]),
        });

        const outputGroup = this.device.createBindGroup({
            layout: p.outputs.getBindGroupLayout(0),
            entries: [
                ...bufferEntries(commonBuffers),
                { binding: 6, resource: r.albedo.createView() },
                { binding: 7, resource: r.normal.createView() },
            ],
        });

        const encoder = this.device.createCommandEncoder();
        const nodeGroups = Math.ceil(r.nodeCount / 64);

        GPUGraphExecution.dispatch(p.seed, schedulerGroup, encoder, 1);

        for (let round = 0; round < r.nodeCount; round++) {
            GPUGraphExecution.dispatch(p.propagate, schedulerGroup, encoder, nodeGroups);
        }

        for (let round = 0; round < r.nodeCount; round++) {
            encoder.clearBuffer(r.queueBuffer, 8, 4);

            GPUGraphExecution.dispatch(p.ready, schedulerGroup, encoder, nodeGroups);

            const pass = encoder.beginComputePass();
            pass.setPipeline(p.interpreter);
            pass.setBindGroup(0, interpreterGroup);
            pass.dispatchWorkgroupsIndirect(r.queueBuffer, 0);
            pass.end();

            GPUGraphExecution.dispatch(
                p.complete, schedulerGroup, encoder, nodeGroups
            );
        }

        GPUGraphExecution.dispatch(
            p.outputs, outputGroup, encoder,
            Math.ceil(this.width / 8), Math.ceil(this.height / 8)
        );

        this.device.queue.submit([encoder.finish()]);
    }
}

export async function createInterpreterPipeline(device: GPUDevice) {
    const module = device.createShaderModule({
        label: "GLYF GPU interpreter",
        code: interpreterWGSL
    });

    const info = await module.getCompilationInfo();

    for (const msg of info.messages) {
        console.log(msg.message);
    }

    if (info.messages.some(message => message.type === "error")) {
        throw new Error("GPU Interpreter shader compilation failed");
    }

    return device.createComputePipelineAsync({
        layout: "auto",
        compute: {
            module,
            entryPoint: "main"
        }
    });
}

const pipelineCache = new WeakMap<
GPUDevice, ReturnType<typeof createGraphPipelines>
>();

// Create gpu compute pipelines. 
// Will be cached in pipelineCache for reusing
//
// 1. seed: starts from the output node
// 2. propagate: finds upstream dependencies
// 3. ready: finds nodes whose inputs are complete
// 4. interpreter: evaluates graph nodes
// 5. complete: evaluated nodes as done
// 6. outputs: writes final values to textures
async function createGraphPipelines(device: GPUDevice) {
    const schedulerModule = device.createShaderModule({
        code: schedulerWGSL,
    });
    const interpreterModule = device.createShaderModule({
        code: interpreterWGSL,
    });

    const types: GPUBufferBindingType[] = [
        "read-only-storage",
        "read-only-storage",
        "uniform",
        "storage",
        "storage",
    ];

    const schedulerLayout = device.createBindGroupLayout({
        entries: types.map((type, binding) => ({
            binding,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type },
        })),
    });

    const schedulerPipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [schedulerLayout],
    });

    const make = (
        module: GPUShaderModule, entryPoint: string,
        layout: GPUPipelineLayout | "auto" = "auto"
    ) => device.createComputePipelineAsync({
        layout, compute: { module, entryPoint },
    });

    const [seed, propagate, ready, complete, interpreter, outputs] =
        await Promise.all([
            ...["seedReachability",
                "propagateReachability",
                "buildReadyQueue",
                "markCompleted",
            ].map(name => make(schedulerModule, name, schedulerPipelineLayout)
            ),
            make(interpreterModule, "main"),
            make(interpreterModule, "outputs"),
        ]);

    return {
        schedulerLayout,
        seed,
        propagate,
        ready,
        complete,
        interpreter,
        outputs,
    };
}