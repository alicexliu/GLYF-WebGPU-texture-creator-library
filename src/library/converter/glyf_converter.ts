import { BinaryWriter } from '../binary_read_write';
import { dataTypes, nodeDefinitions, nodeDefinitionById } from '../../definitions';
import { GLYF_MAGIC_NUMBER, GLYF_HEADER_BYTE_SIZE } from '../glyf_types';
import type { glyfHeader, glyfEditorInfo, NodePosition } from '../glyf_types';
import type { graphNode, graphConnection, Graph } from '../graph_types';

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
    const header = new Uint8Array(GLYF_HEADER_BYTE_SIZE);
    const writer = new BinaryWriter(header);

    writer.setUint32(GLYF_MAGIC_NUMBER);
    writer.setUint32(fileSize);
    writer.setUint32(graph.nodes.length);
    writer.setUint32(graph.outputNodeId);

    return header;
}

function serializeNodes(graph: Graph) : Uint8Array {
    const node_count = graph.nodes.length;
    let nodes_size = 0;

    for (let i = 0; i < node_count; ++i) {
        const node = graph.nodes[i];
        const definition = nodeDefinitionById(node.type)
        nodes_size += ;
    }

    const nodes = new Uint8Array();
    return nodes;
}

function serializeEditor(graph: Graph) : Uint8Array {
    const node_count = graph.nodes.length;
    const editor_size = node_count * 12;
    const editor = new Uint8Array(editor_size);
    const writer = new BinaryWriter(editor);

    for (let i = 0; i < node_count; ++i) {
        const node = graph.nodes[i];
        writer.setUint32(node.id);
        writer.setFloat32(node.x_coord);
        writer.setFloat32(node.y_coord);
    }

    return editor;
}

// Parse Graph into a .glyf 
function serializeGlyf(graph: Graph) : Uint8Array {
    const nodes = serializeNodes(graph);
    const editor = serializeEditor(graph);

    const fileSize = GLYF_HEADER_BYTE_SIZE + nodes.length + editor.length;
    const header = serializeHeader(graph, fileSize);
    
    return concatenateArrays([header, nodes, editor], fileSize)
}