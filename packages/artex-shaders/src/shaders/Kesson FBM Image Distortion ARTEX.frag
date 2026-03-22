precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform sampler2D uMainImage;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

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

float fbm4(vec2 p) {
  float value = 0.0;
  value += 0.5000 * noise2(p); p *= 2.0;
  value += 0.2500 * noise2(p); p *= 2.0;
  value += 0.1250 * noise2(p); p *= 2.0;
  value += 0.0625 * noise2(p);
  return value;
}

vec2 fbmField(vec2 p, float t) {
  float n1 = fbm4(p + vec2(0.0, 0.0) + t);
  float n2 = fbm4(p + vec2(5.2, 1.3) - t);
  return vec2(n1, n2);
}

void main() {
  vec2 resolution = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / resolution;

  float speed = 0.4 * max(0.05, uEffectParam1 * 2.0);
  float distortion = 0.25 * max(0.01, uEffectParam2 * 2.0);
  float scale = 2.5 * max(0.05, uEffectParam3 * 2.0);

  vec2 p = uv;
  p.x *= resolution.x / resolution.y;

  float t = uTime * speed;
  vec2 fieldA = fbmField(p * scale, t) * 2.0 - 1.0;
  vec2 distortedUv = uv + fieldA * distortion;
  vec2 fieldB = fbmField(distortedUv * scale * 1.35, t * 0.85) * 2.0 - 1.0;
  distortedUv += fieldB * distortion * 0.35;

  vec2 safeUv = clamp(distortedUv, vec2(0.001), vec2(0.999));
  vec4 base = texture2D(uMainImage, safeUv);
  vec3 color = base.rgb * max(0.0, uEffectStrength);
  gl_FragColor = vec4(color, base.a);
}
