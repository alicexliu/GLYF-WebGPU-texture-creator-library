import Stats from 'stats.js';
import { GUI } from 'dat.gui';

import { initWebGPU, Renderer } from './node_editor/renderer';
import { TextureRenderer } from './node_editor/texture_render';

import { setupLoaders, Scene } from './stage/scene';
import { Camera } from './stage/camera';
import { Stage } from './stage/stage';
import { createEditor } from './node_editor/editor';

// get the GPU adapter + device
await initWebGPU();
await createEditor(document.getElementById("rete")!, g => console.log(g)); 
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

function setRenderer(mode: string) {
    renderer?.stop();

    renderer = new TextureRenderer(stage);
    // switch (mode) {
        // todo: more options for preview, 
        // like texture on object
    // }
}

const renderModes = { defTex: 'default texture'};
let renderModeController = gui.add({ mode: renderModes.defTex }, 'mode', renderModes);
renderModeController.onChange(setRenderer);

setRenderer(renderModeController.getValue());
