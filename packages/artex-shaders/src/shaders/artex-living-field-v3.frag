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
uniform vec2 leftEye;
uniform vec2 rightEye;
uniform vec2 faceCenter;
uniform float hasFace;

varying vec2 v_uv;

uniform sampler2D uMainImage;
uniform float uTime;
uniform vec2 uResolution;
uniform float uAudioLevel;
uniform float uBassLevel;
uniform float uProximity;
uniform float uCameraLevel;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;
uniform vec2 uLeftEye;
uniform vec2 uRightEye;
uniform vec2 uFaceCenter;
uniform float uHasFace;

uniform float uDensity;
uniform float uSoftness;
uniform float uPorosity;
uniform float uViscosity;
uniform float uGranularity;
uniform float uLayerSeparation;
uniform float uFlowSpeedField;
uniform float uFlowDirection;
uniform float uTurbulence;
uniform float uBreathingRate;
uniform float uBreathingDepth;
uniform float uDrift;
uniform float uDisplacementAmount;
uniform float uPullStrength;
uniform float uStretchStrength;
uniform float uFractureAmount;
uniform float uWarpScale;
uniform float uFocusFalloff;
uniform float uFeedbackAmount;
uniform float uTrailDecay;
uniform float uAfterglow;
uniform float uImprintStrength;
uniform float uMemoryBlur;
uniform vec3 uColorBase;
uniform vec3 uColorMid;
uniform vec3 uColorAccent;
uniform float uEmissiveField;
uniform float uBloomField;
uniform float uContrastField;
uniform float uBlackLevelField;
uniform float uVignetteField;
uniform float uSaturationField;
uniform vec2 uPresenceCentroid;
uniform float uArousal;
uniform float uCoherence;
uniform float uIntimacy;
uniform float uTension;
uniform float uNovelty;
uniform float uAttention;
uniform float uMemoryResidueField;
uniform float uAudioPulse;
uniform float uMotionAmount;

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

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 6; i++) {
    value += amplitude * noise(p);
    p *= 2.03;
    amplitude *= 0.52;
  }
  return value;
}

mat2 rot(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

vec3 saturateColor(vec3 color, float saturation) {
  float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  return mix(vec3(luminance), color, saturation);
}

void main() {
  float density = max(uDensity, 0.58);
  float softness = max(uSoftness, 0.24);
  float porosity = max(uPorosity, 0.12);
  float viscosity = max(uViscosity, 0.72);
  float granularity = max(uGranularity, 0.08);
  float layerSeparation = max(uLayerSeparation, 0.42);
  float flowSpeedField = max(uFlowSpeedField, 0.16);
  float turbulence = max(uTurbulence, 0.08);
  float breathingRate = max(uBreathingRate, 0.08);
  float breathingDepth = max(uBreathingDepth, 0.04);
  float driftAmount = max(uDrift, 0.03);
  float displacementAmount = max(uDisplacementAmount, 0.08);
  float pullStrength = max(uPullStrength, 0.12);
  float stretchStrength = max(uStretchStrength, 0.08);
  float fractureAmount = max(uFractureAmount, 0.015);
  float warpScale = max(uWarpScale, 1.2);
  float focusFalloff = max(uFocusFalloff, 0.18);
  float trailDecay = max(uTrailDecay, 0.96);
  float afterglow = max(uAfterglow, 0.18);
  float imprintStrength = max(uImprintStrength, 0.14);
  float memoryBlur = max(uMemoryBlur, 0.08);
  float emissiveField = max(uEmissiveField, 0.5);
  float bloomField = max(uBloomField, 0.24);
  float contrastField = max(uContrastField, 1.08);
  float blackLevelField = clamp(uBlackLevelField, 0.0, 0.2);
  float vignetteField = max(uVignetteField, 0.08);
  float saturationField = max(uSaturationField, 0.42);
  vec2 presenceCentroid = length(uPresenceCentroid) > 0.001 ? uPresenceCentroid : vec2(0.5, 0.52);
  vec3 defaultBase = vec3(0.01, 0.012, 0.02);
  vec3 defaultMid = vec3(0.42, 0.52, 0.68);
  vec3 defaultAccent = vec3(0.82, 0.9, 0.98);
  float hasPalette = step(0.001, length(uColorMid) + length(uColorAccent));
  vec3 colorBaseField = mix(defaultBase, uColorBase, hasPalette);
  vec3 colorMidField = mix(defaultMid, uColorMid, hasPalette);
  vec3 colorAccentField = mix(defaultAccent, uColorAccent, hasPalette);

  vec2 uv = v_uv;
  vec2 centered = uv - 0.5;
  float aspect = uResolution.x / max(1.0, uResolution.y);
  centered.x *= aspect;

  vec2 focus = mix(presenceCentroid, uFaceCenter, clamp(uHasFace * 0.65 + uIntimacy * 0.35, 0.0, 1.0));
  vec2 focusVec = focus - uv;
  focusVec.x *= aspect;
  float focusDistance = length(focusVec);
  float focusInfluence = exp(-focusDistance / max(0.02, focusFalloff * 0.95));

  float breath = 1.0 + sin(uTime * (0.65 + breathingRate * 7.2) + uAudioPulse * 2.4) * (breathingDepth * 0.9 + 0.02);
  vec2 flowAxis = vec2(cos(uFlowDirection), sin(uFlowDirection));
  vec2 drift = flowAxis * (uTime * (0.02 + flowSpeedField * 0.2));
  vec2 memoryDrift = vec2(uTime * driftAmount * 0.08, -uTime * (0.01 + uMemoryResidueField * 0.05));

  vec2 warpedUv = uv;
  warpedUv = (warpedUv - 0.5) * breath + 0.5;
  warpedUv += (fbm(warpedUv * (1.2 + warpScale) + drift) - 0.5) * (0.08 + displacementAmount * 0.16);
  warpedUv += normalize(focusVec + 1e-4) * focusInfluence * pullStrength * 0.08;
  warpedUv += vec2(
    fbm((warpedUv + drift) * (2.4 + warpScale)),
    fbm((warpedUv - drift.yx) * (2.0 + warpScale * 0.8))
  ) * 0.12 - 0.06;

  vec2 tissueUv = warpedUv;
  tissueUv = rot((uNovelty - 0.5) * 0.35 + uMotionAmount * 0.1) * (tissueUv - 0.5) + 0.5;
  tissueUv.x *= aspect;

  float innerField = fbm(tissueUv * (1.35 + viscosity * 1.45) + drift + memoryDrift);
  float layerField = fbm((tissueUv + vec2(layerSeparation * 0.18, -layerSeparation * 0.12)) * (2.25 + stretchStrength * 1.3) - drift * 1.6);
  float residueField = fbm((tissueUv + memoryDrift * 0.35) * (4.4 + memoryBlur * 2.2) + vec2(11.2, -4.7));
  float field = mix(innerField, layerField, 0.42 + uIntimacy * 0.08);
  field += (residueField - 0.5) * (0.12 + uMemoryResidueField * 0.22);
  field += (fbm(tissueUv * (9.0 + granularity * 7.0) - drift * 0.35) - 0.5) * (granularity * 0.34 + 0.01);

  float pulseGlow = uAudioPulse * 0.18 + uArousal * 0.1 + uBassLevel * 0.12;
  float fracture = smoothstep(0.56, 0.86, fbm(tissueUv * (7.0 + fractureAmount * 8.0) - uTime * (0.06 + uTension * 0.18)));
  field *= 1.0 - fracture * (0.22 + fractureAmount * 0.38);

  float densityCenter = mix(density, 0.42 + uAttention * 0.18, focusInfluence * 0.55);
  field = smoothstep(
    densityCenter - (softness * 0.75 + 0.04),
    densityCenter + (softness * 0.9 + 0.06),
    field
  );

  float eyeTrace = 0.0;
  eyeTrace += exp(-length((uv - uLeftEye) * vec2(aspect, 1.0)) * 18.0) * uHasFace * 0.5;
  eyeTrace += exp(-length((uv - uRightEye) * vec2(aspect, 1.0)) * 18.0) * uHasFace * 0.5;
  float traceField = fbm((uv + vec2(uTime * 0.03, -uTime * 0.02)) * (5.0 + trailDecay * 2.0));
  field += eyeTrace * (0.08 + afterglow * 0.2) + traceField * imprintStrength * 0.1;

  // This shader generates its own procedural cloud field — no standalone fallback needed.
  // When media is loaded, blend it in; when standalone, the field renders on its own.
  vec4 baseImage = artex_sampleMain(uv);
  float baseLuma = dot(baseImage.rgb, vec3(0.299, 0.587, 0.114));
  field += baseLuma * (0.08 + porosity * 0.12);

  float glow = 0.08 + focusInfluence * (0.12 + afterglow * 0.24);
  glow += pulseGlow;
  glow += (uCameraLevel * 0.08 + uProximity * 0.1);
  glow += pow(max(0.0, field), 2.0) * (emissiveField * 0.35 + 0.08);

  float veil = 0.06 + residueField * 0.08 + focusInfluence * 0.05;
  float value = clamp(field * 0.78 + glow + veil, 0.0, 1.0);
  value = pow(value, 1.0 / max(0.001, contrastField + uEffectParam2 * 0.18));
  value = max(0.0, value - max(0.0, blackLevelField - uEffectParam1 * 0.04));

  vec3 color = mix(colorBaseField, colorMidField, value);
  color = mix(color, colorAccentField, clamp(pow(value, 1.55) * (0.72 + uEffectParam3 * 0.3), 0.0, 1.0));
  color += baseImage.rgb * (0.06 + baseLuma * 0.18) * porosity;
  color = saturateColor(color, saturationField + uEffectParam3 * 0.12);
  color += vec3(1.0) * pow(max(0.0, value), 3.0) * (bloomField * 0.45 + 0.04);

  float vignette = smoothstep(1.18 + vignetteField * 0.55, 0.12, length(centered));
  color *= vignette;
  color *= 0.95 + uEffectStrength * 0.08;

  gl_FragColor = vec4(color, clamp(value + afterglow * 0.14, 0.0, 1.0));
}
