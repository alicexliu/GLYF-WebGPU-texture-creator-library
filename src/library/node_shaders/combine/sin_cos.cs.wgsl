fn node(uv: vec2f, p_x: f32, p_mode: u32, p_amplitude: f32, p_frequency: f32, p_offset: f32) -> f32 {
    let angle = p_x * p_frequency;
    let wave = select(sin(angle), cos(angle), p_mode > 0u);
    return p_amplitude * wave + p_offset;
}
