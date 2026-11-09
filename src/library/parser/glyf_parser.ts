import { BinaryReader } from './binary_reader';
import { dataTypes, nodeDefinitions, nodeDefinitionById } from '../../definitions';
import { GLYF_MAGIC_NUMBER } from '../glyf_types';
import type { glyfHeader, glyfEditorInfo, NodePosition } from '../glyf_types';
import type { graphNode, graphConnection, Graph } from '../graph_types';

function parseHeader(reader: BinaryReader) : glyfHeader {
    const header: glyfHeader = {
        magic: reader.getUint32(), // TODO: is this what the magic number is supposed to be?
        fileSize: reader.getUint32(),
        nodeCount: reader.getUint32(),
        outputNodeId: reader.getUint32()
    };

    if (header.magic != GLYF_MAGIC_NUMBER) {
        throw new Error("Invalid GLYF");
    }
    
    return header;
}

function parseNode(reader: BinaryReader) : graphNode {
    const id = reader.getUint32();
    const type = reader.getUint16();
    const connectionCount = reader.getUint16();
    const connections = [];
    for (let i = 0; i < connectionCount; ++i) {
        connections.push(parseConnections(reader));
    }
    
    const parameterLength = reader.getUint16();
    const parameters = parseParameters(reader, type, parameterLength);
    
    return {id, type, connections, parameters};
}

function parseConnections(reader: BinaryReader) : graphConnection {
    return {
        inputSocket: reader.getUint16(),
        upstreamNodeId: reader.getUint32(),
        upstreamSocket: reader.getUint16()
    };
}

function parseParameters(
    reader: BinaryReader, nodeType: number, parameterLength: number
) : Record<string, number | number[]> {
    // TODO
    const definition = nodeDefinitionById.get(nodeType)
}

function parseEditorData(reader: BinaryReader, header: glyfHeader) : glyfEditorInfo {
    // TODO: add any additional fields needed by the editor
    let nodePositionData : NodePosition[] = [];
    for (let i = 0; i < header.nodeCount; ++i) {
        const id = reader.getUint32();
        const x = reader.getFloat32();
        const y = reader.getFloat32();
        nodePositionData.push({id, x, y});
    }
    const metadataLength = reader.getUint16();
    const metadata = null;
    
    return {nodePositionData, metadataLength, metadata};
}

// Parse a GLYF file into a Graph in memory
function parseGlyf(buffer: ArrayBuffer, editor: boolean = false) : Graph {
    const reader = new BinaryReader(buffer);
    const header = parseHeader(reader);

    const nodes = new Map<number, graphNode>();

    for (let i = 0; i < header.nodeCount; ++i) {
        const node = parseNode(reader);
        nodes.set(node.id, node);
    }

    if (editor) {
        parseEditorData(reader, header);
    }

    return {nodes, outputNodeId: header.outputNodeId};
}

// TOASK: do we want to store as urls....
// esp since for web games

// Loads glyf stored in a url
async function loadGlyfFromUrl(url: string): Promise<Graph> {
    const resp = await fetch(url);
    if (!resp.ok) {
        throw new Error(`Error loading GLYF from url: ${resp.status}`);

    }
    
    const buffer = await resp.arrayBuffer();
    return parseGlyf(buffer);
}

// Loads glyf from a local file
async function loadGlyfFromFile(file: File): Promise<Graph> {
    const buffer = await file.arrayBuffer();
    return parseGlyf(buffer);
}


// Parse Graph into a .glyf 
function serializeGlyf(graph: Graph) {
    // TODO
    throw new Error("Unimplemented");
}