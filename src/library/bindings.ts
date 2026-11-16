// bindings for each shader
import type { NodeDefinition } from "../definitions";

export const PARAMS_BINDING = 0;
export const OUTPUT_BINDING = 1;

export const inputBinding = (paramIndex: number) => 2 + paramIndex;
export const timeBinding = (def: NodeDefinition) => 2 + def.parameters.length; // optional