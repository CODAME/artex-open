// Sample Audio Reactive ARTEX.glsl
// Apache-2.0 — ARTEX Contributors
//
// Shows how to wire up live audio uniforms.
// All live inputs degrade gracefully to 0 when no adapter is active.
//
// Demonstrates:
//   • uAudioLevel  — overall amplitude drives chromatic aberration split
//   • uBassLevel   — bass frequency drives a radial push/warp
//   • uTransientLevel — sharp transients (claps, snaps) trigger a brightness flash
//   • uParam1/2/3  — let the artist tune the intensity of each effect independently

precision mediump float;

// Core
uniform float     uTime;
uniform vec2      uResolution;
uniform float     uMix;
uniform float     uParam1;  // 0..2   chromatic aberration strength
uniform float     uParam2;  // 0..2   bass warp intensity
uniform float     uParam3;  // 0..2   transient flash brightness
uniform sampler2D iChannel0;

// Live audio inputs — always declare; will be 0 when no input is active
uniform float uAudioLevel;     // 0..1  overall amplitude
uniform float uBassLevel;      // 0..1  bass frequency amplitude
uniform float uTransientLevel; // 0..1  sharp transients (claps, snaps)

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  // --- Bass warp: push UV outward from centre on low hits ---
  vec2 centre = vec2(0.5);
  vec2 dir    = uv - centre;
  float warp  = uBassLevel * uParam2 * 0.05;
  vec2 warpedUv = uv + dir * warp;

  // --- Chromatic aberration: split R/G/B horizontally on audio peaks ---
  float split = uAudioLevel * uParam1 * 0.015;
  float r = texture2D(iChannel0, warpedUv + vec2( split, 0.0)).r;
  float g = texture2D(iChannel0, warpedUv                    ).g;
  float b = texture2D(iChannel0, warpedUv - vec2( split, 0.0)).b;

  vec4 base = texture2D(iChannel0, uv);

  // --- Transient flash: brief additive white burst ---
  float flash = uTransientLevel * uParam3 * 0.5;

  vec3 col = vec3(r, g, b) + flash;
  gl_FragColor = vec4(mix(base.rgb, col, uMix), base.a);
}
