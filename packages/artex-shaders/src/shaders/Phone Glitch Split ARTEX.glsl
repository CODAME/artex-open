// Phone Glitch Split ARTEX — RGB split, scanline tear, block displacement, and pixel noise.
// Designed as a trigger shader for the "holding a phone" gesture. Disruptive on purpose.
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

// --- Glitch primitives ---
float glitch_rand(float x) {
  return fract(sin(x * 127.1 + 311.7) * 43758.5453);
}

float glitch_rand2(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord.xy / uResolution.xy;

  // Effect intensity — uEffectStrength scales the whole effect; params tune sub-features.
  float strength = clamp(uEffectStrength, 0.0, 1.0);
  float splitAmount = 0.008 * max(0.0, uEffectParam1 * 2.0);
  float blockAmount = 0.06 * max(0.0, uEffectParam2 * 2.0);
  float noiseAmount = 0.4 * max(0.0, uEffectParam3 * 2.0);

  float t = uTime;

  // Slow frame index so block tears jitter at ~12fps rather than every frame.
  float frameT = floor(t * 12.0);

  // Per-scanline horizontal offset — bias toward "big tears" with a sparse mask.
  float lineSeed = glitch_rand(floor(uv.y * 80.0) + frameT);
  float tearMask = step(0.92, lineSeed);
  float tearOffset = (lineSeed - 0.5) * blockAmount * 2.0 * tearMask;

  // Sample block — applies a horizontal shift to a band of scanlines.
  vec2 blockUv = uv + vec2(tearOffset, 0.0);

  // RGB channel split — each channel sampled at a different horizontal offset.
  float audio = 1.0 + uAudioLevel * 0.6;
  float split = splitAmount * audio * (0.7 + 0.3 * sin(t * 7.3));
  vec4 colR = artex_sampleMain(blockUv + vec2(split, 0.0));
  vec4 colG = artex_sampleMain(blockUv);
  vec4 colB = artex_sampleMain(blockUv - vec2(split, 0.0));

  vec3 glitched = vec3(colR.r, colG.g, colB.b);
  float baseAlpha = max(max(colR.a, colG.a), colB.a);

  // Scanlines — subtle darkening on odd rows.
  float scanline = 0.85 + 0.15 * sin(uv.y * uResolution.y * 3.14159);
  glitched *= scanline;

  // Flash / brightness kick near the start of each "tear frame".
  float flashPulse = step(0.97, glitch_rand(frameT)) * 0.25;
  glitched += flashPulse;

  // Pixel noise.
  float noise = glitch_rand2(uv * uResolution.xy + frameT) - 0.5;
  glitched += noise * noiseAmount * 0.25;

  // Composite: crossfade from the clean sample to the glitched color by strength.
  vec4 clean = artex_sampleMain(uv);
  float mediaPresence = smoothstep(0.0, 0.05, clean.a);
  vec3 finalColor = mix(clean.rgb, glitched, strength);

  // When media is absent, show the glitched pattern against transparent.
  float outAlpha = max(clean.a, baseAlpha * strength * (1.0 - mediaPresence));
  fragColor = vec4(finalColor, max(clean.a, outAlpha));
}

void main() {
  vec4 fragColor;
  mainImage(fragColor, gl_FragCoord.xy);
  gl_FragColor = fragColor;
}
