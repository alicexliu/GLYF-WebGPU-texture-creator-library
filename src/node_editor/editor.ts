import { NodeEditor, GetSchemes, ClassicPreset } from "rete";
import { createRoot } from "react-dom/client";
import { AreaPlugin } from "rete-area-plugin";
import { ReactPlugin, Presets, ReactArea2D } from "rete-react-plugin";
import { ConnectionPlugin, Presets as ConnectionPresets } from "rete-connection-plugin"
import { AreaExtensions } from "rete-area-plugin";


export async function createEditor(container: HTMLElement) {


    // editor ---------
    type Schemes = GetSchemes<
    ClassicPreset.Node,
    ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>
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
    const socket = new ClassicPreset.Socket("socket");

    const nodeA = new ClassicPreset.Node("A");
    nodeA.addControl("a", new ClassicPreset.InputControl("text", {}));
    nodeA.addOutput("a", new ClassicPreset.Output(socket));
    await editor.addNode(nodeA);

    const nodeB = new ClassicPreset.Node("B");
    nodeB.addControl("b", new ClassicPreset.InputControl("text", {}));
    nodeB.addInput("b", new ClassicPreset.Input(socket));
    await editor.addNode(nodeB);

    await editor.addConnection(new ClassicPreset.Connection(nodeA, "a", nodeB, "b"));

    // usability stuff?
    // AreaExtensions.selectableNodes(area, AreaExtensions.selector(), { accumulating: AreaExtensions.accumulateOnCtrl() });
    // AreaExtensions.simpleNodesOrder(area);
    // AreaExtensions.zoomAt(area, editor.getNodes());
}
