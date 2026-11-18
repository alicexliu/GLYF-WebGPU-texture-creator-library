fn node(uv: vec2f, p_start: vec4f, p_end: vec4f, p_direction: vec2f, p_intensity: f32) -> vec4f {
    var direction = p_direction;
    if (dot(direction, direction) <= 0.000001) {
        direction = vec2f(1.0, 0.0);
    }

    let normalizedDirection = normalize(direction);
    let projectionRange = 0.5 * (abs(normalizedDirection.x) + abs(normalizedDirection.y));
    let linearAmount = clamp(
        dot(uv - vec2f(0.5), normalizedDirection) / (2.0 * projectionRange) + 0.5,
        0.0,
        1.0
    );
    let amount = pow(linearAmount, 1.0 / max(p_intensity, 0.0001));
    return mix(p_start, p_end, amount);
}
