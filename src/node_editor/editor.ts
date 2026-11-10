import { NodeEditor, GetSchemes, ClassicPreset } from "rete";
import { createRoot } from "react-dom/client";
import { AreaPlugin } from "rete-area-plugin";
import { ReactPlugin, Presets, ReactArea2D } from "rete-react-plugin";
import { ConnectionPlugin, Presets as ConnectionPresets } from "rete-connection-plugin"
import { AreaExtensions } from "rete-area-plugin";

import { graphEditNode } from "./graph_edit_node";
import { NodeType } from "../definitions";

export async function createEditor(container: HTMLElement) {


    // editor ---------
    type Schemes = GetSchemes<
    // ClassicPreset.Node, 
    graphEditNode,
    ClassicPreset.Connection<graphEditNode, graphEditNode>
    >;

    const editor = new NodeEditor<Schemes>();

    // extra area ---------------
    type AreaExtra = ReactArea2D<Schemes>;

    const area = new AreaPlugin<Schemes, AreaExtra>(container);
    // enables the inclusion of custom viewable elements
    const render = new ReactPlugin<Schemes, AreaExtra>({ createRoot });

    render.addPreset(Presets.classic.setup());

    editor.use(area);
    area.use(render);

    // connection feature--------
    const connection = new ConnectionPlugin<Schemes, AreaExtra>();
    connection.addPreset(ConnectionPresets.classic.setup())
    area.use(connection);


    // test node ------ 
    // const socket = new ClassicPreset.Socket("socket");

    // const nodeA = new ClassicPreset.Node("A");
    // nodeA.addControl("a", new ClassicPreset.InputControl("text", {}));
    // nodeA.addOutput("a", new ClassicPreset.Output(socket));
    // await editor.addNode(nodeA);

    // const nodeB = new ClassicPreset.Node("B");
    // nodeB.addControl("b", new ClassicPreset.InputControl("text", {}));
    // nodeB.addInput("b", new ClassicPreset.Input(socket));
    // await editor.addNode(nodeB);

    // await editor.addConnection(new ClassicPreset.Connection(nodeA, "a", nodeB, "b"));

    // temp 
    graphEditNode.onChange = node => console.log(node.label, node.params);

    const color  = new graphEditNode(NodeType.Color);
    const invert = new graphEditNode(NodeType.Invert);
    const output = new graphEditNode(NodeType.Output);
    await editor.addNode(color);
    await editor.addNode(invert);
    await editor.addNode(output);

    await editor.addConnection(new ClassicPreset.Connection(color, "value", invert, "value"));
    await editor.addConnection(new ClassicPreset.Connection(invert, "value", output, "albedo"));

    

    // usability stuff?
    AreaExtensions.selectableNodes(area, AreaExtensions.selector(), { accumulating: AreaExtensions.accumulateOnCtrl() });
    AreaExtensions.simpleNodesOrder(area);
    AreaExtensions.zoomAt(area, editor.getNodes()); 
}
