// Matrix Op ARTEX — Menger fractal distortion applied to artwork
// Based on coyote's shader (shadertoy.com/view/ltfGzS), rewritten for ARTEX compositing.
precision mediump float;
uniform float time;
uniform float uTargetAspect;
uniform float targetAspect;
uniform vec2 uMainImageResolution;
uniform vec2 uStateAResolution;
uniform vec2 uStateBResolution;
uniform vec2 uStateCResolution;
uniform vec2 uStateDResolution;
uniform vec4 uMediaTransform;
uniform vec4 u_mediaTransform;
uniform int uMediaTransformMainEnabled;
uniform vec4 iMouse;
uniform vec2 uLeftEye;
uniform vec2 uRightEye;
uniform vec2 uFaceCenter;
uniform float uHasFace;
uniform vec2 leftEye;
uniform vec2 rightEye;
uniform vec2 faceCenter;
uniform float hasFace;
uniform float uTime;
uniform float iTime;
uniform vec2 uResolution;
uniform vec3 iResolution;
uniform vec3 iChannelResolution[4];
uniform sampler2D uMainImage;
uniform sampler2D uStateA;
uniform sampler2D uStateB;
uniform sampler2D uStateC;
uniform sampler2D uStateD;
uniform sampler2D uMask;
uniform sampler2D uState1;
uniform sampler2D uState2;
uniform int uUseStateBlending;
uniform float uBlendFactor;
uniform int uStateCount;
uniform int uFlowEnabled;
uniform float uFlowIntensity;
uniform float uFlowSpeed;
uniform float uFlowScale;
uniform vec4 iDate;
uniform float uAudioLevel;
uniform float uBassLevel;
uniform float uProximity;
uniform float uCameraLevel;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

// --- ARTEX helpers ---
vec4 tex2D(sampler2D s, vec2 uv) { return texture2D(s, uv); }

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

vec2 artex_applyFlow(vec2 uv) {
  if (uFlowEnabled != 1) return uv;
  vec2 p = uv * uFlowScale;
  float nx = artex_noise(p + vec2(10.0, 0.0) + uTime * uFlowSpeed);
  float ny = artex_noise(p + vec2(0.0, 10.0) + uTime * uFlowSpeed);
  return uv + vec2((nx - 0.5), (ny - 0.5)) * uFlowIntensity * 0.15;
}

vec4 artex_blendStates(vec2 uv) {
  if (uUseStateBlending != 1) return tex2D(uMainImage, uv);
  if (uStateCount <= 1) return tex2D(uStateA, uv);
  if (uStateCount == 2) return mix(tex2D(uStateA, uv), tex2D(uStateB, uv), uBlendFactor);
  if (uStateCount == 3) {
    if (uBlendFactor < 0.5) return mix(tex2D(uStateA, uv), tex2D(uStateB, uv), uBlendFactor * 2.0);
    return mix(tex2D(uStateB, uv), tex2D(uStateC, uv), (uBlendFactor - 0.5) * 2.0);
  }
  float t3 = 1.0 / 3.0;
  if (uBlendFactor < t3) return mix(tex2D(uStateA, uv), tex2D(uStateB, uv), uBlendFactor * 3.0);
  if (uBlendFactor < t3 * 2.0) return mix(tex2D(uStateB, uv), tex2D(uStateC, uv), (uBlendFactor - t3) * 3.0);
  return mix(tex2D(uStateC, uv), tex2D(uStateD, uv), (uBlendFactor - t3 * 2.0) * 3.0);
}

vec4 artex_sampleMain(vec2 uv) {
  return artex_blendStates(artex_applyFlow(uv));
}

// --- Fractal distortion ---
mat3 getRotYMat(float a) {
  return mat3(cos(a), 0.0, sin(a),
              0.0,    1.0, 0.0,
             -sin(a), 0.0, cos(a));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 s = uResolution.xy;
  vec2 baseUv = fragCoord.xy / s;
  float t = uTime * 0.2 * max(0.01, uEffectParam1 * 2.0);
  float pt = uTime * 0.2 * max(0.01, uEffectParam2 * 2.0);

  float c = 1.0;
  float d = 0.0;
  float m = 1.0;

  vec3 p = vec3((2.0 * fragCoord.xy - s) / s.x, 1.0);
  vec3 r = vec3(0.0);
  vec3 q = r;

  p *= getRotYMat(-t);
  q.zx += 10.0 + vec2(sin(pt), cos(pt)) * 3.0;

  // Reduced from 100 to 48 steps for performance
  for (int step = 0; step < 48; step++) {
    float i = 1.0 - float(step) / 48.0;
    c = i;
    d = 0.0;
    m = 1.0;

    for (int j = 0; j < 3; j++) {
      vec3 v = mod(q * m + 1.0, 2.0) - 1.0;
      v *= v; v *= v; v *= v;
      r = max(v, v.yzx);
      d = max(d, (0.29 - length(r) * 0.6) / m) * 0.8;
      m *= 1.1;
    }

    q += p * d;
    if (d < 1e-5) break;
  }

  // Fractal structure values for color modulation
  float k = dot(r, r + 0.15);
  float fractalLuma = clamp(1.0 - k / max(c, 0.01), 0.0, 1.0);

  // Sample artwork at its true UV — no resizing
  vec4 artwork = artex_sampleMain(baseUv);

  // Fractal color tint
  vec3 fractalTint = vec3(1.0, k * 0.8 + 0.2, k / max(c, 0.01) * 0.5 + 0.5);

  // Standalone fractal visual (visible when no media is loaded)
  vec3 fractalStandalone = fractalTint * (0.4 + fractalLuma * 0.6);

  // Composite: modulate artwork when present, show standalone when not
  float strength = clamp(uEffectStrength * max(0.01, uEffectParam3 * 1.5), 0.0, 1.0);
  float mediaPresence = smoothstep(0.0, 0.05, artwork.a);
  vec3 withMedia = mix(artwork.rgb, artwork.rgb * fractalTint * (0.5 + fractalLuma), strength);
  vec3 col = mix(fractalStandalone * strength, withMedia, mediaPresence);

  // Audio reactivity — fractal glow pulses with bass
  col += vec3(0.08, 0.02, 0.0) * uBassLevel * fractalLuma * strength;

  fragColor = vec4(col, max(artwork.a, strength * (1.0 - mediaPresence)));
}

void main() {
  vec4 fragColor;
  mainImage(fragColor, gl_FragCoord.xy);
  gl_FragColor = fragColor;
}
