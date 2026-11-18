export interface CostEstimate {
    space: number; // bytes per texture out
    warmTime: number | null; // ms per warm eval of node
}

// Combines measured evaluation time with rgba16float image storage
export function estimateNodeCost(
    width: number,
    height: number,
    imageCount: number,
    warmTime?: number
): CostEstimate {
    return {
        space: width * height * imageCount * 8,
        warmTime: warmTime ?? null,
    };
}