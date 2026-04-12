// Sixteen Segment Display V4 ARTEX — LED text overlay on artwork
// Based on I.G.P. (glslsandbox.com/e#28623), rewritten for ARTEX compositing.
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
uniform float iTime;
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
uniform float uBassLevel;
uniform float uCameraLevel;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

uniform float uTime;
uniform vec2 uResolution;
uniform float uAudioLevel;
uniform float uProximity;
uniform float uEffectStrength;

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

// --- 16-segment display ---
const vec2 ch_size  = vec2(0.8, 0.8);
const vec2 ch_space = ch_size + vec2(0.4, 0.6);
const vec2 ch_start = vec2(ch_space.x * -11.0, 4.0);
vec2 ch_pos = vec2(0.0, 0.0);
vec3 ch_color = vec3(0.6, 1.7, 0.8);
vec2 uv;
float d = 1.0;

float dseg(vec2 p0, vec2 p1) {
  p0 *= ch_size;
  p1 *= ch_size;
  vec2 dir = normalize(p1 - p0);
  vec2 cp = (uv - ch_pos - p0) * mat2(dir.x, dir.y, -dir.y, dir.x);
  return 2.0 * distance(cp, clamp(cp, vec2(0), vec2(distance(p0, p1), 0)));
}

bool bit(int n, int b) {
  return mod(floor(float(n) / exp2(floor(float(b)))), 2.0) != 0.0;
}

void ddots(int n) {
  float v = 1.0;
  if (n == 0) v = min(v, dseg(vec2(-0.005, -1.000), vec2(0.000, -1.000)));
  else if (n == 1) {
    v = min(v, dseg(vec2(0.005, -1.000), vec2(0.000, -1.000)));
    v = min(v, dseg(vec2(0.005, 0.000), vec2(0.000, 0.000)));
  }
  ch_pos.x += ch_space.x;
  d = min(d, v);
}

void ddigit(int n) {
  float v = 1.0;
  if (bit(n,  0)) v = min(v, dseg(vec2( 0.500,  0.063), vec2( 0.500,  0.937)));
  if (bit(n,  1)) v = min(v, dseg(vec2( 0.438,  1.000), vec2( 0.063,  1.000)));
  if (bit(n,  2)) v = min(v, dseg(vec2(-0.063,  1.000), vec2(-0.438,  1.000)));
  if (bit(n,  3)) v = min(v, dseg(vec2(-0.500,  0.937), vec2(-0.500,  0.062)));
  if (bit(n,  4)) v = min(v, dseg(vec2(-0.500, -0.063), vec2(-0.500, -0.938)));
  if (bit(n,  5)) v = min(v, dseg(vec2(-0.438, -1.000), vec2(-0.063, -1.000)));
  if (bit(n,  6)) v = min(v, dseg(vec2( 0.063, -1.000), vec2( 0.438, -1.000)));
  if (bit(n,  7)) v = min(v, dseg(vec2( 0.500, -0.938), vec2( 0.500, -0.063)));
  if (bit(n,  8)) v = min(v, dseg(vec2( 0.063,  0.000), vec2( 0.438, -0.000)));
  if (bit(n,  9)) v = min(v, dseg(vec2( 0.063,  0.063), vec2( 0.438,  0.938)));
  if (bit(n, 10)) v = min(v, dseg(vec2( 0.000,  0.063), vec2( 0.000,  0.937)));
  if (bit(n, 11)) v = min(v, dseg(vec2(-0.063,  0.063), vec2(-0.438,  0.938)));
  if (bit(n, 12)) v = min(v, dseg(vec2(-0.438,  0.000), vec2(-0.063, -0.000)));
  if (bit(n, 13)) v = min(v, dseg(vec2(-0.063, -0.063), vec2(-0.438, -0.938)));
  if (bit(n, 14)) v = min(v, dseg(vec2( 0.000, -0.938), vec2( 0.000, -0.063)));
  if (bit(n, 15)) v = min(v, dseg(vec2( 0.063, -0.063), vec2( 0.438, -0.938)));
  ch_pos.x += ch_space.x;
  d = min(d, v);
}

#define n0 ddigit(0x22FF);
#define n1 ddigit(0x0281);
#define n2 ddigit(0x1177);
#define n3 ddigit(0x11E7);
#define n4 ddigit(0x5508);
#define n5 ddigit(0x11EE);
#define n6 ddigit(0x11FE);
#define n7 ddigit(0x2206);
#define n8 ddigit(0x11FF);
#define n9 ddigit(0x11EF);

#define A ddigit(0x119F);
#define B ddigit(0x927E);
#define C ddigit(0x007E);
#define D ddigit(0x44E7);
#define E ddigit(0x107E);
#define F ddigit(0x101E);
#define G ddigit(0x807E);
#define H ddigit(0x1199);
#define I ddigit(0x4466);
#define J ddigit(0x4436);
#define K ddigit(0x9218);
#define L ddigit(0x0078);
#define M ddigit(0x0A99);
#define N ddigit(0x8899);
#define O ddigit(0x00FF);
#define P ddigit(0x111F);
#define Q ddigit(0x80FF);
#define R ddigit(0x911F);
#define S ddigit(0x8866);
#define T ddigit(0x4406);
#define U ddigit(0x00F9);
#define V ddigit(0x2218);
#define W ddigit(0xA099);
#define X ddigit(0xAA00);
#define Y ddigit(0x4A00);
#define Z ddigit(0x2266);
#define s_dot     ddots(0);
#define s_ddot    ddots(1);
#define s_minus   ddigit(0x1100);
#define s_plus    ddigit(0x5500);
#define s_mult    ddigit(0xBB00);
#define s_div     ddigit(0x2200);
#define s_greater ddigit(0x2800);
#define s_less    ddigit(0x8200);
#define s_open    ddigit(0x003C);
#define s_close   ddigit(0x00C3);
#define s_sqrt    ddigit(0x0C02);
#define s_uline   ddigit(0x0060);
#define _  ch_pos.x += ch_space.x;
#define nl ch_pos.x = ch_start.x; ch_pos.y -= 3.0;

void showDigit(float dd) {
  if      (dd < 0.5) n0
  else if (dd < 1.5) n1
  else if (dd < 2.5) n2
  else if (dd < 3.5) n3
  else if (dd < 4.5) n4
  else if (dd < 5.5) n5
  else if (dd < 6.5) n6
  else if (dd < 7.5) n7
  else if (dd < 8.5) n8
  else if (dd < 9.5) n9
}

void showFloat(float value) {
  for (int ni = 4; ni > -3; ni--) {
    if (ni == -1) s_dot;
    float dd = mod(floor(value / pow(10.0, float(ni))), 10.0);
    showDigit(dd);
  }
}

void showInteger(int value) {
  bool startDisplay = false;
  float fv = float(value) / 10000.0;
  for (int ni = 5; ni > 0; ni--) {
    float dd = mod(floor(fv), 10.0);
    if ((dd > 1.0) || (ni == 1)) startDisplay = true;
    if (startDisplay) showDigit(dd);
    fv = fv * 10.0;
  }
}

void main() {
  vec2 baseUv = gl_FragCoord.xy / uResolution.xy;
  vec4 artwork = artex_sampleMain(baseUv);

  vec2 mouse = vec2(0.5 + 0.4 * uAudioLevel, 0.2 + 0.6 * uProximity);
  vec2 aspect = uResolution.xy / uResolution.y;
  uv = (gl_FragCoord.xy / uResolution.y) - aspect / 2.0;
  uv *= (20.0 + sin(uTime * max(0.01, uEffectParam1 * 2.0))) / max(0.01, uEffectParam3);
  vec2 mp = mouse * uResolution.xy;
  ch_pos = ch_start + vec2(sin(uTime * max(0.01, uEffectParam1 * 2.0) * max(0.01, uEffectParam2)), 4.0);

  ch_color = vec3(2.6 - 4.0 * mouse.x, 1.2 - mouse.x * mouse.y, 0.5 + mouse.y);
  n1 n6 s_minus S E G M E N T s_minus D I S P L A Y s_dot V n4 s_ddot nl
  A B C D E F G H I J K L M N O P Q R S T U V W X Y Z nl
  s_plus s_minus n0 n1 n2 n3 n4 n5 n6 n7 n8 n9 s_dot s_ddot s_uline s_less s_greater s_open s_close s_sqrt nl
  V I E W P O R T _ I S _ showInteger(int(uResolution.x)); _ s_mult _ showInteger(int(uResolution.y)); nl
  R U N T I M E s_ddot showFloat(uTime); _ S E C O N D S nl
  M O U S E _ P O S I T I O N _ showInteger(int(mp.x)); s_mult showInteger(int(mp.y));

  // Neon glow from segments
  vec3 neonGlow = mix(vec3(0.0), ch_color, 1.0 - clamp(0.08 / d, 0.0, 1.0));
  float glowMask = 1.0 - smoothstep(0.0, 0.12, d);

  // Direct neon: bright on segments, fading outward (for standalone rendering)
  float segmentBright = clamp(0.06 / max(d, 0.001), 0.0, 1.0);
  float segmentGlow = exp(-8.0 * d);
  vec3 directNeon = ch_color * (segmentBright + segmentGlow * 0.6);

  // Composite: neon text overlaid on artwork (or dark background when standalone)
  float strength = clamp(uEffectStrength, 0.0, 1.0);
  float mediaPresence = smoothstep(0.0, 0.05, artwork.a);

  // Standalone: dark background with bright neon segments
  vec3 standalone = vec3(0.01, 0.01, 0.02);
  standalone += directNeon * strength;
  standalone += directNeon * uAudioLevel * 0.3 * strength;

  // With media: darken behind text, add neon on top (original additive formula)
  vec3 withMedia = artwork.rgb * (1.0 - glowMask * 0.3 * strength);
  withMedia += neonGlow * strength * glowMask;
  withMedia += neonGlow * uAudioLevel * 0.3 * strength * glowMask;

  vec3 col = mix(standalone, withMedia, mediaPresence);

  gl_FragColor = vec4(col, max(artwork.a, strength * (1.0 - mediaPresence)));
}
