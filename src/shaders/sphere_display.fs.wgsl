@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

struct SphereParams {
    center: vec2f,
    radius: f32,
    padding: f32,
    rotation: vec2f,
    rotationPadding: vec2f
};

@group(0) @binding(2) var<uniform> sphere: SphereParams;

struct FragmentInput {
    @location(0) uv: vec2f
};

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let sphereXY = vec2f(
        (in.uv.x - sphere.center.x) * 2.0 / sphere.radius,
        (sphere.center.y - in.uv.y) * 2.0 / sphere.radius
    );
    let radiusSquared = dot(sphereXY, sphereXY);
    if (radiusSquared > 1.0) {
        discard;
    }

    let normal = vec3f(sphereXY, sqrt(1.0 - radiusSquared));
    let pitchCos = cos(sphere.rotation.y);
    let pitchSin = sin(sphere.rotation.y);
    let afterPitch = vec3f(
        normal.x,
        pitchCos * normal.y + pitchSin * normal.z,
        -pitchSin * normal.y + pitchCos * normal.z
    );
    let yawCos = cos(sphere.rotation.x);
    let yawSin = sin(sphere.rotation.x);
    let objectNormal = vec3f(
        yawCos * afterPitch.x - yawSin * afterPitch.z,
        afterPitch.y,
        yawSin * afterPitch.x + yawCos * afterPitch.z
    );
    let texUV = vec2f(
        atan2(objectNormal.z, objectNormal.x) / 6.28318530718 + 0.5,
        asin(clamp(objectNormal.y, -1.0, 1.0)) / 3.14159265359 + 0.5
    );
    let color = textureSample(tex, samp, texUV);
    let lightDirection = normalize(vec3f(-0.4, 0.6, 0.7));
    let lighting = 0.25 + 0.75 * max(dot(normal, lightDirection), 0.0);

    return vec4f(color.rgb * lighting, color.a);
}
