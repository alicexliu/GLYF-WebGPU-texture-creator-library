import { NodeEditor, GetSchemes, ClassicPreset } from "rete";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { css } from "styled-components";
import { AreaPlugin } from "rete-area-plugin";
import { ReactPlugin, Presets, ReactArea2D } from "rete-react-plugin";
import { ConnectionPlugin, Presets as ConnectionPresets } from "rete-connection-plugin"
import { AreaExtensions } from "rete-area-plugin";
import { serializeGlyf } from "../library/converter/glyf_converter";
import { parseGlyf } from "../library/parser/glyf_parser";

// custom nodes 
import { getControlLabel, graphEditNode } from "./graph_edit_node";
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

export async function createEditor(container: HTMLElement, onGraphChange: (g: Graph) => void | Promise<unknown>) {
    const editor = new NodeEditor<Schemes>();
    // extra area ---------------
    type AreaExtra = ReactArea2D<Schemes> | ContextMenuExtra;

    const area = new AreaPlugin<Schemes, AreaExtra>(container);
    // enables the inclusion of custom viewable elements
    const render = new ReactPlugin<Schemes, AreaExtra>({ createRoot });

    render.addPreset(Presets.classic.setup({
        customize: {
            node: ({ payload }) => ({ data, emit }) => createElement(
                Presets.classic.Node,
                {
                    data,
                    emit,
                    styles: () => payload.selected ? css`
                        & .title,
                        & .input-title,
                        & .output-title,
                        & .rete-parameter-label {
                            color: black;
                        }
                    ` : undefined,
                }
            ),
            control: ({ payload }) => {
                const label = getControlLabel(payload);
                if (!label || !(payload instanceof ClassicPreset.InputControl)) return null;

                return ({ data }) => createElement(
                    "div",
                    { className: "rete-parameter-control" },
                    createElement("span", { className: "rete-parameter-label" }, label),
                    createElement(Presets.classic.Control, { data })
                );
            },
        },
    }));

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
    let importingGraph = false;
    editor.addPipe(ctx => {
        if (!importingGraph && ["nodecreated", "noderemoved", "connectioncreated", "connectionremoved"].includes(ctx.type)) {
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

    const exportButton = document.getElementById("exportGlyfButton") as HTMLButtonElement;
    const importButton = document.getElementById("importGlyfButton") as HTMLButtonElement;
    const importInput = document.getElementById("importGlyfInput") as HTMLInputElement;
    const exportStatus = document.getElementById("exportStatus")!;
    let exportToastTimeout: number | undefined;
    const showToast = (message: string, isError = false) => {
        window.clearTimeout(exportToastTimeout);
        exportStatus.textContent = message;
        exportStatus.classList.toggle("error", isError);
        exportStatus.classList.add("visible");
        exportToastTimeout = window.setTimeout(() => {
            exportStatus.classList.remove("visible");
        }, 2500);
    };

    importButton.addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", async () => {
        const file = importInput.files?.[0];
        if (!file) return;

        try {
            const graph = parseGlyf(await file.arrayBuffer(), true);
            const importedNodes = new Map<number, graphEditNode>();

            for (const graphNode of graph.nodes) {
                if (importedNodes.has(graphNode.id)) {
                    throw new Error(`Duplicate node ID: ${graphNode.id}`);
                }
                importedNodes.set(
                    graphNode.id,
                    new graphEditNode(graphNode.typeId, graphNode.id, graphNode.parameters)
                );
            }

            const importedConnections: ClassicPreset.Connection<graphEditNode, graphEditNode>[] = [];
            for (const graphNode of graph.nodes) {
                const target = importedNodes.get(graphNode.id)!;
                const targetDefinition = nodeDefinitions[graphNode.typeId];
                for (const connection of graphNode.connections) {
                    const source = importedNodes.get(connection.upstreamNodeId);
                    const sourceDefinition = source && nodeDefinitions[source.typeId];
                    const input = targetDefinition.parameters[connection.inputSocket];
                    const output = sourceDefinition?.outputs[connection.upstreamSocket];

                    if (!source || !input || !output) {
                        throw new Error(`Invalid connection in node ${graphNode.id}`);
                    }
                    importedConnections.push(
                        new ClassicPreset.Connection(source, output.name, target, input.name)
                    );
                }
            }

            importingGraph = true;
            await editor.clear();
            for (const node of importedNodes.values()) {
                await editor.addNode(node);
            }
            for (const connection of importedConnections) {
                await editor.addConnection(connection);
            }

            if (graph.editorInfo?.nodePositions.size) {
                for (const [id, position] of graph.editorInfo.nodePositions) {
                    if (importedNodes.has(id)) {
                        await area.translate(String(id), { x: position[0], y: position[1] });
                    }
                }
            } else {
                AreaExtensions.zoomAt(area, editor.getNodes());
            }
            importingGraph = false;

            const graphUpdated = await onGraphChange(Rete2Graph(editor));
            if (graphUpdated === false) {
                throw new Error("The imported graph could not be rendered.");
            }
            showToast(`Loaded ${file.name}`);
        } catch (error) {
            importingGraph = false;
            console.error("Failed to import GLYF graph:", error);
            showToast("Import failed; see console", true);
        } finally {
            importInput.value = "";
        }
    });

    exportButton.addEventListener("click", () => {
        try {
            const graph = Rete2Graph(editor);
            const graphEditorInfo = {
                nodePositions: new Map(
                    [...area.nodeViews].map(([id, view]) => [
                        Number(id),
                        [view.position.x, view.position.y] as [number, number],
                    ])
                ),
            };
            const bytes = serializeGlyf(graph, graphEditorInfo);
            const blob = new Blob([bytes], { type: "application/octet-stream" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            const filename = "texture.glyf";
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
            showToast(`Downloaded ${filename}`);
        } catch (error) {
            console.error("Failed to export GLYF graph:", error);
            showToast("Export failed; see console", true);
        }
    });
    
    onGraphChange(Rete2Graph(editor));
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
