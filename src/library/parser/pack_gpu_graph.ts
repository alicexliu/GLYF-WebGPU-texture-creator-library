// Graph instructions to dispatch to GPU
// struct Instruction {
//     opcode: u32,
//     nodeId: u32,
//     inputOffset: u32,
//     inputCount: u32,
//     parameterOffset: u32,
//     outputSlot: u32,
// };
export const INSN_NUM_FIELDS = 6;
export const EMPTY = 0xffffffff;

import { nodeDefinitions, NodeType } from "../../definitions";
import { Graph } from "../graph_types";

export function packGPUGraph(graph: Graph) {
    const nodeMap = new Map(graph.nodes.map((node, index) => [node.id, index]));
    if (nodeMap.size != graph.nodes.length) {
        throw new Error(`Invalid graph: nodes with duplicate id`);
    }

    const outputIndex = nodeMap.get(graph.outputNodeId);
    if (outputIndex === undefined ||
        graph.nodes[outputIndex].typeId !== NodeType.Output
    ) {
        throw new Error(`Inalid graph: Invalid output node`);
    }

    const nodeDefns = graph.nodes.map(node => {
        return nodeDefinitions[node.typeId];
    });

    const numParams = nodeDefns.reduce((total, x) => total + x.parameters.length, 0);
    const insns = new Uint32Array(graph.nodes.length * INSN_NUM_FIELDS);
    const inputIndices = new Uint32Array(numParams);
    inputIndices.fill(EMPTY);

    // Separate buffers to store int and float parameters
    const parameters = new Uint32Array(numParams * 4);
    const floatParams = new Float32Array(parameters.buffer);
    
    let offset = 0;

    for (let i = 0; i < graph.nodes.length; ++i) {
        let curr = graph.nodes[i];
        const insnOffset = i * INSN_NUM_FIELDS;
        
        insns.set([
            curr.typeId,
            curr.id,
            offset,
            nodeDefns[i].parameters.length,
            offset,
            curr.typeId == NodeType.Output ? EMPTY : i
        ], insnOffset);

        for (let j = 0; j < nodeDefns[i].parameters.length; ++j) {
            const paramDefn = nodeDefns[i].parameters[j];
            const paramValue = curr.parameters[j] ?? paramDefn.default;
            if (paramValue == undefined) {
                continue;
            }

            const paramComponents = typeof paramValue == "number" ? [paramValue] : paramValue;
            if (paramComponents.length > 4) {
                throw new Error(`Longest param type allowed is 4 components (vec4), this is ${paramComponents.length}`);
            }

            const base = (offset + j) * 4;
            for (let c = 0; c < paramComponents.length; ++c) {
                if (paramDefn.type.type == "uint16" || paramDefn.type.type == "uint32") {
                    parameters[base + c] = paramComponents[c];
                } else {
                    floatParams[base + c] = paramComponents[c];
                }
            }
        }

        const connectedSockets = new Set<number>();
        for (const c of curr.connections) {
            const socket = c.inputSocket;
            const sourceIndex = nodeMap.get(c.upstreamNodeId);
            if (
                !Number.isInteger(c.inputSocket) || !nodeDefns[i].parameters[socket]?.socket || 
                sourceIndex == undefined || c.upstreamSocket != 0 || 
                nodeDefns[sourceIndex].outputs.length == 0
            ) {
                throw new Error(`Socket in node ${curr.id} invalid`);
            }
            if (connectedSockets.has(socket)) {
                throw new Error(`Dupplicate input in node ${curr.id}`);
            }
            connectedSockets.add(socket);
            inputIndices[offset + socket] = sourceIndex;
        }

        offset += nodeDefns[i].parameters.length;
    }

    return {
        insns,
        inputIndices,
        parameters,
        nodeCount: graph.nodes.length,
        outputIndex,
    }
}