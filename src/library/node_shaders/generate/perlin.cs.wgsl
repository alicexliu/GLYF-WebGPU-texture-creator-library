fn hash2(p: vec2f) -> f32 {
    return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn gradient(p: vec2f) -> vec2f {
    let angle = hash2(p) * 6.281;
    return vec2f(cos(angle), sin(angle));
}

fn fade(t: vec2f) -> vec2f {
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

fn node(uv: vec2f, p_uv: vec2f, scale: f32, translation: vec2f) -> f32 {
    let p = p_uv * scale + translation;
    let cell = floor(p);
    let offset = fract(p);
    let blend = fade(offset);

    let n00 = dot(gradient(cell), offset);
    let n10 = dot(gradient(cell + vec2f(1.0, 0.0)), offset - vec2f(1.0, 0.0));
    let n01 = dot(gradient(cell + vec2f(0.0, 1.0)), offset - vec2f(0.0, 1.0));
    let n11 = dot(gradient(cell + vec2f(1.0, 1.0)), offset - vec2f(1.0, 1.0));

    let noise = mix(
        mix(n00, n10, blend.x),
        mix(n01, n11, blend.x),
        blend.y
    );

    return clamp(0.5 + 0.5 * noise, 0.0, 1.0);
}