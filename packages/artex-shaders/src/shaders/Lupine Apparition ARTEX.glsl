// Lupine Apparition ARTEX.glsl
// Reference: forside_art_...3830519681275592239
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

float sat(float x) { return clamp(x, 0.0, 1.0); }

float hash11(float p) {
  return fract(sin(p * 107.13 + 19.37) * 43758.5453123);
}

vec2 hash21(float p) {
  return fract(sin(vec2(p * 127.1 + 311.7, p * 269.5 + 183.3)) * 43758.5453123);
}

void addInk(inout vec3 color, vec3 ink, float a) {
  float alpha = sat(a);
  color = mix(color, ink, alpha * 0.26);
  color += ink * alpha * 0.36;
}

float stem(vec2 p, float x, float y0, float y1, float bend, float seed, float time) {
  float span = max(y1 - y0, 0.001);
  float t = sat((p.y - y0) / span);
  float cx = mix(x, x + bend, t) + bend * sin(t * 3.14159 + seed + time * 0.25) * 0.65;
  float w = mix(0.003, 0.010, t);
  float d = abs(p.x - cx);
  float a = smoothstep(w * 3.0, w, d);
  a *= smoothstep(y0 - 0.03, y0 + 0.03, p.y);
  a *= 1.0 - smoothstep(y1 + 0.01, y1 + 0.06, p.y);
  return a;
}

vec4 ghostPetal(vec2 p, vec2 c, vec2 r, float seed, float time) {
  vec2 q = p - c;
  q += (hash21(seed) - 0.5) * 0.05;
  float a = time * 0.12 + seed;
  float ca = cos(a), sa = sin(a);
  q = mat2(ca, -sa, sa, ca) * q;
  vec2 e = q / max(r, vec2(0.001));
  float d = length(e);
  float body = smoothstep(1.02, 0.90, d);
  float mesh = pow(abs(sin(e.x * 24.0 + seed * 5.0 + time * 0.1) * sin(e.y * 16.0 - seed * 3.0)), 0.55);
  float alpha = body * (0.03 + 0.16 * mesh);
  vec3 col = mix(vec3(0.30, 0.40, 0.66), vec3(0.72, 0.82, 1.0), 0.6);
  return vec4(col, sat(alpha));
}

vec4 lupineFloret(vec2 p, vec2 c, vec2 r, float seed, float time) {
  vec2 q = p - c;
  q.x += 0.01 * sin(time * 0.6 + seed * 2.0);
  vec2 e = q / max(r, vec2(0.001));
  float d = length(e);
  float body = 1.0 - smoothstep(0.82, 1.0, d);
  float band = pow(abs(sin(e.x * 10.0 + e.y * 6.0 + seed * 3.0)), 3.0);
  float alpha = body * (0.22 + 0.24 * band);
  vec3 col = mix(vec3(0.68, 0.69, 0.98), vec3(0.92, 0.84, 1.0), sat(1.0 - d));
  return vec4(col, sat(alpha));
}

vec4 redSpire(vec2 p, vec2 c, vec2 size, float seed, float time) {
  vec2 q = p - c;
  q.y += size.y * 0.5;
  float y = q.y / max(size.y, 0.001);
  float width = mix(0.14, 0.48, sat(y));
  float xNorm = abs(q.x / max(size.x, 0.001));
  float side = 1.0 - smoothstep(width - 0.03, width + 0.06, xNorm);
  float bodyMask = smoothstep(-0.18, 0.05, y) * (1.0 - smoothstep(1.10, 1.30, y));

  float net = pow(abs(sin(q.x * 65.0 + q.y * 12.0 + seed * 4.0 + time * 0.12) * sin(q.y * 40.0 - seed * 3.0)), 0.48);
  float alpha = bodyMask * side * (0.10 + 0.35 * net);
  vec3 col = mix(vec3(0.74, 0.25, 0.35), vec3(0.97, 0.54, 0.57), sat(y * 0.7 + 0.2));
  return vec4(col, sat(alpha));
}

float star(vec2 p, vec2 c, float r) {
  vec2 q = p - c;
  float d = length(q);
  float core = exp(-pow(d / max(r, 0.001), 2.0));
  float rays = (abs(q.x) + abs(q.y));
  float cross = exp(-pow(rays / max(r * 2.0, 0.001), 2.0));
  return sat(core + cross * 0.7);
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / res;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= res.x / res.y;

  float time = uTime * (0.42 + 0.75 * sat(uEffectParam2 * 0.6));
  float heightScale = 0.80 + 0.45 * sat(uEffectParam1 * 0.6);
  float warmth = sat(uEffectParam3 * 0.5);

  vec3 bg = mix(vec3(0.002, 0.007, 0.045), vec3(0.008, 0.022, 0.088), 0.35 + 0.45 * sat((p.y + 1.0) * 0.5));
  vec3 color = bg;

  const int GHOST = 18;
  for (int i = 0; i < GHOST; i++) {
    float seed = float(i) + 10.0;
    vec2 c = vec2(mix(-1.0, 1.0, hash11(seed * 2.1)), mix(-0.9, 0.5, hash11(seed * 3.7)));
    vec2 r = vec2(mix(0.10, 0.36, hash11(seed * 5.2)), mix(0.06, 0.22, hash11(seed * 6.4)));
    vec4 g = ghostPetal(p, c, r, seed, time);
    addInk(color, g.rgb, g.a);
  }

  const int STEMS = 10;
  for (int i = 0; i < STEMS; i++) {
    float seed = float(i) + 44.0;
    float x = mix(-0.9, 0.9, hash11(seed * 1.9));
    float y0 = -1.08 - 0.08 * hash11(seed * 2.7);
    float y1 = mix(-0.05, 0.85, hash11(seed * 4.2)) * heightScale;
    float bend = mix(-0.14, 0.14, hash11(seed * 5.8));
    float a = stem(p, x, y0, y1, bend, seed, time);
    vec3 stemCol = mix(vec3(0.28, 0.37, 0.62), vec3(0.62, 0.74, 1.0), hash11(seed * 8.6));
    addInk(color, stemCol, a * 0.60);
  }

  vec2 base = vec2(0.0, -0.98);
  float spikeHeight = 1.62 * heightScale;
  const int FLORETS = 34;
  for (int i = 0; i < FLORETS; i++) {
    float fi = float(i);
    float t = fi / float(FLORETS - 1);
    float y = base.y + t * spikeHeight;
    float width = mix(0.03, 0.20, sin(t * 3.14159));
    float side = mix(-1.0, 1.0, step(0.5, hash11(fi * 2.3 + 1.0)));
    float x = base.x + side * width * (0.55 + 0.35 * hash11(fi * 4.8)) + 0.03 * sin(time * 0.35 + fi * 0.6);
    vec2 c = vec2(x, y);
    vec2 r = vec2(mix(0.028, 0.07, hash11(fi * 1.7)), mix(0.020, 0.055, hash11(fi * 3.9)));
    vec4 f = lupineFloret(p, c, r, fi + 1.0, time);
    addInk(color, f.rgb, f.a * (0.9 + 0.5 * t));
  }

  vec2 coreStemC = vec2(0.0, -0.18);
  float coreStem = stem(p, coreStemC.x, -1.1, 0.95 * heightScale, 0.02, 3.0, time);
  addInk(color, vec3(0.72, 0.84, 1.0), coreStem * 0.8);

  vec4 red = redSpire(p, vec2(-0.46, -0.03), vec2(0.24, 0.50), 2.0, time);
  addInk(color, red.rgb, red.a * (0.85 + 0.45 * warmth));

  float s1 = star(p, vec2(-0.72, 0.14), 0.03);
  float s2 = star(p, vec2(0.70, 0.12), 0.025);
  addInk(color, vec3(0.72, 0.86, 1.0), s1 * 0.45 + s2 * 0.42);

  color = 1.0 - exp(-color * (1.15 + 0.35 * warmth));
  color = pow(color, vec3(0.94));

  vec3 finalColor = mix(bg, color, sat(uEffectStrength));
  gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}
