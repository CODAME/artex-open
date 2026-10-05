// Equivalent of the original Echo GLSL weighted mix, using WebGPU only.
struct Controls { enabled: vec4f, blend: f32, padding1: f32, padding2: f32, padding3: f32 }
@group(0) @binding(0) var linearSampler: sampler;
@group(0) @binding(1) var present: texture_2d<f32>;
@group(0) @binding(2) var tap1: texture_2d<f32>;
@group(0) @binding(3) var tap2: texture_2d<f32>;
@group(0) @binding(4) var tap3: texture_2d<f32>;
@group(0) @binding(5) var tap4: texture_2d<f32>;
@group(0) @binding(6) var<uniform> controls: Controls;
struct VertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f }
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
  let positions = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
  let position = positions[index];
  return VertexOutput(vec4f(position,0,1),vec2f((position.x+1)*0.5,(1-position.y)*0.5));
}
@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let live = textureSample(present,linearSampler,input.uv);
  let n = dot(controls.enabled,vec4f(1));
  let past = textureSample(tap1,linearSampler,input.uv)*controls.enabled.x
    + textureSample(tap2,linearSampler,input.uv)*controls.enabled.y
    + textureSample(tap3,linearSampler,input.uv)*controls.enabled.z
    + textureSample(tap4,linearSampler,input.uv)*controls.enabled.w;
  return mix(live,past/max(n,1),select(0,controls.blend,n>0));
}
