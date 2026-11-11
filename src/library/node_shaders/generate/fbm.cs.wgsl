fn fbmHash2(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn fbmValueNoise(p: vec2<f32>) -> f32 {
    let cell = floor(p);
    let offset = fract(p);
    let blend = offset * offset * (3.0 - 2.0 * offset);

    let a = fbmHash2(cell);
    let b = fbmHash2(cell + vec2<f32>(1.0, 0.0));
    let c = fbmHash2(cell + vec2<f32>(0.0, 1.0));
    let d = fbmHash2(cell + vec2<f32>(1.0, 1.0));

    return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
}

fn fbm(
    p_uv: vec2<f32>,
    scale: f32,
    translation: vec2<f32>,
    octaves: u32
) -> f32 {
    let octaveCount = clamp(octaves, 1u, 8u);
    var frequency = scale;
    var amplitude = 0.5;
    var total = 0.0;
    var amplitudeTotal = 0.0;

    for (var octave = 0u; octave < octaveCount; octave = octave + 1u) {
        total += amplitude * fbmValueNoise(p_uv * frequency + translation);
        amplitudeTotal += amplitude;
        frequency *= 2.0;
        amplitude *= 0.5;
    }

    return total / amplitudeTotal;
}
