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
    Step = 13,
    // Removed node IDs remain unused to keep serialized GLYF IDs stable.
    SplitVec4 = 16,
    Power = 17,
    CombineVec2 = 18,
    CombineVec3 = 19,
    CombineVec4 = 20,
    SinCos = 21,
}

export interface NodeDefinition {
    typeId: NodeType;
    name: string;
    parameters: Array<{ name: string; type: { size: number; type: string; }; socket?: boolean; default?: GraphValue; toggle?: boolean; }>;
    outputs: Array<{ name: string; type: { size: number; type: string; } }>;
    packedOutputType?: string;
    useUTime?: boolean; // uses time that is from Uniform(precise), rather than from socket input(f16)
    evaluateUniform?: (args: GraphValue[], time: number) => GraphValue;
    evaluateUniformOutputs?: (args: GraphValue[], time: number) => GraphValue[];
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
    [NodeType.Step]: {
        typeId: NodeType.Step,
        name: "Step",
        parameters: [
            { name: "edge", type: dataTypes.FLOAT32, socket: true, default: 0.5 },
            { name: "x", type: dataTypes.FLOAT32, socket: true, default: 0.0 }
        ],
        outputs: [
            { name: "out", type: dataTypes.FLOAT32 }
        ],
        evaluateUniform: ([edge, x]) => asFloat(x) < asFloat(edge) ? 0.0 : 1.0,
    },
    [NodeType.SplitVec4]: {
        typeId: NodeType.SplitVec4,
        name: "Split Vec4",
        parameters: [
            { name: "vec4", type: dataTypes.VEC4, socket: true }
        ],
        outputs: [
            { name: "x", type: dataTypes.FLOAT32 },
            { name: "y", type: dataTypes.FLOAT32 },
            { name: "z", type: dataTypes.FLOAT32 },
            { name: "w", type: dataTypes.FLOAT32 }
        ],
        packedOutputType: "vec4",
        evaluateUniformOutputs: ([vector]) => toVec4CPU(vector),
    },
    [NodeType.CombineVec2]: {
        typeId: NodeType.CombineVec2,
        name: "Combine Vec2",
        parameters: [
            { name: "x", type: dataTypes.FLOAT32, socket: true, default: 0.0 },
            { name: "y", type: dataTypes.FLOAT32, socket: true, default: 0.0 }
        ],
        outputs: [
            { name: "out(2)", type: dataTypes.VEC2 }
        ],
        evaluateUniform: ([x, y]) => [asFloat(x), asFloat(y)],
    },
    [NodeType.CombineVec3]: {
        typeId: NodeType.CombineVec3,
        name: "Combine Vec3",
        parameters: [
            { name: "x", type: dataTypes.FLOAT32, socket: true, default: 0.0 },
            { name: "y", type: dataTypes.FLOAT32, socket: true, default: 0.0 },
            { name: "z", type: dataTypes.FLOAT32, socket: true, default: 0.0 }
        ],
        outputs: [
            { name: "out(3)", type: dataTypes.VEC3 }
        ],
        evaluateUniform: ([x, y, z]) => [asFloat(x), asFloat(y), asFloat(z)],
    },
    [NodeType.CombineVec4]: {
        typeId: NodeType.CombineVec4,
        name: "Combine Vec4",
        parameters: [
            { name: "x", type: dataTypes.FLOAT32, socket: true, default: 0.0 },
            { name: "y", type: dataTypes.FLOAT32, socket: true, default: 0.0 },
            { name: "z", type: dataTypes.FLOAT32, socket: true, default: 0.0 },
            { name: "w", type: dataTypes.FLOAT32, socket: true, default: 1.0 }
        ],
        outputs: [
            { name: "out(4)", type: dataTypes.VEC4 }
        ],
        evaluateUniform: ([x, y, z, w]) => [asFloat(x), asFloat(y), asFloat(z), asFloat(w)],
    },
    [NodeType.SinCos]: {
        typeId: NodeType.SinCos,
        name: "Sin/Cos",
        parameters: [
            { name: "x", type: dataTypes.FLOAT32, socket: true, default: 0.0 },
            { name: "mode", type: dataTypes.UINT32, default: 0, toggle: true },
            { name: "amplitude", type: dataTypes.FLOAT32, default: 1.0 },
            { name: "frequency", type: dataTypes.FLOAT32, default: 1.0 },
            { name: "offset", type: dataTypes.FLOAT32, default: 0.0 }
        ],
        outputs: [
            { name: "out", type: dataTypes.FLOAT32 }
        ],
        evaluateUniform: ([x, mode, amplitude, frequency, offset]) => {
            const angle = asFloat(x) * asFloat(frequency);
            const wave = asFloat(mode) > 0 ? Math.cos(angle) : Math.sin(angle);
            return asFloat(amplitude) * wave + asFloat(offset);
        },
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
    [NodeType.Power]: {
        typeId: NodeType.Power,
        name: "Power",
        parameters: [
            { name: "base", type: dataTypes.FLOAT32, socket: true, default: 2.0 },
            { name: "exponent", type: dataTypes.FLOAT32, socket: true, default: 2.0 }
        ],
        outputs: [
            { name: "out", type: dataTypes.FLOAT32 }
        ],
        evaluateUniform: ([base, exponent]) => Math.pow(asFloat(base), asFloat(exponent)),
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