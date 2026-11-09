@group(0) @binding(0) var outTex: texture_storage_2d<rgba16float, write>;

fn hash2(p: vec2f) -> f32 {
    return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn valueNoise(p: vec2f, period: f32) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);

    let a = hash2(i);
    let b = hash2(i + vec2f(1.0, 0.0));
    let c = hash2(i + vec2f(0.0, 1.0));
    let d = hash2(i + vec2f(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm(uv: vec2f, scale: f32, octaves: i32) -> f32 {
    var sum = 0.0;
    var amp = 0.5;
    var freq = scale;
    for (var o = 0; o < octaves; o++) {
        sum += amp * valueNoise(uv * freq, freq);
        freq *= 2.0;
        amp *= 0.5;
    }
    return sum;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(outTex);
    if (id.x >= size.x || id.y >= size.y) {
        return;
    }

    // pixel -> uv space 
    let uv = vec2f(id.xy) / vec2f(size);
    let n = fbm(uv, 8.0, 2);

    textureStore(outTex, vec2i(id.xy), vec4f(vec3f(n), 1.0));
}
