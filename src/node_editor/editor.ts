import { NodeEditor, GetSchemes, ClassicPreset } from "rete";
import { createElement, useRef, useState } from "react";
import type { HTMLProps, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { createRoot } from "react-dom/client";
import { css } from "styled-components";
import { AreaPlugin } from "rete-area-plugin";
import { ReactPlugin, Presets, ReactArea2D } from "rete-react-plugin";
import { ConnectionPlugin, Presets as ConnectionPresets } from "rete-connection-plugin"
import { AreaExtensions } from "rete-area-plugin";
import { serializeGlyf } from "../library/converter/glyf_converter";
import { parseGlyf } from "../library/parser/glyf_parser";

// custom nodes 
import { getControlLabel, graphEditNode, ToggleControl } from "./graph_edit_node";
import { NodeType } from "../definitions";

import type { Graph, GraphNode, GraphConnection } from "../library/graph_types";

// for add / delete
import { ContextMenuPlugin, ContextMenuExtra, Presets as ContextMenuPresets } from "rete-context-menu-plugin";
import { nodeDefinitions } from "../definitions";

interface ContextMenuItem {
    label: string;
    key: string;
    handler(): void;
    subitems?: ContextMenuItem[];
}

function AutofocusContextMenuSearch(props: HTMLProps<HTMLInputElement>) {
    return createElement(Presets.contextMenu.Search, { ...props, autoFocus: true });
}

function SearchableContextMenu(props: {
    items: ContextMenuItem[];
    onHide(): void;
    searchBar?: boolean;
}) {
    const [query, setQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState<string>();
    const hideTimeout = useRef<number | undefined>(undefined);
    const search = query.trim().toLowerCase();
    const categories = props.items
        .map(category => {
            const items = category.subitems ?? [];
            const matchesCategory = search.length > 0 && category.label.toLowerCase().includes(search);
            return {
                ...category,
                visibleItems: search && !matchesCategory
                    ? items.filter(item => item.label.toLowerCase().includes(search))
                    : items,
            };
        })
        .filter(category => !search || category.visibleItems.length > 0);
    const isActionMenu = props.items.every(item => !item.subitems?.length);
    const searchResults = categories.flatMap(category => category.visibleItems);

    const createNodeItem = (item: ContextMenuItem) => createElement(
        Presets.contextMenu.Item,
        {
            key: item.key,
            hasSubitems: false,
            onPointerDown: (event: ReactPointerEvent) => event.stopPropagation(),
            onClick: (event: ReactMouseEvent) => {
                event.stopPropagation();
                item.handler();
                props.onHide();
            },
            "data-testid": "context-menu-item",
        },
        item.label
    );

    return createElement(
        Presets.contextMenu.Menu,
        {
            "data-testid": "context-menu",
            onMouseOver: () => window.clearTimeout(hideTimeout.current),
            onMouseLeave: () => {
                window.clearTimeout(hideTimeout.current);
                hideTimeout.current = window.setTimeout(props.onHide, 100);
            },
            onWheel: (event: ReactWheelEvent) => event.stopPropagation(),
        },
        props.searchBar && createElement(
            Presets.contextMenu.Common,
            null,
            createElement(AutofocusContextMenuSearch, {
                value: query,
                onChange: event => setQuery(event.currentTarget.value),
                onPointerDown: event => event.stopPropagation(),
                onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => {
                    if (event.key !== "Enter" || !search || isActionMenu) return;
                    const firstResult = searchResults[0];
                    if (!firstResult) return;

                    event.preventDefault();
                    event.stopPropagation();
                    firstResult.handler();
                    props.onHide();
                },
            })
        ),
        isActionMenu
            ? props.items
                .filter(item => !search || item.label.toLowerCase().includes(search))
                .map(createNodeItem)
            : categories.map(category => search
                ? createElement(
                    "div",
                    { key: category.key },
                    category.visibleItems.map(createNodeItem)
                )
                : createElement(
                    Presets.contextMenu.Item,
                    {
                        key: category.key,
                        onPointerEnter: () => setActiveCategory(category.key),
                        onPointerLeave: () => setActiveCategory(undefined),
                        hasSubitems: Boolean(category.subitems?.length),
                        onPointerDown: (event: ReactPointerEvent) => event.stopPropagation(),
                    },
                    category.label,
                    activeCategory === category.key && category.subitems?.length
                        ? createElement(
                            Presets.contextMenu.Subitems,
                            null,
                            category.subitems.map(createNodeItem)
                        )
                        : null
                ))
    );
}

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
                if (payload instanceof ToggleControl) {
                    return ({ data }) => createElement(
                        "div",
                        { className: "rete-parameter-control" },
                        createElement("span", { className: "rete-parameter-label" }, label),
                        createElement("button", {
                            type: "button",
                            className: "rete-toggle-control",
                            "aria-pressed": data.value,
                            onPointerDown: event => event.stopPropagation(),
                            onClick: event => {
                                event.stopPropagation();
                                data.toggle();
                                event.currentTarget.textContent = data.value ? "cos" : "sin";
                                event.currentTarget.setAttribute("aria-pressed", String(data.value));
                            },
                        }, data.value ? "cos" : "sin")
                    );
                }
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
    type NodeMenuItem = [string, () => graphEditNode];
    type NodeMenuCategory = [string, NodeMenuItem[]];
    const nodeMenuItem = (type: NodeType): NodeMenuItem => [
        nodeDefinitions[type].name,
        () => new graphEditNode(type)
    ];
    const nodesList: NodeMenuCategory[] = [
        ["Generators", [
            nodeMenuItem(NodeType.Time),
            nodeMenuItem(NodeType.Color),
            nodeMenuItem(NodeType.Constant),
            nodeMenuItem(NodeType.PerlinNoise),
            nodeMenuItem(NodeType.WorleyNoise),
            nodeMenuItem(NodeType.FbmNoise),
        ]],
        ["Math", [
            nodeMenuItem(NodeType.Add),
            nodeMenuItem(NodeType.Subtract),
            nodeMenuItem(NodeType.Multiply),
            nodeMenuItem(NodeType.Power),
            nodeMenuItem(NodeType.Step),
            nodeMenuItem(NodeType.SinCos),
            nodeMenuItem(NodeType.DotProduct),
            nodeMenuItem(NodeType.Invert),
            nodeMenuItem(NodeType.Blend),

        ]],
        ["Vectors", [
            nodeMenuItem(NodeType.CombineVec2),
            nodeMenuItem(NodeType.CombineVec3),
            nodeMenuItem(NodeType.CombineVec4),
            nodeMenuItem(NodeType.SplitVec4),
        ]],
        ["UV", [
            nodeMenuItem(NodeType.UVTransform),
        ]],
    ];

    const contextMenu = new ContextMenuPlugin<Schemes>({
        items: ContextMenuPresets.classic.setup(nodesList)
    });
    area.use(contextMenu);
    render.addPreset({
        render: context => {
            if (context.data.type !== "contextmenu") return null;
            return createElement(SearchableContextMenu, {
                items: context.data.items,
                onHide: context.data.onHide,
                searchBar: context.data.searchBar,
            });
        },
    });

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

    await editor.addConnection(new ClassicPreset.Connection(color, "out", invert, "in"));
    await editor.addConnection(new ClassicPreset.Connection(invert, "out", output, "albedo"));

    

    // usability stuff?
    AreaExtensions.selectableNodes(area, AreaExtensions.selector(), { accumulating: AreaExtensions.accumulateOnCtrl() });
    AreaExtensions.simpleNodesOrder(area);
    AreaExtensions.zoomAt(area, editor.getNodes()); 

    document.addEventListener("keydown", event => {
        if (event.key !== "Delete" && event.key !== "Backspace") return;
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.target instanceof Element && event.target.closest(
            "input, textarea, select, button, [contenteditable='true']"
        )) return;

        const selectedNodes = editor.getNodes().filter(node => node.selected);
        if (selectedNodes.length === 0) return;

        event.preventDefault();
        void (async () => {
            const selectedIds = new Set(selectedNodes.map(node => node.id));
            const connectionsToRemove = editor.getConnections().filter(connection =>
                selectedIds.has(connection.source) || selectedIds.has(connection.target)
            );

            for (const connection of connectionsToRemove) {
                if (!await editor.removeConnection(connection.id)) {
                    throw new Error(`Failed to remove connection ${connection.id}`);
                }
            }
            for (const node of selectedNodes) {
                if (!await editor.removeNode(node.id)) {
                    throw new Error(`Failed to remove node ${node.id}`);
                }
            }
        })().catch(error => {
            console.error("Failed to delete selected nodes:", error);
        });
    });

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
