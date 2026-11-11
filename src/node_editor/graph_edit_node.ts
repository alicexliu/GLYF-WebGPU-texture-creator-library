import { ClassicPreset } from "rete";
import { nodeDefinitions, dataTypes, NodeType } from "../definitions";
import type { GraphNode, GraphConnection, GraphValue } from "../library/graph_types";



// socket map
const sockets = new Map<string, ClassicPreset.Socket>();
const controlLabels = new WeakMap<ClassicPreset.Control, string>();

export function getControlLabel(control: ClassicPreset.Control) {
    return controlLabels.get(control);
}

function getSocket(type: string) {
    if (!sockets.has(type)) {
        sockets.set(type, new ClassicPreset.Socket(type));
    }
    return sockets.get(type)!;
}

// custom node class for Rete.js to use 
export class graphEditNode extends ClassicPreset.Node {

    // unique node ids
    private static nextId = 0;
    static onChange: (node: graphEditNode) => void = () => {};

    

    graphId: number;
    typeId: NodeType;
    params: (GraphValue | undefined)[] = [];        

    constructor(type: NodeType) {
        // pass name of node type to super 
        const def = nodeDefinitions[type];
        if (!def) throw new Error(`undefined node type: ${type}`);
        super(def.name);

        // custom ============================================================

        this.graphId = graphEditNode.nextId++;
        this.id = String(this.graphId); // id for Rete.js
        this.typeId = type;
        
        // set parameters using node definition 
        // socket -> use
        // no socket, default -> use 
        // no socket, no default -> error node 
        for (const [i, param] of def.parameters.entries()) {

            var control = undefined;
            // default -> use 
            if (param.default !== undefined) {
                this.params[i] = structuredClone(param.default); // deep copy
                control = this.makeControl(i, param.type.type); 
                controlLabels.set(control, param.name);
            }

            // socket -> use 
            if (param.socket) {
                const input = new ClassicPreset.Input(getSocket(param.type.type), param.name);
                // param name is the socket key!
                this.addInput(param.name, input);

                if (control) {
                    input.addControl(control); // fallback 
                }
            } else if (control) {
                this.addControl(param.name, control);
            } else { // neither socket nor default
                throw new Error(`${def.name}.${param.name}: need socket or default`);
            }
        }

        for (const out of def.outputs) {
            this.addOutput(out.name, new ClassicPreset.Output(getSocket(out.type.type), out.name));
        }
    } // constructor

    private makeControl(paramIndex: number, dataType: string) {
        const update = (v: GraphValue) => {
            this.params[paramIndex] = v;
            graphEditNode.onChange(this);
        };

        const value = this.params[paramIndex];

        switch (dataType) {
            case "float32":
                return new ClassicPreset.InputControl("number", {
                    initial: value as number,
                    change: update,
                });

            case "uint16":
            case "uint32":
                return new ClassicPreset.InputControl("number", {
                    initial: value as number,
                    change: v => update(Math.max(0, Math.round(v))),
                });
            case "vec2":
            case "vec3":
            case "vec4": { // temp
                const count = Number(dataType.slice(3));  
                return new ClassicPreset.InputControl("text", {
                    initial: (value as number[]).join(", "),
                    change: text => {
                        const parts = text.split(",").map(s => Number(s.trim()));
                        if (parts.length === count && parts.every(Number.isFinite)) update(parts);
                    },
                });
            }
            default:
                throw new Error(`unsupported data type: ${dataType}`);
        }


    }

}