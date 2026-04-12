// Moon Surface II ARTEX — Terrain-warped artwork with lunar topography
// Based on Nikos Papadopoulos (4rknova, 2015), rewritten for ARTEX compositing.
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

// --- Terrain noise ---
#define SPEED 25.0

float fbm(vec2 p) {
  return 0.5000 * artex_noise(p)
       + 0.2500 * artex_noise(p * 2.0)
       + 0.1250 * artex_noise(p * 4.0)
       + 0.0625 * artex_noise(p * 8.0);
}

float terrain(vec3 p) {
  float heightScale = max(0.01, uEffectParam2 * 2.0);
  return dot(vec3(p.x, p.y * heightScale
    + 0.45 * fbm(p.zx)
    + 2.55 * artex_noise(0.1 * p.xz)
    + 0.83 * artex_noise(0.4 * p.xz)
    + 3.33 * artex_noise(0.001 * p.xz), p.z), vec3(0.0, 1.0, 0.0));
}

vec3 terrainNormal(vec3 p, float d) {
  const float eps = 0.001;
  return normalize(vec3(
    terrain(vec3(p.x + eps, p.y, p.z)),
    terrain(vec3(p.x, p.y + eps, p.z)),
    terrain(vec3(p.x, p.y, p.z + eps))) - d);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 baseUv = fragCoord.xy / uResolution.xy;
  vec2 uv = baseUv * 2.0 - 1.0;

  if (abs(0.001 + uv.y) >= 0.7) {
    fragColor = artex_sampleMain(baseUv);
    return;
  }

  vec2 uvn = uv * vec2(uResolution.x / uResolution.y, 1.0);
  float vel = SPEED * uTime * uEffectParam1;

  vec3 cu = vec3(2.0 * artex_noise(vec2(0.3 * uTime)) - 1.0, 1.0, fbm(vec2(0.8 * uTime)));
  vec3 cp = vec3(0.0, 3.1 + artex_noise(vec2(uTime)) * 3.1, vel);
  vec3 ct = vec3(1.5 * sin(uTime), -2.0 + cos(uTime) + fbm(cp.xz) * 0.4, 13.0 + vel);

  vec3 ro = cp;
  vec3 rd = normalize(vec3(uvn, 1.0 / tan(60.0 * 3.14159265 / 180.0)));

  vec3 rz = normalize(ct - cp);
  vec3 rx = normalize(cross(rz, cu));
  vec3 ry = normalize(cross(rx, rz));
  rd = normalize(mat3(rx, ry, rz) * rd);

  // March — reduced from 150 to 48 steps
  vec3 pos = ro;
  float d = 1.0;
  int maxSteps = int(48.0 * max(0.1, uEffectParam3 * 1.5));
  for (int i = 0; i < 48; i++) {
    if (i >= maxSteps) break;
    d = terrain(pos);
    if (d < 0.001) break;
    pos += d * rd;
  }

  bool hit = d < 0.001;
  vec3 sn = terrainNormal(pos, d);

  // Lighting value for terrain shape
  float light = hit ? dot(sn, normalize(vec3(cp.x, cp.y + 0.5, cp.z) - pos)) : 0.0;
  light = clamp(light, 0.0, 1.0);

  // Sample artwork at its true UV — no resizing
  float depthFade = hit ? 1.0 : 0.0;
  vec4 artwork = artex_sampleMain(baseUv);
  float mediaPresence = smoothstep(0.0, 0.05, artwork.a);

  // Standalone terrain visual: grey moonscape with lighting
  vec3 terrainColor = vec3(0.25 + light * 0.55) * depthFade;
  terrainColor += vec3(0.12, 0.10, 0.15) * (1.0 - depthFade); // sky

  // Composite: terrain lighting sculpts the artwork when present
  float strength = clamp(uEffectStrength, 0.0, 1.0);
  vec3 withMedia = artwork.rgb * mix(vec3(1.0), vec3(0.4 + light * 0.8), strength * depthFade);
  vec3 col = mix(terrainColor * strength, withMedia, mediaPresence);

  // Vignette
  col *= 1.75 * smoothstep(length(uv) * 0.35, 0.75, 0.4);

  // Subtle grain
  float grain = artex_hash((artex_hash(vec2(uv.x, 0.0)) + uv.y) * uTime + 0.1) * 0.08;
  col += grain * strength;

  // Audio: deepen shadows on bass
  col *= 1.0 - uBassLevel * 0.15 * (1.0 - light) * strength;

  col *= smoothstep(0.001, 3.5, uTime);

  fragColor = vec4(col, max(artwork.a, strength * (1.0 - mediaPresence)));
}

void main() {
  vec4 fragColor;
  mainImage(fragColor, gl_FragCoord.xy);
  gl_FragColor = fragColor;
}
