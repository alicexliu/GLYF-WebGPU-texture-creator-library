// Structs to load a texture graph and store in memory

export interface GraphConnection {
    inputSocket: number;    // 2B
    upstreamNodeId: number; // 4B
    upstreamSocket: number; // 2B
}

export type GraphValue = number | number[];

export interface GraphNode {
    id: number,         // 4B
    typeId: number;     // 2B
    connections: GraphConnection[];
    parameters: GraphValue[]; // node-specific parameters
}

export interface Graph {
    nodes: GraphNode[];
    outputNodeId: number;
}

export interface GraphEditorInfo {
    nodePositions: Map<number, [number, number]>; // node_id to canvas coords
}