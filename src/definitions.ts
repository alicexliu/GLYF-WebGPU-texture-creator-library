// DATA TYPES

import { GraphValue } from "./library/graph_types";

// TODO: add more as needed
export const dataTypes = {
    FLOAT32: {
        size:  Float32Array.BYTES_PER_ELEMENT,
        type: "float32"
    },

    UINT16: {
        size: Uint16Array.BYTES_PER_ELEMENT,
        type: "uint16"
    },

    UINT32: {
        size: Uint32Array.BYTES_PER_ELEMENT,
        type: "uint32"
    },

    VEC2: {
        size: 2 * Float32Array.BYTES_PER_ELEMENT,
        type: "vec2"
    },

    VEC3: {
        size: 3 * Float32Array.BYTES_PER_ELEMENT,
        type: "vec3"
    },

    VEC4: {
        size: 4 * Float32Array.BYTES_PER_ELEMENT,
        type: "vec4"
    }
};

// TODO: add more as needed
export enum NodeType {
    Output = 0,
    Color = 1,
    Constant = 2,
    Add = 3,
    Invert = 4,
}

export interface NodeDefinition {
    typeId: NodeType;
    name: string;
    parameters: Array<{ name: string; type: { size: number; type: string; }; socket?: boolean; default?: GraphValue; }>;
    outputs: Array<{ name: string; type: { size: number; type: string; } }>;
}

// NODE DEFINITIONS
// TODO: add more as needed 
// NOTE: i changed Color and constant to hold value in 
// added parameters too and changed inputs inputs bc they belong to the node rather 
// than being required to be input from another node, but should be able to feed in 

// PARAMETERS:
// socket: true -> can have node input socket / false -> can only be set manually
// default: initial value for the parameter, can be changed manually 

// socket + default -> can be set manually, but input node overrides
// socket only -> input node required
// default only -> can only be set manually
// neither -> not allowed
export const nodeDefinitions: Record<NodeType, NodeDefinition> = {
    [NodeType.Output]: {
        typeId: NodeType.Output,
        name: "Output",
        parameters: [
            { name: "albedo", type: dataTypes.VEC3, socket: true },
            { name: "normal", type: dataTypes.VEC3, socket: true, default: [0.5, 0.5, 1.0] },
        ],
        outputs: []
    },
    [NodeType.Color]: {
        typeId: NodeType.Color,
        name: "Color",
        parameters: [
            { name: "value", type: dataTypes.VEC4, default: [0.0, 0.0, 0.0, 1.0] },
        ],
        outputs: [
            { name: "value", type: dataTypes.VEC4 }
        ]
    },
    [NodeType.Constant]: {
        typeId: NodeType.Constant,
        name: "Constant",
        parameters: [ 
            { name: "value", type: dataTypes.FLOAT32, default: 0.0 }
        ],
        outputs: [
            { name: "value", type: dataTypes.FLOAT32 }
        ]
    },
    [NodeType.Add]: {
        typeId: NodeType.Add,
        name: "Add",
        parameters: [
            { name: "a", type: dataTypes.FLOAT32, socket: true, default: 0.0 },
            { name: "b", type: dataTypes.FLOAT32, socket: true, default: 0.0 }
        ],
        outputs: [
            { name: "value", type: dataTypes.FLOAT32 }
        ]
    },
    [NodeType.Invert]: {
        typeId: NodeType.Invert,
        name: "Invert",
        parameters: [
            { name: "value", type: dataTypes.VEC4, socket: true }
        ],
        outputs: [
            { name: "value", type: dataTypes.VEC4 }
        ]
    },
};