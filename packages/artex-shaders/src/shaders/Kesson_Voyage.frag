// Kesson Voyage ARTEX — Gyroid tunnel artwork warper
// Rewritten for ARTEX compositing with reduced ray march steps.
precision mediump float;
uniform float time;
uniform float uTargetAspect;
uniform float targetAspect;
uniform vec2 uMainImageResolution;
uniform vec2 uStateAResolution;
uniform vec2 uStateBResolution;
uniform vec2 uStateCResolution;
uniform vec2 uStateDResolution;
uniform vec4 uMediaTransform;
uniform vec4 u_mediaTransform;
uniform int uMediaTransformMainEnabled;
uniform vec4 iMouse;
uniform vec2 uLeftEye;
uniform vec2 uRightEye;
uniform vec2 uFaceCenter;
uniform float uHasFace;
uniform vec2 leftEye;
uniform vec2 rightEye;
uniform vec2 faceCenter;
uniform float hasFace;
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

// --- ARTEX helpers ---
vec4 tex2D(sampler2D s, vec2 uv) { return texture2D(s, uv); }

float artex_hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float artex_noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = artex_hash(i);
  float b = artex_hash(i + vec2(1.0, 0.0));
  float c = artex_hash(i + vec2(0.0, 1.0));
  float d = artex_hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec2 artex_applyFlow(vec2 uv) {
  if (uFlowEnabled != 1) return uv;
  vec2 p = uv * uFlowScale;
  float nx = artex_noise(p + vec2(10.0, 0.0) + uTime * uFlowSpeed);
  float ny = artex_noise(p + vec2(0.0, 10.0) + uTime * uFlowSpeed);
  return uv + vec2((nx - 0.5), (ny - 0.5)) * uFlowIntensity * 0.15;
}

vec4 artex_blendStates(vec2 uv) {
  if (uUseStateBlending != 1) return tex2D(uMainImage, uv);
  if (uStateCount <= 1) return tex2D(uStateA, uv);
  if (uStateCount == 2) return mix(tex2D(uStateA, uv), tex2D(uStateB, uv), uBlendFactor);
  if (uStateCount == 3) {
    if (uBlendFactor < 0.5) return mix(tex2D(uStateA, uv), tex2D(uStateB, uv), uBlendFactor * 2.0);
    return mix(tex2D(uStateB, uv), tex2D(uStateC, uv), (uBlendFactor - 0.5) * 2.0);
  }
  float t3 = 1.0 / 3.0;
  if (uBlendFactor < t3) return mix(tex2D(uStateA, uv), tex2D(uStateB, uv), uBlendFactor * 3.0);
  if (uBlendFactor < t3 * 2.0) return mix(tex2D(uStateB, uv), tex2D(uStateC, uv), (uBlendFactor - t3) * 3.0);
  return mix(tex2D(uStateC, uv), tex2D(uStateD, uv), (uBlendFactor - t3 * 2.0) * 3.0);
}

vec4 artex_sampleMain(vec2 uv) {
  return artex_blendStates(artex_applyFlow(uv));
}

// --- Gyroid tunnel ---
#define SPEED 0.25
#define ROTSPEED 0.15
#define CAMDIST 4.0

mat2 rot(float a) {
  float s = sin(a), c = cos(a);
  return mat2(c, -s, s, c);
}

float repeat(float p, float s) {
  return (fract(p / s - 0.5) - 0.5) * s;
}

vec3 tunnel(vec3 p) {
  float dd = p.z * 0.005 * 20.1 + uTime * 0.25;
  return vec3(sin(dd) * 6.0, sin(dd * 0.7) * 6.0, 0.0);
}

vec3 navigate(vec3 p) {
  p += tunnel(p);
  p.xy *= rot((p.z + uTime) * ROTSPEED);
  p.y -= 0.3;
  return p;
}

float sdGyroid(vec3 p, float scale, float thickness, float bias, float lx, float ly) {
  vec3 p2 = p * scale;
  p2.z = sin(p2.z) + 10.0;
  float ls = max(lx, ly);
  return abs(dot(sin(p2 * lx), cos(p2.zxy * ly)) - bias) / (scale * ls) - thickness;
}

float smin(float a, float b, float h) {
  float k = clamp((a - b) / h * 0.5 + 0.5, 0.0, 1.0);
  return mix(a, b, k) - k * (1.0 - k) * h;
}

float sdTriPrism(vec3 p, vec2 h) {
  vec3 q = abs(p);
  return max(q.z - h.y, max(q.x * 0.866025 + p.y * 0.5, -p.y) - h.x * 0.5);
}

float beamAccum = 0.0;

float getDist(vec3 p) {
  vec3 pc = p;
  p.z += uTime * SPEED;
  p -= tunnel(p);
  vec3 p2 = navigate(p - tunnel(p));
  vec3 pg = p2;
  pg.xy *= rot(pg.z * 0.0001);

  float lz = fract((p.z / 100.0) * 0.02);
  float t = uTime;
  float lx = 6.0 + (sin((lz + t) * 0.2576) * 0.5 + 0.5);
  float ly = 5.0 + (cos((lz + t) * 0.1987) * 0.5 + 0.5);
  float g1 = sdGyroid(pg, 0.5, 0.1, 1.4, lx, ly) * 0.8;

  // Reduced from 8 to 4 detail octaves
  float v = 10.63748;
  float m = 0.5;
  for (int i = 0; i < 4; i++) {
    g1 -= sdGyroid(p2, v, 0.03, 0.3, 1.0, 1.0) * m;
    v *= 2.0;
    m *= 0.85;
  }

  float camera = length(pc - vec3(0.0, 0.0, -CAMDIST)) - 0.2;
  g1 = max(g1, -camera);

  vec3 ps = p;
  ps += tunnel(ps);
  ps.z = repeat(ps.z, 30.0);
  ps.xy *= rot(ps.z * 0.1);
  float c11 = sdTriPrism(ps, vec2(1.0, 15.0));
  float c12 = sdTriPrism(ps, vec2(0.9, 30.0));
  float cc1 = max(c11, -c12);

  float d1 = smin(g1, cc1, 0.2);
  d1 = min(d1, cc1);
  beamAccum += 0.01 / (0.08 + cc1);
  return d1;
}

void main() {
  vec2 baseUv = gl_FragCoord.xy / uResolution.xy;

  // Always sample artwork at its true UV — never alter the artwork's scale
  vec4 artwork = artex_sampleMain(baseUv);

  float strength = clamp(uEffectStrength, 0.0, 1.0);
  if (strength < 0.001) {
    gl_FragColor = artwork;
    return;
  }

  // Compute tunnel geometry for overlay effect
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;
  float t = uTime * 0.01;
  uv += sin(uv * 20.0 + t) * 0.01;

  vec3 ro = vec3(0.0, 0.0, -CAMDIST);
  ro += vec3(
    sin(sin(ro.x) + cos(ro.y + uTime) + uTime * 0.178),
    cos(cos(ro.z) + sin(ro.x + uTime) + uTime * 0.785),
    sin(sin(ro.y) + cos(ro.z + uTime) + uTime * 0.355)
  ) * 0.1;

  vec3 ta = vec3(0.0);
  ta += vec3(
    sin(sin(ta.y) + cos(ta.z + uTime) + uTime * 0.533),
    cos(cos(ta.x) + sin(ta.y + uTime) + uTime * 0.365),
    sin(sin(ta.x) + cos(ta.y + uTime) + uTime * 0.563)
  ) * 0.1;

  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = normalize(cross(uu, ww));
  vec3 rd = normalize(uv.x * uu + uv.y * vv + ww);

  // Reduced from 150 to 48 steps
  float dO = 0.00001;
  for (int i = 0; i < 48; i++) {
    vec3 p = ro + rd * dO;
    float dS = getDist(p);
    dO += dS;
    if (dO > 20.0 || dS < 0.00001) break;
  }

  float depthNorm = clamp(dO / 20.0, 0.0, 1.0);

  // Tunnel beam glow — boosted for visibility
  vec3 tunnelColor = vec3(0.1, 0.72, 1.0);
  float beamGlow = beamAccum * (0.4 + uAudioLevel * 3.0);
  vec3 glowEffect = tunnelColor * beamGlow * 0.6;
  glowEffect = 1.0 - exp(-glowEffect);

  // Depth-based ambient: closer = brighter structure
  float depthAmbient = 1.0 - depthNorm * 0.5;

  // Standalone tunnel visual (visible when no media is loaded)
  float mediaPresence = smoothstep(0.0, 0.05, artwork.a);
  vec3 standalone = vec3(0.05, 0.08, 0.15) * depthAmbient;
  standalone += tunnelColor * (1.0 - depthNorm) * 0.15;
  vec3 standaloneGlow = glowEffect + glowEffect * tunnelColor * 0.8;
  standalone += standaloneGlow * strength;

  // Composite: overlay tunnel structure onto artwork
  vec3 withMedia = artwork.rgb;
  withMedia *= mix(vec3(1.0), vec3(0.75), depthNorm * strength * 0.4);
  vec3 tintedGlow = mix(glowEffect, artwork.rgb * glowEffect * 2.5, 0.4);
  withMedia += tintedGlow * strength * 1.5;

  vec3 col = mix(standalone, withMedia, mediaPresence);

  gl_FragColor = vec4(col, max(artwork.a, strength * (1.0 - mediaPresence)));
}
