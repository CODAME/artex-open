precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform sampler2D uMainImage;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

// Video-derived seed shader
// Source: florigenix_ai_1770672914_3829003697423363078_64438645865.mp4
// MD5: 2c9366bbd4b446c76c5c7adae5d7d3ab

const vec3 VIDEO_BASE = vec3(0.511187, 0.526239, 0.475238);
const vec3 VIDEO_ACCENT = vec3(0.769024, 0.808895, 0.685592);
const vec3 VIDEO_SHADOW = vec3(0.272377, 0.196954, 0.174677);
const float VIDEO_PULSE = 2.006667;
const float VIDEO_SWIRL = 2.095882;
const float VIDEO_GRAIN = 0.538824;
const float VIDEO_TILT = -0.222745;
const float VIDEO_STROBE = 1.319608;
const float VIDEO_DRIFT = 0.274707;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = hash(i + vec2(0.0, 0.0));
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

mat2 rotate2d(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}

void main() {
  vec2 resolution = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / resolution;
  vec2 p = uv - 0.5;
  p.x *= resolution.x / resolution.y;

  float amount = clamp(uEffectParam1 * 0.5, 0.0, 1.2);
  float speed = clamp(uEffectParam2 * 0.5, 0.0, 1.2);
  float polish = clamp(uEffectParam3 * 0.5, 0.0, 1.2);

  float t = uTime * (0.65 + VIDEO_PULSE * (0.35 + speed * 0.65));
  float pulse = 0.5 + 0.5 * sin(t * 1.3 + VIDEO_STROBE * 2.6);

  vec2 q = p * rotate2d(VIDEO_TILT * 0.65 + sin(t * 0.16) * 0.1);
  float n = noise(q * (2.4 + VIDEO_SWIRL * (0.8 + amount * 0.9)) + t * (0.14 + VIDEO_DRIFT * 0.14));

  vec2 warp = vec2(
    sin((q.y + n * 0.6) * (6.0 + VIDEO_SWIRL * 2.8) + t * (0.85 + VIDEO_DRIFT)),
    cos((q.x - n * 0.5) * (5.2 + VIDEO_SWIRL * 3.0) - t * (0.78 + VIDEO_DRIFT * 0.9))
  ) * (0.004 + amount * 0.018);

  vec2 sampleUv = clamp(uv + warp, 0.0, 1.0);
  vec4 base = texture2D(uMainImage, sampleUv);

  vec2 px = vec2(1.0 / resolution.x, 1.0 / resolution.y);
  vec3 gradX = texture2D(uMainImage, clamp(sampleUv + vec2(px.x, 0.0), 0.0, 1.0)).rgb
    - texture2D(uMainImage, clamp(sampleUv - vec2(px.x, 0.0), 0.0, 1.0)).rgb;
  vec3 gradY = texture2D(uMainImage, clamp(sampleUv + vec2(0.0, px.y), 0.0, 1.0)).rgb
    - texture2D(uMainImage, clamp(sampleUv - vec2(0.0, px.y), 0.0, 1.0)).rgb;
  float edge = clamp(length(gradX) + length(gradY), 0.0, 1.0);

  float luma = dot(base.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 graded = mix(VIDEO_SHADOW, VIDEO_BASE, smoothstep(0.04, 0.88, luma + n * 0.08));
  graded = mix(graded, VIDEO_ACCENT, smoothstep(0.46, 1.08, luma + pulse * 0.34 + n * 0.16));

  float chromaBeat = sin(t * (1.5 + VIDEO_STROBE) + p.x * 6.2 - p.y * 4.1);
  vec3 color = mix(base.rgb, graded, clamp(0.22 + amount * 0.45 + VIDEO_GRAIN * 0.08, 0.0, 0.92));
  color += VIDEO_ACCENT * edge * (0.08 + polish * 0.55);
  color += vec3(0.02, -0.01, 0.03) * chromaBeat * (0.25 + polish * 0.45);

  float vignette = smoothstep(1.22, 0.15, length(p * (1.0 + 0.12 * sin(t * 0.22))));
  color *= mix(0.62, 1.0, vignette);

  float scan = 0.95 + 0.05 * sin((uv.y + n * 0.03) * resolution.y * 0.55 + t * (8.0 + VIDEO_STROBE * 4.0));
  color *= scan;

  float grain = (hash(gl_FragCoord.xy + t * 21.0) - 0.5) * (0.008 + VIDEO_GRAIN * (0.012 + polish * 0.02));
  color += grain;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), base.a);
}
