// DATA TYPES

import { GraphValue } from "./library/graph_types";
import { asFloat, toVec4CPU } from "./library/node_shader_builder"

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
    Time = 1,
    Color = 2,
    Constant = 3,
    Add = 4,
    Invert = 5,
    Subtract = 6,
    Multiply = 7,
    PerlinNoise = 8,
    WorleyNoise = 9,
    FbmNoise = 10,
    UVTransform = 11,
    Blend = 12,
}

export interface NodeDefinition {
    typeId: NodeType;
    name: string;
    parameters: Array<{ name: string; type: { size: number; type: string; }; socket?: boolean; default?: GraphValue; }>;
    outputs: Array<{ name: string; type: { size: number; type: string; } }>;
    useUTime?: boolean; // uses time that is from Uniform(precise), rather than from socket input(f16)
    evaluateUniform?: (args: GraphValue[], time: number) => GraphValue;
}

// NODE DEFINITIONS 

// PARAMETERS:
// socket: true -> can have node input socket / false -> can only be set manually
// default: initial value for the parameter, can be changed manually 

// socket + default -> can be set manually, but input node overrides
// socket only -> input node required
// default only -> can only be set manually
// neither -> not allowed

// useUTime flag should be on if you want to use input uniform directly for precision
// if name == 'uv' then fallback would be the built-in uv coordinates (must still define def, but will be ignored)
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
    [NodeType.Time]: {
        typeId: NodeType.Time,
        name: "Time",
        parameters: [],
        outputs: [
            { name: "out", type: dataTypes.FLOAT32 }
        ],
        useUTime: true,
        evaluateUniform: (_, time) => time,
        
    },
    [NodeType.Color]: {
        typeId: NodeType.Color,
        name: "Color",
        parameters: [
            { name: "color", type: dataTypes.VEC4, default: [0.0, 0.0, 0.0, 1.0] },
        ],
        outputs: [
            { name: "out", type: dataTypes.VEC4 }
        ],
        evaluateUniform: ([val]) => toVec4CPU(val),
    },
    [NodeType.Constant]: {
        typeId: NodeType.Constant,
        name: "Constant",
        parameters: [ 
            { name: "constant", type: dataTypes.FLOAT32, default: 0.0 }
        ],
        outputs: [
            { name: "out", type: dataTypes.FLOAT32 }
        ],
        evaluateUniform: ([val]) => asFloat(val),
    },
    [NodeType.Add]: {
        typeId: NodeType.Add,
        name: "Add",
        parameters: [
            { name: "a", type: dataTypes.FLOAT32, socket: true, default: 0.0 },
            { name: "b", type: dataTypes.FLOAT32, socket: true, default: 0.0 }
        ],
        outputs: [
            { name: "out", type: dataTypes.FLOAT32 }
        ],
        evaluateUniform: ([a, b]) => asFloat(a) + asFloat(b),
    },
    [NodeType.Subtract]: {
        typeId: NodeType.Subtract,
        name: "Subtract",
        parameters: [
            { name: "a", type: dataTypes.FLOAT32, socket: true, default: 0.0 },
            { name: "b", type: dataTypes.FLOAT32, socket: true, default: 0.0 }
        ],
        outputs: [
            { name: "out", type: dataTypes.FLOAT32 }
        ],
        evaluateUniform: ([a, b]) => asFloat(a) - asFloat(b),
    },
    [NodeType.Multiply]: {
        typeId: NodeType.Multiply,
        name: "Multiply",
        parameters: [
            { name: "a", type: dataTypes.FLOAT32, socket: true, default: 0.0 },
            { name: "b", type: dataTypes.FLOAT32, socket: true, default: 0.0 }
        ],
        outputs: [
            { name: "out", type: dataTypes.FLOAT32 }
        ],
        evaluateUniform: ([a, b]) => asFloat(a) * asFloat(b),
    },
    [NodeType.Invert]: {
        typeId: NodeType.Invert,
        name: "Invert",
        parameters: [
            { name: "in", type: dataTypes.VEC4, socket: true }
        ],
        outputs: [
            { name: "out", type: dataTypes.VEC4 }
        ],
        evaluateUniform: ([val]) => {
            const c = toVec4CPU(val);
            return [1.0 - c[0], 1.0 - c[1], 1.0 - c[2], c[3]];
        },
    },
    [NodeType.PerlinNoise]: {
        typeId: NodeType.PerlinNoise,
        name: "Perlin Noise",
        parameters: [
            { name: "uv", type: dataTypes.VEC2, socket: true, default: [0,0] },
            { name: "scale", type: dataTypes.FLOAT32, socket: true, default: 1.0 },
            { name: "translation", type: dataTypes.VEC2, socket: true, default: [0.0, 0.0] }
        ],
        outputs: [
            { name: "out", type: dataTypes.FLOAT32 }
        ]
    },
    [NodeType.WorleyNoise]: {
        typeId: NodeType.WorleyNoise,
        name: "Worley Noise",
        parameters: [
            { name: "uv", type: dataTypes.VEC2, socket: true, default: [0,0] },
            { name: "scale", type: dataTypes.FLOAT32, socket: true, default: 8.0 },
            { name: "translation", type: dataTypes.VEC2, socket: true, default: [0.0, 0.0] }
        ],
        outputs: [
            { name: "out", type: dataTypes.FLOAT32 }
        ]
    },
    [NodeType.FbmNoise]: {
        typeId: NodeType.FbmNoise,
        name: "FBM Noise",
        parameters: [
            { name: "uv", type: dataTypes.VEC2, socket: true, default: [0,0] },
            { name: "scale", type: dataTypes.FLOAT32, socket: true, default: 8.0 },
            { name: "translation", type: dataTypes.VEC2, socket: true, default: [0.0, 0.0] },
            { name: "octaves", type: dataTypes.UINT32, socket: true, default: 4 }
        ],
        outputs: [
            { name: "value", type: dataTypes.FLOAT32 }
        ]
    },
    [NodeType.UVTransform]: {
        typeId: NodeType.UVTransform,
        name: "UV Transform",
        parameters: [
            { name: "uv", type: dataTypes.VEC2, socket: true, default: [0,0] },
            { name: "scale", type: dataTypes.VEC2, socket: true, default: [1.0, 1.0] },
            { name: "rotation", type: dataTypes.FLOAT32, socket: true, default: 0.0 },
            { name: "translation", type: dataTypes.VEC2, socket: true, default: [0.0, 0.0] }
        ],
        outputs: [
            { name: "out", type: dataTypes.VEC2 }
        ]
    },
    [NodeType.Blend]: {
        typeId: NodeType.Blend, 
        name: "Blend", 
        parameters: [
            { name: "a", type: dataTypes.VEC4, socket: true },
            { name: "b", type: dataTypes.VEC4, socket: true },
            { name: "factor", type: dataTypes.FLOAT32, socket: true, default: 0.5 }
        ],
        outputs: [
            { name: "out", type: dataTypes.VEC4 }
        ],
        evaluateUniform: ([a, b, factor]) => {
            const va = toVec4CPU(a);
            const vb = toVec4CPU(b);
            const f = asFloat(factor);
            return va.map((v, i) => v * (1.0 - f) + vb[i] * f);
        },
    }
};