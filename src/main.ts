import Stats from 'stats.js';
import { GUI } from 'dat.gui';

import { initWebGPU, Renderer, device } from './node_editor/renderer';
import { TextureRenderer } from './node_editor/texture_render';

import { setupLoaders, Scene } from './stage/scene';
import { Camera } from './stage/camera';
import { Stage } from './stage/stage';
import { createEditor, Rete2Graph } from './node_editor/editor';
import { Graph } from './library/graph_types';
import { NodeType } from './definitions';
import { GraphExecution } from './library/parser/graph_execution';
import { setupResizableLayout } from './layout';

let execution: GraphExecution;

async function updateGraph(graph: Graph): Promise<boolean> {
    try {
        const newExecution = await GraphExecution.create(device, graph);
        const old = execution;
        execution = newExecution;
        setRenderer();
        old?.destroy();
        return true;
    } catch (e) {
        console.error("Error executing graph:", e);
        return false;
    }
}


// get the GPU adapter + device
setupResizableLayout();
await initWebGPU();

let ready = false
const editor = await createEditor(document.getElementById("rete")!, g => ready ? updateGraph(g) : undefined);
ready = true;
await updateGraph(Rete2Graph(editor));

// todo
// pass graph to the Graph -> Texture func

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

function setRenderer() {
    renderer?.stop();

    const texture = execution.outputs.get("albedo");
    if (!texture) {
        throw new Error("Missing albedo output from graph execution");
    }

    renderer = new TextureRenderer(stage, texture);
    // switch (mode) {
        // todo: more options for preview, 
        // like texture on object
    // }
}

const renderModes = { defTex: 'default texture'};
let renderModeController = gui.add({ mode: renderModes.defTex }, 'mode', renderModes);
renderModeController.onChange(setRenderer);

setRenderer();
