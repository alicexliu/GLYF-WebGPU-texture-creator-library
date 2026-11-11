fn node(uv: vec2f, a: vec4<f32>, b: vec4<f32>, factor: f32) -> vec4<f32> {
    return mix(a, b, factor);
}