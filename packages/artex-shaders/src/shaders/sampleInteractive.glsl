// sampleInteractive.glsl
// Premium interactive shader with glow, chroma, and audio-reactive ripples.
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
uniform float uCameraLevel;

uniform vec2 uResolution;
uniform float uTime;
uniform float uAudioLevel;
uniform float uBassLevel;
uniform float uProximity;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;
uniform sampler2D uMainImage; // artwork / uMainImage

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

vec3 grade(vec3 c) {
  c = pow(c, vec3(0.95));
  c = c * 1.05 + vec3(0.01, 0.0, -0.01);
  return clamp(c, 0.0, 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= uResolution.x / uResolution.y;

  float beat = smoothstep(0.05, 0.9, uBassLevel);
  float pulse = (0.02 + 0.08 * beat) * (0.6 + 0.6 * uEffectParam1);
  float r = length(p);
  float ripple = sin(r * 14.0 - uTime * 4.0 + noise(p * 4.0 + uTime * 0.3) * 2.0) * 0.5 + 0.5;
  vec2 offset = p * ripple * pulse;

  vec3 base = artex_sampleMain( uv + offset).rgb;

  // Subtle chromatic aberration
  vec2 chroma = p * (0.001 + 0.003 * beat) * (0.4 + 0.6 * uEffectParam2);
  vec3 col;
  col.r = artex_sampleMain( uv + offset + chroma).r;
  col.g = base.g;
  col.b = artex_sampleMain( uv + offset - chroma).b;

  // Neon glow
  float glow = smoothstep(1.1, 0.0, r);
  vec3 neon = vec3(0.2, 0.65, 1.0);
  col += neon * glow * (0.25 + 0.75 * uAudioLevel) * (0.5 + 0.8 * uEffectParam3);

  // Vignette and proximity warmth
  float vignette = smoothstep(1.1, 0.4, r);
  vec3 warmth = vec3(0.08, 0.03, -0.02) * (0.3 + uProximity);
  col = col * vignette + warmth;

  col = grade(col);
  col = mix(base, col, uEffectStrength);

  gl_FragColor = vec4(col, 1.0);
}
