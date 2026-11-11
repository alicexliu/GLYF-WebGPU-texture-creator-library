// Parsing to generate WGSL for each texture Graph

import { Graph, GraphNode, GraphValue } from "../graph_types";
import colorWGSL from "../node_shaders/generate/color.cs.wgsl?raw";
import constantWGSL from "../node_shaders/generate/constant.cs.wgsl?raw";
import addWGSL from "../node_shaders/combine/add.cs.wgsl?raw";
import invertWGSL from "../node_shaders/combine/invert.cs.wgsl?raw";
import { nodeDefinitions, NodeType } from "../../definitions";

export const nodeWGSL = {
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
export function topoSort(G: Graph) {
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

// Helper to get the input sockets for a node
export function getInputs(
    node: GraphNode, textures: Map<number, GPUTexture>
): Map<number, GPUTexture> {
    if (!nodeDefinitions[node.typeId]) {
        throw new Error(`Invalid node type: ${node.typeId}`);
    }

    const inputs = new Map<number, GPUTexture>();

    for (const conn of node.connections) {
        const texture = textures.get(conn.upstreamNodeId);
        if (!texture) {
            throw new Error(`Missing output from input node ${conn.upstreamNodeId}`);
        }
        inputs.set(conn.inputSocket, texture);
    }

    return inputs;
}

// Helper to get the input values for a node
export function getValues(
    node: GraphNode,
    inputs: Map<number, GPUTexture>
): (GraphValue | undefined)[] {
    const values: (GraphValue | undefined)[] = [];
    const nodeDefn = nodeDefinitions[node.typeId];
    for (let i = 0; i < nodeDefn.parameters.length; ++i) {
        const val = node.parameters[i] ?? nodeDefn.parameters[i].default;
        if (!inputs.has(i)) {
            if (nodeDefn.parameters[i].socket && nodeDefn.parameters[i].default == undefined) {
                throw new Error(`Missing input connection`);
            }
            if (val == undefined) {
                throw new Error(`${nodeDefn.parameters[i].name} missing for node ${node.id}`)
            }
        }
        values.push(val);
    }

    return values;
}