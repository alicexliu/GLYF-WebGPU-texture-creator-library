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
// TODO: add more as needed 
// NOTE: i changed Color and constant to hold value in 
// added parameters too and changed inputs inputs bc they belong to the node rather 
// than being required to be input from another node, but should be able to feed in
export const nodeDefinitions = {
    Color: {
        id: 0,

        inputs: [],

        parameters: [
            {
                name: "value",
                type: dataTypes.VEC4,
                default: [0.0, 0.0, 0.0, 0.0]
            },
        ],

        outputs: [
            { name: "value", type: "float32" }
        ]
    },

    Constant: {
        id: 1,

        inputs: [],

        parameters: [
            {
                name: "value",
                type: dataTypes.FLOAT32,
                default: 0.0
            },
        ],

        outputs: [
            { name: "value", type: dataTypes.FLOAT32 }
        ]
    },

    Add: {
        id: 2,

        inputs: [
            {
                name: "a",
                type: dataTypes.FLOAT32,
                fallbackParameter: "a"
            },
            {
                name: "b",
                type: dataTypes.FLOAT32,
                fallbackParameter: "b"
            },
        ],

        parameters: [
            {
                name: "a",
                type: dataTypes.FLOAT32,
                default: 0.0
            },
            {
                name: "b",
                type: dataTypes.FLOAT32,
                default: 0.0
            },
        ],

        outputs: [
            { name: "value", type: "float32" }
        ]
    },
}

export const nodeDefinitionById = new Map(
    Object.values(nodeDefinitions).map(def => [def.id, def])
);