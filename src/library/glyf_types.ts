// Structs for GLYF file definition
export const GLYF_MAGIC_NUMBER = 0x46594C47; // 'GLYF' little endian
export const GLYF_HEADER_BYTE_SIZE = 16;

export interface glyfHeader {
    magic: number;          // 4B
    fileSize: number;       // 4B
    nodeCount: number;      // 4B
    outputNodeId: number;   // 4B
}

export interface glyfConnection {
    inputSocket: number;    // 2B
    upstreamNodeId: number; // 4B
    upstreamSocket: number; // 2B
}

export interface glyfNode {
    id: number;                 // 4B
    type: number;               // 2B
    connectionCount: number;    // 4B
    connections: glyfConnection[];
    parameterLength: number;    // 2B
    parameterData: Uint8Array;
}

export interface NodePosition {
    id: number;         // 4B
    x: number;          // 4B
    y: number;          // 4B
}

export interface glyfEditorInfo {
    nodePositionData: NodePosition[];
    // metadataLength: number;         // 4B
    // metadata: Uint8Array; // TODO: figure out if we actually have extra metadata to store
}