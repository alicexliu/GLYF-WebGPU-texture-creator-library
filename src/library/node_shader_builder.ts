import type { NodeDefinition } from "../definitions";
import type { GraphValue } from "./graph_types";

const wgslType: Record<string, string> = {
    float32: "f32", uint16: "u32", uint32: "u32",
    vec2: "vec2f", vec3: "vec3f", vec4: "vec4f",
};

const fromVec4: Record<string, (v: string) => string> = {
    float32: v => `${v}.x`, // todo: maybe use luminance ???
    uint16:  v => `u32(${v}.x)`,
    uint32:  v => `u32(${v}.x)`,
    vec2:    v => `${v}.xy`,
    vec3:    v => `${v}.xyz`,
    vec4:    v => v,
};

const toVec4: Record<string, (v: string) => string> = {
    float32: v => `vec4f(vec3f(${v}), 1.0)`,
    uint16:  v => `vec4f(vec3f(f32(${v})), 1.0)`,
    uint32:  v => `vec4f(vec3f(f32(${v})), 1.0)`,
    vec2:    v => `vec4f(${v}, 0.0, 1.0)`,
    vec3:    v => `vec4f(${v}, 1.0)`,
    vec4:    v => v,
};

function toVec4CPU(v: GraphValue): number[] {
    if (typeof v === "number") return [v, v, v, 1];
    if (v.length === 2) return [v[0], v[1], 0, 1];
    if (v.length === 3) return [v[0], v[1], v[2], 1];
    return v;
}

export function buildNodeShader(def: NodeDefinition, nodeWGSL: string) {
     if (def.outputs.length === 0) throw new Error(`${def.name} has no output`); // for Output node 

    const outType = def.outputs[0].type.type;
    const paramN = Math.max(def.parameters.length, 1);

    const bindings: string[] = []; // ex. @group(0) @binding(2) ... 
    const reads: string[] = []; // ex. let size = ... 
    const args: string[] = ["uv"]; // ex. node(uv, size ... )

    // add parameter bindings (tex socket inputs, param inputs)
    for (const [i, param] of def.parameters.entries()) {
        const type = param.type.type;
        
        // socket 
        if (param.socket) {
            // @group(0) @binding(2+#i) var in#i: texture_2d<f32>;
            bindings.push(`@group(0) @binding(${2 + i}) var in${i}: texture_2d<f32>;`);
            // select socket tex or param, depending on connection 
            reads.push(`let raw${i} = select(params.values[${i}], textureLoad(in${i}, pixel, 0), params.connected[${i}].x > 0.5);`);
        }
        // param/default
        else {
            reads.push(`let raw${i} = params.values[${i}];`);
        }

        // vec4 -> node input format
        reads.push(`let arg${i}: ${wgslType[type]} = ${fromVec4[type](`raw${i}`)};`);
        args.push(`arg${i}`);
    }

    const wgslText = 
        `
        struct Params {
            values:    array<vec4f, ${paramN}>, // defaults, vec4f 
            connected: array<vec4f, ${paramN}>,   // .x = 1 if that parameter has a wire
        };

        @group(0) @binding(0) var<uniform> params: Params;
        @group(0) @binding(1) var outTex: texture_storage_2d<rgba16float, write>;
        ${bindings.join("\n        ")}
            
        // wgsl function 
        ${nodeWGSL}

        // main function 
        @compute @workgroup_size(8, 8)
        fn main(@builtin(global_invocation_id) id: vec3u) {
            
            let size = textureDimensions(outTex);
            if (id.x >= size.x || id.y >= size.y) { return; }
            let pixel = vec2i(id.xy);
            let uv = (vec2f(id.xy)) / vec2f(size);
            _ = params.values[0]; // for safety, always use params 

            ${reads.join("\n    ")}

            let result = node(${args.join(", ")});
            textureStore(outTex, pixel, ${toVec4[outType]("result")});
        }
        `
    return wgslText;
}

// for struct Params to pass into Shader 
// values: array<vec4f, N>
// connected: array<vec4f, N>
export function packParams(def: NodeDefinition, values: (GraphValue | undefined)[], 
                           connected: boolean[]): Float32Array {
    const n = Math.max(def.parameters.length, 1);
    // n * (vec4) * 2
    const data = new Float32Array(n * 8);             

    for (let i = 0; i < def.parameters.length; i++) {
        const v = values[i];
        // values
        if (v !== undefined) data.set(toVec4CPU(v), i * 4);
        // connected 
        data[n * 4 + i * 4] = connected[i] ? 1 : 0; 
    }
    return data;
}