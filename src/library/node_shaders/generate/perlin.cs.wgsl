fn hash2(p: vec2f) -> f32 {
    let q = bitcast<vec2u>(vec2i(p));
    var h = (q.x * 0x9e3779b9u) ^ (q.y * 0x85ebca6bu);
    h = (h ^ (h >> 16u)) * 0x7feb352du;
    h = (h ^ (h >> 15u)) * 0x846ca68bu;
    h = h ^ (h >> 16u);
    return f32(h >> 8u) * (1.0 / 16777216.0);
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