// Sample Flow Field ARTEX.glsl
// Apache-2.0 — ARTEX Contributors
//
// Demonstrates flow/motion uniforms with a turbulent ink-wash UV distortion.
// All flow uniforms degrade gracefully to a clean passthrough when uFlowEnabled == 0.
//
// Demonstrates:
//   • uFlowEnabled  — gates all distortion (degrade gracefully when 0)
//   • uFlowIntensity — strength of the warp
//   • uFlowSpeed    — how fast the noise field evolves over uTime
//   • uFlowScale    — spatial frequency of the noise field
//   • uParam1 (0..2) — distortion depth: 0 = no warp, 2 = full warp
//   • uParam2 (0..2) — extra turbulence (second noise octave layered on top)
//   • uMix           — blend warped result with clean base

precision mediump float;

// Core — always available
uniform float     uTime;
uniform vec2      uResolution;
uniform float     uMix;        // 0..1  blend warped result with clean base
uniform float     uParam1;     // 0..2  distortion depth (0 = off, 2 = maximum)
uniform float     uParam2;     // 0..2  extra turbulence second octave
uniform sampler2D iChannel0;   // primary artwork / video frame

// Flow / Motion uniforms — declare all four to register the "Flow" capability badge
uniform int   uFlowEnabled;    // 1 = flow is active; 0 = passthrough
uniform float uFlowIntensity;  // 0..1  warp magnitude
uniform float uFlowSpeed;      // 0..1  how fast the noise field evolves with uTime
uniform float uFlowScale;      // 0..1  spatial frequency of the noise field

// --- Value noise helpers — copied from rain.glsl (canonical ARTEX pattern) ---
float artex_hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

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

// --- artex_applyFlow — copied verbatim from rain.glsl ---
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

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  // Primary flow warp via the canonical artex_applyFlow helper
  vec2 flowUv = artex_applyFlow(uv);

  // Second turbulence octave: 2× frequency, ½ amplitude — only when flow is on
  if (uFlowEnabled == 1) {
    vec2 p2 = uv * uFlowScale * 2.0;
    float nx2 = artex_noise(p2 + vec2(5.0, 0.0) + uTime * uFlowSpeed * 1.3);
    float ny2 = artex_noise(p2 + vec2(0.0, 5.0) + uTime * uFlowSpeed * 1.3);
    vec2 turb = vec2(
      (nx2 - 0.5) * uFlowIntensity * 0.075,
      (ny2 - 0.5) * uFlowIntensity * 0.075
    );
    flowUv += turb * uParam2;
  }

  // uParam1 scales the warp depth: 0 = no displacement, 2 = full displacement
  vec2 finalUv = mix(uv, flowUv, clamp(uParam1 / 2.0, 0.0, 1.0));

  vec4 base   = texture2D(iChannel0, uv);
  vec4 warped = texture2D(iChannel0, finalUv);

  gl_FragColor = vec4(mix(base.rgb, warped.rgb, uMix), base.a);
}
