// Parsing to generate WGSL for each texture Graph

import { Graph, GraphNode } from "../graph_types";
import colorWGSL from "../node_shaders/generate/color.cs.wgsl?raw";
import constantWGSL from "../node_shaders/generate/constant.cs.wgsl?raw";
import addWGSL from "../node_shaders/combine/add.cs.wgsl?raw";
import invertWGSL from "../node_shaders/combine/invert.cs.wgsl?raw";
import { NodeType } from "../../definitions";

const nodeWGSL = {
    [NodeType.Color]: {name: "color", source: colorWGSL},
    [NodeType.Constant]: {name: "constant", source: constantWGSL},
    [NodeType.Add]: {name: "add", source: addWGSL},
    [NodeType.Invert]: {name: "invert", source: invertWGSL},
};

// dfs node visit helper for tarjan's
function dfs_visit(
    G: Graph, u: GraphNode,
    color: Map<GraphNode, number>,
    f: GraphNode[]
): void {
    color.set(u, 1);
    for (const c of u.connections) {
        const v = G.nodes.find(n => n.id == c.upstreamNodeId);
        if (!v) {
            throw new Error(`Missing node ${c.upstreamNodeId}`);
        }
        if (color.get(v) == 1) {
            throw new Error(`Graph has a cycle`);
        }
        if (color.get(v) == 0) {
            dfs_visit(G, v, color, f);
        }
    }

    color.set(u, 2);
    f.push(u);
}

// Tarjan's to sort Graph (which should be DAG)
// Returns nodes in decreasing order of finish time
function topoSort(G: Graph) {
    // perform DFS
    // 0=WHITE, 1=GRAY, 2=BLACK
    const nodeColor = new Map<GraphNode, number>();
    for (const n of G.nodes) {
        nodeColor.set(n, 0);
    }

    // We only need to look at the nodes connected to the output node
    const outputNode = G.nodes.find(n => n.id === G.outputNodeId);
    if (!outputNode) {
        throw new Error(`Missing output node ${G.outputNodeId}`);
    }

    const f: GraphNode[] =[];
    dfs_visit(G, outputNode, nodeColor, f);
    
    return f;
}

function generateGraphWGSL(G: Graph) : string {
    const orderedNodes = topoSort(G);
    const outputNode = orderedNodes[orderedNodes.length - 1];
    if (!outputNode || outputNode.typeId !== NodeType.Output) {
        throw new Error("No valid output node");
    }

    
}