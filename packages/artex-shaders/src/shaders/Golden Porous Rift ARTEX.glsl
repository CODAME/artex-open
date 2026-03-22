// Golden Porous Rift ARTEX.glsl
// Inspired by a molten, porous golden cavern.
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
    p = p * 2.02 + vec2(13.4, 7.9);
    a *= 0.5;
  }
  return v;
}

vec3 voro(vec2 p, float time) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float f1 = 1e9;
  float f2 = 1e9;
  vec2 id = vec2(0.0);

  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      o = 0.5 + 0.5 * sin(time * 0.2 + 6.2831 * o);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = n + g;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }

  float c = hash12(id);
  return vec3(sqrt(f1), max(0.0, sqrt(f2) - sqrt(f1)), c);
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / res;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= res.x / res.y;

  float time = uTime * (0.32 + 0.60 * sat(uEffectParam2 * 0.6));
  float detail = 0.75 + 0.65 * sat(uEffectParam1 * 0.5);
  float heat = sat(uEffectParam3 * 0.5);

  vec3 bg = mix(vec3(0.010, 0.008, 0.003), vec3(0.028, 0.020, 0.005), sat(0.55 - 0.30 * p.y));

  vec2 c = p - vec2(0.03, -0.18);
  float r = length(c * vec2(0.92, 1.10));
  float ang = atan(c.y, c.x);

  float warp = fbm(c * 2.2 + vec2(ang * 0.9, time * 0.25));
  float spiral = r + 0.25 * sin(ang * 2.5 + r * 10.0 - time * 0.35) + 0.12 * warp;

  vec2 q = vec2(
    spiral * (7.0 + 3.0 * detail) + warp * 2.2,
    ang * 3.2 + warp * 1.4
  );

  vec3 vc = voro(q, time);
  float cell = vc.x;
  float edge = vc.y;
  float rnd = vc.z;

  float holes = smoothstep(0.16 + 0.07 * rnd, 0.02, cell);
  float ridges = pow(sat(edge * (8.0 + 6.0 * detail)), 0.9);
  float grain = fbm(q * 0.55 + time * 0.1);

  float bandA = 0.5 + 0.5 * sin((spiral + 0.15 * grain) * 36.0 - time * 0.55);
  float bandB = 0.5 + 0.5 * sin((spiral + 0.10 * grain) * 21.0 + ang * 5.0 + time * 0.25);
  float strata = mix(bandA, bandB, 0.38);

  float ridgeLine = 0.46 + 0.10 * sin(p.x * 2.2 + warp * 1.3) + 0.06 * sin(p.x * 5.4 - warp * 2.0);
  float terrain = smoothstep(ridgeLine + 0.03, ridgeLine - 0.03, p.y);

  float illumination = ridges * (0.70 + 0.45 * strata) + (1.0 - holes) * 0.12;
  illumination += pow(sat(edge * 18.0), 1.3) * 0.18;

  vec3 goldDark = vec3(0.20, 0.13, 0.02);
  vec3 goldMid = vec3(0.85, 0.66, 0.08);
  vec3 goldHot = vec3(1.0, 0.95, 0.72);

  vec3 col = mix(goldDark, goldMid, sat(illumination * 0.95));
  col = mix(col, goldHot, pow(sat(illumination), 2.0) * (0.65 + 0.35 * heat));

  col *= (1.0 - holes * (0.65 + 0.25 * rnd));
  col += goldHot * pow(sat(edge * 24.0), 2.4) * (0.35 + 0.35 * heat);

  vec3 finalCol = mix(bg, col, terrain);

  finalCol = 1.0 - exp(-finalCol * (1.25 + 0.35 * heat));
  finalCol = pow(finalCol, vec3(0.94));
  finalCol = mix(bg, finalCol, sat(uEffectStrength));

  gl_FragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
