// Ghost Flora Column ARTEX.glsl
// Reference: forside_art_...3830519455873633713
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

float sat(float x) { return clamp(x, 0.0, 1.0); }

float hash11(float p) {
  return fract(sin(p * 91.73 + 17.31) * 43758.5453123);
}

vec2 hash21(float p) {
  return fract(sin(vec2(p * 127.1 + 311.7, p * 269.5 + 183.3)) * 43758.5453123);
}

void addInk(inout vec3 color, vec3 ink, float a) {
  float alpha = sat(a);
  color = mix(color, ink, alpha * 0.22);
  color += ink * alpha * 0.34;
}

float stemAlpha(vec2 p, float x, float y0, float y1, float bend, float seed) {
  float span = max(y1 - y0, 0.001);
  float t = sat((p.y - y0) / span);
  float curve = bend * sin(t * 3.14159 + seed * 3.2) * (0.4 + 0.6 * t);
  float sx = mix(x, x + bend, t) + curve;
  float w = mix(0.002, 0.008, t);
  float d = abs(p.x - sx);
  float line = smoothstep(w * 3.0, w, d);
  float mask = smoothstep(y0 - 0.02, y0 + 0.03, p.y) * (1.0 - smoothstep(y1 + 0.01, y1 + 0.06, p.y));
  return line * mask;
}

vec4 wireDisk(vec2 p, vec2 c, vec2 r, float seed, float time) {
  vec2 q = p - c;
  q.x += 0.03 * r.x * sin(time * 0.35 + seed * 2.7 + q.y * 10.0);
  vec2 e = q / max(r, vec2(0.001));
  float d = length(e);
  float body = smoothstep(1.02, 0.90, d);
  float meshA = pow(abs(sin(e.x * 44.0 + seed * 5.0 + time * 0.18)), 12.0);
  float meshB = pow(abs(sin(e.y * 32.0 - seed * 4.0 - time * 0.15)), 12.0);
  float rim = exp(-pow((d - 1.0) / 0.055, 2.0));
  float alpha = body * (0.05 + 0.22 * mix(meshA, meshB, 0.45)) + rim * 0.08;
  vec3 col = mix(vec3(0.50, 0.61, 0.98), vec3(0.88, 0.84, 1.0), hash11(seed * 8.1));
  return vec4(col, sat(alpha));
}

vec4 fuzzyBloom(vec2 p, vec2 c, float r, float seed, float time) {
  vec2 q = p - c;
  float rr = length(q);
  float a = atan(q.y, q.x);
  float core = exp(-pow(rr / max(r, 0.001), 2.2) * 2.0);
  float shell = exp(-pow((rr - r) / (r * 0.19 + 0.002), 2.0));
  float spikes = pow(abs(sin(a * 52.0 + time * 0.45 + seed * 7.0)), 24.0);
  float alpha = core * 0.22 + shell * (0.10 + 0.80 * spikes);
  vec3 col = mix(vec3(0.95, 0.88, 1.0), vec3(0.56, 0.58, 1.0), sat(rr / max(r, 0.001)));
  col += vec3(1.0, 0.55, 0.62) * shell * spikes * 0.32;
  return vec4(col, sat(alpha));
}

vec4 coralColumn(vec2 p, vec2 c, vec2 size, float seed, float time) {
  vec2 q = p - c;
  q.y += size.y * 0.45;
  float y = q.y / max(size.y, 0.001);
  float halfW = mix(0.10, 0.44, sat(y));
  float xNorm = abs(q.x / max(size.x, 0.001));
  float side = 1.0 - smoothstep(halfW - 0.03, halfW + 0.06, xNorm);
  float bodyMask = smoothstep(-0.2, 0.03, y) * (1.0 - smoothstep(1.12, 1.32, y));

  float phase = (q.x / max(size.x * halfW, 0.002)) * 56.0 + y * 4.5 + seed * 8.0 + time * 0.18;
  float filaments = pow(abs(sin(phase)), 19.0);
  float tips = smoothstep(0.94, 1.10, y) * pow(abs(sin(q.x * 180.0 + seed * 19.0)), 18.0);

  float alpha = bodyMask * side * (0.20 + 0.68 * filaments) + side * tips * 0.35;
  vec3 col = mix(vec3(0.86, 0.29, 0.41), vec3(1.0, 0.63, 0.70), sat(y * 0.75 + 0.2));
  return vec4(col, sat(alpha));
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / res;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= res.x / res.y;

  float time = uTime * (0.45 + 0.75 * sat(uEffectParam2 * 0.55));
  float density = 0.75 + 0.40 * sat(uEffectParam1 * 0.6);
  float accent = sat(uEffectParam3 * 0.5);

  vec3 bg = mix(vec3(0.002, 0.006, 0.035), vec3(0.008, 0.020, 0.078), 0.35 + 0.5 * sat((p.y + 1.0) * 0.5));
  vec3 color = bg;

  const int DISKS = 18;
  for (int i = 0; i < DISKS; i++) {
    float seed = float(i) + 21.0;
    float x = mix(-1.3, 1.2, hash11(seed * 2.1));
    float y = mix(-0.7, 0.8, hash11(seed * 3.7));
    vec2 c = vec2(x + 0.08 * sin(time * 0.22 + seed), y);
    vec2 r = vec2(mix(0.14, 0.48, hash11(seed * 4.3)), mix(0.06, 0.24, hash11(seed * 5.9)));
    vec4 d = wireDisk(p, c, r, seed, time);
    addInk(color, d.rgb, d.a * (0.3 + 0.5 * hash11(seed * 1.8)));
  }

  const int STEMS = 15;
  for (int i = 0; i < STEMS; i++) {
    float seed = float(i) + 77.0;
    float x = mix(-1.25, 1.1, hash11(seed * 1.9));
    float y0 = -1.1 - 0.08 * hash11(seed * 4.1);
    float y1 = mix(-0.05, 0.88, hash11(seed * 3.2)) * density;
    float bend = mix(-0.16, 0.16, hash11(seed * 6.4));
    float a = stemAlpha(p, x, y0, y1, bend, seed + time * 0.3);
    vec3 stemCol = mix(vec3(0.25, 0.34, 0.60), vec3(0.65, 0.78, 1.0), hash11(seed * 7.1));
    addInk(color, stemCol, a * 0.48);
  }

  vec4 bloom = fuzzyBloom(p, vec2(-0.44, 0.25), 0.16, 1.0, time);
  addInk(color, bloom.rgb, bloom.a * 1.1);

  vec4 column = coralColumn(p, vec2(0.58, 0.02), vec2(0.18, 0.56), 2.0, time);
  addInk(color, column.rgb, column.a * (0.85 + 0.5 * accent));

  const int BUDS = 6;
  for (int i = 0; i < BUDS; i++) {
    float seed = float(i) + 140.0;
    vec2 c = vec2(mix(-0.95, 0.45, hash11(seed * 2.7)), mix(-0.55, 0.78, hash11(seed * 5.2)));
    vec2 q = (p - c) / vec2(0.08, 0.055);
    float d = length(q);
    float a = 1.0 - smoothstep(0.82, 1.0, d);
    vec3 budCol = mix(vec3(0.76, 0.72, 1.0), vec3(1.0, 0.62, 0.52), hash11(seed * 8.8));
    addInk(color, budCol, a * 0.22 * density);
  }

  color = 1.0 - exp(-color * (1.15 + accent * 0.4));
  color = pow(color, vec3(0.95));

  vec3 finalColor = mix(bg, color, sat(uEffectStrength));
  gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}
