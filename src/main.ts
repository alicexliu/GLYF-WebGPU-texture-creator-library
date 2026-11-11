import Stats from 'stats.js';
import { GUI } from 'dat.gui';

import { initWebGPU, Renderer, device } from './node_editor/renderer';
import { TextureRenderer } from './node_editor/texture_render';

import { setupLoaders, Scene } from './stage/scene';
import { Camera } from './stage/camera';
import { Stage } from './stage/stage';
import { createEditor } from './node_editor/editor';
import { Graph } from './library/graph_types';
import { NodeType } from './definitions';
import { GraphExecution } from './library/parser/graph_execution';

// get the GPU adapter + device
await initWebGPU();
await createEditor(document.getElementById("rete")!);

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


// TODO: remove this later, this is just dummy to test the graph execution
const graph: Graph = {
    outputNodeId: 2,
    nodes: [
        {
            id: 0,
            typeId: NodeType.Color,
            parameters: [[0, 1, 1, 1]],
            connections: [],
        },
        {
            id: 1,
            typeId: NodeType.Invert,
            parameters: [],
            connections: [
                {
                    upstreamNodeId: 0,
                    upstreamSocket: 0,
                    inputSocket: 0,
                },
            ],
        },
        {
            id: 2,
            typeId: NodeType.Output,
            parameters: [],
            connections: [
                {
                    upstreamNodeId: 1,
                    upstreamSocket: 0,
                    inputSocket: 0,
                },
            ],
        },
    ],
};

const execution = await GraphExecution.create(device, graph);

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
