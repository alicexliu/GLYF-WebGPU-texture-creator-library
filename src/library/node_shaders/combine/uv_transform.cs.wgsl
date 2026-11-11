fn uvTransform(
    p_uv: vec2<f32>,
    p_scale: vec2<f32>,
    p_rotation: f32,
    p_translation: vec2<f32>
) -> vec2<f32> {
    let centered = (p_uv - vec2<f32>(0.5)) * p_scale;
    let cosine = cos(p_rotation);
    let sine = sin(p_rotation);
    let rotated = vec2<f32>(
        cosine * centered.x - sine * centered.y,
        sine * centered.x + cosine * centered.y
    );

    return rotated + vec2<f32>(0.5) + p_translation;
}
