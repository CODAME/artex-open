// Golden Electric Spiral ARTEX — Electric spiral distortion on artwork
// Rewritten for ARTEX compositing.
precision mediump float;
uniform float uTime;
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

highp float artex_hash(highp vec2 p) {
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

// --- Electric spiral ---
float seg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 baseUv = fragCoord / uResolution.xy;
  vec2 uv = (fragCoord - 0.5 * uResolution.xy) / uResolution.y;

  float a = atan(uv.y, uv.x);
  float t = uTime * uEffectParam1;
  vec2 p = cos(a + t) * vec2(cos(0.5 * t), sin(0.3 * t));

  float d1 = length(uv - p);
  float d2 = length(uv);
  float denom = max(d1 + d2, 1e-4);
  vec2 uv2 = 2.0 * cos(log(max(length(uv), 1e-4)) * 0.25 - 0.5 * t + log(vec2(d1, d2) / denom));

  // Grid pattern from spiral coords
  vec2 fpos = fract(4.0 * uv2) - 0.5;
  float grid = max(abs(fpos.x), abs(fpos.y));
  float k = 5.0 / uResolution.y;
  float gridMask = smoothstep(-k, k, 0.25 - grid);

  // Electric rings
  float ringFreq = 10.0 * max(1.0, uEffectParam2 * 2.0);
  float ring = cos(ringFreq * length(uv2) + 4.0 * t);
  float electricMask = exp(-9.0 * abs(cos(9.0 * a + t) * uv.x + sin(9.0 * a + t) * uv.y + 0.1 * ring));

  // Sample artwork at its true UV — no resizing
  vec4 artwork = artex_sampleMain(baseUv);
  float mediaPresence = smoothstep(0.0, 0.05, artwork.a);

  float strength = clamp(uEffectStrength * max(0.01, uEffectParam3 * 1.5), 0.0, 1.0);

  // Warm golden tint from spiral pattern
  vec3 goldenTint = vec3(1.0, 0.85, 0.5);
  vec3 electricTint = vec3(0.5, 1.0, 1.0);

  // Standalone visual: dark background with golden grid and electric arcs
  vec3 standalone = vec3(0.02, 0.01, 0.04);
  standalone = mix(standalone, goldenTint * 0.5, gridMask * strength * 0.6);
  standalone += electricTint * (0.5 + 0.5 * ring) * electricMask * strength * 0.5;

  // With-media composite: artwork + golden grid overlay + electric arcs
  vec3 withMedia = artwork.rgb;
  withMedia = mix(withMedia, withMedia * goldenTint * 1.3, gridMask * strength * 0.6);
  withMedia += electricTint * (0.5 + 0.5 * ring) * electricMask * strength * 0.4;

  vec3 col = mix(standalone, withMedia, mediaPresence);

  // Central glow from spiral focus
  float coshVal = 0.5 * (exp(2.5 * (d1 + d2)) + exp(-2.5 * (d1 + d2)));
  float centralGlow = 1.0 / max(coshVal, 1e-4);
  col += vec3(1.0, 0.5, 0.1) * centralGlow * strength * 0.3;

  // Audio: electric intensity pulses with audio
  col += electricTint * electricMask * uAudioLevel * 0.25 * strength;

  fragColor = vec4(col, max(artwork.a, strength * (1.0 - mediaPresence)));
}

void main() {
  vec4 fragColor;
  mainImage(fragColor, gl_FragCoord.xy);
  gl_FragColor = fragColor;
}
