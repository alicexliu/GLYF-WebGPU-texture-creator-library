fn node(uv: vec2f, p_x: f32, p_min: f32, p_max: f32) -> f32 {
    return clamp(p_x, p_min, p_max);
}
