const EMPTY: u32 = 0xffffffffu;
const ACTIVE: u32 = 1u;
const DONE: u32 = 2u;

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

struct SchedulerQueue {
    tilesX: u32,
    tilesY: u32,
    count: atomic<u32>,
    nodes: array<u32>,
};

@group(0) @binding(0)
var<storage, read> instructions: array<Instruction>;

@group(0) @binding(1)
var<storage, read> inputIndices: array<u32>;

@group(0) @binding(2)
var<uniform> executionInfo: ExecutionInfo;

@group(0) @binding(3)
var<storage, read_write> nodeState: array<atomic<u32>>;

@group(0) @binding(4)
var<storage, read_write> queue: SchedulerQueue;


// Begin traversal at the designated output.
@compute @workgroup_size(1)
fn seedReachability() {
    atomicOr(&nodeState[executionInfo.outputIndex], ACTIVE);
}


// Mark the upstream dependencies of active nodes.
// Repeating this pass numNodes times covers every possible path.
@compute @workgroup_size(64)
fn propagateReachability(
    @builtin(global_invocation_id) id: vec3u
) {
    let index = id.x;
    if (index >= executionInfo.numNodes) {
        return;
    }

    if ((atomicLoad(&nodeState[index]) & ACTIVE) == 0u) {
        return;
    }

    let insn = instructions[index];

    for (var p = 0u; p < insn.inputCount; p++) {
        let source = inputIndices[insn.inputOffset + p];

        if (source != EMPTY) {
            atomicOr(&nodeState[source], ACTIVE);
        }
    }
}


@compute @workgroup_size(64)
fn buildReadyQueue(
    @builtin(global_invocation_id) id: vec3u
) {
    let index = id.x;
    if (index >= executionInfo.numNodes) {
        return;
    }

    let flags = atomicLoad(&nodeState[index]);

    if ((flags & ACTIVE) == 0u || (flags & DONE) != 0u) {
        return;
    }

    let insn = instructions[index];

    for (var p = 0u; p < insn.inputCount; p++) {
        let source = inputIndices[insn.inputOffset + p];

        if (source != EMPTY) {
            if ((atomicLoad(&nodeState[source]) & DONE) == 0u) {
                return;
            }
        }
    }

    let position = atomicAdd(&queue.count, 1u);
    queue.nodes[position] = index;
}


@compute @workgroup_size(64)
fn markCompleted(
    @builtin(global_invocation_id) id: vec3u
) {
    if (id.x >= atomicLoad(&queue.count)) {
        return;
    }

    let index = queue.nodes[id.x];
    atomicOr(&nodeState[index], DONE);
}
