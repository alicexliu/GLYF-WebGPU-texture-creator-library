@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

struct FragmentInput {
    @location(0) uv: vec2f
};

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    return textureSample(tex, samp, in.uv);
}
