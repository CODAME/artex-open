// Lavender Poppy Veils ARTEX.glsl
// Reference: forside_art_...3830519519761291017
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

float sat(float x) { return clamp(x, 0.0, 1.0); }

float hash11(float p) {
  return fract(sin(p * 93.17 + 15.13) * 43758.5453123);
}

void addInk(inout vec3 color, vec3 ink, float a) {
  float alpha = sat(a);
  color = mix(color, ink, alpha * 0.24);
  color += ink * alpha * 0.35;
}

float stem(vec2 p, float x, float y0, float y1, float sway, float seed, float time) {
  float span = max(y1 - y0, 0.001);
  float t = sat((p.y - y0) / span);
  float cx = mix(x, x + sway, t) + sway * 0.7 * sin(t * 3.14159 + seed + time * 0.3);
  float w = mix(0.002, 0.006, t);
  float d = abs(p.x - cx);
  float a = smoothstep(w * 3.0, w, d);
  a *= smoothstep(y0 - 0.02, y0 + 0.03, p.y);
  a *= 1.0 - smoothstep(y1 + 0.01, y1 + 0.05, p.y);
  return a;
}

vec4 fanBloom(vec2 p, vec2 c, vec2 size, float seed, float time) {
  vec2 q = p - c;
  q += vec2(0.02 * sin(time * 0.4 + seed), 0.015 * cos(time * 0.35 + seed * 1.7));
  float ang = atan(q.y / max(size.y, 0.001), q.x / max(size.x, 0.001));
  float rr = length(q / max(size, vec2(0.001)));

  float lobe = 1.0 + 0.18 * sin(4.0 * ang + seed * 2.5 + time * 0.2) + 0.08 * sin(9.0 * ang + seed * 1.7);
  float edge = 1.0 - smoothstep(lobe, lobe + 0.10, rr);

  float ribs = pow(abs(sin(ang * 42.0 + seed * 5.0 - time * 0.12)), 15.0);
  float bowl = exp(-pow((rr - 0.45) / 0.32, 2.0));
  float alpha = edge * (0.08 + 0.42 * ribs + 0.14 * bowl);

  vec3 base = mix(vec3(0.52, 0.56, 0.95), vec3(0.93, 0.86, 1.0), sat(1.0 - rr));
  vec3 glow = vec3(0.98, 0.90, 1.0) * exp(-pow(rr / 0.32, 2.0));
  return vec4(base + glow * 0.35, sat(alpha));
}

vec4 orangeBud(vec2 p, vec2 c, vec2 r, float seed, float time) {
  vec2 q = p - c;
  q.x += 0.02 * sin(time * 0.45 + seed * 2.1);
  q.y += 0.02 * cos(time * 0.37 + seed * 1.2);
  vec2 e = q / max(r, vec2(0.001));
  float d = length(e);
  float body = 1.0 - smoothstep(0.84, 1.0, d);
  float mesh = pow(abs(sin(e.x * 42.0 + seed * 6.0) * sin(e.y * 26.0 - seed * 5.0)), 0.55);
  float alpha = body * (0.18 + 0.22 * mesh);
  vec3 col = mix(vec3(0.86, 0.45, 0.37), vec3(1.0, 0.66, 0.53), sat(1.0 - d));
  return vec4(col, sat(alpha));
}

vec4 ghostShape(vec2 p, vec2 c, vec2 r, float seed, float time) {
  vec2 q = p - c;
  q.x += 0.05 * r.x * sin(time * 0.22 + seed);
  vec2 e = q / max(r, vec2(0.001));
  float d = length(e);
  float body = smoothstep(1.02, 0.93, d);
  float lines = pow(abs(sin(e.x * 28.0 + seed * 3.0 + time * 0.08)), 12.0);
  float alpha = body * (0.03 + 0.10 * lines);
  vec3 col = mix(vec3(0.20, 0.28, 0.52), vec3(0.45, 0.56, 0.86), 0.6);
  return vec4(col, sat(alpha));
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / res;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= res.x / res.y;

  float time = uTime * (0.40 + 0.70 * sat(uEffectParam2 * 0.6));
  float spread = 0.80 + 0.45 * sat(uEffectParam1 * 0.5);
  float warmth = sat(uEffectParam3 * 0.5);

  vec3 bg = mix(vec3(0.002, 0.007, 0.045), vec3(0.010, 0.024, 0.090), 0.3 + 0.5 * sat((p.y + 1.0) * 0.5));
  vec3 color = bg;

  const int GHOSTS = 12;
  for (int i = 0; i < GHOSTS; i++) {
    float seed = float(i) + 17.0;
    vec2 c = vec2(mix(-1.2, 1.2, hash11(seed * 2.2)), mix(-0.9, 0.9, hash11(seed * 3.9)));
    vec2 r = vec2(mix(0.12, 0.34, hash11(seed * 5.7)), mix(0.18, 0.55, hash11(seed * 7.3)));
    vec4 g = ghostShape(p, c, r, seed, time);
    addInk(color, g.rgb, g.a * 0.9);
  }

  const int STEMS = 11;
  for (int i = 0; i < STEMS; i++) {
    float seed = float(i) + 83.0;
    float x = mix(-1.1, 1.05, hash11(seed * 1.9));
    float y0 = -1.08 - 0.08 * hash11(seed * 2.3);
    float y1 = mix(-0.05, 0.95, hash11(seed * 4.4)) * spread;
    float sway = mix(-0.18, 0.18, hash11(seed * 6.1));
    float a = stem(p, x, y0, y1, sway, seed, time);
    vec3 stemCol = mix(vec3(0.30, 0.39, 0.68), vec3(0.68, 0.78, 1.0), hash11(seed * 8.0));
    addInk(color, stemCol, a * 0.55);
  }

  vec4 bloomA = fanBloom(p, vec2(-0.08, 0.30), vec2(0.40, 0.33), 2.0, time);
  vec4 bloomB = fanBloom(p, vec2(0.00, -0.22), vec2(0.44, 0.30), 6.0, time + 0.35);
  addInk(color, bloomA.rgb, bloomA.a * 1.25);
  addInk(color, bloomB.rgb, bloomB.a * 1.15);

  const int BUDS = 5;
  for (int i = 0; i < BUDS; i++) {
    float seed = float(i) + 133.0;
    vec2 c = vec2(mix(0.18, 1.02, hash11(seed * 2.9)), mix(-0.28, 0.55, hash11(seed * 4.1)));
    vec2 r = vec2(mix(0.09, 0.14, hash11(seed * 7.1)), mix(0.10, 0.16, hash11(seed * 8.3)));
    vec4 bud = orangeBud(p, c, r, seed, time);
    addInk(color, bud.rgb, bud.a * (0.85 + 0.45 * warmth));
  }

  color = 1.0 - exp(-color * (1.10 + warmth * 0.35));
  color = pow(color, vec3(0.95));

  vec3 finalColor = mix(bg, color, sat(uEffectStrength));
  gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}
