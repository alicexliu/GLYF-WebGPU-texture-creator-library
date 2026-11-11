import { Scene } from '../stage/scene';
import { Camera } from '../stage/camera';
import { Stage } from '../stage/stage';

export var canvas: HTMLCanvasElement;
export var canvasFormat: GPUTextureFormat;
export var context: GPUCanvasContext;
export var device: GPUDevice;
export var canvasTextureView: GPUTextureView;

export var aspectRatio: number;
export const fovYDegrees = 45;

export var modelBindGroupLayout: GPUBindGroupLayout;
export var materialBindGroupLayout: GPUBindGroupLayout;

// CHECKITOUT: this function initializes WebGPU and also creates some bind group layouts shared by all the renderers
export async function initWebGPU() {
    canvas = document.getElementById("mainCanvas") as HTMLCanvasElement;
    const canvasPane = document.getElementById("canvasPane")!;

    const resizeCanvas = () => {
        const devicePixelRatio = window.devicePixelRatio || 1;
        const size = Math.min(canvasPane.clientWidth, canvasPane.clientHeight);
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;
        const width = Math.round(size * devicePixelRatio);
        const height = width;

        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        if (height > 0) {
            aspectRatio = width / height;
        }
    };
    resizeCanvas();

    if (!navigator.gpu)
    {
        let errorMessageElement = document.createElement("h1");
        errorMessageElement.textContent = "This browser doesn't support WebGPU! Try using Google Chrome.";
        errorMessageElement.style.paddingLeft = '0.4em';
        document.body.innerHTML = '';
        document.body.appendChild(errorMessageElement);
        throw new Error("WebGPU not supported on this browser");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter)
    {
        throw new Error("no appropriate GPUAdapter found");
    }

    device = await adapter.requestDevice();

    context = canvas.getContext("webgpu")!;
    canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
    });
    new ResizeObserver(resizeCanvas).observe(canvasPane);
    window.addEventListener("resize", resizeCanvas);

    console.log("WebGPU init successsful");

    modelBindGroupLayout = device.createBindGroupLayout({
        label: "model bind group layout",
        entries: [
            { // modelMat
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: { type: "uniform" }
            }
        ]
    });

    materialBindGroupLayout = device.createBindGroupLayout({
        label: "material bind group layout",
        entries: [
            { // diffuseTex
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {}
            },
            { // diffuseTexSampler
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {}
            }
        ]
    });
}

export const vertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 32,
    attributes: [
        { // pos
            format: "float32x3",
            offset: 0,
            shaderLocation: 0
        },
        { // nor
            format: "float32x3",
            offset: 12,
            shaderLocation: 1
        },
        { // uv
            format: "float32x2",
            offset: 24,
            shaderLocation: 2
        }
    ]
};

export abstract class Renderer {
    protected scene: Scene;
    protected camera: Camera;

    protected stats: Stats;

    private prevTime: number = 0;
    private frameRequestId: number;

    // --- performance measurement tracking properties ---
    private sampleFrames = 0;
    private totalGpuMs = 0;
    private isTimingGpu = false;
    private readonly SAMPLE_WINDOW = 500;

    constructor(stage: Stage) {
        this.scene = stage.scene;        this.camera = stage.camera;
        this.stats = stage.stats;

        this.frameRequestId = requestAnimationFrame((t) => this.onFrame(t));
    }

    stop(): void {
        cancelAnimationFrame(this.frameRequestId);
    }

    protected abstract draw(): void;

    // CHECKITOUT: this is the main rendering loop
    private onFrame(time: number) {
        if (this.prevTime == 0) {
            this.prevTime = time;
        }

        let deltaTime = time - this.prevTime;
        this.camera.onFrame(deltaTime);

        this.stats.begin();

        // --- benchmark GPU render time ---
        if (!this.isTimingGpu) {
            this.isTimingGpu = true;
            const startTime = performance.now();

            this.draw();

            device.queue.onSubmittedWorkDone()
                .then(() => {
                    const elapsed = performance.now() - startTime;
                    this.totalGpuMs += elapsed;
                    this.sampleFrames++;

                    if (this.sampleFrames >= this.SAMPLE_WINDOW) {
                        const avgMs = (this.totalGpuMs / this.SAMPLE_WINDOW).toFixed(2);
                        this.totalGpuMs = 0;
                        this.sampleFrames = 0;
                    }
                })
                .catch((err) => {
                    console.error("Benchmark error:", err);
                })
                .finally(() => {
                    this.isTimingGpu = false;
                });
        } else {
            this.draw();
        }

        this.stats.end();

        this.prevTime = time;
        this.frameRequestId = requestAnimationFrame((t) => this.onFrame(t));
    }
}
