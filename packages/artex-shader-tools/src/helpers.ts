/**
 * Canonical ARTEX GLSL helper functions.
 *
 * These are injected into converted shaders when the source uses flow or
 * state-blending features, or when the user opts in via conversion options.
 *
 * Precision notes:
 *  - `artex_hash` multiplies by 43758.5453, which overflows GLSL ES 1.0
 *    mediump on many mobile GPUs (~16-bit mantissa, ~2048 precise range).
 *    The return type and parameter are explicitly `highp` so the helper is
 *    safe when copied into shaders that declare `precision mediump float;`.
 *  - `artex_blendStates` clamps `uStateCount` into the documented 1..4 range
 *    before dispatching so malformed uniforms do not select undefined paths.
 */

export const ARTEX_HASH_FN = `
highp float artex_hash(highp vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
`.trim();

export const ARTEX_NOISE_FN = `
float artex_noise(vec2 p) {
  highp vec2 hp = p;
  vec2 i = floor(hp);
  vec2 f = fract(hp);
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
  highp vec2 p = uv * uFlowScale;
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
  int count = uStateCount;
  if (count < 1) count = 1;
  if (count > 4) count = 4;
  if (count == 1) return texture2D(uStateA, uv);
  if (count == 2) return mix(texture2D(uStateA, uv), texture2D(uStateB, uv), uBlendFactor);
  if (count == 3) {
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

/**
 * Canonical UV guard against a zero resolution.
 *
 * GLSL `x / 0.0` is undefined (NaN / Inf); even a one-frame zero canvas
 * can poison downstream texture lookups. Use `artex_safeResolution()` or
 * `gl_FragCoord.xy / max(uResolution, vec2(1.0))` as the primary UV.
 */
export const ARTEX_SAFE_RESOLUTION_FN = `
vec2 artex_safeResolution() {
  return max(uResolution, vec2(1.0));
}
`.trim();
