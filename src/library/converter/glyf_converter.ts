import { dataTypes, nodeDefinitions, nodeDefinitionById } from '../../definitions';
import { GLYF_MAGIC_NUMBER, GLYF_HEADER_BYTE_SIZE } from '../glyf_types';
import type { glyfHeader, glyfEditorInfo, NodePosition } from '../glyf_types';
import type { graphNode, graphConnection, Graph } from '../graph_types';

function serializeHeader(graph: Graph, fileSize: number) : Uint8Array {
    const header = new Uint8Array(GLYF_HEADER_BYTE_SIZE);
    const view = new DataView(
        header.buffer, 
        header.byteOffset, 
        header.byteLength
    );

    return header;
}

function serializeNodes(graph: Graph) : Uint8Array {

}

function serializeEditor(graph: Graph) : Uint8Array {

}

function concatenateArrays(arrays: Uint8Array[], fileSize: number) : Uint8Array {
    const res = new Uint8Array(fileSize);

    let offset = 0;
    arrays.forEach((array) => {
        res.set(array, offset);
        offset += array.byteLength;
    });
    return res;
}

// Parse Graph into a .glyf 
function serializeGlyf(graph: Graph) : Uint8Array {
    const nodes = serializeNodes(graph);
    const editor = serializeEditor(graph);

    const fileSize = GLYF_HEADER_BYTE_SIZE + nodes.length + editor.length;
    const header = serializeHeader(graph, fileSize);
    
    return concatenateArrays([header, nodes, editor], fileSize)
}