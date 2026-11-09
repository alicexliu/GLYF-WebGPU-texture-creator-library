import commonRaw from './common.wgsl?raw';

import fullscreenVertRaw from './fullscreen.vs.wgsl?raw';
import noiseComputeRaw from './noise.cs.wgsl?raw';
import displayFragRaw from './display.fs.wgsl?raw';


// CONSTANTS (for use in shaders)
// =================================

// CHECKITOUT: feel free to add more constants here and to refer to them in your shader code

// Note that these are declared in a somewhat roundabout way because otherwise minification will drop variables
// that are unused in host side code.
export const constants = {
    bindGroup_scene: 0,
    bindGroup_model: 1,
    bindGroup_gBuffer: 1,
    bindGroup_material: 2,
};

// =================================

function evalShaderRaw(raw: string): string {
    return raw.replace(
        /\$\{(\w+)\}/g,
        (_, name: string) => {
            const value = constants[name as keyof typeof constants];

            if (value === undefined) {
                throw new Error(`Missing shader constant: ${name}`);
            }

            return String(value);
        }
    );
}

const commonSrc: string = evalShaderRaw(commonRaw);

function processShaderRaw(raw: string) {
    return commonSrc + evalShaderRaw(raw);
}

export const fullscreenVertSrc: string = processShaderRaw(fullscreenVertRaw);

export const noiseComputeSrc: string = processShaderRaw(noiseComputeRaw);
export const displayFragSrc: string = processShaderRaw(displayFragRaw);
