// Sample Hello World ARTEX.glsl
// Apache-2.0 — ARTEX Contributors
//
// A minimal starter shader. Copy this file, rename it, and build from here.
// Only uses core uniforms — no live inputs required.
//
// Demonstrates:
//   • Sampling the base artwork via iChannel0
//   • Time-driven animation with uTime
//   • Artist macro parameter uMood
//   • Three user-tunable knobs: uParam1, uParam2, uParam3
//   • Blend-with-base via uMix

precision mediump float;

// Core — always available
uniform float     uTime;
uniform vec2      uResolution;
uniform float     uMood;    // 0..1   artist macro parameter
uniform float     uMix;    // 0..1   blend strength with base artwork
uniform float     uParam1;  // 0..2   try: hue speed
uniform float     uParam2;  // 0..2   try: tint saturation
uniform float     uParam3;  // 0..2   try: vignette amount
uniform sampler2D iChannel0; // primary artwork / video frame

// Helpers
vec3 hueShift(vec3 rgb, float hue) {
  const vec3 k = vec3(0.57735);
  float c = cos(hue);
  return rgb * c + cross(k, rgb) * sin(hue) + k * dot(k, rgb) * (1.0 - c);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec4 base = texture2D(iChannel0, uv);

  // Slowly shift hue over time, nudged by mood
  float shift = uTime * uParam1 * 0.4 + uMood * 3.14159;
  vec3 tinted = hueShift(base.rgb, shift) * (0.5 + uParam2 * 0.75);

  // Soft vignette — stronger when uParam3 is high
  vec2 c = uv - 0.5;
  float vignette = 1.0 - dot(c, c) * uParam3 * 2.0;
  vignette = clamp(vignette, 0.0, 1.0);

  vec3 col = mix(base.rgb, tinted * vignette, uMix);
  gl_FragColor = vec4(col, base.a);
}
