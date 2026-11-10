import { BinaryReader } from '../binary_read_write';
import { dataTypes, nodeDefinitions, nodeDefinitionById } from '../../definitions';
import { GLYF_MAGIC_NUMBER } from '../glyf_types';
import type { glyfHeader, glyfEditorInfo, NodePosition } from '../glyf_types';
import type { graphNode, graphConnection, Graph } from '../graph_types';

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

// Helper to parse different dTypes
function parseData(attributeType: { size: number; type: string; }, reader: BinaryReader): number | number[] {
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

function parseAttributes(
    reader: BinaryReader, nodeType: number, parameterLength: number
) : Record<string, number | number[]>[] {
    // TODO
    const definition = nodeDefinitionById.get(nodeType);
    if (!definition) {
        throw new Error(`Unknown node type ID: ${nodeType}`);
    }

    let inputs : Record<string, number | number[]>[] = [];
    let parameters : Record<string, number | number[]>[] = [];
    let outputs : Record<string, number | number[]>[] = [];

    // Read inputs
    for (let i = 0; i < definition.inputs.length; ++i) {
        const inputName = definition.inputs[i].name;
        const lenToSkip = inputName.length;
        reader.getString(lenToSkip);
        const data = parseData(definition.inputs[i].type, reader);
        record = {inputName: inputName, data};
        parameters.push(record);
    }

    // Read paramaters
    for (let i = 0; i < definition.parameters.length; ++i) {
        const paramName = definition.parameters[i].name;
        const lenToSkip = paramName.length;
        reader.getString(lenToSkip);
        const data = parseData(definition.parameters[i].type, reader);
        record = {paramName, data};
        parameters.push(record);
    }

    // Read output

    return {inputs, parameters};
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
    
    return {nodePositionData };
}

// Parse a GLYF file into a Graph in memory
function parseGlyf(buffer: ArrayBuffer, editor: boolean = false) : Graph {
    const reader = new BinaryReader(buffer);
    const header = parseHeader(reader);

    const nodes = [];

    for (let i = 0; i < header.nodeCount; ++i) {
        nodes.push(parseNode(reader));
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