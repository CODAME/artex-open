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
uniform float uEffectStrength;

uniform float uTime;
uniform vec2 uResolution;
uniform sampler2D uMainImage;
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

// Video-derived seed shader
// Source: florigenix_ai_1770672914_3829003697423363078_64438645865.mp4
// MD5: 2c9366bbd4b446c76c5c7adae5d7d3ab

const vec3 VIDEO_BASE = vec3(0.511187, 0.526239, 0.475238);
const vec3 VIDEO_ACCENT = vec3(0.769024, 0.808895, 0.685592);
const vec3 VIDEO_SHADOW = vec3(0.272377, 0.196954, 0.174677);
const float VIDEO_PULSE = 2.006667;
const float VIDEO_SWIRL = 2.095882;
const float VIDEO_GRAIN = 0.538824;
const float VIDEO_TILT = -0.222745;
const float VIDEO_STROBE = 1.319608;
const float VIDEO_DRIFT = 0.274707;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = hash(i + vec2(0.0, 0.0));
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

mat2 rotate2d(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}

void main() {
  vec2 resolution = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / resolution;
  vec2 p = uv - 0.5;
  p.x *= resolution.x / resolution.y;

  float amount = clamp(uEffectParam1 * 0.5, 0.0, 1.2);
  float speed = clamp(uEffectParam2 * 0.5, 0.0, 1.2);
  float polish = clamp(uEffectParam3 * 0.5, 0.0, 1.2);

  float t = uTime * (0.65 + VIDEO_PULSE * (0.35 + speed * 0.65));
  float pulse = 0.5 + 0.5 * sin(t * 1.3 + VIDEO_STROBE * 2.6);

  vec2 q = p * rotate2d(VIDEO_TILT * 0.65 + sin(t * 0.16) * 0.1);
  float n = noise(q * (2.4 + VIDEO_SWIRL * (0.8 + amount * 0.9)) + t * (0.14 + VIDEO_DRIFT * 0.14));

  vec2 warp = vec2(
    sin((q.y + n * 0.6) * (6.0 + VIDEO_SWIRL * 2.8) + t * (0.85 + VIDEO_DRIFT)),
    cos((q.x - n * 0.5) * (5.2 + VIDEO_SWIRL * 3.0) - t * (0.78 + VIDEO_DRIFT * 0.9))
  ) * (0.004 + amount * 0.018);

  vec2 sampleUv = clamp(uv + warp, 0.0, 1.0);

  // Media presence detection
  vec4 artwork = artex_sampleMain(uv);
  float mediaPresence = smoothstep(0.0, 0.05, artwork.a);
  float strength = uEffectStrength;

  vec4 base = artex_sampleMain( sampleUv);

  vec2 px = vec2(1.0 / resolution.x, 1.0 / resolution.y);
  vec3 gradX = artex_sampleMain( clamp(sampleUv + vec2(px.x, 0.0), 0.0, 1.0)).rgb
    - artex_sampleMain( clamp(sampleUv - vec2(px.x, 0.0), 0.0, 1.0)).rgb;
  vec3 gradY = artex_sampleMain( clamp(sampleUv + vec2(0.0, px.y), 0.0, 1.0)).rgb
    - artex_sampleMain( clamp(sampleUv - vec2(0.0, px.y), 0.0, 1.0)).rgb;
  float edge = clamp(length(gradX) + length(gradY), 0.0, 1.0);

  float luma = dot(base.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 graded = mix(VIDEO_SHADOW, VIDEO_BASE, smoothstep(0.04, 0.88, luma + n * 0.08));
  graded = mix(graded, VIDEO_ACCENT, smoothstep(0.46, 1.08, luma + pulse * 0.34 + n * 0.16));

  float chromaBeat = sin(t * (1.5 + VIDEO_STROBE) + p.x * 6.2 - p.y * 4.1);
  vec3 withMedia = mix(base.rgb, graded, clamp(0.22 + amount * 0.45 + VIDEO_GRAIN * 0.08, 0.0, 0.92));
  withMedia += VIDEO_ACCENT * edge * (0.08 + polish * 0.55);
  withMedia += vec3(0.02, -0.01, 0.03) * chromaBeat * (0.25 + polish * 0.45);

  // Standalone: procedural visual from distortion field
  float warpLen = length(warp) * 50.0;
  vec3 standalone = mix(VIDEO_SHADOW, VIDEO_BASE, smoothstep(0.0, 0.7, n));
  standalone = mix(standalone, VIDEO_ACCENT, smoothstep(0.4, 1.0, n + pulse * 0.3));
  standalone += VIDEO_ACCENT * warpLen * 0.5;
  standalone += vec3(0.02, -0.01, 0.03) * chromaBeat * (0.25 + polish * 0.45);

  vec3 color = mix(standalone, withMedia, mediaPresence);

  float vignette = smoothstep(1.22, 0.15, length(p * (1.0 + 0.12 * sin(t * 0.22))));
  color *= mix(0.62, 1.0, vignette);

  float scan = 0.95 + 0.05 * sin((uv.y + n * 0.03) * resolution.y * 0.55 + t * (8.0 + VIDEO_STROBE * 4.0));
  color *= scan;

  float grain = (hash(gl_FragCoord.xy + t * 21.0) - 0.5) * (0.008 + VIDEO_GRAIN * (0.012 + polish * 0.02));
  color += grain;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), max(artwork.a, strength * (1.0 - mediaPresence)));
}
