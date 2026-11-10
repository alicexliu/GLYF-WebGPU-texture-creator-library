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

// PARAMETERS:
// socket: true -> can have node input socket / false -> can only be set manually
// default: initial value for the parameter, can be changed manually 

// socket + default -> can be set manually, but input node overrides
// socket only -> input node required
// default only -> can only be set manually
// neither cant happen 
export const nodeDefinitions = {
    Output: {
        typeId: 0,

        parameters: [
            { name: "albedo",     type: dataTypes.VEC3,    socket: true },                       
            { name: "normal",     type: dataTypes.VEC3,    socket: true,  default: [0.5, 0.5, 1.0] }, // (0,0,1) flattened
        ],
        outputs: []
    },
    Color: {
        typeId: 1,
        name: "Color",
        parameters: [
            {
                name: "value",
                type: dataTypes.VEC4,
                default: [0.0, 0.0, 0.0, 1.0]
            },
        ],

        outputs: [
            { name: "value", type: dataTypes.VEC4 }
        ]
    },

    Constant: {
        typeId: 2,
        name: "Constant",

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
        typeId: 3,
        name: "Add",

        parameters: [
            { name: "a",     type: dataTypes.FLOAT32,    socket: true,  default: 0.0 },
            { name: "b",     type: dataTypes.FLOAT32,    socket: true,  default: 0.0 },
        ],

        outputs: [
            { name: "value", type: dataTypes.FLOAT32 }
        ]
    },

    Invert: {
        typeId: 4,
        name: "Invert",

        parameters: [
            { name: "value", type: dataTypes.VEC4, socket: true},
        ],

        outputs: [
            { name: "value", type: dataTypes.VEC4 }
        ]
    }
}

export const nodeDefinitionById = new Map(
    Object.values(nodeDefinitions).map(def => [def.typeId, def])
);