import type { Graph, GraphNode, GraphConnection } from "../library/graph_types";
import { GraphExecution } from "../library/parser/graph_execution";
import { NodeEditor, GetSchemes, ClassicPreset } from "rete";
import { NodeType, nodeDefinitions } from "../definitions";
import { fullscreenVertSrc, displayFragSrc } from "../shaders/shaders";

export async function exportTextureToPng(
    device: GPUDevice,
    sourceTexture: GPUTexture,
    filename = "texture_4k.png"
) : Promise<void>{
    const width = sourceTexture.width;
    const height = sourceTexture.height;

    const targetTexture = device.createTexture({
        size: [width, height],
        format: "rgba8unorm", // png required format
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    const sampler = device.createSampler({ magFilter: "nearest", minFilter: "nearest" });
    const bindGroupLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        ],
    });

    const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
            { binding: 0, resource: sourceTexture.createView() },
            { binding: 1, resource: sampler },
        ],
    });

    const pipeline = await device.createRenderPipelineAsync({
        layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
        vertex: {
            module: device.createShaderModule({ code: fullscreenVertSrc }),
            buffers: [],
        },
        fragment: {
            module: device.createShaderModule({ code: displayFragSrc }),
            targets: [{ format: "rgba8unorm" }],
        },
    });

    // GPU to CPU buffer
    const unpaddedBytesPerRow = width * 4; // an rgba8unorm pixel is 4 bytes
    const paddedBytesPerRow = Math.ceil(unpaddedBytesPerRow / 256) * 256;

    const buffer = device.createBuffer({
        size: paddedBytesPerRow * height,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // GPU pass
    try {
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: targetTexture.createView(),
                clearValue: [0, 0, 0, 1],
                loadOp: "clear",
                storeOp: "store",
            }],
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3);
        pass.end();

        encoder.copyTextureToBuffer(
            { texture: targetTexture },
            { buffer: buffer, bytesPerRow: paddedBytesPerRow, rowsPerImage: height },
            { width, height }
        );

        device.queue.submit([encoder.finish()]);
        await buffer.mapAsync(GPUMapMode.READ);

        // get rid of padding
        const mapped = new Uint8Array(buffer.getMappedRange());
        const pixels = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) {
            const srcOffset = y * paddedBytesPerRow;
            const dstOffset = y * unpaddedBytesPerRow;
            pixels.set(mapped.subarray(srcOffset, srcOffset + unpaddedBytesPerRow), dstOffset);
        }
        buffer.unmap();

        // encode as PNG + download
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.putImageData(new ImageData(pixels, width, height), 0, 0);

        const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(b => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png")
        );

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    } finally {
        targetTexture.destroy();
        buffer.destroy();
    }
}

export function setupPngExport(
    device: GPUDevice,
    getGraph: () => Graph | undefined,
    resolution = 4096
) {
    const exportPngButton = document.getElementById("exportPngButton") as HTMLButtonElement;
    const exportStatus = document.getElementById("exportStatus")!;
    let toastTimeout: number | undefined;

    const showStatus = (message: string, isError = false) => {
        window.clearTimeout(toastTimeout);
        exportStatus.textContent = message;
        exportStatus.classList.toggle("error", isError);
        exportStatus.classList.add("visible");
        toastTimeout = window.setTimeout(() => {
            exportStatus.classList.remove("visible");
        }, 2500);
    };

    let isExporting = false;
    exportPngButton.addEventListener("click", async () => {
        const graph = getGraph();
        if (!graph || isExporting) return;

        isExporting = true;
        exportPngButton.disabled = true;
        showStatus("Rendering 4K PNG...");

        let exportExec: GraphExecution | undefined;
        try {
            exportExec = await GraphExecution.create(device, graph, resolution, resolution);
            const albedo = exportExec.outputs.get("albedo");
            if (!albedo) {
                throw new Error("Missing albedo output");
            }
            await exportTextureToPng(device, albedo, "texture_4k.png");
            showStatus("Downloaded texture_4k.png");
        } catch (error) {
            console.error("Failed to export 4K PNG:", error);
            showStatus("4K PNG export failed", true);
        } finally {
            exportExec?.destroy();
            exportPngButton.disabled = false;
            isExporting = false;
        }
    });
}


// returns a Graph based on the current Node editor status on Rete.js side 
export function Rete2Graph(editor: NodeEditor<Schemes>): Graph {
    const connections = editor.getConnections();

    const nodes: GraphNode[] = editor.getNodes().map(n => {

        // for each node 
        const id = n.graphId;
        const typeId = n.typeId;    
        const parameters = n.params; // todo: undefined?    
        const def = nodeDefinitions[n.typeId];

        // for each connecction
        const myConnections: GraphConnection[] = connections
            .filter(c => c.target === n.id)
            .map(c => {
                const inputSocket = def.parameters.findIndex(p => p.name === c.targetInput);
                const src = editor.getNode(c.source)!;

                const upstreamNodeId = src.graphId;
                const upstreamSocket = nodeDefinitions[src.typeId].outputs.findIndex(o => o.name === c.sourceOutput);

                return { inputSocket, upstreamNodeId, upstreamSocket};
            });

        return { id, typeId, connections: myConnections, parameters };

    });

    const output = nodes.find(n => n.typeId === NodeType.Output);
    return { nodes, outputNodeId: output ? output.id : -1 };
}