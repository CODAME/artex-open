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
uniform float uProximity;
uniform float uCameraLevel;
uniform vec2 uLeftEye;
uniform vec2 uRightEye;
uniform vec2 uFaceCenter;
uniform float uHasFace;
uniform vec2 leftEye;
uniform vec2 rightEye;
uniform vec2 faceCenter;
uniform float hasFace;

uniform float uTime;
uniform vec2 uResolution;
uniform sampler2D uMainImage;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

vec4 tex2D(sampler2D s, vec2 uv) { return texture2D(s, uv); }
vec4 tex2D(sampler2D s, vec3 uv) { return texture2D(s, uv.xy); }
vec4 tex2D(sampler2D s, vec4 uv) { return texture2D(s, uv.xy); }

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

float sat(float x) {
  return clamp(x, 0.0, 1.0);
}

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

float dancerMask(vec4 sampleColor) {
  float alphaMask = sampleColor.a;
  float brightnessMask = 1.0 - smoothstep(0.76, 0.98, luma(sampleColor.rgb));
  return max(alphaMask, brightnessMask);
}

void main() {
  vec2 resolution = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / resolution;

  float tileCount = mix(4.0, 16.0, sat(uEffectParam1 * 0.5));
  float speed = 0.35 + 1.8 * sat(uEffectParam2 * 0.5);
  float edgeBoost = 0.8 + 2.4 * sat(uEffectParam3 * 0.5);

  vec2 tiled = uv * tileCount;
  vec2 cell = floor(tiled);
  vec2 local = fract(tiled);

  float rnd = hash12(cell);
  float phase = uTime * speed + rnd * 6.2831853;

  // Create "GIF frame stepping" feel with per-tile temporal offset.
  float frame = floor(uTime * (2.0 + speed * 1.7) + rnd * 8.0);
  vec2 stepJitter = vec2(
    fract(frame * 0.37 + rnd) - 0.5,
    fract(frame * 0.73 + rnd * 1.7) - 0.5
  ) * 0.08;

  float rowSign = mod(cell.y, 2.0) < 0.5 ? -1.0 : 1.0;
  float rowShift = rowSign * 0.045 * sin(phase * 0.8 + cell.y * 0.41);
  vec2 microWarp = vec2(
    0.015 * sin(phase + local.y * 8.0),
    0.018 * cos(phase * 1.2 + local.x * 7.0)
  );

  vec2 sampleUv = local;
  sampleUv.x += rowShift;
  sampleUv += stepJitter + microWarp;
  sampleUv = clamp(sampleUv, vec2(0.001), vec2(0.999));

  // Media presence detection
  vec4 artwork = artex_sampleMain(uv);
  float mediaPresence = smoothstep(0.0, 0.05, artwork.a);
  float strength = uEffectStrength;

  vec4 src = artex_sampleMain( sampleUv);
  float mask = dancerMask(src);

  // Silhouette edge extraction in texture space.
  vec2 edgeStep = vec2(1.0 / 256.0, 1.0 / 256.0);
  float mL = dancerMask(artex_sampleMain( clamp(sampleUv - vec2(edgeStep.x, 0.0), vec2(0.001), vec2(0.999))));
  float mR = dancerMask(artex_sampleMain( clamp(sampleUv + vec2(edgeStep.x, 0.0), vec2(0.001), vec2(0.999))));
  float mD = dancerMask(artex_sampleMain( clamp(sampleUv - vec2(0.0, edgeStep.y), vec2(0.001), vec2(0.999))));
  float mU = dancerMask(artex_sampleMain( clamp(sampleUv + vec2(0.0, edgeStep.y), vec2(0.001), vec2(0.999))));
  float edge = sat((abs(mR - mL) + abs(mU - mD)) * 0.5 * edgeBoost);

  vec3 bg = vec3(0.975, 0.975, 0.982);
  float gridLine = smoothstep(0.985, 1.0, max(abs(local.x - 0.5), abs(local.y - 0.5)) * 2.0);
  bg -= gridLine * 0.018;

  // Standalone: procedural colored tiles when no media
  float tileHue = hash12(cell) * 6.2831853;
  vec3 tileColor = 0.5 + 0.45 * vec3(
    sin(tileHue),
    sin(tileHue + 2.094),
    sin(tileHue + 4.189)
  );
  tileColor *= 0.85 + 0.15 * sin(phase + local.y * 6.0);
  float tileMask = smoothstep(0.48, 0.42, max(abs(local.x - 0.5), abs(local.y - 0.5)));
  float tilePattern = smoothstep(0.35, 0.15, length(local - 0.5 + vec2(sin(phase) * 0.1, cos(phase * 1.3) * 0.1)));
  vec3 standaloneSubject = tileColor * (0.7 + tilePattern * 0.5);
  vec3 standaloneComposed = mix(bg, standaloneSubject, tileMask * 0.85);

  // With media: original composition
  vec3 subject = src.rgb;
  subject *= 0.90 + 0.15 * sin(phase + local.y * 6.0);
  subject += edge * vec3(0.07, 0.12, 0.24);
  vec3 mediaComposed = mix(bg, subject, mask);
  mediaComposed += edge * vec3(0.04, 0.07, 0.14) * 0.5;

  vec3 composed = mix(standaloneComposed, mediaComposed, mediaPresence);

  vec2 p = uv * 2.0 - 1.0;
  p.x *= resolution.x / resolution.y;
  float vignette = smoothstep(1.28, 0.25, length(p));
  composed *= mix(0.93, 1.05, vignette);

  vec3 finalColor = mix(bg, composed, sat(uEffectStrength));
  gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), max(artwork.a, strength * (1.0 - mediaPresence)));
}
