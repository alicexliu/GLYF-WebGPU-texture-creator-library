import { createElement, useEffect, useRef } from "react";
import { displayFragSrc, fullscreenVertSrc } from "../shaders/shaders";

const previewSize = 128;
const previews = new Map<number, GPUTexture>();
const canvases = new Map<number, Set<HTMLCanvasElement>>();
const contexts = new WeakMap<HTMLCanvasElement, GPUCanvasContext>();

let previewDevice: GPUDevice | undefined;
let previewFormat: GPUTextureFormat | undefined;
let previewPipeline: GPURenderPipeline | undefined;
let previewLayout: GPUBindGroupLayout | undefined;
let previewSampler: GPUSampler | undefined;

function ensurePreviewPipeline(): void {
    if (!previewDevice || !previewFormat || previewPipeline) return;

    previewLayout = previewDevice.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } }
        ]
    });
    previewSampler = previewDevice.createSampler({ magFilter: "linear", minFilter: "linear" });
    previewPipeline = previewDevice.createRenderPipeline({
        layout: previewDevice.createPipelineLayout({ bindGroupLayouts: [previewLayout] }),
        vertex: {
            module: previewDevice.createShaderModule({ code: fullscreenVertSrc }),
            entryPoint: "main"
        },
        fragment: {
            module: previewDevice.createShaderModule({ code: displayFragSrc }),
            entryPoint: "main",
            targets: [{ format: previewFormat }]
        }
    });
}

function renderPreviews(nodeIds?: ReadonlySet<number>): void {
    if (!previewDevice || !previewFormat) return;
    if (nodeIds?.size === 0) return;
    ensurePreviewPipeline();

    const encoder = previewDevice.createCommandEncoder();
    let hasPass = false;

    for (const [nodeId, nodeCanvases] of canvases) {
        if (nodeIds && !nodeIds.has(nodeId)) continue;
        const texture = previews.get(nodeId);
        for (const canvas of nodeCanvases) {
            if (!texture) {
                canvas.hidden = true;
                continue;
            }

            let context = contexts.get(canvas);
            if (!context) {
                context = canvas.getContext("webgpu") ?? undefined;
                if (!context) {
                    throw new Error("Unable to create WebGPU context for node preview");
                }
                context.configure({ device: previewDevice, format: previewFormat, alphaMode: "opaque" });
                contexts.set(canvas, context);
            }

            canvas.hidden = false;
            const bindGroup = previewDevice.createBindGroup({
                layout: previewLayout!,
                entries: [
                    { binding: 0, resource: texture.createView() },
                    { binding: 1, resource: previewSampler! }
                ]
            });
            const pass = encoder.beginRenderPass({
                colorAttachments: [{
                    view: context.getCurrentTexture().createView(),
                    clearValue: { r: 0.12, g: 0.12, b: 0.12, a: 1 },
                    loadOp: "clear",
                    storeOp: "store"
                }]
            });
            pass.setPipeline(previewPipeline!);
            pass.setBindGroup(0, bindGroup);
            pass.draw(3);
            pass.end();
            hasPass = true;
        }
    }

    if (hasPass) {
        previewDevice.queue.submit([encoder.finish()]);
    }
}

export function setNodePreviewTextures(
    device: GPUDevice,
    format: GPUTextureFormat,
    nodeTextures: ReadonlyMap<number, GPUTexture>
): void {
    previewDevice = device;
    previewFormat = format;
    previews.clear();
    for (const [nodeId, texture] of nodeTextures) {
        previews.set(nodeId, texture);
    }
    renderPreviews();
}

export function refreshNodePreviews(nodeIds: ReadonlySet<number>): void {
    renderPreviews(nodeIds);
}

export function registerNodePreview(nodeId: number, canvas: HTMLCanvasElement): () => void {
    const nodeCanvases = canvases.get(nodeId) ?? new Set<HTMLCanvasElement>();
    nodeCanvases.add(canvas);
    canvases.set(nodeId, nodeCanvases);
    renderPreviews(new Set([nodeId]));

    return () => {
        nodeCanvases.delete(canvas);
        if (nodeCanvases.size === 0) {
            canvases.delete(nodeId);
        }
    };
}

export function NodePreview({ nodeId }: { nodeId: number }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        return registerNodePreview(nodeId, canvas);
    }, [nodeId]);

    return createElement("canvas", {
        ref: canvasRef,
        className: "rete-node-preview",
        width: previewSize,
        height: previewSize,
        "aria-label": `Texture preview for node ${nodeId}`
    });
}
