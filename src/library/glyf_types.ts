// Structs for GLYF file definition
export const GLYF_MAGIC_NUMBER = 0x46594C47; // 'GLYF' little endian
export const GLYF_HEADER_BYTE_SIZE = 16;
export const GLYF_CONNECTION_BYTE_SIZE = 8;

export interface glyfHeader {
    magic: number;          // 4B - int32
    fileSize: number;       // 4B - int32
    nodeCount: number;      // 4B - int32
    outputNodeId: number;   // 4B - int32
}

export interface glyfConnection {
    inputSocket: number;    // 2B - int16
    upstreamNodeId: number; // 4B - int32
    upstreamSocket: number; // 2B - int16
}

export interface glyfNode {
    id: number;                 // 4B - int32
    typeId: number;             // 2B - int16
    numConnections: number;     // 2B - int16
    connections: glyfConnection[];
    parameterData: Uint8Array;
}

export interface NodePosition {
    id: number;         // 4B - int32
    x: number;          // 4B - float
    y: number;          // 4B - float
}

export interface glyfEditorInfo {
    nodePositionData: NodePosition[]; 
    // metadataLength: number;         // 4B
    // metadata: Uint8Array; // TODO: figure out if we actually have extra metadata to store
}