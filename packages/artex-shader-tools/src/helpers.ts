/**
 * Canonical ARTEX GLSL helper functions.
 *
 * These are injected into converted shaders when the source uses flow or
 * state-blending features, or when the user opts in via conversion options.
 */

export const ARTEX_HASH_FN = `
float artex_hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
`.trim();

export const ARTEX_NOISE_FN = `
float artex_noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = artex_hash(i);
  float b = artex_hash(i + vec2(1.0, 0.0));
  float c = artex_hash(i + vec2(0.0, 1.0));
  float d = artex_hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`.trim();

export const ARTEX_APPLY_FLOW_FN = `
vec2 artex_applyFlow(vec2 uv) {
  if (uFlowEnabled != 1) return uv;
  vec2 p = uv * uFlowScale;
  float nx = artex_noise(p + vec2(10.0, 0.0) + uTime * uFlowSpeed);
  float ny = artex_noise(p + vec2(0.0, 10.0) + uTime * uFlowSpeed);
  vec2 distortion = vec2(
    (nx - 0.5) * uFlowIntensity * 0.15,
    (ny - 0.5) * uFlowIntensity * 0.15
  );
  return uv + distortion;
}
`.trim();

export const ARTEX_BLEND_STATES_FN = `
vec4 artex_blendStates(vec2 uv) {
  if (uUseStateBlending != 1) return texture2D(iChannel0, uv);
  if (uStateCount <= 1) return texture2D(uStateA, uv);
  if (uStateCount == 2) return mix(texture2D(uStateA, uv), texture2D(uStateB, uv), uBlendFactor);
  if (uStateCount == 3) {
    if (uBlendFactor < 0.5) return mix(texture2D(uStateA, uv), texture2D(uStateB, uv), uBlendFactor * 2.0);
    return mix(texture2D(uStateB, uv), texture2D(uStateC, uv), (uBlendFactor - 0.5) * 2.0);
  }
  float t3 = 1.0 / 3.0;
  if (uBlendFactor < t3) return mix(texture2D(uStateA, uv), texture2D(uStateB, uv), uBlendFactor * 3.0);
  if (uBlendFactor < t3 * 2.0) return mix(texture2D(uStateB, uv), texture2D(uStateC, uv), (uBlendFactor - t3) * 3.0);
  return mix(texture2D(uStateC, uv), texture2D(uStateD, uv), (uBlendFactor - t3 * 2.0) * 3.0);
}
`.trim();

export const ARTEX_SAMPLE_MAIN_FN = `
vec4 artex_sampleMain(vec2 uv) {
  vec2 flowUv = artex_applyFlow(uv);
  return artex_blendStates(flowUv);
}
`.trim();
