// Anemone Dustfield ARTEX.glsl
// Reference: forside_art_...3830519763634928470
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

float sat(float x) { return clamp(x, 0.0, 1.0); }

float hash11(float p) {
  return fract(sin(p * 97.31 + 23.17) * 43758.5453123);
}

vec2 hash22(vec2 p) {
  vec2 q = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(q) * 43758.5453123);
}

void addInk(inout vec3 color, vec3 ink, float a) {
  float alpha = sat(a);
  color = mix(color, ink, alpha * 0.25);
  color += ink * alpha * 0.38;
}

float stem(vec2 p, float x, float y0, float y1, float bend, float seed, float time) {
  float span = max(y1 - y0, 0.001);
  float t = sat((p.y - y0) / span);
  float sx = mix(x, x + bend, t) + bend * 0.55 * sin(t * 3.14159 + seed + time * 0.3);
  float w = mix(0.003, 0.010, t);
  float d = abs(p.x - sx);
  float a = smoothstep(w * 3.2, w, d);
  a *= smoothstep(y0 - 0.03, y0 + 0.02, p.y);
  a *= 1.0 - smoothstep(y1 + 0.01, y1 + 0.06, p.y);
  return a;
}

vec4 cupBloom(vec2 p, vec2 c, vec2 r, float seed, float time) {
  vec2 q = p - c;
  q += vec2(0.02 * sin(time * 0.45 + seed), 0.02 * cos(time * 0.35 + seed * 1.7));

  vec2 e = q / max(r, vec2(0.001));
  float d = length(e);
  float bowl = smoothstep(1.02, 0.88, d);

  float petal = 0.94 + 0.12 * sin(6.0 * atan(e.y, e.x) + seed * 2.1 + time * 0.16);
  float edge = 1.0 - smoothstep(petal, petal + 0.08, d);

  float ribs = pow(abs(sin(atan(e.y, e.x) * 28.0 + seed * 5.0 - time * 0.1)), 15.0);
  float veil = exp(-pow((d - 0.72) / 0.25, 2.0));

  float alpha = edge * (0.10 + 0.25 * ribs) + bowl * 0.08 + veil * 0.12;
  vec3 col = mix(vec3(0.50, 0.60, 0.98), vec3(0.86, 0.90, 1.0), sat(1.0 - d));
  return vec4(col, sat(alpha));
}

float pollenSpark(vec2 p, vec2 c, vec2 scale, float seed, float density) {
  vec2 q = (p - c) / max(scale, vec2(0.001));
  float mask = 1.0 - smoothstep(0.0, 1.0, length(q));

  vec2 grid = q * mix(22.0, 42.0, density);
  vec2 id = floor(grid);
  vec2 gv = fract(grid) - 0.5;

  vec2 h = hash22(id + seed);
  float alive = step(0.74, h.x);
  vec2 offset = (h - 0.5) * 0.36;
  float d = length(gv - offset);
  float spark = exp(-pow(d * 10.0, 2.0));

  return mask * alive * spark;
}

vec4 filamentCylinder(vec2 p, vec2 c, vec2 size, float seed, float time) {
  vec2 q = p - c;
  q.y += size.y * 0.45;
  float y = q.y / max(size.y, 0.001);

  float w = mix(0.18, 0.42, sat(y));
  float xNorm = abs(q.x / max(size.x, 0.001));
  float side = 1.0 - smoothstep(w - 0.03, w + 0.06, xNorm);
  float body = smoothstep(-0.15, 0.02, y) * (1.0 - smoothstep(1.08, 1.24, y));

  float filaments = pow(abs(sin((q.x / max(size.x * w, 0.002)) * 58.0 + y * 3.0 + seed * 6.0 + time * 0.2)), 20.0);
  float alpha = body * side * (0.12 + 0.52 * filaments);

  vec3 col = mix(vec3(0.36, 0.45, 0.92), vec3(0.78, 0.84, 1.0), sat(y * 0.7 + 0.2));
  col += vec3(1.0, 0.62, 0.64) * filaments * smoothstep(0.92, 1.06, y) * 0.45;
  return vec4(col, sat(alpha));
}

vec4 leafGhost(vec2 p, vec2 c, vec2 r, float seed, float time) {
  vec2 q = p - c;
  float a = seed * 0.4 + time * 0.08;
  float ca = cos(a), sa = sin(a);
  q = mat2(ca, -sa, sa, ca) * q;
  vec2 e = q / max(r, vec2(0.001));
  float d = length(e);
  float body = smoothstep(1.04, 0.92, d);
  float mesh = pow(abs(sin(e.x * 20.0 + seed * 4.0) * sin(e.y * 16.0 - seed * 2.0)), 0.5);
  float alpha = body * (0.02 + 0.11 * mesh);
  vec3 col = mix(vec3(0.20, 0.30, 0.50), vec3(0.45, 0.60, 0.86), 0.5);
  return vec4(col, sat(alpha));
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / res;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= res.x / res.y;

  float time = uTime * (0.44 + 0.72 * sat(uEffectParam2 * 0.6));
  float bloomScale = 0.80 + 0.42 * sat(uEffectParam1 * 0.6);
  float sparkWarmth = sat(uEffectParam3 * 0.5);

  vec3 bg = mix(vec3(0.001, 0.006, 0.035), vec3(0.008, 0.020, 0.080), 0.34 + 0.45 * sat((p.y + 1.0) * 0.5));
  vec3 color = bg;

  const int LEAVES = 14;
  for (int i = 0; i < LEAVES; i++) {
    float seed = float(i) + 12.0;
    vec2 c = vec2(mix(-0.8, 0.9, hash11(seed * 2.2)), mix(-0.95, 0.2, hash11(seed * 3.8)));
    vec2 r = vec2(mix(0.10, 0.28, hash11(seed * 5.3)), mix(0.08, 0.22, hash11(seed * 6.9)));
    vec4 l = leafGhost(p, c, r, seed, time);
    addInk(color, l.rgb, l.a);
  }

  const int STEMS = 9;
  for (int i = 0; i < STEMS; i++) {
    float seed = float(i) + 58.0;
    float x = mix(-0.95, 0.8, hash11(seed * 2.1));
    float y0 = -1.08 - 0.08 * hash11(seed * 2.6);
    float y1 = mix(-0.12, 0.86, hash11(seed * 4.0)) * bloomScale;
    float bend = mix(-0.12, 0.12, hash11(seed * 6.1));
    float a = stem(p, x, y0, y1, bend, seed, time);
    vec3 stemCol = mix(vec3(0.30, 0.39, 0.66), vec3(0.64, 0.77, 1.0), hash11(seed * 8.2));
    addInk(color, stemCol, a * 0.62);
  }

  const int BLOOMS = 6;
  for (int i = 0; i < BLOOMS; i++) {
    float seed = float(i) + 94.0;
    vec2 c = vec2(mix(-0.72, 0.62, hash11(seed * 1.9)), mix(-0.66, 0.30, hash11(seed * 3.5)));
    vec2 r = vec2(mix(0.16, 0.34, hash11(seed * 4.9)), mix(0.10, 0.19, hash11(seed * 7.2)));
    vec4 b = cupBloom(p, c, r * bloomScale, seed, time);
    addInk(color, b.rgb, b.a * 1.05);

    float pollen = pollenSpark(p, c + vec2(0.0, 0.02 * r.y), r * vec2(0.7, 0.55), seed, sat(0.4 + 0.5 * bloomScale));
    vec3 sparkCol = mix(vec3(0.86, 0.76, 0.66), vec3(1.0, 0.68, 0.52), sparkWarmth);
    addInk(color, sparkCol, pollen * 0.95);
  }

  vec4 colA = filamentCylinder(p, vec2(-0.10, 0.58), vec2(0.24, 0.30), 2.0, time);
  vec4 colB = filamentCylinder(p, vec2(0.30, 0.78), vec2(0.18, 0.24), 5.0, time + 0.4);
  addInk(color, colA.rgb, colA.a);
  addInk(color, colB.rgb, colB.a * 0.9);

  color = 1.0 - exp(-color * (1.14 + 0.34 * sparkWarmth));
  color = pow(color, vec3(0.95));

  vec3 finalColor = mix(bg, color, sat(uEffectStrength));
  gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}
