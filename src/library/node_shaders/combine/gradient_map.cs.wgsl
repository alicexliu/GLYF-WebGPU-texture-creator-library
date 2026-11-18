fn node(uv: vec2f, p_value: f32, p_low: vec4f, p_mid: vec4f, p_high: vec4f, p_midPosition: f32) -> vec4f {
    let t = clamp(p_value, 0.0, 1.0);
    let m = clamp(p_midPosition, 0.001, 0.999);
    if (t < m) {
        return mix(p_low, p_mid, t / m);
    }
    return mix(p_mid, p_high, (t - m) / (1.0 - m));
}
