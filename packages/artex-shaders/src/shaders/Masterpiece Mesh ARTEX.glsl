// Masterpiece Mesh ARTEX.glsl
// Uses uploaded media as a single moving artwork inside the filament body.
precision mediump float;
uniform float time;
uniform float iTime;
uniform float uTargetAspect;
uniform float targetAspect;
uniform vec3 iResolution;
uniform vec3 iChannelResolution[4];
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

uniform float uTime;
uniform vec2 uResolution;
uniform sampler2D uMainImage;
uniform vec2 uMainImageResolution;
uniform float uAudioLevel;
uniform float uBassLevel;
uniform float uProximity;
uniform float uCameraLevel;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

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

float softLine(float dist, float width) {
  float w = max(width, 1e-4);
  return exp(-pow(abs(dist) / w, 1.42));
}

float columnEnvelope(float s, float spread) {
  float bell = pow(max(0.0, sin(s * PI)), 0.72);
  return mix(0.12, 0.56, bell) * spread;
}

float strandYWarp(float s, float phase, float time, float orbit) {
  return 0.040 * sin(s * TAU * 1.9 + phase * 0.8 - time * (0.20 + orbit * 0.24))
    + 0.018 * sin(s * TAU * 5.2 - phase * 1.4 + time * (0.28 + orbit * 0.35));
}

float strandCurve(float s, float phase, float time, float spread, float orbit, float detail) {
  float env = columnEnvelope(s, spread);
  float lobe = sin(s * (4.2 + detail * 2.0) * PI + phase + time * (0.55 + orbit * 0.42));
  float curl = sin(s * (12.0 + detail * 5.0) + phase * 1.8 - time * (0.80 + orbit * 0.72));
  float knot = sin(s * (22.0 + detail * 8.5) + phase * 2.7 + time * (0.22 + orbit * 0.45));
  return env * (0.64 * lobe + 0.24 * curl + 0.12 * knot);
}

vec2 coverUv(vec2 uv, float targetAspect) {
  vec2 src = max(uMainImageResolution, vec2(1.0));
  float srcAspect = src.x / src.y;
  vec2 scale = vec2(1.0);
  if (srcAspect > targetAspect) {
    scale.x = targetAspect / srcAspect;
  } else {
    scale.y = srcAspect / targetAspect;
  }
  return clamp((uv - 0.5) * scale + 0.5, vec2(0.0), vec2(1.0));
}

vec3 sampleColumnMedia(vec2 uv, float targetAspect) {
  vec2 cUv = coverUv(clamp(uv, vec2(0.0), vec2(1.0)), targetAspect);
  vec4 s = artex_sampleMain(cUv);
  // When no media loaded, generate procedural mesh color
  if (s.a < 0.01) {
    float n1 = noise2(uv * 6.0 + vec2(uTime * 0.08, 0.0));
    float n2 = noise2(uv * 4.0 + vec2(0.0, uTime * 0.06));
    return vec3(
      0.35 + 0.35 * sin(n1 * 6.0 + uTime * 0.2),
      0.25 + 0.3 * sin(n2 * 5.0 + uTime * 0.3 + 2.0),
      0.4 + 0.35 * sin((n1 + n2) * 4.0 + uTime * 0.15 + 4.0)
    );
  }
  return s.rgb;
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / res;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= res.x / res.y;

  float audio = sat(uAudioLevel);
  float bass = sat(uBassLevel);
  float proximity = sat(uProximity);
  float camera = sat(uCameraLevel);
  float presence = max(proximity, camera);
  float energy = sat(audio * 0.42 + bass * 0.78);

  float spread = 0.76 + 0.36 * sat(uEffectParam1 * 0.55) + 0.18 * presence;
  float orbitSpeed = 0.38 + 0.88 * sat(uEffectParam2 * 0.55) + 0.46 * energy + 0.18 * camera;
  float ribbonDetail = 0.48 + 0.82 * sat(uEffectParam3 * 0.55) + 0.14 * proximity;
  float time = uTime * orbitSpeed;

  float sBase = clamp((p.y + 1.08) / 2.16, 0.0, 1.0);
  float verticalMask = smoothstep(0.025, 0.10, sBase) * (1.0 - smoothstep(0.94, 0.995, sBase));

  float spineX = 0.035 * sin(sBase * PI * 2.0 + time * 0.34)
    + 0.028 * sin(sBase * TAU * 4.8 - time * 0.21)
    + 0.020 * (camera - 0.5) * sin(sBase * PI * 2.4 + time * 0.16);

  float radius = 0.085 + columnEnvelope(sBase, spread * 0.72) * 0.62;
  float localX = (p.x - spineX) / max(radius, 1e-4);

  float sheetField = 0.0;
  const int SHEETS = 6;
  for (int i = 0; i < SHEETS; i++) {
    float fi = float(i);
    float seed = fi + 41.0;
    float phase = seed * 1.93;
    float orbit = 0.70 + hash11(seed * 4.3) * 1.1;
    float yWarp = strandYWarp(sBase, phase, time * 0.7, orbit) * 0.8;
    float s = clamp((p.y + yWarp + 1.08) / 2.16, 0.0, 1.0);
    float env = columnEnvelope(s, spread * (0.72 + 0.08 * hash11(seed * 1.7)));
    float x = env * (
      0.92 * sin(s * PI * (2.5 + orbit * 0.35) + phase + time * (0.22 + orbit * 0.16))
      + 0.28 * sin(s * TAU * 4.8 - phase * 1.2 - time * 0.20)
    );
    x += 0.038 * sin(time * 0.18 + phase * 1.6);

    float width = mix(0.042, 0.082, hash11(seed * 2.9)) * (0.72 + 0.24 * ribbonDetail);
    float sheet = exp(-pow(abs(p.x - x) / max(width, 1e-4), 2.35));
    float flutter = 0.5 + 0.5 * sin(s * TAU * (1.6 + hash11(seed * 3.8)) + phase * 0.6 - time * (0.15 + orbit * 0.08));
    float texture = 0.58 + 0.42 * noise2(vec2((p.x - x) * 7.0, s * 9.0 + seed + time * 0.08));
    float mask = smoothstep(0.03, 0.20, s) * (1.0 - smoothstep(0.88, 0.99, s));
    sheetField = max(sheetField, sheet * pow(flutter, 2.8) * texture * mask);
  }

  float strandField = 0.0;
  const int STRANDS = 18;
  for (int i = 0; i < STRANDS; i++) {
    float fi = float(i);
    float seed = fi + 1.0;
    float phase = seed * 1.618 + sin(seed * 2.17) * 0.8;
    float orbit = 0.58 + hash11(seed * 2.9) * 1.18;
    float detail = 0.38 + hash11(seed * 5.1) * 1.15;

    float yWarp = strandYWarp(sBase, phase, time, orbit);
    float s = clamp((p.y + yWarp + 1.08) / 2.16, 0.0, 1.0);
    float x = strandCurve(s, phase, time, spread * (0.68 + 0.10 * hash11(seed * 1.4)), orbit, detail);
    x += 0.022 * sin(time * 0.24 + phase * 1.7) * columnEnvelope(s, spread * 0.62);
    x += 0.016 * (camera - 0.5) * sin(s * PI * 2.0 + phase);

    float width = mix(0.0018, 0.0048, hash11(seed * 7.4)) * (0.88 + 0.42 * energy);
    float dist = p.x - x;
    float line = softLine(dist, width);
    float glow = softLine(dist, width * (3.8 + 1.3 * ribbonDetail));
    float twist = 0.5 + 0.5 * sin(
      dist * 155.0
      + s * TAU * (3.2 + detail * 1.8)
      + phase
      - time * (0.28 + orbit * 0.18)
    );
    float thread = pow(twist, 5.8);
    float mask = smoothstep(0.015, 0.09, s) * (1.0 - smoothstep(0.94, 0.995, s));
    float tail = 0.65 + 0.35 * sin(s * PI * (2.0 + detail * 0.35) + phase * 1.2 + time * 0.12);
    strandField = max(strandField, max(line * thread, glow * 0.18) * mask * tail);
  }

  float coreX = 0.024 * sin(p.y * 6.0 + time * 0.95) + 0.010 * sin(p.y * 14.0 - time * 0.7);
  float coreWidth = (0.006 + 0.014 * columnEnvelope(sBase, spread * 0.52)) * (0.92 + 0.12 * bass);
  float coreField = softLine(p.x - coreX, coreWidth) * verticalMask;

  float fillMask = sat(pow(sheetField, 1.18) * (0.96 + 0.12 * ribbonDetail));
  float wireMask = sat(strandField * (1.22 + 0.10 * ribbonDetail) + coreField * 0.12);
  float carrierMask = sat(max(fillMask, wireMask));
  carrierMask *= verticalMask;
  carrierMask = pow(carrierMask, 1.22);

  vec2 meshUv = vec2(localX * 0.5 + 0.5, sBase);
  float localBody = 1.0 - smoothstep(0.0, 1.0, abs(localX));
  meshUv.x += 0.060 * sin(sBase * TAU * (1.28 + ribbonDetail * 0.18) + time * 0.24) * localBody;
  meshUv.x += 0.020 * energy * sin(sBase * TAU * 3.2 + time * 0.58);
  meshUv.y += 0.016 * sin(localX * 4.2 + time * 0.18) * localBody;
  meshUv.y += 0.012 * (camera - 0.5) * cos(sBase * TAU * 2.0 + time * 0.22);

  float meshAspect = 0.22 + 0.05 * sat(spread * 0.5);
  vec3 media = sampleColumnMedia(meshUv, meshAspect);
  vec3 finalColor = media * carrierMask;
  float strength = sat(uEffectStrength);
  finalColor = mix(vec3(0.0), finalColor, strength);

  // Check media presence for alpha output
  vec4 artworkCheck = artex_sampleMain(uv);
  float mediaPresence = smoothstep(0.0, 0.05, artworkCheck.a);

  gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), max(artworkCheck.a, strength * (1.0 - mediaPresence)));
}
