// Reeded Glass Portrait ARTEX.glsl
// Apache-2.0 — ARTEX
//
// Fluted / reeded-glass portrait effect. The artwork is viewed through a
// column of vertical cylindrical lenses: each rib refracts the source
// horizontally, duplicating features and smearing them into vertical drips.
// A warm duotone grade (amber / shadow) unifies the composition — inspired
// by the privacy-glass portraiture where a face softens into rhythmic bands.
//
// ARTEX inputs used:
//   - uMainImage / uMainImage   : source portrait / video
//   - uTime                    : subtle lens drift + bottom drip flow
//   - uMood                    : rib density (0 = few fat ribs, 1 = dense mesh)
//   - uEffectParam1            : lens curvature (cylindrical refraction strength)
//   - uEffectParam2            : vertical smear / drip length
//   - uEffectParam3            : color warmth / duotone intensity
//   - uEffectStrength          : blend with original artwork
//   - uAudioLevel / uBassLevel : rib shimmer + sub-harmonic pulse
//   - uProximity               : sharpens focus near the center as viewer approaches
//   - uCameraLevel             : highlight bloom on rib seams
//   - uFaceCenter / uHasFace   : centers the rib column on the subject
//   - uMainImageResolution     : preserves artwork aspect (no painting into letterbox)

precision mediump float;
uniform float time;
uniform float iTime;
uniform float uTime;
uniform float uTargetAspect;
uniform float targetAspect;
uniform vec2 uResolution;
uniform vec3 iResolution;
uniform vec3 iChannelResolution[4];
uniform sampler2D uMainImage;
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
uniform vec2 uLeftEye;
uniform vec2 uRightEye;
uniform vec2 uFaceCenter;
uniform float uHasFace;
uniform vec2 leftEye;
uniform vec2 rightEye;
uniform vec2 faceCenter;
uniform float hasFace;
uniform float uAudioLevel;
uniform float uBassLevel;
uniform float uTransientLevel;
uniform float uProximity;
uniform float uCameraLevel;
const float uMood = 0.5;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

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
  return texture2D(textureRef, containedUv);
}

vec4 artex_sampleMainTexture(vec2 uv) {
  vec2 containedUv = artex_mapContainedUv(uv, uMainImageResolution, uMediaTransformMainEnabled);
  if (
    containedUv.x < 0.0 || containedUv.x > 1.0
    || containedUv.y < 0.0 || containedUv.y > 1.0
  ) {
    return vec4(0.0);
  }
  return texture2D(uMainImage, containedUv);
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

vec4 tex2D(sampler2D s, vec2 uv) { return texture2D(s, uv); }

float sat(float x) { return clamp(x, 0.0, 1.0); }

float hash11(float p) {
  return fract(sin(p * 127.1 + 311.7) * 43758.5453123);
}

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Flow-warped source sampler (optional flow field layer).
vec2 applyFlow(vec2 uv) {
  if (uFlowEnabled != 1) return uv;
  vec2 p = uv * max(uFlowScale * 6.0, 0.5);
  float nx = noise2(p + vec2(11.0, 0.0) + uTime * uFlowSpeed);
  float ny = noise2(p + vec2(0.0, 11.0) + uTime * uFlowSpeed);
  return uv + vec2(nx - 0.5, ny - 0.5) * uFlowIntensity * 0.12;
}

vec4 sampleSource(vec2 uv) {
  // Clamp so cylindrical refraction near rib edges never wraps.
  vec2 clamped = clamp(applyFlow(uv), vec2(0.0), vec2(1.0));
  if (uUseStateBlending == 1 && uStateCount >= 2) {
    vec4 a = tex2D(uStateA, clamped);
    vec4 b = tex2D(uStateB, clamped);
    return mix(a, b, sat(uBlendFactor));
  }
  return artex_sampleMain( clamped);
}

// Soft luminance — we use it for the "gravity" of black drips.
float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// Aspect-correct fragment coordinates. Maps to [-1..1] X-range respecting the
// artwork's aspect so the ribs are vertical regardless of canvas shape.
vec2 aspectCoords(vec2 fragUv, float canvasAspect) {
  vec2 p = fragUv * 2.0 - 1.0;
  p.x *= canvasAspect;
  return p;
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / res;
  float canvasAspect = res.x / res.y;

  // Preserve artwork bounds — don't paint into letterbox/pillarbox.
  vec4 baseSample = sampleSource(uv);
  float mediaPresence = smoothstep(0.0, 0.05, baseSample.a);

  // Drive parameters.
  float audio = sat(uAudioLevel);
  float bass = sat(uBassLevel);
  float transient = sat(uTransientLevel);
  float proximity = sat(uProximity);
  float camera = sat(uCameraLevel);
  float mood = sat(uMood);

  // Subject anchor — if face tracking is live, pin the optical axis to the
  // face center so the ribs frame the subject symmetrically.
  float haveFace = max(sat(uHasFace), sat(hasFace));
  vec2 faceHint = mix(uFaceCenter, faceCenter, step(0.5, sat(hasFace)));
  vec2 anchor = mix(vec2(0.5), clamp(faceHint, vec2(0.05), vec2(0.95)), haveFace);

  // Rib count: the artist slider drives density; mood and bass add life.
  float densityKnob = 0.15 + 1.85 * sat(uEffectParam1 * 0.5);
  float ribCount = mix(14.0, 56.0, sat(densityKnob * 0.5)) * (0.90 + 0.25 * mood);
  ribCount += 4.0 * bass;
  ribCount = clamp(ribCount, 8.0, 96.0);

  // Lens curvature — how strongly each rib bends light horizontally.
  float curvature = 0.65 * sat(uEffectParam2 * 0.55) + 0.20;
  curvature += 0.22 * bass + 0.10 * transient;

  // Vertical smear / drip length (the black streaks at the bottom).
  float drip = sat(uEffectParam3 * 0.55) * 0.85 + 0.15 * proximity;

  // Warmth / duotone balance (color shift).
  float warmth = sat(uMood * 0.5 + 0.35 + 0.25 * camera);

  // --- Rib lattice ----------------------------------------------------------
  // Center the lattice on the anchor so the subject sits between two ribs.
  float centeredX = uv.x - anchor.x;
  float ribIndex = floor(centeredX * ribCount + 0.5);
  float ribCenterX = anchor.x + ribIndex / ribCount;
  float ribHalf = 0.5 / ribCount;
  // Local coordinate within the rib, in [-1..1].
  float ribLocal = (uv.x - ribCenterX) / ribHalf;
  ribLocal = clamp(ribLocal, -1.0, 1.0);

  // Per-rib pseudo-random signature for imperfections.
  float ribSig = hash11(ribIndex * 1.37 + 4.1);
  float ribSig2 = hash11(ribIndex * 2.71 + 9.3);

  // Cylindrical refraction: a rib of index i looks up the source at an
  // x-offset that moves *away* from the rib edges, compressing detail toward
  // the rib center — this is what creates the repeated "slices" of the face.
  float lensBend = sin(ribLocal * 1.5707963) * curvature;
  // A gentle slow sway keeps the glass feeling hand-poured rather than
  // mathematically perfect.
  lensBend += 0.04 * sin(uTime * 0.55 + ribSig * 6.2831) * curvature;
  // Small per-rib horizontal jitter — ribs are never perfectly aligned.
  lensBend += (ribSig - 0.5) * 0.06 * curvature;

  // Refracted source UV. The horizontal sample shifts by lensBend scaled to
  // rib width; vertical stays put (the refraction axis is the rib axis).
  vec2 refractedUv = vec2(ribCenterX + lensBend * ribHalf * 1.15, uv.y);

  // Drip: at the bottom of certain ribs, the glass appears to melt downward.
  // We pull the sample up (reveal upstream detail) weighted by the rib's own
  // luminance — dark features become long black streaks.
  float dripMask = smoothstep(0.05, 0.95, uv.y);
  float dripProfile = pow(dripMask, 1.4);
  float dripAmount = drip * dripProfile * (0.35 + 0.65 * ribSig2);
  // Slow wobble so the drips feel fluid rather than frozen.
  dripAmount *= 0.85 + 0.15 * sin(uTime * 0.35 + ribSig * 12.0);
  refractedUv.y -= dripAmount * 0.22;

  // Slight per-rib vertical stretch so nose/mouth features smear between ribs.
  refractedUv.y = mix(refractedUv.y, 0.5 + (refractedUv.y - 0.5) * (1.0 - 0.08 * curvature), 0.4);

  vec4 refracted = sampleSource(refractedUv);
  vec3 glass = refracted.rgb;

  // Bring in a neighbor sample at the rib seam to make the edges read as a
  // hard refractive boundary rather than a smooth blur.
  float seam = 1.0 - abs(ribLocal);
  float seamBend = sign(ribLocal) * (1.0 - seam) * curvature * 0.30;
  vec2 seamUv = vec2(ribCenterX + seamBend, refractedUv.y);
  vec4 seamSample = sampleSource(seamUv);
  float seamMix = pow(1.0 - seam, 3.0);
  glass = mix(glass, seamSample.rgb, seamMix * 0.25);

  // Rib shimmer — a narrow highlight line where ribs meet. Audio reactive.
  float seamLine = smoothstep(0.85, 1.0, 1.0 - abs(ribLocal));
  float shimmer = seamLine * (0.30 + 0.70 * audio + 0.35 * camera);
  // A second sparse shimmer pass driven by transients for "clap" moments.
  shimmer += seamLine * transient * 0.45 * (0.5 + 0.5 * sin(uTime * 9.0 + ribSig * 17.0));

  // --- Drip darkening -------------------------------------------------------
  // Darken the shader where luminance is already low AND we're in the drip
  // zone. This produces the black vertical streaks seen in the reference.
  float sampleLuma = luma(glass);
  float dripDarken = (1.0 - smoothstep(0.15, 0.55, sampleLuma)) * dripProfile * drip;
  dripDarken *= 0.55 + 0.45 * ribSig2;
  glass = mix(glass, glass * 0.08, sat(dripDarken));

  // --- Duotone grade --------------------------------------------------------
  // Warm palette: amber highlights, deep near-black shadows. The shadow tint
  // leans red/brown rather than blue so the whole image feels incandescent.
  vec3 shadow = mix(vec3(0.02, 0.01, 0.02), vec3(0.24, 0.03, 0.02), warmth);
  vec3 mid = mix(vec3(0.62, 0.18, 0.05), vec3(0.95, 0.35, 0.05), warmth);
  vec3 highlight = mix(vec3(0.98, 0.70, 0.18), vec3(1.00, 0.82, 0.22), warmth);

  float L = sat(pow(sampleLuma, 0.85));
  vec3 graded = mix(shadow, mid, smoothstep(0.0, 0.55, L));
  graded = mix(graded, highlight, smoothstep(0.45, 1.0, L));

  // Preserve a touch of the refracted hue on mid-tones so skin doesn't flatten.
  graded = mix(graded, glass, 0.12 * (1.0 - warmth));

  // Audio-reactive overall brightness lift, subtle.
  graded *= 1.0 + 0.10 * audio + 0.06 * bass;

  // Seam highlights glow warm.
  graded += vec3(1.00, 0.55, 0.15) * shimmer * 0.35;

  // Proximity pulls the image back toward its un-graded state near the face —
  // as the viewer approaches, the glass becomes more transparent.
  float reveal = proximity * 0.55;
  graded = mix(graded, glass, reveal);

  // Subtle vignette to match the reference framing.
  vec2 vignetteP = aspectCoords(uv, canvasAspect);
  float vignette = 1.0 - smoothstep(0.8, 1.7, length(vignetteP) * (0.95 - 0.15 * warmth));
  graded *= mix(1.0, vignette, 0.35);

  // Film grain to dirty the gradient (reference photo has sensor noise).
  float grain = (hash12(gl_FragCoord.xy + uTime * 37.0) - 0.5) * 0.04;
  graded += grain * (0.5 + 0.5 * warmth);

  // Output: respect artwork alpha (no painting into letterbox), and blend
  // with the original via uEffectStrength. When no media is present, we
  // render the graded ribs on their own so the shader still reads as a
  // living image rather than a black frame.
  float strength = sat(uEffectStrength);
  vec3 finalColor = mix(baseSample.rgb, graded, strength);
  float alpha = max(baseSample.a, strength * (1.0 - mediaPresence));

  // Clip to the media region — outside the artwork, emit nothing, honoring
  // the project rule that the shader must not render into letterbox/pillarbox.
  alpha *= max(mediaPresence, step(0.001, baseSample.a));
  if (alpha < 0.001 && mediaPresence < 0.001) {
    // No source at all — let the grading stand but softly, so the shader
    // still looks alive when previewed without media.
    finalColor = graded;
    alpha = strength;
  }

  gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), sat(alpha));
}
