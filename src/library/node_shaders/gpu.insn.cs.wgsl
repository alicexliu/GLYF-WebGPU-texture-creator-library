struct Instruction {
    opcode: u32, // should match NodeType enum
    nodeId: u32,
    inputOffset: u32,
    inputCount: u32,
    parameterOffset: u32,
    outputSlot: u32,
};

struct ExecutionInfo {
    width: u32,
    height: u32,
    numNodes: u32,
    outputIndex: u32
};

struct WorkQueue {
    tilesX: u32,
    tilesY: u32,
    count: u32,
    nodes: array<u32>
};

const EMPTY: u32 = 0xffffffffu;


@group(0) @binding(0)
var<storage, read> instructions: array<Instruction>;

@group(0) @binding(1)
var<storage, read> inputIndices: array<u32>;

@group(0) @binding(2)
var<storage, read> parameters: array<vec4u>;

@group(0) @binding(3)
var<uniform> executionInfo: ExecutionInfo;

// each texel stores 4 half-precision components in 2xu32, 8B/texel
@group(0) @binding(4)
var<storage, read_write> intermediates: array<vec2u>;

@group(0) @binding(5)
var<storage, read> workQueue: WorkQueue;

// Output texture values, add more as we have stuff like roughness etc
@group(0) @binding(6)
var albedoOutput: texture_storage_2d<rgba16float, write>;

@group(0) @binding(7)
var normalOutput: texture_storage_2d<rgba16float, write>;


fn scalarResult(value: f32) -> vec4f {
    return vec4f(vec3f(value), 1.0);
}

fn resultIndex(slot: u32, pixel:vec2u) -> u32 {
    return (slot * executionInfo.height + pixel.y) * executionInfo.width + pixel.x;
}

fn loadResult(slot: u32, pixel:vec2u) -> vec4f {
    let packed = intermediates[resultIndex(slot, pixel)];
    return vec4f(
        unpack2x16float(packed.x), unpack2x16float(packed.y)
    );
}

fn storeResult(slot: u32, pixel:vec2u, v: vec4f) {
    intermediates[resultIndex(slot, pixel)] = vec2u(
        pack2x16float(v.xy), pack2x16float(v.zw)
    );
}

fn loadFloatArgument(
    insn: Instruction,
    paramIndex: u32,
    pixel: vec2u
) -> vec4f {
    let sourceIndex = inputIndices[insn.inputOffset + paramIndex];
    if (sourceIndex != EMPTY) {
        return loadResult(instructions[sourceIndex].outputSlot, pixel);
    }

    // FBM nodes have a built-in UV fallback value
    if (insn.opcode == 10u && paramIndex == 0u) {
        let uv = vec2f(pixel) / vec2f(f32(executionInfo.width), 
            f32(executionInfo.height));
        return vec4f(uv, 0.0, 1.0);
    }

    let raw = parameters[insn.parameterOffset + paramIndex];
    return bitcast<vec4f>(raw);
}

fn evaluateNode(opcode: u32, args: array<vec4f, 4>, pixel: vec2u) -> vec4f {
    let uv = vec2f(pixel) / vec2f(f32(executionInfo.width), 
                f32(executionInfo.height));   

    switch opcode {
        // color
        case 2u: {
            return args[0];
        }
        // constant
        case 3u: {
            return scalarResult(args[0].x);
        }
        // add
        case 4u: {
            return scalarResult(args[0].x + args[1].x);
        }
        // invert
        case 5u: {
            return vec4f(vec3f(1.0) - args[0].rgb, args[0].a);
        }
        // subtract
        case 6u: {
            return scalarResult(args[0].x - args[1].x);
        }
        // multiply
        case 7u: {
            return scalarResult(args[0].x * args[1].x);
        }
        // fbm
        case 10u: {
            return scalarResult(fbmNode(
                uv,
                args[0].xy,
                args[1].x,
                args[2].xy,
                u32(args[3].x)
            ));
        }
        // blend
        case 12u: {
            return mix(args[0], args[1], args[2].x);
        }
        // should never reach here
        default: {
            return vec4f(1.0, 0.0, 1.0, 1.0);
        }
    }
}

@compute @workgroup_size(8, 8, 1)
fn main(
    @builtin(global_invocation_id) id: vec3u,
    @builtin(workgroup_id) group: vec3u
) {
    if (
        id.x >= executionInfo.width || id.y >= executionInfo.height || 
        group.z >= workQueue.count
    ) {
        return;
    }

    let index = workQueue.nodes[group.z];
    if (index >= executionInfo.numNodes) {
        return;
    }

    let insn = instructions[index];
    if (
        insn.opcode == 0u || insn.inputCount > 4u ||
         insn.outputSlot == EMPTY
         ) {
        return;
    }
    
    let pixel = id.xy;
    var args: array<vec4f, 4>;
    for (var i = 0u; i < insn.inputCount; i++) {
        args[i] = loadFloatArgument(insn, i, pixel);
    }

    let result = evaluateNode(insn.opcode, args, pixel);
    storeResult(insn.outputSlot, pixel, result);
}

@compute @workgroup_size(8, 8, 1)
fn outputs(
    @builtin(global_invocation_id) id: vec3u
) {
    if (id.x >= executionInfo.width || id.y >= executionInfo.height) {
        return;
    }
    
    let pixel = id.xy;
    let outputNode = instructions[executionInfo.outputIndex];
    let albedo = loadFloatArgument(outputNode, 0u, pixel);
    var normal = loadFloatArgument(outputNode, 1u, pixel);
    
    let normalSource = inputIndices[outputNode.inputOffset + 1u];
    if (normalSource == EMPTY) {
        normal.a = 1.0;
    }

    textureStore(albedoOutput, vec2i(pixel), albedo);
    textureStore(normalOutput, vec2i(pixel), normal);
}