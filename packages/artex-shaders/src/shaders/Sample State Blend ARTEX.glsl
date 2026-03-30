// Sample State Blend ARTEX.glsl
// Apache-2.0 — ARTEX Contributors
//
// Demonstrates state blending — morphing between up to 4 artwork states.
// Falls back gracefully to iChannel0 when no states are active.
//
// Demonstrates:
//   • uUseStateBlending — gates the state system; 0 = use iChannel0 directly
//   • uStateA/B/C/D     — up to 4 artwork state textures
//   • uBlendFactor       — 0..1 position across the state sequence
//   • uStateCount        — how many states are loaded (1..4)
//   • uMood              — tints the edge-glow overlay (0 = cool blue, 1 = warm amber)
//   • uMix               — final blend of glow effect over the blended state
//
// The artex_blendStates + artex_sampleMain helpers are copied verbatim from
// rain.glsl — this is the canonical ARTEX compositing chain.

precision mediump float;

// Core
uniform float     uTime;
uniform vec2      uResolution;
uniform float     uMood;       // 0..1  cool → warm glow tint
uniform float     uMix;        // 0..1  effect blend strength

// State blending uniforms — declare all to register the "States" capability badge
uniform int       uUseStateBlending; // 1 = states available; 0 = use iChannel0
uniform sampler2D uStateA;
uniform sampler2D uStateB;
uniform sampler2D uStateC;
uniform sampler2D uStateD;
uniform float     uBlendFactor;      // 0..1 position across the state sequence
uniform int       uStateCount;       // 1..4 number of loaded states

// Flow uniforms — required by artex_sampleMain (declare even when passthrough)
uniform int   uFlowEnabled;
uniform float uFlowIntensity;
uniform float uFlowSpeed;
uniform float uFlowScale;

// iChannel0 — primary artwork / fallback when uUseStateBlending == 0
uniform sampler2D iChannel0;

// tex2D overloads (standard ARTEX helper pattern)
vec4 tex2D(sampler2D s, vec2 uv) { return texture2D(s, uv); }
vec4 tex2D(sampler2D s, vec3 uv) { return texture2D(s, uv.xy); }
vec4 tex2D(sampler2D s, vec4 uv) { return texture2D(s, uv.xy); }

// --- Value noise helpers — copied from rain.glsl ---
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

// --- artex_blendStates — copied verbatim from rain.glsl ---
// Note: uses iChannel0 as the no-states fallback (public API convention).
vec4 artex_blendStates(vec2 uv) {
  if (uUseStateBlending != 1) {
    return tex2D(iChannel0, uv);
  }
  if (uStateCount <= 1) {
    return tex2D(uStateA, uv);
  } else if (uStateCount == 2) {
    vec4 stateA = tex2D(uStateA, uv);
    vec4 stateB = tex2D(uStateB, uv);
    return mix(stateA, stateB, uBlendFactor);
  } else if (uStateCount == 3) {
    if (uBlendFactor < 0.5) {
      float t = uBlendFactor * 2.0;
      return mix(tex2D(uStateA, uv), tex2D(uStateB, uv), t);
    } else {
      float t = (uBlendFactor - 0.5) * 2.0;
      return mix(tex2D(uStateB, uv), tex2D(uStateC, uv), t);
    }
  } else {
    float third     = 1.0 / 3.0;
    float twoThirds = 2.0 / 3.0;
    if (uBlendFactor < third) {
      float t = uBlendFactor * 3.0;
      return mix(tex2D(uStateA, uv), tex2D(uStateB, uv), t);
    } else if (uBlendFactor < twoThirds) {
      float t = (uBlendFactor - third) * 3.0;
      return mix(tex2D(uStateB, uv), tex2D(uStateC, uv), t);
    } else {
      float t = (uBlendFactor - twoThirds) * 3.0;
      return mix(tex2D(uStateC, uv), tex2D(uStateD, uv), t);
    }
  }
}

// --- artex_sampleMain — copied verbatim from rain.glsl ---
vec4 artex_sampleMain(vec2 uv) {
  vec2 flowUv = artex_applyFlow(uv);
  return artex_blendStates(flowUv);
}

void main() {
  vec2 uv  = gl_FragCoord.xy / uResolution;

  // State-blended base (or iChannel0 fallback) via the canonical helpers
  vec4 base = artex_sampleMain(uv);

  // Edge-glow overlay: 4-tap gradient magnitude across the blended image
  vec2 px  = 1.5 / uResolution;
  float rt = artex_sampleMain(uv + vec2( px.x,  0.0)).r;
  float lt = artex_sampleMain(uv + vec2(-px.x,  0.0)).r;
  float up = artex_sampleMain(uv + vec2( 0.0,  px.y)).r;
  float dn = artex_sampleMain(uv + vec2( 0.0, -px.y)).r;
  float gradMag = length(vec2(rt - lt, up - dn));
  float edge    = smoothstep(0.05, 0.3, gradMag);

  // Mood-tinted glow: cool blue at uMood=0, warm amber at uMood=1
  vec3 glowTint = mix(vec3(0.4, 0.6, 1.0), vec3(1.0, 0.75, 0.3), uMood);
  vec3 col      = base.rgb + glowTint * edge * 0.6;

  gl_FragColor = vec4(mix(base.rgb, col, uMix), base.a);
}
