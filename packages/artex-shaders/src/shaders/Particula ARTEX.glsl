// Particula ARTEX.glsl
// Procedural audio-reactive particle spheres — shader port of Particula
// (github.com/Humprt/particula, MIT © 2025 Humprt Pum).
// Apache-2.0
//
// uEffectParam1  — sphere scale        (0..2, default 1)
// uEffectParam2  — turbulence          (0..2, default 1)
// uEffectParam3  — outer sphere mix    (0..2, default 1)
//
// 60 magenta/pink billboard particles (Sphere 1 — Animus Vox palette)
// 28 purple/cyan billboard particles  (Sphere 2 — bass accent)
// 16 orbiting sparks                  (ring boundary)
// All particles are 3-D: Fibonacci-distributed, sinusoidal turbulence,
// Y-axis rotation, perspective-projected to screen.

precision mediump float;
const float uMood = 0.5;
uniform float time;
uniform float iTime;
uniform float uTargetAspect;
uniform float targetAspect;
uniform vec3  iResolution;
uniform vec3  iChannelResolution[4];
uniform sampler2D uMainImage;
uniform vec2  uMainImageResolution;
uniform sampler2D uStateA;
uniform vec2  uStateAResolution;
uniform sampler2D uStateB;
uniform vec2  uStateBResolution;
uniform sampler2D uStateC;
uniform vec2  uStateCResolution;
uniform sampler2D uStateD;
uniform vec2  uStateDResolution;
uniform sampler2D uMask;
uniform sampler2D uState1;
uniform sampler2D uState2;
uniform int   uUseStateBlending;
uniform float uBlendFactor;
uniform int   uStateCount;
uniform int   uFlowEnabled;
uniform float uFlowIntensity;
uniform float uFlowSpeed;
uniform float uFlowScale;
uniform vec4  uMediaTransform;
uniform vec4  u_mediaTransform;
uniform int   uMediaTransformMainEnabled;
uniform vec4  iDate;
uniform vec4  iMouse;
uniform float uAudioLevel;
uniform float uBassLevel;
uniform float uProximity;
uniform float uCameraLevel;
uniform vec2  uLeftEye;
uniform vec2  uRightEye;
uniform vec2  uFaceCenter;
uniform float uHasFace;
uniform vec2  leftEye;
uniform vec2  rightEye;
uniform vec2  faceCenter;
uniform float hasFace;

uniform float uTime;
uniform vec2  uResolution;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

// Live inputs not in the legacy block
uniform float     uTransientLevel;

// ── Helpers ───────────────────────────────────────────────────────────────────

float sat(float x) { return clamp(x, 0.0, 1.0); }

float hash(float n) { return fract(sin(n * 91.13 + 33.37) * 43758.5453); }

// Y-axis rotation
vec3 rotY(vec3 q, float a) {
  float s = sin(a), c = cos(a);
  return vec3(c * q.x + s * q.z, q.y, -s * q.x + c * q.z);
}

// ── Main ──────────────────────────────────────────────────────────────────────

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv  = gl_FragCoord.xy / res;       // 0..1  (used for iChannel0 lookup)
  vec2 p   = uv * 2.0 - 1.0;             // -1..1 centred
  p.x     *= res.x / res.y;              // aspect-ratio correct

  // ── Signals ────────────────────────────────────────────────────────────────
  float audio = sat(uAudioLevel * 1.4);
  float bass  = sat(uBassLevel  * 2.0);
  float trans = sat(uTransientLevel * 2.5);
  float prox  = sat(max(uProximity, uCameraLevel * 0.5));

  // Beat pulse: transients cause a fast outward radius flash
  float beatExpand = trans * 0.12;

  // ── Sphere 1 (magenta/pink — Animus Vox) ──────────────────────────────────
  float r1    = (0.50 + uEffectParam1 * 0.18) * (1.0 + beatExpand);
  float rot1  = uTime * (0.10 + audio * 0.22);
  float turb1 = (0.10 + uEffectParam2 * 0.10 + audio * 0.06) * r1;

  // ── Sphere 2 (purple/cyan — bass accent) ──────────────────────────────────
  float r2     = r1 * 1.52;
  float rot2   = -uTime * (0.055 + audio * 0.09);
  float turb2  = (0.06 + uEffectParam2 * 0.06) * r2;
  float s2vis  = sat(uEffectParam3 * 0.7);

  // ── Virtual camera ─────────────────────────────────────────────────────────
  float camZ  = 2.0 - prox * 0.45;   // proximity zooms in
  float focal = 1.7;

  // ── Palette ────────────────────────────────────────────────────────────────
  vec3 col1a = vec3(1.00, 0.00, 0.88);  // magenta  #ff00e0
  vec3 col1b = vec3(1.00, 0.00, 0.47);  // pink     #ff0077
  vec3 col2a = vec3(0.47, 0.13, 1.00);  // purple   #7722ff
  vec3 col2b = vec3(0.00, 0.93, 1.00);  // cyan     #00eeff

  vec3 color = vec3(0.0);

  // ── Sphere 1: 60 billboard particles ──────────────────────────────────────
  const int N1 = 60;
  float pSz1 = 0.026 + uEffectParam1 * 0.006;

  for (int i = 0; i < N1; i++) {
    float fi   = (float(i) + 0.5) / float(N1);
    float seed = float(i);

    // Fibonacci sphere distribution (golden angle)
    float phi   = acos(clamp(1.0 - 2.0 * fi, -1.0, 1.0));
    float theta = fi * 6.2831853 * 2.399963;
    vec3 base   = vec3(sin(phi) * cos(theta), sin(phi) * sin(theta), cos(phi));

    // Per-particle sinusoidal turbulence — unique frequency per particle
    float h1 = hash(seed * 7.31);
    float h2 = hash(seed * 13.97);
    float h3 = hash(seed * 19.73);
    vec3 sway = vec3(
      sin(uTime * (0.20 + h1 * 0.28) + h1 * 6.28),
      cos(uTime * (0.15 + h2 * 0.22) + h2 * 6.28),
      sin(uTime * (0.18 + h3 * 0.25) + h3 * 6.28)
    ) * turb1;

    // Random radius within shell (35%–100% of r1)
    float radScale = 0.35 + 0.65 * hash(seed * 23.1);
    vec3 pos = normalize(base + sway * 0.35) * r1 * radScale + sway * 0.65;

    // Soft-clamp particles that escape the sphere (avoids hard branch)
    float d = length(pos);
    pos *= mix(1.0, r1 / max(d, 0.001), sat((d - r1) * 8.0));

    pos = rotY(pos, rot1);

    // Depth — fade particles very close to the camera
    float depth = camZ - pos.z;
    float dClip = sat(depth * 5.0);

    // Screen-space Gaussian blob
    vec2 sp   = pos.xy / max(depth, 0.01) * focal;
    float sd  = length(p - sp);
    float blob = exp(-sd * sd / (pSz1 * pSz1)) * dClip;

    // Color: vertical gradient within sphere
    float yN = pos.y / r1 * 0.5 + 0.5;
    vec3 pc = mix(col1a, col1b, yN);

    // Depth shading + per-particle flicker (simulates lifetime cycling)
    float dShade  = 0.35 + 0.65 * (pos.z / r1 * 0.5 + 0.5);
    float flicker = 0.50 + 0.50 * sin(uTime * (1.4 + hash(seed * 11.0)) + seed * 5.3);
    color += pc * blob * dShade * (0.55 + flicker * 0.45) * (1.0 + audio * 0.55);
  }

  // ── Sphere 2: 28 billboard particles ──────────────────────────────────────
  const int N2 = 28;
  float pSz2 = 0.018;

  for (int i = 0; i < N2; i++) {
    float fi   = (float(i) + 0.5) / float(N2);
    float seed = float(i) + 200.0;

    float phi   = acos(clamp(1.0 - 2.0 * fi, -1.0, 1.0));
    float theta = fi * 6.2831853 * 2.399963;
    vec3 base   = vec3(sin(phi) * cos(theta), sin(phi) * sin(theta), cos(phi));

    float h1 = hash(seed * 7.31);
    float h2 = hash(seed * 13.97);
    float h3 = hash(seed * 19.73);
    vec3 sway = vec3(
      sin(uTime * (0.14 + h1 * 0.18) + h1 * 6.28),
      cos(uTime * (0.11 + h2 * 0.16) + h2 * 6.28),
      sin(uTime * (0.13 + h3 * 0.18) + h3 * 6.28)
    ) * turb2;

    // Shell-concentrated: outer 70%–100% of r2
    float radScale = 0.70 + 0.30 * hash(seed * 17.3);
    vec3 pos = normalize(base + sway * 0.25) * r2 * radScale + sway * 0.75;

    float d = length(pos);
    pos *= mix(1.0, r2 / max(d, 0.001), sat((d - r2) * 6.0));

    pos = rotY(pos, rot2);

    float depth = camZ - pos.z;
    float dClip = sat(depth * 5.0);

    vec2 sp   = pos.xy / max(depth, 0.01) * focal;
    float sd  = length(p - sp);
    float blob = exp(-sd * sd / (pSz2 * pSz2)) * dClip;

    float yN = pos.y / r2 * 0.5 + 0.5;
    vec3 pc = mix(col2a, col2b, yN);

    float dShade  = 0.25 + 0.75 * (pos.z / r2 * 0.5 + 0.5);
    float flicker = 0.40 + 0.60 * sin(uTime * (1.1 + hash(seed * 9.1)) + seed * 4.1);
    color += pc * blob * dShade * (0.45 + flicker * 0.55) * s2vis * (0.5 + bass * 0.6);
  }

  // ── Orbiting sparks ────────────────────────────────────────────────────────
  // Bright point particles on the sphere boundary — beat/bass reactive.
  float sparkR = r1 * (1.06 + bass * 0.08 + trans * 0.06);
  const int NS = 16;

  for (int i = 0; i < NS; i++) {
    float seed = float(i) + 400.0;
    float h    = hash(seed);

    // Spherical orbit: random polar angle, time-driven azimuth
    float sPhi   = hash(seed * 3.7) * 3.14159;
    float sTheta = h * 6.2832 + uTime * mix(-0.14, 0.20, hash(seed * 2.3)) * (1.0 + audio * 1.3);
    vec3 sp3 = vec3(
      sin(sPhi) * cos(sTheta),
      cos(sPhi),
      sin(sPhi) * sin(sTheta)
    ) * sparkR;

    float depth = camZ - sp3.z;
    float dClip = sat(depth * 5.0);

    vec2 sp   = sp3.xy / max(depth, 0.01) * focal;
    float sd  = length(p - sp);
    float sSz = mix(0.009, 0.022, hash(seed * 5.6));
    float blob = exp(-sd * sd / (sSz * sSz)) * dClip;

    float flicker = 0.35 + 0.65 * sin(uTime * mix(1.8, 4.5, hash(seed * 11.2)) + seed * 17.0);
    vec3 sc = mix(col1a, col2a, hash(seed * 9.7));
    color += sc * blob * flicker * (0.07 + bass * 0.22 + trans * 0.55);
  }

  // ── Post-process ───────────────────────────────────────────────────────────
  float vignette = smoothstep(1.75, 0.2, length(p));
  color *= vignette;

  // Filmic tone-map — bass and transients boost brightness (beat flash)
  color = 1.0 - exp(-color * (1.1 + bass * 0.55 + trans * 0.9));
  color = pow(color, vec3(0.92));

  // ── Composite over artwork (additive — mirrors Particula's AdditiveBlending)
  vec3 bg    = texture2D(uMainImage, uv).rgb;
  vec3 final = mix(bg, bg + color, sat(uEffectStrength));

  gl_FragColor = vec4(clamp(final, 0.0, 1.0), 1.0);
}
