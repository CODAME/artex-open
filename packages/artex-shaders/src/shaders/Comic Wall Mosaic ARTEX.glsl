// Comic Wall Mosaic ARTEX.glsl
// Inspired by a pinned, hand-drawn comic board on a textured wall.
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

float sat(float x) { return clamp(x, 0.0, 1.0); }

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec2 hash22(vec2 p) {
  vec2 q = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(q) * 43758.5453123);
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

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise2(p);
    p = p * 2.03 + vec2(11.7, 7.3);
    a *= 0.5;
  }
  return v;
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h);
}

float lineMask(float d, float w) {
  return smoothstep(w * 2.5, w, d);
}

void addInk(inout vec3 color, vec3 ink, float a) {
  float alpha = sat(a);
  color = mix(color, ink, alpha * 0.36);
  color += ink * alpha * 0.22;
}

float ellipseOutline(vec2 p, vec2 center, vec2 r, float thickness) {
  vec2 q = (p - center) / max(r, vec2(1e-4));
  float d = abs(length(q) - 1.0);
  return smoothstep(thickness * 1.8, thickness, d);
}

float roundedBox(vec2 p, vec2 halfSize, float radius) {
  vec2 d = abs(p) - halfSize + radius;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius;
}

vec3 accentPalette(float t) {
  vec3 c0 = vec3(0.95, 0.60, 0.15); // orange marker
  vec3 c1 = vec3(0.17, 0.37, 0.78); // blue marker
  vec3 c2 = vec3(0.80, 0.18, 0.24); // red marker
  vec3 c3 = vec3(0.10, 0.62, 0.58); // teal marker
  float q = fract(t * 4.0);
  if (t < 0.25) return mix(c0, c1, q);
  if (t < 0.50) return mix(c1, c2, q);
  if (t < 0.75) return mix(c2, c3, q);
  return mix(c3, c0, q);
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / res;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= res.x / res.y;

  float time = uTime * (0.25 + 0.45 * sat(uEffectParam2 * 0.6));
  float panelDensity = 0.75 + 0.55 * sat(uEffectParam1 * 0.5);
  float accentAmount = sat(uEffectParam3 * 0.5);

  // Dark textured wall background.
  float wallN = fbm(p * 10.0);
  vec3 wall = vec3(0.20, 0.22, 0.20) + vec3(0.09, 0.10, 0.08) * wallN;
  float pits = smoothstep(0.65, 1.0, fbm(p * 35.0 + 13.1));
  wall -= pits * 0.08;

  vec3 color = wall;

  // Board placement and slight lens-like bending.
  vec2 center = vec2(0.0, -0.02);
  vec2 boardSize = vec2(0.68, 0.50);
  vec2 bp = p - center;
  float lens = 1.0 + 0.03 * (bp.x * bp.x + bp.y * bp.y);
  vec2 bq = bp * lens;

  float boardDist = roundedBox(bq, boardSize, 0.004);
  float boardMask = smoothstep(0.01, -0.004, boardDist);

  // Board shadow.
  float shadow = smoothstep(0.06, 0.0, roundedBox(bq + vec2(0.015, -0.014), boardSize, 0.01));
  color = mix(color * 0.78, color, 1.0 - 0.28 * shadow);

  // Board paper base + subtle paper grain.
  vec2 rp = (bq / boardSize) * 0.5 + 0.5;
  float paperNoise = fbm(rp * vec2(120.0, 95.0));
  vec3 paper = vec3(0.95, 0.94, 0.90) + 0.05 * (paperNoise - 0.5);

  // Pin hints.
  vec2 pinA = rp - vec2(0.01, 0.99);
  vec2 pinB = rp - vec2(0.99, 0.99);
  vec2 pinC = rp - vec2(0.01, 0.01);
  vec2 pinD = rp - vec2(0.99, 0.01);
  float pins = exp(-dot(pinA, pinA) * 3000.0) + exp(-dot(pinB, pinB) * 3000.0)
    + exp(-dot(pinC, pinC) * 3000.0) + exp(-dot(pinD, pinD) * 3000.0);
  paper = mix(paper, vec3(0.65, 0.56, 0.34), sat(pins * 0.9));

  // Distorted panel field.
  vec2 gridScale = vec2(14.0, 10.0) * panelDensity;
  vec2 warp = vec2(
    fbm(rp * 7.0 + vec2(0.0, time * 0.1)),
    fbm(rp * 7.0 + vec2(4.0, -time * 0.1))
  ) - 0.5;
  vec2 gp = rp * gridScale + warp * (0.45 + 0.55 * accentAmount);
  vec2 cid = floor(gp);
  vec2 f = fract(gp) - 0.5;

  float cellSeed = hash12(cid);
  float edge = min(0.5 - abs(f.x), 0.5 - abs(f.y));
  float panelInk = smoothstep(0.03, 0.0, edge);

  // Doodle primitives inside each cell.
  vec3 doodle = vec3(0.0);
  float inkA = 0.0;

  // Main black sketch lines.
  vec2 s0 = hash22(cid + 1.1) - 0.5;
  vec2 s1 = hash22(cid + 2.7) - 0.5;
  vec2 s2 = hash22(cid + 4.3) - 0.5;
  vec2 s3 = hash22(cid + 8.9) - 0.5;
  inkA += lineMask(sdSegment(f, s0 * 0.9, s1 * 0.9), 0.024);
  inkA += lineMask(sdSegment(f, s1 * 0.75, s2 * 0.75), 0.018);
  inkA += lineMask(sdSegment(f, s2 * 0.85, s3 * 0.85), 0.016);

  // Speech bubble outlines in some cells.
  float bubbleGate = step(0.56, cellSeed);
  float bubble = ellipseOutline(f, (hash22(cid + 3.2) - 0.5) * 0.25, vec2(0.30, 0.20), 0.035);
  bubble += ellipseOutline(f, vec2(0.18, -0.16), vec2(0.08, 0.06), 0.030) * 0.8;
  inkA += bubble * bubbleGate * 0.9;

  // Marker patches.
  vec2 accentCenter = (hash22(cid + 14.0) - 0.5) * 0.45;
  float accentBlob = smoothstep(0.34, 0.10, length((f - accentCenter) / vec2(0.85, 0.50)));
  float accentGate = step(0.42, hash12(cid + 5.0));
  vec3 accentCol = accentPalette(hash12(cid + 21.0));
  doodle += accentCol * accentBlob * accentGate * (0.40 + 0.45 * accentAmount);

  // Tiny text-like horizontal strokes.
  float textRows = step(0.53, hash12(cid + 9.0));
  vec2 tf = f;
  tf.y += 0.08 * sin((tf.x + cellSeed) * 18.0);
  float row = pow(abs(sin((tf.y + 0.5) * 46.0)), 20.0);
  float colCut = step(0.35, fract((tf.x + cellSeed * 0.3) * 9.0));
  float textInk = row * colCut * smoothstep(0.48, 0.05, abs(tf.x));
  inkA += textInk * textRows * 0.55;

  // Bottom strip of dense mini-panels.
  float bottomStrip = smoothstep(0.18, 0.0, rp.y);
  vec2 mini = rp * vec2(34.0, 8.0);
  vec2 mf = fract(mini) - 0.5;
  float miniEdge = min(0.5 - abs(mf.x), 0.5 - abs(mf.y));
  float miniInk = smoothstep(0.025, 0.0, miniEdge);
  float miniDots = smoothstep(0.20, 0.02, length(mf - (hash22(floor(mini) + 30.0) - 0.5) * 0.6));
  vec3 miniCol = accentPalette(hash12(floor(mini) + 70.0)) * miniDots * 0.38;
  doodle += miniCol * bottomStrip;
  inkA += miniInk * bottomStrip * 0.75;

  // Blue tape-like strips near top third.
  float tapeBand = smoothstep(0.72, 0.70, rp.y) * (1.0 - smoothstep(0.86, 0.88, rp.y));
  float tapeBreaks = step(0.20, fract(rp.x * 12.0 + 0.3 * sin(rp.x * 30.0)));
  vec3 tape = vec3(0.13, 0.31, 0.72) * tapeBand * tapeBreaks * 0.85;
  doodle += tape;

  vec3 inkBlack = vec3(0.10, 0.10, 0.11);
  vec3 boardCol = paper + doodle;
  boardCol = mix(boardCol, inkBlack, sat(panelInk * 0.85 + inkA * 0.65));

  // Border line and wear.
  float border = smoothstep(0.010, 0.0, abs(boardDist + 0.0015));
  boardCol = mix(boardCol, vec3(0.15), border);
  boardCol *= 0.98 + 0.05 * fbm(rp * 24.0);

  color = mix(color, boardCol, boardMask);

  // Vignette.
  float vig = smoothstep(1.35, 0.25, length(p * vec2(0.9, 1.0)));
  color *= 0.80 + 0.20 * vig;

  color = 1.0 - exp(-color * 1.10);
  color = pow(color, vec3(0.97));
  color = mix(wall, color, sat(uEffectStrength));

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
