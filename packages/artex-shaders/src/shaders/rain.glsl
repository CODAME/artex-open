// rain.glsl
// Cinematic rain with refraction, mist, and layered streaks.
precision mediump float;
uniform float iTime;
uniform vec3 iResolution;
uniform vec3 iChannelResolution[4];
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
uniform float uBassLevel;
uniform float uCameraLevel;

uniform vec2 uResolution;
uniform float uTime;
uniform float uAudioLevel;
uniform float uProximity;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;
uniform sampler2D uMainImage; // artwork / uMainImage

vec4 tex2D(sampler2D s, vec2 uv) { return texture2D(s, uv); }
vec4 tex2D(sampler2D s, vec3 uv) { return texture2D(s, uv.xy); }
vec4 tex2D(sampler2D s, vec4 uv) { return texture2D(s, uv.xy); }

const float RAIN_TIME_SCALE = 2.0;

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
  vec2 distortion = vec2(
    (nx - 0.5) * uFlowIntensity * 0.15,
    (ny - 0.5) * uFlowIntensity * 0.15
  );
  return uv + distortion;
}

vec4 artex_blendStates(vec2 uv) {
  if (uUseStateBlending != 1) {
    return tex2D(uMainImage, uv);
  }

  if (uStateCount <= 1) {
    return tex2D(uStateA, uv);
  } else if (uStateCount == 2) {
    vec4 stateA = tex2D(uStateA, uv);
    vec4 stateB = tex2D(uStateB, uv);
    return mix(stateA, stateB, uBlendFactor);
  } else if (uStateCount == 3) {
    if (uBlendFactor < 0.5) {
      float t = uBlendFactor * 2.0;
      vec4 stateA = tex2D(uStateA, uv);
      vec4 stateB = tex2D(uStateB, uv);
      return mix(stateA, stateB, t);
    } else {
      float t = (uBlendFactor - 0.5) * 2.0;
      vec4 stateB = tex2D(uStateB, uv);
      vec4 stateC = tex2D(uStateC, uv);
      return mix(stateB, stateC, t);
    }
  } else if (uStateCount >= 4) {
    float third = 1.0 / 3.0;
    float twoThirds = 2.0 / 3.0;
    if (uBlendFactor < third) {
      float t = uBlendFactor * 3.0;
      vec4 stateA = tex2D(uStateA, uv);
      vec4 stateB = tex2D(uStateB, uv);
      return mix(stateA, stateB, t);
    } else if (uBlendFactor < twoThirds) {
      float t = (uBlendFactor - third) * 3.0;
      vec4 stateB = tex2D(uStateB, uv);
      vec4 stateC = tex2D(uStateC, uv);
      return mix(stateB, stateC, t);
    } else {
      float t = (uBlendFactor - twoThirds) * 3.0;
      vec4 stateC = tex2D(uStateC, uv);
      vec4 stateD = tex2D(uStateD, uv);
      return mix(stateC, stateD, t);
    }
  }

  return tex2D(uMainImage, uv);
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
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float rainLayer(vec2 uv, float scale, float speed, float width, float slant) {
  vec2 p = uv;
  p.x += p.y * slant;
  p *= scale;
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float rnd = hash(cell);
  float column = step(rnd, 0.35);
  float x = abs(f.x - 0.5);
  float line = smoothstep(width, 0.0, x);
  float t = fract(f.y + (uTime * RAIN_TIME_SCALE) * speed + rnd);
  float head = smoothstep(0.0, 0.2, t) * smoothstep(1.0, 0.7, t);
  return column * line * head;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  vec3 base = artex_sampleMain( uv).rgb;

  float wind = 0.12 + 0.35 * uProximity;
  float density = clamp(uEffectParam1, 0.3, 2.0);
  float speedBoost = 0.7 + 0.6 * uEffectParam2;
  float intensity = (0.5 + uAudioLevel * 0.7) * uEffectStrength;

  float layer1 = rainLayer(uv, 18.0 * density, (0.9 + uProximity * 0.6) * speedBoost, 0.08, wind);
  float layer2 = rainLayer(uv, 32.0 * density, (1.5 + uProximity * 0.8) * speedBoost, 0.06, wind * 1.4);
  float layer3 = rainLayer(uv, 52.0 * density, (2.2 + uProximity * 1.0) * speedBoost, 0.045, wind * 1.8);
  float rain = clamp(layer1 + layer2 + layer3, 0.0, 1.0);

  // Raindrop refraction
  float droplet = noise(uv * 10.0 + (uTime * RAIN_TIME_SCALE) * 0.2)
    * noise(uv * 40.0 - (uTime * RAIN_TIME_SCALE) * 0.8);
  vec2 refractUV = uv + (droplet - 0.5) * (0.006 + 0.006 * uEffectParam3) * intensity;
  vec3 refracted = artex_sampleMain( refractUV).rgb;

  vec3 rainColor = vec3(0.6, 0.75, 0.9);
  vec3 col = mix(base, refracted, 0.35 * intensity);
  col = mix(col, col + rainColor * rain * intensity, rain * 0.8);

  // Misty lift in highlights
  float mist = smoothstep(0.2, 0.9, rain) * 0.15 * intensity;
  col += vec3(0.06, 0.08, 0.1) * mist;

  col = mix(base, col, uEffectStrength);
  gl_FragColor = vec4(col, 1.0);
}
