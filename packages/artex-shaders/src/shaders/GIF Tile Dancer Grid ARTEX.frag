precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform sampler2D uMainImage;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

float sat(float x) {
  return clamp(x, 0.0, 1.0);
}

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

float dancerMask(vec4 sampleColor) {
  float alphaMask = sampleColor.a;
  float brightnessMask = 1.0 - smoothstep(0.76, 0.98, luma(sampleColor.rgb));
  return max(alphaMask, brightnessMask);
}

void main() {
  vec2 resolution = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / resolution;

  float tileCount = mix(4.0, 16.0, sat(uEffectParam1 * 0.5));
  float speed = 0.35 + 1.8 * sat(uEffectParam2 * 0.5);
  float edgeBoost = 0.8 + 2.4 * sat(uEffectParam3 * 0.5);

  vec2 tiled = uv * tileCount;
  vec2 cell = floor(tiled);
  vec2 local = fract(tiled);

  float rnd = hash12(cell);
  float phase = uTime * speed + rnd * 6.2831853;

  // Create "GIF frame stepping" feel with per-tile temporal offset.
  float frame = floor(uTime * (2.0 + speed * 1.7) + rnd * 8.0);
  vec2 stepJitter = vec2(
    fract(frame * 0.37 + rnd) - 0.5,
    fract(frame * 0.73 + rnd * 1.7) - 0.5
  ) * 0.08;

  float rowSign = mod(cell.y, 2.0) < 0.5 ? -1.0 : 1.0;
  float rowShift = rowSign * 0.045 * sin(phase * 0.8 + cell.y * 0.41);
  vec2 microWarp = vec2(
    0.015 * sin(phase + local.y * 8.0),
    0.018 * cos(phase * 1.2 + local.x * 7.0)
  );

  vec2 sampleUv = local;
  sampleUv.x += rowShift;
  sampleUv += stepJitter + microWarp;
  sampleUv = clamp(sampleUv, vec2(0.001), vec2(0.999));

  vec4 src = texture2D(uMainImage, sampleUv);
  float mask = dancerMask(src);

  // Silhouette edge extraction in texture space.
  vec2 edgeStep = vec2(1.0 / 256.0, 1.0 / 256.0);
  float mL = dancerMask(texture2D(uMainImage, clamp(sampleUv - vec2(edgeStep.x, 0.0), vec2(0.001), vec2(0.999))));
  float mR = dancerMask(texture2D(uMainImage, clamp(sampleUv + vec2(edgeStep.x, 0.0), vec2(0.001), vec2(0.999))));
  float mD = dancerMask(texture2D(uMainImage, clamp(sampleUv - vec2(0.0, edgeStep.y), vec2(0.001), vec2(0.999))));
  float mU = dancerMask(texture2D(uMainImage, clamp(sampleUv + vec2(0.0, edgeStep.y), vec2(0.001), vec2(0.999))));
  float edge = sat((abs(mR - mL) + abs(mU - mD)) * 0.5 * edgeBoost);

  vec3 bg = vec3(0.975, 0.975, 0.982);
  float gridLine = smoothstep(0.985, 1.0, max(abs(local.x - 0.5), abs(local.y - 0.5)) * 2.0);
  bg -= gridLine * 0.018;

  vec3 subject = src.rgb;
  subject *= 0.90 + 0.15 * sin(phase + local.y * 6.0);
  subject += edge * vec3(0.07, 0.12, 0.24);

  vec3 composed = mix(bg, subject, mask);
  composed += edge * vec3(0.04, 0.07, 0.14) * 0.5;

  vec2 p = uv * 2.0 - 1.0;
  p.x *= resolution.x / resolution.y;
  float vignette = smoothstep(1.28, 0.25, length(p));
  composed *= mix(0.93, 1.05, vignette);

  vec3 finalColor = mix(bg, composed, sat(uEffectStrength));
  gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}
