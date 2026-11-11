fn node(
    uv: vec2f, 
    p_uv: vec2f,
    p_scale: vec2f,
    p_rotation: f32,
    p_translation: vec2f
) -> vec2f {
    let centered = (p_uv - vec2f(0.5)) * p_scale;
    let cosine = cos(p_rotation);
    let sine = sin(p_rotation);
    let rotated = vec2f(
        cosine * centered.x - sine * centered.y,
        sine * centered.x + cosine * centered.y
    );

    return rotated + vec2f(0.5) + p_translation;
}
