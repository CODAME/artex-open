// Sample Proximity Bloom ARTEX.glsl
// Apache-2.0 — ARTEX Contributors
//
// Audience proximity drives a warm bloom that grows as viewers step closer.
// Camera brightness shifts exposure when a camera adapter is active.
//
// Demonstrates:
//   • uProximity  — 0 = no one present, 1 = very close
//   • uCameraLevel — scene brightness from a camera adapter
//   • uMood        — artist macro for colour temperature of the bloom
//   • uParam1/2/3  — bloom radius, bloom strength, vignette darkness

precision mediump float;

// Core
uniform float     uTime;
uniform vec2      uResolution;
uniform float     uMood;    // 0..1  warm/cool tint
uniform float     uMix;
uniform float     uParam1;  // 0..2  bloom spread radius
uniform float     uParam2;  // 0..2  bloom blend strength
uniform float     uParam3;  // 0..2  vignette edge darkness
uniform sampler2D iChannel0;

// Live inputs — degrade gracefully when inactive
uniform float uProximity;   // 0..1  viewer proximity
uniform float uCameraLevel; // 0..1  camera brightness (optional)

// Simple cross-tap soft bloom
vec3 softBloom(vec2 uv, float radius) {
  vec2 px = radius / uResolution;
  vec3 col = texture2D(iChannel0, uv).rgb;
  col += texture2D(iChannel0, uv + vec2( px.x,  0.0)).rgb;
  col += texture2D(iChannel0, uv + vec2(-px.x,  0.0)).rgb;
  col += texture2D(iChannel0, uv + vec2( 0.0,  px.y)).rgb;
  col += texture2D(iChannel0, uv + vec2( 0.0, -px.y)).rgb;
  col += texture2D(iChannel0, uv + vec2( px.x,  px.y)).rgb;
  col += texture2D(iChannel0, uv + vec2(-px.x,  px.y)).rgb;
  col += texture2D(iChannel0, uv + vec2( px.x, -px.y)).rgb;
  col += texture2D(iChannel0, uv + vec2(-px.x, -px.y)).rgb;
  return col / 9.0;
}

void main() {
  vec2 uv  = gl_FragCoord.xy / uResolution;
  vec4 base = texture2D(iChannel0, uv);

  // Bloom grows with proximity
  float radius = (2.0 + uProximity * 18.0) * uParam1;
  vec3 glow    = softBloom(uv, radius);

  // Warm/cool tint driven by uMood (0 = cool blue, 1 = warm amber)
  vec3 warmTint = mix(
    vec3(0.8, 0.9, 1.1),  // cool
    vec3(1.2, 1.05, 0.85), // warm
    uMood
  );
  glow *= warmTint;

  // Camera brightness nudges overall exposure
  float exposure = 1.0 + uCameraLevel * 0.25;

  // Vignette pulls back at screen edges; proximity lifts the vignette
  vec2 offset    = uv - 0.5;
  float vignette = 1.0 - dot(offset, offset) * uParam3 * 2.5 * (1.0 - uProximity * 0.8);
  vignette = clamp(vignette, 0.0, 1.0);

  vec3 col = mix(base.rgb, glow * exposure, uParam2 * 0.6) * vignette;
  gl_FragColor = vec4(mix(base.rgb, col, uMix), base.a);
}
