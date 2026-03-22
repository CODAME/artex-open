// Reactive Compute Splat Bloom ARTEX.glsl
// Floating translucent particle veil inspired by suspended liquid curl references.
precision mediump float;

uniform float iTime;
uniform vec3 iResolution;
uniform vec3 iChannelResolution[4];

uniform sampler2D uStateA;
uniform sampler2D uStateB;
uniform sampler2D uStateC;
uniform sampler2D uStateD;
uniform int uUseStateBlending;
uniform float uBlendFactor;
uniform int uStateCount;

uniform int uFlowEnabled;
uniform float uFlowIntensity;
uniform float uFlowSpeed;
uniform float uFlowScale;

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
uniform sampler2D uMainImage;

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

mat2 artex_rot(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}

float artex_fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += artex_noise(p) * amp;
    p = artex_rot(0.72) * p * 2.03 + vec2(7.3, 11.1);
    amp *= 0.52;
  }
  return sum;
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
    return texture2D(uMainImage, uv);
  }

  if (uStateCount <= 1) {
    return texture2D(uStateA, uv);
  } else if (uStateCount == 2) {
    return mix(texture2D(uStateA, uv), texture2D(uStateB, uv), uBlendFactor);
  } else if (uStateCount == 3) {
    if (uBlendFactor < 0.5) {
      return mix(texture2D(uStateA, uv), texture2D(uStateB, uv), uBlendFactor * 2.0);
    }
    return mix(texture2D(uStateB, uv), texture2D(uStateC, uv), (uBlendFactor - 0.5) * 2.0);
  }

  float third = 1.0 / 3.0;
  float twoThirds = 2.0 / 3.0;
  if (uBlendFactor < third) {
    return mix(texture2D(uStateA, uv), texture2D(uStateB, uv), uBlendFactor * 3.0);
  } else if (uBlendFactor < twoThirds) {
    return mix(texture2D(uStateB, uv), texture2D(uStateC, uv), (uBlendFactor - third) * 3.0);
  }
  return mix(texture2D(uStateC, uv), texture2D(uStateD, uv), (uBlendFactor - twoThirds) * 3.0);
}

vec4 artex_sampleMain(vec2 uv) {
  vec2 flowUv = artex_applyFlow(uv);
  return artex_blendStates(clamp(flowUv, vec2(0.0), vec2(1.0)));
}

vec2 artex_curlField(vec2 p, float t) {
  vec2 shift = vec2(0.0, t * 0.08);
  float eps = 0.045;
  float nx = artex_fbm(p + vec2(eps, 0.0) + shift) - artex_fbm(p - vec2(eps, 0.0) + shift);
  float ny = artex_fbm(p + vec2(0.0, eps) + shift) - artex_fbm(p - vec2(0.0, eps) + shift);
  return vec2(ny, -nx) / (2.0 * eps);
}

vec3 backgroundGradient(vec2 uv, vec2 p) {
  vec3 skyA = vec3(0.16, 0.72, 0.98);
  vec3 skyB = vec3(0.46, 0.63, 0.98);
  vec3 blush = vec3(1.0, 0.75, 0.92);
  vec3 bg = mix(skyA, skyB, smoothstep(-0.95, 0.95, p.y * 0.85 + 0.2));
  bg = mix(bg, blush, smoothstep(0.08, 1.18, uv.x + (1.0 - uv.y) * 0.48) * 0.44);
  bg += vec3(0.05, 0.12, 0.24) * smoothstep(1.35, 0.22, length(p + vec2(0.78, 0.42)));
  return bg;
}

vec3 renderVeil(vec2 uv, vec2 p, vec3 source, float loud, float beat, float presence) {
  float t = uTime * (0.18 + uEffectParam2 * 0.68 + beat * 0.45 + uCameraLevel * 0.32);
  vec2 q = p;
  q *= artex_rot(sin(t * 0.23) * 0.28);
  q += vec2(sin(t * 0.19) * 0.06, cos(t * 0.16) * 0.05);

  vec2 curl = artex_curlField(q * 1.1 + vec2(0.0, -t * 0.12), t);
  q += curl * (0.16 + presence * 0.12 + uEffectParam2 * 0.08);
  q.y += sin(q.x * 3.4 + t * 0.65) * 0.05;
  q.x += cos(q.y * 2.8 - t * 0.42) * 0.04;

  float spread = 0.88 + uEffectParam1 * 0.26 - presence * 0.08;
  float radial = length(vec2(q.x / spread, q.y / (1.06 + uEffectParam1 * 0.08)));
  float shellNoise = artex_fbm(q * 1.85 + curl * 1.2 + vec2(t * 0.07, -t * 0.05));
  float body = smoothstep(0.98 + shellNoise * 0.2, 0.16 + shellNoise * 0.06, radial);

  float membraneField = abs(artex_fbm(q * 3.7 + curl * 2.0 + vec2(t * 0.11, -t * 0.08)) - 0.5);
  float veilField = abs(artex_fbm(q * 6.3 - curl * 2.8 + vec2(-t * 0.16, t * 0.13)) - 0.5);
  float membranes = pow(smoothstep(0.19, 0.01, membraneField), 1.7) * body;
  float veils = pow(smoothstep(0.15, 0.0, veilField), 2.1) * body;

  float density = 48.0 + uEffectParam1 * 52.0 + loud * 24.0 + presence * 18.0;
  float dustNoise = artex_noise((q + curl * 0.08) * density + vec2(t * 1.15, -t * 0.9));
  float dust = smoothstep(0.78 - uEffectParam3 * 0.12 - presence * 0.04, 1.0, dustNoise) * (0.25 + body * 0.75);

  float sparkleNoise = artex_noise((q - curl * 0.14) * (density * 1.9) + vec2(-t * 1.9, t * 1.4));
  float sparkles = smoothstep(0.94 - uEffectParam3 * 0.16 - beat * 0.06, 1.0, sparkleNoise) * (0.15 + body * 0.85);

  float halo = smoothstep(1.18, 0.26, radial) * (0.32 + membranes * 0.42 + veils * 0.24);
  float sourceLuma = dot(source, vec3(0.299, 0.587, 0.114));
  vec3 cool = vec3(0.77, 0.9, 1.0);
  vec3 warm = vec3(1.0, 0.96, 0.98);
  vec3 filamentTint = mix(cool, warm, 0.52 + 0.32 * artex_fbm(q * 1.3 - t * 0.03));
  vec3 sourceTint = mix(vec3(1.0), clamp(source * 1.25 + vec3(0.08), 0.0, 1.4), 0.12 + sourceLuma * 0.08);

  vec3 veil = vec3(0.0);
  veil += filamentTint * body * (0.08 + 0.12 * presence);
  veil += vec3(1.0) * membranes * (0.9 + uEffectParam3 * 0.28);
  veil += mix(filamentTint, vec3(1.0), 0.55) * veils * 0.42;
  veil += sourceTint * dust * 0.22;
  veil += vec3(1.0) * sparkles * (0.5 + uEffectParam3 * 0.5 + beat * 0.25);
  veil += cool * halo * 0.18;

  return veil;
}

vec3 tonemap(vec3 c) {
  c = 1.0 - exp(-c);
  c = pow(c, vec3(0.92, 0.94, 0.98));
  return clamp(c, 0.0, 1.0);
}

void main() {
  vec2 resolution = max(uResolution.xy, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / resolution;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= resolution.x / resolution.y;

  float loud = smoothstep(0.04, 0.9, uAudioLevel);
  float beat = smoothstep(0.08, 0.95, uBassLevel);
  float presence = smoothstep(0.02, 0.95, max(uProximity, uCameraLevel * 0.85));

  vec2 sourceOffset = vec2(
    artex_fbm(p * 1.25 + vec2(uTime * 0.04, -uTime * 0.03)) - 0.5,
    artex_fbm(p * 1.25 + vec2(4.3 - uTime * 0.03, 2.1 + uTime * 0.04)) - 0.5
  ) * (0.01 + presence * 0.012);
  vec3 source = artex_sampleMain(clamp(uv + sourceOffset, vec2(0.0), vec2(1.0))).rgb;

  vec3 bg = backgroundGradient(uv, p);
  bg = mix(bg, source * 0.55 + bg * 0.45, 0.08);

  vec3 veil = renderVeil(uv, p, source, loud, beat, presence);
  vec3 col = bg + veil * (0.95 + uEffectParam3 * 0.7);
  col += vec3(0.0, 0.03, 0.08) * loud * smoothstep(1.25, 0.22, length(p + vec2(0.0, 0.08)));

  col = tonemap(col);
  col = mix(bg, col, clamp(uEffectStrength, 0.0, 2.0));

  gl_FragColor = vec4(col, 1.0);
}
