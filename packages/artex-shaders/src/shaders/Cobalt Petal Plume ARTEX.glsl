// Cobalt Petal Plume ARTEX.glsl
// Inspired by a luminous blue floral plume with particulate spray.
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

float sat(float x) { return clamp(x, 0.0, 1.0); }

float hash11(float p) {
  return fract(sin(p * 91.13 + 33.37) * 43758.5453123);
}

vec2 hash21(float p) {
  return fract(sin(vec2(p * 127.1 + 311.7, p * 269.5 + 183.3)) * 43758.5453123);
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

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h);
}

void addGlow(inout vec3 color, vec3 ink, float a) {
  float alpha = sat(a);
  color = mix(color, ink, alpha * 0.25);
  color += ink * alpha * 0.45;
}

vec4 petalBurst(vec2 p, vec2 c, float scale, float seed, float time) {
  vec2 q = p - c;
  float rr = length(q) / max(scale, 0.001);
  float ang = atan(q.y, q.x);

  float petals = 0.76 + 0.22 * sin(6.0 * ang + seed * 2.3 + time * 0.15)
    + 0.08 * sin(12.0 * ang - seed * 1.6);
  float edge = 1.0 - smoothstep(petals, petals + 0.10, rr);

  float veins = pow(abs(sin(ang * 34.0 + rr * 14.0 + seed * 5.0)), 14.0);
  float core = exp(-pow(rr / 0.32, 2.0));

  float alpha = edge * (0.08 + 0.45 * veins) + core * 0.24;
  vec3 col = mix(vec3(0.22, 0.49, 0.85), vec3(0.78, 0.92, 1.0), sat(1.0 - rr));
  return vec4(col, sat(alpha));
}

float sparkleField(vec2 p, vec2 anchor, float seed, float scale, float threshold) {
  vec2 gp = (p - anchor) * scale;
  vec2 gid = floor(gp);
  vec2 gv = fract(gp) - 0.5;

  vec2 rnd = hash21(dot(gid, vec2(1.0, 57.0)) + seed);
  float alive = step(threshold, rnd.x);
  vec2 ofs = (rnd - 0.5) * 0.42;
  float d = length(gv - ofs);
  float spark = exp(-pow(d * 10.0, 2.0)) * alive;
  return spark;
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / res;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= res.x / res.y;

  float time = uTime * (0.42 + 0.70 * sat(uEffectParam2 * 0.6));
  float bloomScale = 0.75 + 0.65 * sat(uEffectParam1 * 0.5);
  float sparkleBoost = sat(uEffectParam3 * 0.5);

  vec3 bg = mix(vec3(0.002, 0.010, 0.030), vec3(0.006, 0.020, 0.058), sat(0.52 - 0.28 * p.y));
  vec3 color = bg;

  vec2 a0 = vec2(-1.05, -0.20);
  vec2 b0 = vec2(0.35, 0.93);
  vec2 a1 = vec2(-0.95, -0.95);
  vec2 b1 = vec2(0.78, -0.10);

  float d0 = sdSegment(p, a0, b0);
  float d1 = sdSegment(p, a1, b1);

  float stem0 = exp(-d0 * 120.0);
  float stem1 = exp(-d1 * 140.0);

  vec3 stemCol = vec3(0.22, 0.54, 0.96);
  addGlow(color, stemCol, stem0 * 0.45 + stem1 * 0.38);

  const int BLOOMS = 10;
  for (int i = 0; i < BLOOMS; i++) {
    float fi = float(i);
    float t = (fi + 1.0) / float(BLOOMS + 1);

    vec2 cMain = mix(a0, b0, t);
    cMain += vec2(
      0.10 * sin(time * 0.22 + fi * 0.7),
      0.05 * cos(time * 0.28 + fi * 0.5)
    );

    float s = mix(0.14, 0.34, hash11(fi * 2.3 + 3.0)) * bloomScale;
    vec4 bloom = petalBurst(p, cMain, s, fi + 1.0, time);
    addGlow(color, bloom.rgb, bloom.a * (0.65 + 0.35 * hash11(fi * 5.1 + 4.0)));

    if (hash11(fi * 4.3 + 9.0) > 0.58) {
      vec2 cSide = mix(a1, b1, t);
      cSide += (hash21(fi * 7.0) - 0.5) * vec2(0.20, 0.12);
      float s2 = s * mix(0.55, 0.85, hash11(fi * 8.3));
      vec4 bloom2 = petalBurst(p, cSide, s2, fi + 7.0, time + 0.3);
      addGlow(color, bloom2.rgb, bloom2.a * 0.55);
    }
  }

  float sprayA = sparkleField(p, mix(a0, b0, 0.50), 11.0, 58.0 + 40.0 * bloomScale, 0.83 - 0.15 * sparkleBoost);
  float sprayB = sparkleField(p, mix(a0, b0, 0.25), 29.0, 54.0 + 32.0 * bloomScale, 0.86 - 0.15 * sparkleBoost);
  float sprayC = sparkleField(p, mix(a1, b1, 0.60), 47.0, 64.0 + 36.0 * bloomScale, 0.88 - 0.14 * sparkleBoost);

  float sprayMask = sat(stem0 * 0.9 + stem1 * 0.8 + noise2(p * 4.0 + time * 0.2) * 0.2);
  float spray = (sprayA + sprayB + sprayC) * sprayMask;

  vec3 sparkCol = vec3(0.78, 0.92, 1.0);
  addGlow(color, sparkCol, spray * (0.7 + 1.0 * sparkleBoost));

  color = 1.0 - exp(-color * (1.18 + 0.42 * sparkleBoost));
  color = pow(color, vec3(0.94));
  color = mix(bg, color, sat(uEffectStrength));

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
