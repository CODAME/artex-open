precision mediump float;
const float uMood = 0.5;
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
  if (containedUv.x < 0.0 || containedUv.x > 1.0 || containedUv.y < 0.0 || containedUv.y > 1.0) {
    return vec4(0.0);
  }
  return tex2D(textureRef, containedUv);
}

vec4 artex_sampleMainTexture(vec2 uv) {
  vec2 containedUv = artex_mapContainedUv(uv, uMainImageResolution, uMediaTransformMainEnabled);
  if (containedUv.x < 0.0 || containedUv.x > 1.0 || containedUv.y < 0.0 || containedUv.y > 1.0) {
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
  } else {
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
}

vec4 artex_sampleMain(vec2 uv) {
  vec2 flowUv = artex_applyFlow(uv);
  return artex_blendStates(flowUv);
}

vec4 artex_sampleMain(float uv) { return artex_sampleMain(vec2(uv)); }
vec4 artex_sampleMain(vec3 uv) { return artex_sampleMain(uv.xy); }
vec4 artex_sampleMain(vec4 uv) { return artex_sampleMain(uv.xy); }

// --- ModBod Normal Iridescent ---
// Inspired by modbod3d-gifgen: MeshNormalMaterial mapped onto a spinning
// surface. With media: derives fake normals from the image luminance gradient
// (Sobel), then spins the normal space over time. Standalone: spinning sphere
// with iridescent normal-mapped colors.
// uEffectParam1: spin speed
// uEffectParam2: normal sensitivity (edge sharpness)
// uEffectParam3: wobble amount

float lum(vec4 c) {
  return dot(c.rgb, vec3(0.299, 0.587, 0.114));
}

vec3 rotateY(vec3 n, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(c * n.x - s * n.z, n.y, s * n.x + c * n.z);
}

vec3 rotateX(vec3 n, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(n.x, c * n.y - s * n.z, s * n.y + c * n.z);
}

void main() {
  vec2 resolution = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / resolution;

  float strength    = max(0.0, uEffectStrength);
  float spinSpeed   = 0.3 + uEffectParam1 * 2.0;
  float normalScale = 1.0 + uEffectParam2 * 6.0;
  float wobble      = uEffectParam3;

  // --- With-media path: Sobel fake normals on the source image ---
  vec4 base = artex_sampleMain(uv);
  float mediaPresence = smoothstep(0.0, 0.05, base.a);

  float px = 1.5 / resolution.x;
  float py = 1.5 / resolution.y;

  float tl = lum(artex_sampleMain(uv + vec2(-px,  py)));
  float tc = lum(artex_sampleMain(uv + vec2(0.0,  py)));
  float tr = lum(artex_sampleMain(uv + vec2( px,  py)));
  float ml = lum(artex_sampleMain(uv + vec2(-px, 0.0)));
  float mr = lum(artex_sampleMain(uv + vec2( px, 0.0)));
  float bl = lum(artex_sampleMain(uv + vec2(-px, -py)));
  float bc = lum(artex_sampleMain(uv + vec2(0.0, -py)));
  float br = lum(artex_sampleMain(uv + vec2( px, -py)));

  float gx = ((tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl)) * normalScale;
  float gy = ((tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br)) * normalScale;

  float gnLen = length(vec2(gx, gy));
  float nz = sqrt(max(0.0, 1.0 - min(1.0, gnLen * gnLen)));
  vec3 imgNormal = normalize(vec3(gx, gy, nz + 0.001));

  float spinAngle   = uTime * spinSpeed;
  float wobbleAngle = wobble * 0.5 * sin(uTime * 0.8);

  vec3 rotImgNormal = rotateX(rotateY(imgNormal, spinAngle), wobbleAngle);
  vec3 normalColor  = rotImgNormal * 0.5 + 0.5;

  vec3 withMedia = mix(base.rgb, normalColor, strength);

  // --- Standalone path: spinning sphere with normal-map colors ---
  vec2 screenPos = (uv - 0.5) * 2.0;
  screenPos.x *= resolution.x / resolution.y;

  float sphereR  = 0.72;
  float r2       = dot(screenPos, screenPos);
  float onSphere = step(r2, sphereR * sphereR);

  float snz = sqrt(max(0.0, sphereR * sphereR - r2)) / max(sphereR, 0.0001);
  vec3 sphereNormal = normalize(vec3(screenPos / max(sphereR, 0.0001), snz));
  vec3 rotSphereNormal = rotateX(rotateY(sphereNormal, spinAngle), wobbleAngle);
  vec3 standaloneColor = (rotSphereNormal * 0.5 + 0.5) * onSphere * strength;

  // Soft edge vignette on the standalone sphere
  float edgeSoft = 1.0 - smoothstep(sphereR * 0.85, sphereR, sqrt(r2));
  standaloneColor *= mix(0.75, 1.0, edgeSoft);

  vec3 color = mix(standaloneColor, withMedia, mediaPresence);
  float alpha = max(base.a * strength, onSphere * strength * (1.0 - mediaPresence));

  gl_FragColor = vec4(color, alpha);
}
