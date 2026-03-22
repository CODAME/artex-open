// Mactuitui Filament Column ARTEX.glsl
// Reference: mactuitui_1772758310_3846497825966335158_3065232260.mp4
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uAudioLevel;
uniform float uBassLevel;
uniform float uProximity;
uniform float uCameraLevel;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

float sat(float x) { return clamp(x, 0.0, 1.0); }

float hash11(float p) {
  return fract(sin(p * 127.1 + 311.7) * 43758.5453123);
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

vec3 palette(float t) {
  return 0.58 + 0.42 * cos(TAU * (vec3(0.10, 0.36, 0.68) + t));
}

float softLine(float dist, float width) {
  float w = max(width, 1e-4);
  return exp(-pow(abs(dist) / w, 1.38));
}

float columnEnvelope(float s, float spread) {
  float bell = pow(max(0.0, sin(s * PI)), 0.72);
  return mix(0.12, 0.56, bell) * spread;
}

float strandYWarp(float s, float phase, float time, float orbit) {
  return 0.040 * sin(s * TAU * 1.9 + phase * 0.8 - time * (0.20 + orbit * 0.24))
    + 0.018 * sin(s * TAU * 5.2 - phase * 1.4 + time * (0.28 + orbit * 0.35));
}

float strandCurve(float s, float phase, float time, float spread, float orbit, float detail) {
  float env = columnEnvelope(s, spread);
  float lobe = sin(s * (4.2 + detail * 2.0) * PI + phase + time * (0.55 + orbit * 0.42));
  float curl = sin(s * (12.0 + detail * 5.0) + phase * 1.8 - time * (0.80 + orbit * 0.72));
  float knot = sin(s * (22.0 + detail * 8.5) + phase * 2.7 + time * (0.22 + orbit * 0.45));
  return env * (0.64 * lobe + 0.24 * curl + 0.12 * knot);
}

void addGlow(inout vec3 color, vec3 ink, float alpha) {
  float a = sat(alpha);
  color += ink * a;
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / res;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= res.x / res.y;

  float audio = sat(uAudioLevel);
  float bass = sat(uBassLevel);
  float proximity = sat(uProximity);
  float camera = sat(uCameraLevel);
  float presence = max(proximity, camera);
  float energy = sat(audio * 0.45 + bass * 0.75);
  float drive = max(presence, energy);

  float spread = 0.74 + 0.34 * sat(uEffectParam1 * 0.55) + 0.16 * presence;
  float orbitSpeed = 0.42 + 0.96 * sat(uEffectParam2 * 0.55) + 0.52 * energy + 0.20 * camera;
  float veil = 0.44 + 0.92 * sat(uEffectParam3 * 0.55) + 0.30 * proximity;
  float time = uTime * orbitSpeed;
  float bassPulse = 1.0 + 0.15 * bass * sin(uTime * 4.0);

  vec3 color = vec3(0.0);

  float columnMask = exp(-pow(length(vec2(p.x * 1.8, p.y * 0.55 + 0.02 * sin(time * 0.25))) * 0.82, 2.0));
  color += vec3(0.0025, 0.0018, 0.0045) * columnMask;

  float baseS = clamp((p.y + 1.08) / 2.16, 0.0, 1.0);

  const int SHEETS = 6;
  for (int i = 0; i < SHEETS; i++) {
    float fi = float(i);
    float seed = fi + 41.0;
    float phase = seed * 1.93;
    float orbit = 0.70 + hash11(seed * 4.3) * 1.1;
    float yWarp = strandYWarp(baseS, phase, time * 0.7, orbit) * 0.8;
    float s = clamp((p.y + yWarp + 1.08) / 2.16, 0.0, 1.0);
    float env = columnEnvelope(s, spread * (1.08 + 0.10 * hash11(seed * 1.7)));
    float x = env * (
      0.92 * sin(s * PI * (2.5 + orbit * 0.35) + phase + time * (0.22 + orbit * 0.16))
      + 0.28 * sin(s * TAU * 4.8 - phase * 1.2 - time * 0.20)
    );
    x += 0.06 * sin(time * 0.18 + phase * 1.6);

    float width = mix(0.085, 0.15, hash11(seed * 2.9)) * (0.65 + 0.55 * veil) * bassPulse;
    float sheet = exp(-pow(abs(p.x - x) / max(width, 1e-4), 2.2));
    float flutter = 0.5 + 0.5 * sin(s * TAU * (1.6 + hash11(seed * 3.8)) + phase * 0.6 - time * (0.15 + orbit * 0.08));
    float texture = 0.55 + 0.45 * noise2(vec2((p.x - x) * 8.0, s * 9.0 + seed + time * 0.08));
    float mask = smoothstep(0.03, 0.20, s) * (1.0 - smoothstep(0.88, 0.99, s));
    sheet *= pow(flutter, 2.6) * texture * mask;

    vec3 sheetCol = palette(fract(0.18 + hash11(seed * 6.2) * 0.6 - s * 0.35 + time * 0.018));
    addGlow(color, sheetCol, sheet * 0.030 * (0.70 + 0.50 * drive));
  }

  const int STRANDS = 18;
  for (int i = 0; i < STRANDS; i++) {
    float fi = float(i);
    float seed = fi + 1.0;
    float phase = seed * 1.618 + sin(seed * 2.17) * 0.8;
    float orbit = 0.58 + hash11(seed * 2.9) * 1.18;
    float detail = 0.38 + hash11(seed * 5.1) * 1.15;

    float yWarp = strandYWarp(baseS, phase, time, orbit);
    float s = clamp((p.y + yWarp + 1.08) / 2.16, 0.0, 1.0);
    float x = strandCurve(s, phase, time, spread * (0.94 + 0.12 * hash11(seed * 1.4)), orbit, detail);
    x += 0.030 * sin(time * 0.24 + phase * 1.7) * columnEnvelope(s, spread * 0.8);
    x += 0.022 * (camera - 0.5) * sin(s * PI * 2.0 + phase);

    float width = mix(0.0022, 0.0066, hash11(seed * 7.4)) * (0.84 + 0.55 * energy) * bassPulse;
    float dist = p.x - x;
    float line = softLine(dist, width);
    float glow = softLine(dist, width * (5.4 + 2.4 * veil));
    float outer = softLine(dist, width * (15.0 + 9.0 * veil));

    float twist = 0.5 + 0.5 * sin(
      dist * 155.0
      + s * TAU * (3.2 + detail * 1.8)
      + phase
      - time * (0.28 + orbit * 0.18)
    );
    float thread = pow(twist, 6.0);
    float mask = smoothstep(0.015, 0.09, s) * (1.0 - smoothstep(0.94, 0.995, s));
    float tail = 0.65 + 0.35 * sin(s * PI * (2.0 + detail * 0.35) + phase * 1.2 + time * 0.12);

    vec3 strandCol = palette(fract(0.86 - s * 0.60 + hash11(seed * 3.7) * 0.82 + time * 0.026));
    strandCol = mix(strandCol, vec3(1.0), 0.18 + 0.24 * pow(1.0 - abs(s - 0.5) * 1.85, 1.8));

    addGlow(color, strandCol, line * thread * mask * (0.22 + 0.26 * drive) * tail);
    addGlow(color, strandCol, glow * mask * 0.070 * (0.65 + 0.45 * veil));
    addGlow(color, strandCol, outer * mask * 0.012 * (0.55 + 0.45 * energy));
  }

  float coreX = 0.03 * sin(p.y * 6.0 + time * 0.95) + 0.015 * sin(p.y * 14.0 - time * 0.7);
  float coreWidth = (0.016 + 0.045 * columnEnvelope(baseS, spread * 0.78)) * (0.92 + 0.35 * bassPulse);
  float core = softLine(p.x - coreX, coreWidth);
  vec3 coreCol = mix(vec3(1.0, 0.75, 0.54), vec3(0.74, 0.95, 1.0), sat(baseS * 1.05));
  addGlow(color, coreCol, core * (0.045 + 0.16 * energy));

  float halo = exp(-pow(length(vec2(p.x * 1.9, p.y * 0.7)), 2.0) * (1.6 - 0.2 * drive));
  color += vec3(0.012, 0.008, 0.018) * halo * (0.18 + 0.18 * veil);

  color = 1.0 - exp(-color * (1.10 + 0.32 * veil + 0.20 * energy));
  color = pow(color, vec3(0.94));
  color = mix(vec3(0.0), color, sat(uEffectStrength));

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
