precision mediump float;
uniform float uTime;
uniform float iTime;
uniform vec2 uResolution;
uniform vec3 iResolution;
uniform vec3 iChannelResolution[4];
uniform sampler2D uMainImage;
uniform sampler2D uStateA;
uniform sampler2D uStateB;
uniform sampler2D uStateC;
uniform sampler2D uStateD;
uniform sampler2D uMask;
uniform sampler2D uState1;
uniform sampler2D uState2;
uniform int uUseStateBlending;
uniform float uBlendFactor;
uniform int uStateCount;
uniform int uFlowEnabled;
uniform float uFlowIntensity;
uniform float uFlowSpeed;
uniform float uFlowScale;
uniform vec4 iDate;
uniform float uAudioLevel;
uniform float uBassLevel;
uniform float uProximity;
uniform float uCameraLevel;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

vec3 col1 = vec3(0.938, 0.678, 0.375);
vec3 col2 = vec3(0.455, 0.456, 0.55);

float hash(float n) {
  return fract(sin(n) * 43758.5453);
}

float noise(in vec2 x) {
  vec2 p = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n = p.x + p.y * 57.0;
  float res = mix(
    mix(hash(n + 0.0), hash(n + 1.0), f.x),
    mix(hash(n + 57.0), hash(n + 58.0), f.x),
    f.y
  );
  return res;
}

float fbm(vec2 p) {
  float f = 0.0;
  f += 0.50000 * noise(p); p = p * 2.02;
  f += 0.25000 * noise(p); p = p * 2.03;
  f += 0.12500 * noise(p); p = p * 2.01;
  f += 0.06250 * noise(p); p = p * 2.04;
  f += 0.03125 * noise(p);
  return f / 0.984375;
}

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
  return mod289(((x * 34.0) + 1.0) * x);
}

vec4 taylorInvSqrt(vec4 r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

vec2 fade(vec2 t) {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float pnoise(vec2 P, vec2 rep) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
  Pi = mod(Pi, rep.xyxy); 
  Pi = mod289(Pi);        
  vec4 ix = Pi.xzxz;
  vec4 iy = Pi.yyww;
  vec4 fx = Pf.xzxz;
  vec4 fy = Pf.yyww;

  vec4 i = permute(permute(ix) + iy);

  vec4 gx = fract(i * (1.0 / 41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;

  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);

  vec4 norm = taylorInvSqrt(vec4(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11)));
  g00 *= norm.x;
  g01 *= norm.y;
  g10 *= norm.z;
  g11 *= norm.w;

  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));

  vec2 fade_xy = fade(Pf.xy);
  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
  float n_xy = mix(n_x.x, n_x.y, fade_xy.y);
  return 2.3 * n_xy;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  // ARTEX specific parameters integration
  float t = uTime * uEffectParam1; // Param 1 controls animation speed
  float hillSoftening = 0.01 * max(0.01, uEffectParam2 * 2.0); // Param 2 controls hill softening
  float reflectionSoftening = 0.1 * max(0.01, uEffectParam3 * 2.0); // Param 3 controls reflection softening

  vec2 uv = fragCoord.xy / uResolution.xy;
  uv = uv * 2.0 - 1.0;
  uv.x *= uResolution.x / uResolution.y;

  vec3 col = vec3(0.0);

  if (abs(uv.x) < 1.0) {
    // sky
    col += mix(col1, col2, abs(uv.y)) + 0.2;
    col += mix(vec3(1.0), vec3(0.3), abs((uv.y - 0.45) * 1.5)) * 0.3;

    // hills
    for (int i = 0; i < 2; i++) {
      float edge = fbm(vec2(0.0, uv.x * 3.0 + float(i))) * 0.15 + 0.1;
      if (uv.y < edge + hillSoftening && uv.y > 0.0) {
        col -= 0.8 * smoothstep(edge + hillSoftening, edge, uv.y);
      }
    }

    // vignette
    float r = length(uv);
    col -= r * r * 0.2;

    float dist = 1.0 - abs(uv.y) * 0.9;
    uv.y *= 0.9;

    // shadows
    if (uv.y < 0.1) {
      uv.x *= dist * 1.2;
      col -= 0.6 * smoothstep(-0.3, 0.1, uv.y);

      float sand = pnoise(vec2(uv.x * 3.5 * dist + dist * 100.0, uv.y * 40.0 * dist), vec2(100.0, 100.0))
                 - pnoise(vec2(uv.x * 5.0 * dist * dist * dist, uv.y * 1.0 * dist), vec2(100.0, 100.0));
      if (sand > 0.4) {
        col -= smoothstep(0.4, 0.7, dist) * 0.2 * smoothstep(0.4, 0.8, sand);
      }
    }

    // reflection warp
    if (uv.y < 0.0) {
      uv.x += 0.05 * pnoise(vec2(uv.x * 10.0 * dist, uv.y * 100.0 * dist + t * 0.5), vec2(100.0, 100.0));
      uv.y += 0.04 * pnoise(vec2(uv.x * 10.0 * dist, uv.y * (100.0 * dist + 20.0) + t * 0.5), vec2(50.0, 100.0))
            * (0.5 + abs(uv.x) * 2.0) - 0.05;
    }

    // reflected mountains
    for (int i = 0; i < 2; i++) {
      float edge = fbm(vec2(0.0, uv.x * 3.0 + float(i))) * 0.1 + 0.1;
      if (uv.y > -edge - reflectionSoftening && uv.y < 0.1) {
        col -= 0.3 * smoothstep(-edge - reflectionSoftening, -edge, uv.y);
      }
    }

    // highlights
    col -= smoothstep(0.5, 0.0, abs(uv.y + 0.6)) * 0.2;
    col += smoothstep(0.3, 0.0, abs(uv.y + 0.3)) * 0.1;
    col -= smoothstep(0.6, 0.0, abs(uv.y + 1.0)) * 0.1;
    col.z += 0.05 * (1.0 - dist);
  }

  // Apply uEffectStrength to overall color
  fragColor = vec4(col * uEffectStrength, 1.0);
}

void main() {
  vec4 fragColor;
  vec2 fragCoord = gl_FragCoord.xy;
  mainImage(fragColor, fragCoord);
  gl_FragColor = fragColor;
}
