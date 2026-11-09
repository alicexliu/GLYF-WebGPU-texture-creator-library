// DATA TYPES
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

// NODE DEFINITIONS
// TODO: add more as needed, may need to add more fields like
// default values
export const nodeDefinitions = {
    Color: {
        id: 0,
        parameters: {
            color: {
                type: dataTypes.VEC4,
                default: [0.0, 0.0, 0.0]
            }
        }
    },

    Constant: {
        id: 1,
        inputParameterLayout: "ONE_FLOAT",
        parameters: {
            value: {
                type: dataTypes.FLOAT32,
                default: 0.0
            }
        }
    }
}