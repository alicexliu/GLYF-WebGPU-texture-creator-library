import { BinaryReader } from '../binary_read_write';
import { dataTypes, nodeDefinitions, NodeType } from '../../definitions';
import { GLYF_MAGIC_NUMBER, glyfHeader } from '../glyf_types';
import type { GraphNode, GraphConnection, Graph, GraphValue, GraphEditorInfo } from '../graph_types';

// TODO: ADD MORE VALIDATION; probably use fileSize for some of it
function parseHeader(reader: BinaryReader) : glyfHeader {
    const header: glyfHeader = {
        magic: reader.getUint32(),
        fileSize: reader.getUint32(),
        nodeCount: reader.getUint32(),
        outputNodeId: reader.getUint32()
    };

    if (header.magic != GLYF_MAGIC_NUMBER) {
        throw new Error("Invalid GLYF");
    }
    
    return header;
}

function parseNode(reader: BinaryReader) : GraphNode {
    const id = reader.getUint32();
    const typeId = reader.getUint16() as NodeType;;

    const connectionCount = reader.getUint16();
    const connections = [];
    for (let i = 0; i < connectionCount; ++i) {
        connections.push(parseConnections(reader));
    }
    
    const parameters = parseParameters(reader, typeId);
    
    return {id, typeId, connections, parameters};
}

function parseConnections(reader: BinaryReader) : GraphConnection {
    return {
        upstreamNodeId: reader.getUint32(),
        upstreamSocket: reader.getUint16(),
        inputSocket: reader.getUint16()
    };
}

// Helper to parse different dTypes
function parseData(attributeType: { size: number; type: string; }, reader: BinaryReader): GraphValue {
    switch (attributeType) {
        case dataTypes.VEC4:
            return reader.getVec4();

        case dataTypes.FLOAT32:
            return reader.getFloat32();

        case dataTypes.UINT16:
            return reader.getUint16();

        case dataTypes.UINT32:
            return reader.getUint32();

        case dataTypes.VEC2:
            return reader.getVec2();

        case dataTypes.VEC3:
            return reader.getVec3();

        default:
            throw new Error(`Unknown attribute type ID: ${attributeType}`);
    }
}

function parseParameters(reader: BinaryReader, nodeType: number) : GraphValue[] {
    // Read paramaters
    let definition = nodeDefinitions[nodeType];
    if (!definition) {
        throw new Error(`Unknown node type ID: ${nodeType}`);
    }

    const parameters: GraphValue[] = [];
    for (const parameter of definition.parameters) {
        parameters.push(parseData(parameter.type, reader));
    }

    return parameters;
}

function parseEditorData(reader: BinaryReader, header: glyfHeader) : GraphEditorInfo {
    // TODO: add any additional fields needed by the editor
    let nodePositions = new Map<number, [number, number]>();
    for (let i = 0; i < header.nodeCount; ++i) {
        const id = reader.getUint32();
        const x = reader.getFloat32();
        const y = reader.getFloat32();
        nodePositions.set(id, [x, y]);
    }
    
    return {nodePositions};
}

// Parse a GLYF file into a Graph in memory
function parseGlyf(buffer: ArrayBuffer, editor: boolean = false) : Graph {
    const reader = new BinaryReader(buffer);
    const header = parseHeader(reader);

    const nodes = [];

    for (let i = 0; i < header.nodeCount; ++i) {
        nodes.push(parseNode(reader));
    }

    let editorInfo = undefined;
    if (editor && reader.getOffset() < header.fileSize) {
        editorInfo = parseEditorData(reader, header);
    }

    return {
        nodes,
        outputNodeId: header.outputNodeId,
        editorInfo
    };
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