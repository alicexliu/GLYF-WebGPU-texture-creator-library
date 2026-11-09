// Structs for GLYF file definition
export const GLYF_MAGIC_NUMBER = 0x46594C47; // 'GLYF' litte endian
export const GLYF_VERSION = 1;

export interface glyfHeader {
    magic: number; // TOASK: what is this?
    version: number; // TOASK: do we really need multiple glyf format versions
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
    id: number;                 //4B
    type: number;               // 2B
    connectionCount: number;    // 16B
    connections: glyfConnection[];
    parameterLength: number;    // 2B
    parameterData: Uint8Array;
}