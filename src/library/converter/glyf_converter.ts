import { BinaryWriter } from '../binary_read_write';
import { dataTypes, nodeDefinitions } from '../../definitions';
import { GLYF_MAGIC_NUMBER, GLYF_HEADER_BYTE_SIZE, GLYF_CONNECTION_BYTE_SIZE } from '../glyf_types';
import type { GraphNode, GraphConnection, Graph, GraphValue, GraphEditorInfo } from '../graph_types';

function concatenateArrays(arrays: Uint8Array[], fileSize: number) : Uint8Array {
    const res = new Uint8Array(fileSize);

    let offset = 0;
    arrays.forEach((array) => {
        res.set(array, offset);
        offset += array.byteLength;
    });
    return res;
}

function serializeHeader(graph: Graph, fileSize: number) : Uint8Array {
    const header_buffer = new Uint8Array(GLYF_HEADER_BYTE_SIZE);
    const writer = new BinaryWriter(header_buffer);

    writer.setUint32(GLYF_MAGIC_NUMBER);
    writer.setUint32(fileSize);
    writer.setUint32(graph.nodes.length);
    writer.setUint32(graph.outputNodeId);

    return header_buffer;
}

// Helper to write different dTypes
function writeData(attributeType: { size: number; type: string; }, writer: BinaryWriter, value: GraphValue | undefined) {
    switch (attributeType) {
        case dataTypes.FLOAT32:
            writer.setFloat32(value as number);
            break;

        case dataTypes.UINT16:
            writer.setUint16(value as number);
            break;

        case dataTypes.UINT32:
            writer.setUint32(value as number);
            break;

        case dataTypes.VEC2:
            writer.setVec2(value as [number, number]);
            break;

        case dataTypes.VEC3:
            writer.setVec3(value as [number, number, number]);
            break;

        case dataTypes.VEC4:
            writer.setVec4(value as [number, number, number, number]);
            break;

        default:
            throw new Error(`Unknown attribute type ID: ${attributeType}`);
    }
}

function serializeNodes(graph: Graph) : Uint8Array {
    const MAX_ALLOC = 65536; // 64 KB
    const node_buffer = new Uint8Array(MAX_ALLOC);
    const writer = new BinaryWriter(node_buffer);
    
    // iterate through each node
    for (const node of graph.nodes) {
        const definition = nodeDefinitions[node.typeId];
        if (!definition) {
            throw new Error(`Unknown node type ID: ${node.typeId}`);
        }

        // node data
        writer.setUint32(node.id);
        writer.setUint16(node.typeId);

        // connections
        const connections = node.connections;
        writer.setUint16(connections.length);
        for (const connection of connections) {
            writer.setUint32(connection.upstreamNodeId);
            writer.setUint16(connection.upstreamSocket);
            writer.setUint16(connection.inputSocket);
        }

        // parameters
        const parameters = definition.parameters;
        for (let i = 0; i < parameters.length; ++i) {
            const def_parameter = parameters[i];

            // if parameter is undefined, don't write any data
            if (def_parameter.socket === true && def_parameter.default === undefined) {
                continue; 
            }

            const parameter = node.parameters[i];
            if (parameter === undefined) {
                throw new Error(`Validation Error: Node ${node.id} missing required parameter '${def_parameter.name}'`);
            }
            
            writeData(def_parameter.type, writer, parameter);
        }
    }

    return node_buffer.subarray(0, writer.getOffset());
}

function serializeEditor(graph: GraphEditorInfo) : Uint8Array {
    const node_count = graph.nodePositions.size;
    const editor_size = node_count * 12;
    const editor_buffer = new Uint8Array(editor_size);
    const writer = new BinaryWriter(editor_buffer);

    for (const [nodeId, position] of graph.nodePositions) {
        writer.setUint32(nodeId);
        writer.setFloat32(position[0]); // x position
        writer.setFloat32(position[1]); // y position
    }

    return editor_buffer;
}

// Parse Graph into a .glyf 
export function serializeGlyf(graph: Graph, graphEditorInfo: GraphEditorInfo) : Uint8Array {
    const nodes_buffer = serializeNodes(graph);
    const editor_buffer = serializeEditor(graphEditorInfo);

    const fileSize = GLYF_HEADER_BYTE_SIZE + nodes_buffer.length + editor_buffer.length;
    const header_buffer = serializeHeader(graph, fileSize);
    
    return concatenateArrays([header_buffer, nodes_buffer, editor_buffer], fileSize)
}