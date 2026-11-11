fn worleyHash2(p: vec2f) -> vec2f {
    let hashed = sin(vec2f(
        dot(p, vec2f(127.1, 311.7)),
        dot(p, vec2f(269.5, 183.3))
    )) * vec2f(43758.5453, 24634.6345);
    return fract(hashed);
}

fn node(uv: vec2f, p_uv: vec2f, scale: f32, translation: vec2f) -> f32 {
    let p = p_uv * scale + translation;
    let cell = floor(p);
    let offset = fract(p);
    var closestDistance = 1.0e6;

    for (var y = -1; y <= 1; y = y + 1) {
        for (var x = -1; x <= 1; x = x + 1) {
            let neighbor = vec2f(f32(x), f32(y));
            let featurePoint = neighbor + worleyHash2(cell + neighbor);
            closestDistance = min(closestDistance, distance(offset, featurePoint));
        }
    }

    return clamp(closestDistance / 1.41421356, 0.0, 1.0);
}
