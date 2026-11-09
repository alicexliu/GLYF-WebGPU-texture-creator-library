// Structs to load a texture graph and store in memory

export interface graphConnection {
    inputSocket: number;    // 2B
    upstreamNodeId: number; // 4B
    upstreamSocket: number; // 2B
}

export type graphValue = number | number[];

export interface graphNode {
    id: number,     // 4B
    type: number;   // 2B
    connections: graphConnection[];
    inputValues: Record<string, graphValue>; // inputs from parent nodes
    parameters: Record<string, graphValue>; // node-specific parameters
}

export interface Graph {
    nodes: Map<number, graphNode>;
    outputNodeId: number;
}