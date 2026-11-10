fn node(uv: vec2f, p_val:vec4<f32>) -> vec4<f32> {
    let rgb_inv = vec3<f32>(1.0) - p_val.rgb;
    return vec4<f32>(rgb_inv, p_val.a);
}