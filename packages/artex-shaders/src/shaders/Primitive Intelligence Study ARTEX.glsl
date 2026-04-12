// Primitive Intelligence Study ARTEX.glsl
// Black-field synthetic face study with mic-reactive iris, ring shell, and sparse telemetry dust.
precision mediump float;
uniform float time;
uniform float iTime;
uniform float uTargetAspect;
uniform float targetAspect;
uniform vec3 iResolution;
uniform vec3 iChannelResolution[4];
uniform sampler2D uMainImage;
uniform vec2 uMainImageResolution;
uniform sampler2D uStateA;
uniform vec2 uStateAResolution;
uniform sampler2D uStateB;
uniform vec2 uStateBResolution;
uniform sampler2D uStateC;
uniform vec2 uStateCResolution;
uniform sampler2D uStateD;
uniform vec2 uStateDResolution;
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
uniform vec4 uMediaTransform;
uniform vec4 u_mediaTransform;
uniform int uMediaTransformMainEnabled;
uniform vec4 iDate;
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
uniform vec2 uResolution;
uniform float uAudioLevel;
uniform float uBassLevel;
uniform float uProximity;
uniform float uCameraLevel;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

float sat(float x) { return clamp(x, 0.0, 1.0); }

float hash11(float p) {
  return fract(sin(p * 127.1 + 311.7) * 43758.5453123);
}

vec2 hash21(float p) {
  return fract(sin(vec2(p * 127.1 + 311.7, p * 269.5 + 183.3)) * 43758.5453123);
}

mat2 rot(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}

float ringMask(float radius, float target, float width) {
  return exp(-pow((radius - target) / max(width, 0.001), 2.0));
}

void main() {
  vec2 resolution = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / resolution;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= resolution.x / resolution.y;

  float t = uTime * (0.28 + uEffectParam2 * 0.36);
  float audio = sat(uAudioLevel);
  float bass = sat(uBassLevel);
  float sensor = sat(max(uProximity, uCameraLevel));
  float response = sat(max(audio, bass * 0.9));
  float breathing = sin(t * 0.58) * 0.5 + 0.5;

  vec3 bg = vec3(0.0);
  vec3 shellColor = mix(vec3(0.12, 0.15, 0.22), vec3(0.82, 0.24, 0.15), sat(uEffectParam3 * 0.5));
  vec3 irisColor = mix(vec3(0.95, 0.27, 0.14), vec3(0.96, 0.78, 0.68), sat(uEffectParam3 * 0.35 + bass * 0.3));
  vec3 haloColor = mix(vec3(0.12, 0.34, 0.62), vec3(0.85, 0.42, 0.18), sat(uEffectParam3 * 0.7));

  float radius = length(p);
  float angle = atan(p.y, p.x);
  vec2 drift = rot(sin(t * 0.36) * 0.18) * p;

  float coreRadius = 0.11 + uEffectParam1 * 0.04 + breathing * 0.015 + response * 0.08;
  float pupilOffset = sin(t * 0.92) * 0.025 * (0.25 + uEffectParam2 * 0.6);
  vec2 pupilCenter = vec2(pupilOffset, cos(t * 0.67) * 0.015);
  float pupil = exp(-pow(length(drift - pupilCenter) / max(coreRadius, 0.001), 2.2));
  float irisShell = ringMask(length(drift - pupilCenter), coreRadius * (1.45 + bass * 0.25), 0.05 + audio * 0.03);
  float corePulse = exp(-pow(radius / (0.19 + response * 0.06 + uEffectParam1 * 0.04), 2.0));

  float shellRadius = 0.46 + breathing * 0.02 + response * 0.05;
  float shellWidth = 0.022 + bass * 0.035 + uEffectParam1 * 0.01;
  float shell = ringMask(radius, shellRadius, shellWidth);
  float ringSweep = pow(sat(0.5 + 0.5 * sin(angle * 4.0 - t * (1.2 + uEffectParam2 * 2.4))), 5.5);
  float ringRipple = 0.5 + 0.5 * sin(radius * 48.0 - t * (1.6 + bass * 2.0));
  float shellSignal = shell * (0.18 + ringSweep * (0.55 + bass * 0.85) + ringRipple * audio * 0.2);

  float outerRadius = shellRadius + 0.1 + sensor * 0.04;
  float outerRing = ringMask(radius, outerRadius, 0.012 + bass * 0.015);
  float outerSweep = pow(sat(0.5 + 0.5 * sin(angle * 7.0 + t * (1.4 + uEffectParam2 * 2.8))), 8.0);

  vec3 color = bg;
  color += irisColor * pupil * (0.8 + audio * 0.9);
  color += vec3(1.0, 0.72, 0.54) * irisShell * (0.2 + response * 0.8);
  color += shellColor * shellSignal * (0.65 + uEffectParam3 * 0.5);
  color += haloColor * outerRing * (0.16 + outerSweep * (0.3 + bass * 0.55));
  color += vec3(0.25, 0.06, 0.02) * corePulse * (0.18 + response * 0.32);

  const int SPARKS = 24;
  for (int i = 0; i < SPARKS; i++) {
    float seed = float(i) + 19.0;
    float orbit = mix(shellRadius - 0.08, outerRadius + 0.05, hash11(seed * 3.1));
    float localAngle = hash11(seed * 7.4) * 6.2831853 + t * mix(-0.12, 0.18, hash11(seed * 2.2)) * (0.6 + uEffectParam2 * 1.4);
    vec2 sparkPos = vec2(cos(localAngle), sin(localAngle)) * orbit;
    float spark = exp(-pow(length(p - sparkPos) / mix(0.006, 0.02, hash11(seed * 5.6)), 2.0));
    float flicker = 0.35 + 0.65 * sin(t * mix(1.8, 4.6, hash11(seed * 11.2)) + seed * 17.0);
    color += mix(haloColor, irisColor, hash11(seed * 9.7)) * spark * flicker * (0.1 + audio * 0.4);
  }

  const int DUST = 32;
  for (int i = 0; i < DUST; i++) {
    float seed = float(i) + 97.0;
    vec2 dustPos = (hash21(seed * 4.7) * 2.0 - 1.0) * vec2(1.4, 0.95);
    dustPos *= rot(seed * 0.23 + t * 0.02);
    float dust = exp(-pow(length(p - dustPos) / mix(0.0025, 0.01, hash11(seed * 6.8)), 2.0));
    color += haloColor * dust * (0.015 + response * 0.08);
  }

  float vignette = smoothstep(1.35, 0.18, radius);
  color *= vignette;
  color = 1.0 - exp(-color * (1.1 + response * 0.9));
  color = pow(color, vec3(0.92));
  color = mix(bg, color, sat(uEffectStrength));

  gl_FragColor = vec4(color, 1.0);
}
