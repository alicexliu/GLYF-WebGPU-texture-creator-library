// Parsing to generate WGSL for each texture Graph

import { Graph, GraphNode, GraphValue } from "../graph_types";
import colorWGSL from "../node_shaders/generate/color.cs.wgsl?raw";
import constantWGSL from "../node_shaders/generate/constant.cs.wgsl?raw";
import addWGSL from "../node_shaders/combine/add.cs.wgsl?raw";
import subtractWGSL from "../node_shaders/combine/subtract.cs.wgsl?raw";
import stepWGSL from "../node_shaders/combine/step.cs.wgsl?raw";
import multiplyWGSL from "../node_shaders/combine/multiply.cs.wgsl?raw";
import powerWGSL from "../node_shaders/combine/power.cs.wgsl?raw";
import invertWGSL from "../node_shaders/combine/invert.cs.wgsl?raw";
import blendWGSL from "../node_shaders/combine/blend.cs.wgsl?raw";
import perlinWGSL from "../node_shaders/generate/perlin.cs.wgsl?raw";
import worleyWGSL from "../node_shaders/generate/worley.cs.wgsl?raw";
import fbmWGSL from "../node_shaders/generate/fbm.cs.wgsl?raw";
import timeWGSL from "../node_shaders/generate/time.cs.wgsl?raw";
import uvTransformWGSL from "../node_shaders/combine/uv_transform.cs.wgsl?raw";
import splitVec4WGSL from "../node_shaders/combine/split_vec4.cs.wgsl?raw";
import combineVec2WGSL from "../node_shaders/combine/combine_vec2.cs.wgsl?raw";
import combineVec3WGSL from "../node_shaders/combine/combine_vec3.cs.wgsl?raw";
import combineVec4WGSL from "../node_shaders/combine/combine_vec4.cs.wgsl?raw";
import sinCosWGSL from "../node_shaders/combine/sin_cos.cs.wgsl?raw";
import dotProductWGSL from "../node_shaders/combine/dot_product.cs.wgsl?raw";
import oneMinusWGSL from "../node_shaders/combine/one_minus.cs.wgsl?raw";
import gradientWGSL from "../node_shaders/generate/gradient.cs.wgsl?raw";
import clampWGSL from "../node_shaders/combine/clamp.cs.wgsl?raw";
import { nodeDefinitions, NodeType } from "../../definitions";

export const nodeWGSL = {
    [NodeType.Time]: {name: "time", source: timeWGSL},
    [NodeType.Color]: {name: "color", source: colorWGSL},
    [NodeType.Constant]: {name: "constant", source: constantWGSL},
    [NodeType.Add]: {name: "add", source: addWGSL},
    [NodeType.Subtract]: {name: "subtract", source: subtractWGSL},
    [NodeType.Step]: {name: "step", source: stepWGSL},
    [NodeType.Multiply]: {name: "multiply", source: multiplyWGSL},
    [NodeType.Power]: {name: "power", source: powerWGSL},
    [NodeType.Invert]: {name: "invert", source: invertWGSL},
    [NodeType.Blend]: {name: "blend", source: blendWGSL},
    [NodeType.PerlinNoise]: {name: "perlin", source: perlinWGSL},
    [NodeType.WorleyNoise]: {name: "worley", source: worleyWGSL},
    [NodeType.FbmNoise]: {name: "fbm", source: fbmWGSL},
    [NodeType.UVTransform]: {name: "uv_transform", source: uvTransformWGSL},
    [NodeType.SplitVec4]: {name: "split_vec4", source: splitVec4WGSL},
    [NodeType.CombineVec2]: {name: "combine_vec2", source: combineVec2WGSL},
    [NodeType.CombineVec3]: {name: "combine_vec3", source: combineVec3WGSL},
    [NodeType.CombineVec4]: {name: "combine_vec4", source: combineVec4WGSL},
    [NodeType.SinCos]: {name: "sin_cos", source: sinCosWGSL},
    [NodeType.DotProduct]: {name: "dot_product", source: dotProductWGSL},
    [NodeType.OneMinus]: {name: "one_minus", source: oneMinusWGSL},
    [NodeType.Gradient]: {name: "gradient", source: gradientWGSL},
    [NodeType.Clamp]: {name: "clamp", source: clampWGSL},
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
    node: GraphNode, textures: Map<number, GPUTexture[]>, uniformNodes: Map<number, GraphValue[]>
): Map<number, GPUTexture> {
    if (!nodeDefinitions[node.typeId]) {
        throw new Error(`Invalid node type: ${node.typeId}`);
    }

    const inputs = new Map<number, GPUTexture>();

    for (const conn of node.connections) {
        if (uniformNodes.has(conn.upstreamNodeId)) {
            continue;
        }

        const texture = textures.get(conn.upstreamNodeId)?.[conn.upstreamSocket];
        if (!texture) {
            throw new Error(`Missing output ${conn.upstreamSocket} from input node ${conn.upstreamNodeId}`);
        }
        inputs.set(conn.inputSocket, texture);
    }

    return inputs;
}

// Helper to get the input values for a node
export function getValues(
    node: GraphNode,
    inputs: Map<number, GPUTexture>,
    uniformNodes: Map<number, GraphValue[]>
): (GraphValue | undefined)[] {
    const values: (GraphValue | undefined)[] = [];
    const nodeDefn = nodeDefinitions[node.typeId];

    for (let i = 0; i < nodeDefn.parameters.length; ++i) {
        // check if the socket is connected to a uniform node
        const conn = node.connections.find(c => c.inputSocket === i);
        const uniformVal = conn ? uniformNodes.get(conn.upstreamNodeId)?.[conn.upstreamSocket] : undefined;

        const val = uniformVal ?? node.parameters[i] ?? nodeDefn.parameters[i].default;

        if (!inputs.has(i) && uniformVal === undefined) {
            if (nodeDefn.parameters[i].socket && nodeDefn.parameters[i].default == undefined) {
                throw new Error(`Missing input connection`);
            }
            if (val == undefined && uniformVal === undefined) {
                throw new Error(`${nodeDefn.parameters[i].name} missing for node ${node.id}`)
            }
        } 
        values.push(val);
    }

    return values;
}

export function evaluateUniformNode(
    node: GraphNode,
    uniformNodes: Map<number, GraphValue[]>,
    time: number = 0
): GraphValue[] {
    const def = nodeDefinitions[node.typeId];
    if (!def.evaluateUniform && !def.evaluateUniformOutputs) {
        throw new Error(`${def.name} has no CPU uniform evaluator`);
    }

    const args: GraphValue[] = def.parameters.map((param, i) => {
        const conn = node.connections.find(c => c.inputSocket === i);
        if (conn) {
            const value = uniformNodes.get(conn.upstreamNodeId)?.[conn.upstreamSocket];
            if (value === undefined) {
                throw new Error(`Missing uniform output ${conn.upstreamSocket} from node ${conn.upstreamNodeId}`);
            }
            return value;
        }
        const value = node.parameters[i] ?? param.default;
        if (value === undefined) {
            throw new Error(`${param.name} missing for node ${node.id}`);
        }
        return value;
    });

    if (def.evaluateUniformOutputs) {
        return def.evaluateUniformOutputs(args, time);
    }
    return [def.evaluateUniform!(args, time)];
}

export function getInputChannels(node: GraphNode, nodes: GraphNode[]): number[] {
    const channels = new Array<number>(nodeDefinitions[node.typeId].parameters.length).fill(0);
    for (const connection of node.connections) {
        const upstreamNode = nodes.find(candidate => candidate.id === connection.upstreamNodeId);
        if (!upstreamNode) {
            throw new Error(`Missing node ${connection.upstreamNodeId}`);
        }
        if (nodeDefinitions[upstreamNode.typeId].packedOutputType) {
            channels[connection.inputSocket] = connection.upstreamSocket + 1;
        }
    }
    return channels;
}