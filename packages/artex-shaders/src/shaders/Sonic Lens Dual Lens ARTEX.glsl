// Sonic Lens Dual Lens ARTEX.glsl
// Apache-2.0 — Srix / Sonic Lens (https://github.com/srix/sonic-lens)
// Ported to ARTEX uniform conventions.
//
// Two right-triangular lenses anchored at the bottom corners of the
// frame, each rendering a Sonic Lens feature view straight from the
// app's GPU pipeline.  Everywhere outside the two triangles the
// original media is passed through untouched.  Where the triangles
// overlap in the bottom centre, colorDiversity wins (drawn on top);
// symmetry sits behind.
//
// Feature views (ports of src/gpu/shaders/):
//   symmetry       — viz-symmetry.frag: false-colour heat map.
//                    Green where a pixel matches its horizontal mirror,
//                    red where it differs.
//   colorDiversity — viz-color-div.frag: saturated regions shown on a
//                    fully saturated hue wheel, desaturated regions
//                    fall to grey.
//
// Silent by design.  Sonic Lens is image → music; the frame sings, it
// does not listen.  No uAudioLevel / uBassLevel uniforms are declared.
//
// Params:
//   uEffectParam1 — 0..2  symmetry triangle leg length (1.0 = 0.7 of canvas)
//   uEffectParam2 — 0..2  diversity triangle leg length (1.0 = 0.7 of canvas)
//   uEffectParam3 — 0..2  hue-wheel / symmetry heat-map intensity (1.0 = default)
//   uMood         — 0..1  cool → warm tint bias on low-saturation regions
//
// Layout (WebGL default: uv.y = 0 at bottom):
//
//        1 +-----------------+
//          |                 |     • outside both triangles:
//          |    passthrough  |       raw uMainImage shows through
//    uv.y  |                 |
//          |  [sym]   [div]  |     • bottom-left triangle:  symmetry
//          | [symm] [ddiv]   |     • bottom-right triangle: color-diversity
//        0 +-----------------+     • overlap (bottom-centre): diversity on top
//          0      uv.x       1

precision mediump float;
uniform float time;
uniform float iTime;
uniform float uTargetAspect;
uniform float targetAspect;
uniform vec3 iResolution;
uniform vec3 iChannelResolution[4];
uniform vec2 uMainImageResolution;
uniform sampler2D uStateA;
uniform vec2 uStateAResolution;
uniform sampler2D uStateB;
uniform vec2 uStateBResolution;
uniform sampler2D uStateC;
uniform vec2 uStateCResolution;
uniform sampler2D uStateD;
uniform vec2 uStateDResolution;
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
uniform vec4 uMediaTransform;
uniform vec4 u_mediaTransform;
uniform int uMediaTransformMainEnabled;
uniform vec4 iDate;
uniform vec4 iMouse;
uniform float uAudioLevel;
uniform float uBassLevel;
uniform float uCameraLevel;
uniform vec2 uLeftEye;
uniform vec2 uRightEye;
uniform vec2 uFaceCenter;
uniform float uHasFace;
uniform vec2 leftEye;
uniform vec2 rightEye;
uniform vec2 faceCenter;
uniform float hasFace;

// Core
uniform float     uTime;
uniform vec2      uResolution;
const float uMood = 0.5;
uniform float     uEffectStrength;
uniform float     uEffectParam1;   // 0..2  symmetry triangle size
uniform float     uEffectParam2;   // 0..2  diversity triangle size
uniform float     uEffectParam3;   // 0..2  lens intensity
uniform sampler2D uMainImage;

// Live input — degrades gracefully to 0
uniform float     uProximity;      // 0..1  viewer proximity (slow breath on both lenses)

vec4 tex2D(sampler2D s, vec2 uv) { return texture2D(s, uv); }
vec4 tex2D(sampler2D s, vec3 uv) { return texture2D(s, uv.xy); }
vec4 tex2D(sampler2D s, vec4 uv) { return texture2D(s, uv.xy); }

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

vec2 artex_mapContainedUv(vec2 uv, vec2 sourceResolution, int applyMediaTransform) {
  vec2 src = max(sourceResolution, vec2(1.0));
  vec2 dst = max(iResolution.xy, vec2(1.0));
  float srcAspect = src.x / src.y;
  float dstAspect = dst.x / dst.y;

  vec2 mediaWindow = vec2(1.0);
  if (srcAspect > dstAspect) {
    mediaWindow.y = dstAspect / srcAspect;
  } else {
    mediaWindow.x = srcAspect / dstAspect;
  }

  if (applyMediaTransform == 1) {
    float mediaScale = max(uMediaTransform.z, 0.0001);
    mediaWindow *= mediaScale;

    vec2 centered = (uv - vec2(0.5)) / max(mediaWindow, vec2(0.0001));
    float angle = uMediaTransform.w;
    float sinAngle = sin(angle);
    float cosAngle = cos(angle);
    vec2 rotated = vec2(
      centered.x * cosAngle - centered.y * sinAngle,
      centered.x * sinAngle + centered.y * cosAngle
    );

    return rotated + vec2(0.5) + uMediaTransform.xy;
  }

  return (uv - vec2(0.5)) / max(mediaWindow, vec2(0.0001)) + vec2(0.5);
}

vec4 artex_sampleContained(sampler2D textureRef, vec2 uv, vec2 sourceResolution) {
  vec2 containedUv = artex_mapContainedUv(uv, sourceResolution, 1);
  if (
    containedUv.x < 0.0 || containedUv.x > 1.0
    || containedUv.y < 0.0 || containedUv.y > 1.0
  ) {
    return vec4(0.0);
  }
  return tex2D(textureRef, containedUv);
}

vec4 artex_sampleMainTexture(vec2 uv) {
  vec2 containedUv = artex_mapContainedUv(uv, uMainImageResolution, uMediaTransformMainEnabled);
  if (
    containedUv.x < 0.0 || containedUv.x > 1.0
    || containedUv.y < 0.0 || containedUv.y > 1.0
  ) {
    return vec4(0.0);
  }
  return tex2D(uMainImage, containedUv);
}

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

vec4 artex_blendStates(vec2 uv) {
  if (uUseStateBlending != 1) {
    return artex_sampleMainTexture(uv);
  }

  if (uStateCount <= 1) {
    return artex_sampleContained(uStateA, uv, uStateAResolution);
  } else if (uStateCount == 2) {
    vec4 stateA = artex_sampleContained(uStateA, uv, uStateAResolution);
    vec4 stateB = artex_sampleContained(uStateB, uv, uStateBResolution);
    return mix(stateA, stateB, uBlendFactor);
  } else if (uStateCount == 3) {
    if (uBlendFactor < 0.5) {
      float t = uBlendFactor * 2.0;
      vec4 stateA = artex_sampleContained(uStateA, uv, uStateAResolution);
      vec4 stateB = artex_sampleContained(uStateB, uv, uStateBResolution);
      return mix(stateA, stateB, t);
    } else {
      float t = (uBlendFactor - 0.5) * 2.0;
      vec4 stateB = artex_sampleContained(uStateB, uv, uStateBResolution);
      vec4 stateC = artex_sampleContained(uStateC, uv, uStateCResolution);
      return mix(stateB, stateC, t);
    }
  } else if (uStateCount >= 4) {
    float third = 1.0 / 3.0;
    float twoThirds = 2.0 / 3.0;
    if (uBlendFactor < third) {
      float t = uBlendFactor * 3.0;
      vec4 stateA = artex_sampleContained(uStateA, uv, uStateAResolution);
      vec4 stateB = artex_sampleContained(uStateB, uv, uStateBResolution);
      return mix(stateA, stateB, t);
    } else if (uBlendFactor < twoThirds) {
      float t = (uBlendFactor - third) * 3.0;
      vec4 stateB = artex_sampleContained(uStateB, uv, uStateBResolution);
      vec4 stateC = artex_sampleContained(uStateC, uv, uStateCResolution);
      return mix(stateB, stateC, t);
    } else {
      float t = (uBlendFactor - twoThirds) * 3.0;
      vec4 stateC = artex_sampleContained(uStateC, uv, uStateCResolution);
      vec4 stateD = artex_sampleContained(uStateD, uv, uStateDResolution);
      return mix(stateC, stateD, t);
    }
  }

  return artex_sampleMainTexture(uv);
}

vec4 artex_sampleMain(vec2 uv) {
  vec2 flowUv = artex_applyFlow(uv);
  return artex_blendStates(flowUv);
}

vec4 artex_sampleMain(float uv) {
  return artex_sampleMain(vec2(uv));
}

vec4 artex_sampleMain(vec3 uv) {
  return artex_sampleMain(uv.xy);
}

vec4 artex_sampleMain(vec4 uv) {
  return artex_sampleMain(uv.xy);
}

// --- HSV helpers (from src/gpu/shaders/viz-color-div.frag) ---------------
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

// --- Symmetry lens -------------------------------------------------------
// Port of viz-symmetry.frag.  Green where a pixel's luminance matches
// its horizontal mirror, red where it differs — a false-colour heat map
// of left/right symmetry.
vec3 symmetryLens(vec3 base, vec2 uv) {
  vec2  mirrorUv  = vec2(1.0 - uv.x, uv.y);
  vec3  mirror    = artex_sampleMain( mirrorUv).rgb;
  float origLum   = dot(base,   vec3(0.299, 0.587, 0.114));
  float mirrorLum = dot(mirror, vec3(0.299, 0.587, 0.114));
  float diff      = abs(origLum - mirrorLum);
  float sym       = 1.0 - smoothstep(0.0, 0.2, diff);
  float gain      = clamp(uEffectParam3, 0.0, 2.0);
  return vec3(diff * 2.0, sym * 0.8, sym * 0.3) * gain;
}

// --- Color-diversity lens -----------------------------------------------
// Port of viz-color-div.frag.  Saturated pixels are rendered on a fully
// saturated color wheel; desaturated pixels drop to grey so the frame's
// color variety reads as a heat-map of hue.
vec3 diversityLens(vec3 base) {
  vec3  hsv      = rgb2hsv(base);
  float wheelV   = 0.90 * clamp(uEffectParam3, 0.0, 2.0);
  vec3  hueColor = hsv2rgb(vec3(hsv.x, 1.0, wheelV));
  vec3  grey     = vec3(hsv.z * 0.5);

  // Mood nudge — cool 0 → warm 1, applied only to the greyed regions so
  // low-saturation areas take on a subtle tint.
  float mood     = clamp(uMood, 0.0, 1.0);
  vec3  moodTint = mix(vec3(0.90, 0.96, 1.10), vec3(1.10, 1.00, 0.88), mood);
  grey *= moodTint;

  return mix(grey, hueColor, smoothstep(0.05, 0.30, hsv.y));
}

void main() {
  vec2 res   = max(uResolution, vec2(1.0));
  vec2 uv    = gl_FragCoord.xy / res;
  vec2 texel = 1.0 / res;

  vec3 base = artex_sampleMain( uv).rgb;

  // --- Triangle masks ---------------------------------------------------
  // Right-triangle at (0,0): inside when uv.x + uv.y < leg.
  // Right-triangle at (1,0): inside when (1-uv.x) + uv.y < leg.
  // Default leg = 0.7 (uEffectParamN = 1.0).  uEffectParamN scales linearly.
  float legL = clamp(uEffectParam1 * 0.7, 0.05, 1.4);
  float legR = clamp(uEffectParam2 * 0.7, 0.05, 1.4);

  float sumL = uv.x + uv.y;
  float sumR = (1.0 - uv.x) + uv.y;

  // Smoothstep gives a 1-pixel soft edge so the hypotenuses don't stair-step.
  float edgeSoft = 1.5 * (texel.x + texel.y);
  float inL = 1.0 - smoothstep(legL - edgeSoft, legL + edgeSoft, sumL);
  float inR = 1.0 - smoothstep(legR - edgeSoft, legR + edgeSoft, sumR);

  // --- Lens effects ----------------------------------------------------
  vec3 symCol = symmetryLens(base, uv);
  vec3 divCol = diversityLens(base);

  // Slow breath — amplified by viewer proximity so a close viewer feels
  // the lenses "breathe" toward them.
  float proximity = clamp(uProximity, 0.0, 1.0);
  float breath    = 0.92 + 0.08 * sin(uTime * 0.4) * (0.5 + proximity * 0.8);
  symCol *= breath;
  divCol *= breath;

  // --- Composite -------------------------------------------------------
  // Lenses are fully opaque inside their triangles; outside is pure
  // passthrough.  Order matters: symmetry first, diversity on top.
  vec3 col = base;
  col = mix(col, symCol, inL);
  col = mix(col, divCol, inR);

  // --- Thin gold seam on each hypotenuse ------------------------------
  // Seam width ≈ 2 px regardless of resolution.  Gives the two lenses a
  // crisp divider so they read as deliberate overlays rather than fog.
  float seamW = 2.5 * (texel.x + texel.y);
  float seamL = exp(-pow((sumL - legL) / seamW, 2.0));
  float seamR = exp(-pow((sumR - legR) / seamW, 2.0));
  vec3  gold  = vec3(1.25, 0.95, 0.55);
  col = mix(col, gold, max(seamL, seamR) * 0.75);

  gl_FragColor = vec4(mix(base, col, clamp(uEffectStrength, 0.0, 1.0)), 1.0);
}
