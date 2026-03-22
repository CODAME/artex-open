// Pastel Wave Trails ARTEX.glsl
// p5-style layered gradient wave ribbons translated into a single-pass ARTEX shader.
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;
uniform vec2 uFaceCenter;
uniform float uHasFace;
uniform float uProximity;

const float PI = 3.14159265359;
const int LINE_COUNT = 6;
const int TRAIL_COUNT = 14;

float saturate(float x) {
  return clamp(x, 0.0, 1.0);
}

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise21(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec3 paletteColor(int index) {
  if (index == 0) return vec3(209.0, 242.0, 253.0) / 255.0; // #D1F2FD
  if (index == 1) return vec3(185.0, 233.0, 255.0) / 255.0; // #B9E9FF
  if (index == 2) return vec3(224.0, 206.0, 250.0) / 255.0; // #E0CEFA
  if (index == 3) return vec3(255.0, 209.0, 232.0) / 255.0; // #FFD1E8
  if (index == 4) return vec3(253.0, 253.0, 203.0) / 255.0; // #FDFDCB
  return vec3(209.0, 255.0, 239.0) / 255.0; // #D1FFEF
}

float gradientPulse(float x, float center, float width) {
  float d = (x - center) / max(width, 1e-4);
  return exp(-d * d);
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / res;
  vec2 centeredUv = uv * 2.0 - 1.0;
  centeredUv.x *= res.x / res.y;

  float timeScale = 0.75 + 0.55 * saturate(uEffectParam2 * 0.5);
  float phase = uTime * 0.9 * timeScale;
  float amplitudeScale = 0.7 + 0.3 * saturate(uEffectParam1 * 0.7);
  float trailSpread = 0.8 + 0.5 * saturate(uEffectParam2 * 0.6);

  vec2 attractor = mix(vec2(0.5, 0.5), clamp(uFaceCenter, 0.0, 1.0), saturate(uHasFace));
  vec2 attractorPx = attractor * res;
  float pullAmount = saturate(uHasFace * (0.22 + 0.55 * saturate(uEffectParam3 * 0.7)) + uProximity * 0.9);

  vec3 tintAccum = vec3(0.0);
  float alphaAccum = 0.0;
  float xPx = uv.x * res.x;
  float yPx = uv.y * res.y;
  float taper = sin(uv.x * PI);

  for (int lineIndex = 0; lineIndex < LINE_COUNT; lineIndex++) {
    float lineF = float(lineIndex);
    vec3 colorA = paletteColor(lineIndex);
    int nextLineIndex = lineIndex == LINE_COUNT - 1 ? 0 : lineIndex + 1;
    vec3 colorB = paletteColor(nextLineIndex);
    float freq = 0.003 + lineF * 0.0006;

    for (int trailIndex = 0; trailIndex < TRAIL_COUNT; trailIndex++) {
      float trailF = float(trailIndex);
      float trailMix = trailF / float(TRAIL_COUNT - 1);
      float age = 1.0 - trailMix;
      float localPhase = phase - age * (1.2 + lineF * 0.08) * trailSpread;
      float linePhase = localPhase * (1.0 + lineF * 0.05);

      float wave = sin(xPx * freq + linePhase) + cos(xPx * 0.002 - localPhase) * 0.3;
      float amp = mix(180.0, 50.0, attractor.y) * amplitudeScale;
      float lineYPx = res.y * 0.5 + wave * amp * taper + trailF * (0.3 + lineF * 0.1) * trailSpread;

      if (pullAmount > 0.001) {
        float distanceToAttractor = length(vec2(xPx - attractorPx.x, lineYPx - attractorPx.y));
        float pull = exp(-pow(distanceToAttractor / 150.0, 2.0));
        lineYPx = mix(lineYPx, attractorPx.y, pull * taper * pullAmount);
      }

      float shimmerCenter = 0.5 + 0.5 * sin(localPhase * 0.95);
      float shimmer = gradientPulse(uv.x, shimmerCenter, 0.14 + 0.02 * sin(localPhase + lineF));
      vec3 lineColor = mix(colorA, colorB, shimmer);

      float thickness = mix(0.5, 4.0, trailMix);
      float distPx = abs(yPx - lineYPx);
      float core = 1.0 - smoothstep(thickness, thickness + 1.25, distPx);
      float glow = exp(-pow(distPx / (4.0 + thickness * 3.0), 2.0));
      float alpha = mix(0.01, 0.16, trailMix);
      float strokeAlpha = alpha * (core * 0.52 + glow * 0.08);

      tintAccum += lineColor * strokeAlpha;
      alphaAccum += strokeAlpha;
    }
  }

  float finalAlpha = saturate(1.0 - exp(-alphaAccum * (1.55 + 0.2 * saturate(uEffectStrength))));
  vec3 finalColor = tintAccum / max(alphaAccum, 1e-4);
  finalColor = mix(finalColor, vec3(1.0), 0.08);

  gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), finalAlpha);
}
