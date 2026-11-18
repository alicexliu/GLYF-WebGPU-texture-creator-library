import Stats from 'stats.js';
import { GUI } from 'dat.gui';

import { initWebGPU, Renderer, device } from './node_editor/renderer';
import { TextureRenderer } from './node_editor/texture_render';

import { setupLoaders, Scene } from './stage/scene';
import { Camera } from './stage/camera';
import { Stage } from './stage/stage';
import { createEditor } from './node_editor/editor';
import { Rete2Graph, setupPngExport } from './node_editor/import_export';
import { Graph } from './library/graph_types';
import { GraphExecution } from './library/parser/graph_execution';
import { GPUGraphExecution } from './library/parser/gpu_graph_execution';
import { setupResizableLayout } from './layout';


const profileButton = document.getElementById("profileCosts") as HTMLButtonElement;
const cacheMode = document.getElementById("cacheMode") as HTMLSelectElement;
const costRows = document.getElementById("costRows")!;
const costSummary = document.getElementById("costSummary")!;
const costStatus = document.getElementById("costStatus")!;

const backend = { mode: "Specialized shaders"};
let execution: GraphExecution | GPUGraphExecution;
let graphUpdates: Promise<boolean> = Promise.resolve(true);

function applyCacheMode(): void {
    if (execution instanceof GraphExecution) {
        execution.setCachedNodes(
            cacheMode.value === "static" ? undefined : new Set()
        );
    }
}

async function profileCurrentGraph(): Promise<boolean> {
    if (!(execution instanceof GraphExecution)) {
        return false;
    }

    try {
        await execution.profileNodeCosts();

        costStatus.textContent =
            "Profiling took " + execution.profileMs.toFixed(1) + " ms.";

        return true;
    } catch (error) {
        costStatus.textContent = "Profiling failed; see the console.";
        console.error(error);
        return false;
    } finally {
        profileButton.disabled = false;
        updateCostPanel();
    }
}

// Queues profiling after pending graph edits
function queueCostProfile(): void {
    profileButton.disabled = true;
    costStatus.textContent = "Measuring...";
    graphUpdates = graphUpdates.then(profileCurrentGraph);
}

// Refreshes the table without rebuilding the editor or renderer
function updateCostPanel(): void {
    // GPU execution doesn't have caching implemented yet
    if (!(execution instanceof GraphExecution)) {
        costRows.replaceChildren();
        return;
    }
    if (!execution) {
        return;
    }

    costSummary.textContent =
        "Last update: " + execution.lastDispatchCount +
        " GPU dispatches. Allocated images: " +
        (execution.allocatedImageBytes / 1048576).toFixed(2) + " MiB.";

    costRows.replaceChildren();

    for (const row of execution.getNodeCosts()) {
        const tr = document.createElement("tr");
        const cells = [
            "#" + row.id + " " + row.name,
            row.dynamic ? "Dynamic" : "Static",
            row.warmTime == null ? "Not measured" : row.warmTime.toFixed(4),
            row.space == 0 ? "—" : (row.space / 1048576).toFixed(2),
            row.state,
        ];

        for (const value of cells) {
            const td = document.createElement("td");
            td.textContent = value;
            tr.append(td);
        }

        costRows.append(tr);
    }
}

async function applyGraphUpdate(graph: Graph): Promise<boolean> {
    try {
        if (execution && execution.updateGraph(graph)) {
            return true;
        }

        const newExecution = await GraphExecution.create(device, graph);
        const old = execution;
        execution = newExecution;
        applyCacheMode();
        if (renderer) {
            setRenderer();
        }
        old?.destroy();
        return true;
    } catch (e) {
        console.error("Error executing graph:", e);
        return false;
    }
}

async function updateGraph(graph: Graph): Promise<boolean> {
    const snapshot = structuredClone(graph);
    graphUpdates = graphUpdates.then(applyGraphUpdate.bind(null, snapshot));
    return graphUpdates;
}

// get the GPU adapter + device
setupResizableLayout();
await initWebGPU();

// node graph setup
let ready = false
const editor = await createEditor(document.getElementById("rete")!, g => ready ? updateGraph(g) : undefined);
ready = true;
await updateGraph(Rete2Graph(editor));
setupPngExport(device, () => Rete2Graph(editor));

// loader for gltf / image
setupLoaders();

let scene = new Scene();
// await scene.loadGltf('./scenes/sponza/Sponza.gltf');

const camera = new Camera();

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

const gui = new GUI();

const stage = new Stage(scene, camera, stats);

var renderer: Renderer | undefined;
const renderModes = { texture: 'Default texture', sphere: 'Sphere' };
const renderMode = { mode: renderModes.texture };
const renderModeController = gui.add(renderMode, 'mode', renderModes);
const spherePosition = { x: 0.5, y: 0.5, radius: 1, yaw: 0, pitch: 0 };

function setRenderer(mode: string = renderMode.mode) {
    renderMode.mode = mode;
    renderer?.stop();

    const texture = execution.outputs.get("albedo");
    if (!texture) {
        throw new Error("Missing albedo output from graph execution");
    }

    renderer = new TextureRenderer(
        stage,
        texture,
        execution,
        mode === renderModes.sphere,
        spherePosition
    );
}

renderModeController.onChange(setRenderer);

setRenderer();

profileButton.addEventListener("click", queueCostProfile);
cacheMode.addEventListener("change", applyCacheMode);

updateCostPanel();
setInterval(updateCostPanel, 250);
