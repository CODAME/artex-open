// Phone Chromatic Warp ARTEX — Polar-coordinate swirl with per-channel chromatic split.
// Designed as a trigger shader for the "holding a phone" gesture. Smoother than Glitch Split.
precision mediump float;
const float uMood = 0.5;
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

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord.xy / uResolution.xy;

  // Centered coords with aspect correction so the swirl is radial, not elliptical.
  vec2 centered = uv - 0.5;
  centered.x *= uResolution.x / uResolution.y;

  float radius = length(centered);
  float angle = atan(centered.y, centered.x);

  float strength = clamp(uEffectStrength, 0.0, 1.0);
  float swirlAmount = 1.8 * max(0.0, uEffectParam1 * 2.0);
  float splitAmount = 0.018 * max(0.0, uEffectParam2 * 2.0);
  float pulseAmount = 0.25 * max(0.0, uEffectParam3 * 2.0);

  float t = uTime;

  // Swirl — angle is shifted by a function of radius, so the center barely moves
  // and the edges warp most.
  float audio = 1.0 + uAudioLevel * 0.5;
  float twist = swirlAmount * smoothstep(0.0, 0.6, radius) * audio;
  float swirlAngle = angle + twist * (0.6 + 0.4 * sin(t * 1.3));

  vec2 swirled = vec2(cos(swirlAngle), sin(swirlAngle)) * radius;
  swirled.x /= uResolution.x / uResolution.y;
  swirled += 0.5;

  // Per-channel chromatic split — each channel sampled with a slightly different swirl.
  float chromatic = splitAmount * (0.7 + 0.3 * sin(t * 4.1));
  vec2 splitDir = vec2(cos(angle), sin(angle));

  vec4 sampleR = artex_sampleMain(swirled + splitDir * chromatic);
  vec4 sampleG = artex_sampleMain(swirled);
  vec4 sampleB = artex_sampleMain(swirled - splitDir * chromatic);

  vec3 warped = vec3(sampleR.r, sampleG.g, sampleB.b);

  // Radial pulse brightness so the effect "breathes" on the frame.
  float pulse = 1.0 + pulseAmount * sin(t * 2.4 - radius * 6.0);
  warped *= pulse;

  // Composite with the clean sample by strength.
  vec4 clean = artex_sampleMain(uv);
  float mediaPresence = smoothstep(0.0, 0.05, clean.a);
  vec3 finalColor = mix(clean.rgb, warped, strength);

  float baseAlpha = max(max(sampleR.a, sampleG.a), sampleB.a);
  float outAlpha = max(clean.a, baseAlpha * strength * (1.0 - mediaPresence));
  fragColor = vec4(finalColor, max(clean.a, outAlpha));
}

void main() {
  vec4 fragColor;
  mainImage(fragColor, gl_FragCoord.xy);
  gl_FragColor = fragColor;
}
