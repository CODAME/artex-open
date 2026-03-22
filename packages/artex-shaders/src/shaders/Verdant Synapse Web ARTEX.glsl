// Verdant Synapse Web ARTEX.glsl
// Inspired by glowing green membrane strands and synaptic nodes.
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

float sat(float x) { return clamp(x, 0.0, 1.0); }

float hash11(float p) {
  return fract(sin(p * 93.17 + 17.13) * 43758.5453123);
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
  color = mix(color, ink, alpha * 0.24);
  color += ink * alpha * 0.42;
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / res;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= res.x / res.y;

  float time = uTime * (0.40 + 0.75 * sat(uEffectParam2 * 0.6));
  float density = 0.70 + 0.80 * sat(uEffectParam1 * 0.5);
  float sparkleBoost = sat(uEffectParam3 * 0.5);

  vec3 bg = mix(vec3(0.002, 0.014, 0.004), vec3(0.006, 0.030, 0.010), sat(0.50 - 0.30 * p.y));
  vec3 color = bg;

  vec2 nucleus = vec2(0.0, -0.02 + 0.04 * sin(time * 0.3));
  vec3 webCol = vec3(0.36, 0.82, 0.30);
  vec3 hotCol = vec3(0.82, 1.0, 0.70);

  float web = 0.0;
  float nodes = 0.0;

  const int BRANCHES = 84;
  for (int i = 0; i < BRANCHES; i++) {
    float fi = float(i);
    float s1 = hash11(fi * 1.73 + 1.0);
    float s2 = hash11(fi * 3.91 + 2.0);
    float s3 = hash11(fi * 5.27 + 3.0);

    vec2 a = nucleus + vec2((s1 - 0.5) * 0.60, (s2 - 0.5) * 0.12);

    float angle;
    if (s3 < 0.62) {
      angle = mix(0.15, 2.95, s1);
    } else {
      angle = mix(-2.8, -0.2, s2);
    }

    float len = mix(0.30, 1.60, pow(s2, 0.65)) * density;
    vec2 dir = vec2(cos(angle), sin(angle));
    vec2 b = a + dir * len;
    b.x += 0.20 * sin(time * (0.20 + s1 * 0.45) + fi * 0.40);
    b.y += 0.08 * cos(time * (0.18 + s2 * 0.38) + fi * 0.31);

    float d = sdSegment(p, a, b);
    float width = mix(0.0010, 0.0048, s1);
    web += exp(-d * (240.0 / max(width * 1000.0, 1.0))) * (0.30 + 0.70 * (1.0 - s3));

    float n = exp(-length(p - a) * (70.0 + 80.0 * s2));
    nodes += n * (0.35 + 0.65 * s1);
  }

  const int CLUMPS = 10;
  for (int i = 0; i < CLUMPS; i++) {
    float fi = float(i);
    float sx = hash11(fi * 4.11 + 9.0);
    float sy = hash11(fi * 6.71 + 2.0);
    vec2 c = vec2(mix(-1.1, 1.1, sx), mix(0.20, 0.95, sy));
    vec2 q = p - c;
    q.x *= mix(0.7, 1.4, hash11(fi * 2.3 + 5.0));
    q.y *= mix(1.0, 1.8, hash11(fi * 1.5 + 7.0));
    float blob = exp(-dot(q, q) * 3.6);
    float grain = noise2((p + vec2(fi * 0.03, 0.0)) * (8.0 + 6.0 * density) + time * 0.08);
    web += blob * (0.25 + 0.40 * sat(grain * 1.2));
  }

  float bottomArc = -0.42 + 0.10 * sin(p.x * 1.4 + time * 0.25);
  float lowerMass = smoothstep(bottomArc + 0.10, bottomArc - 0.06, p.y);
  float lowerNoise = noise2(p * (7.0 + 6.0 * density) + vec2(0.0, time * 0.12));
  web += lowerMass * (0.25 + 0.30 * lowerNoise);

  vec2 gp = (p + vec2(0.0, 0.15)) * (36.0 + 30.0 * density);
  vec2 gid = floor(gp);
  vec2 gv = fract(gp) - 0.5;
  vec2 rnd = hash21(dot(gid, vec2(1.0, 57.0)));
  float alive = step(0.80 - 0.18 * sparkleBoost, rnd.x);
  vec2 ofs = (rnd - 0.5) * 0.40;
  float spark = exp(-pow(length(gv - ofs) * 10.0, 2.0)) * alive;

  float webSoft = sat(web * 0.22);
  float nodeSoft = sat(nodes * 0.85);

  vec3 baseWeb = webCol * webSoft;
  vec3 nodeGlow = hotCol * nodeSoft * (0.5 + 0.4 * sparkleBoost);
  vec3 sparkle = hotCol * spark * (0.6 + 0.9 * sparkleBoost) * (0.3 + 0.8 * webSoft);

  addGlow(color, baseWeb, webSoft);
  addGlow(color, nodeGlow, nodeSoft);
  addGlow(color, sparkle, spark);

  color = 1.0 - exp(-color * (1.20 + 0.35 * sparkleBoost));
  color = pow(color, vec3(0.95));
  color = mix(bg, color, sat(uEffectStrength));

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
