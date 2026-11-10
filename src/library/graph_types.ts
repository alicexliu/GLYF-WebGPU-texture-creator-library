// Structs to load a texture graph and store in memory

export interface graphConnection {
    inputSocket: number;    // 2B
    upstreamNodeId: number; // 4B
    upstreamSocket: number; // 2B
}

export type graphValue = number | number[];

export interface graphNode {
    id: number,     // 4B
    typeId: number;   // 2B
    connections: graphConnection[];
    parameters: Record<string, graphValue>; // node-specific parameters

    x_coord: number, // 4B float
    y_coord: number, // 4B float
}

export interface Graph {
    nodes: graphNode[];
    outputNodeId: number;
}