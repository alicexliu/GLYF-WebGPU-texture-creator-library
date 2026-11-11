import { NodeEditor, GetSchemes, ClassicPreset } from "rete";
import { createRoot } from "react-dom/client";
import { AreaPlugin } from "rete-area-plugin";
import { ReactPlugin, Presets, ReactArea2D } from "rete-react-plugin";
import { ConnectionPlugin, Presets as ConnectionPresets } from "rete-connection-plugin"
import { AreaExtensions } from "rete-area-plugin";

// custom nodes 
import { graphEditNode } from "./graph_edit_node";
import { NodeType } from "../definitions";

import type { Graph, GraphNode, GraphConnection } from "../library/graph_types";

// for add / delete
import { ContextMenuPlugin, ContextMenuExtra, Presets as ContextMenuPresets } from "rete-context-menu-plugin";
import { nodeDefinitions } from "../definitions";


// editor ---------
    type Schemes = GetSchemes<
    // ClassicPreset.Node, 
    graphEditNode, ClassicPreset.Connection<graphEditNode, graphEditNode>
    >;

export async function createEditor(container: HTMLElement, onGraphChange: (g: Graph) => void) {
    const editor = new NodeEditor<Schemes>();
    // extra area ---------------
    type AreaExtra = ReactArea2D<Schemes> | ContextMenuExtra;

    const area = new AreaPlugin<Schemes, AreaExtra>(container);
    // enables the inclusion of custom viewable elements
    const render = new ReactPlugin<Schemes, AreaExtra>({ createRoot });

    render.addPreset(Presets.classic.setup());

    editor.use(area);
    area.use(render);

    // connection feature --------
    const connection = new ConnectionPlugin<Schemes, AreaExtra>();
    connection.addPreset(ConnectionPresets.classic.setup())
    area.use(connection);

    // context menu ---------
    const nodesList = Object.values(nodeDefinitions)
    .filter(def => def.typeId !== NodeType.Output) // cant add Output
    .map(def => [def.name, () => new graphEditNode(def.typeId)] as [string, () => graphEditNode]);

    const contextMenu = new ContextMenuPlugin<Schemes>({
        items: ContextMenuPresets.classic.setup(nodesList)
    });
    area.use(contextMenu);
    render.addPreset(Presets.contextMenu.setup()); 

    // notifiers --------
    // edits with nodes/connections
    editor.addPipe(ctx => {
        if (["nodecreated", "noderemoved", "connectioncreated", "connectionremoved"].includes(ctx.type)) {
            console.log(ctx.type); // todo
            onGraphChange(Rete2Graph(editor));
            
        }
        return ctx;
    });
    // edits on params 
    graphEditNode.onChange = node => {
        console.log(node.label, node.params);
        onGraphChange(Rete2Graph(editor));
    }


    
    // temp starter nodes 
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
    
    return editor;
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
