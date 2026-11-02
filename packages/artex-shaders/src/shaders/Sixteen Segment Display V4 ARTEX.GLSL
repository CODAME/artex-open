// Sixteen Segment Display V4 ARTEX — LED text overlay on artwork
// Based on I.G.P. (glslsandbox.com/e#28623), rewritten for ARTEX compositing.
precision mediump float;
const float uMood = 0.5;
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

highp float artex_hash(highp vec2 p) {
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

// The code arrives as two bytes, low and high: under precision mediump a
// GPU may hold ints and floats in 16 bits (Mali, Adreno), where a whole code
// like 0x119F does not survive float() (fp16 is exact only to 2048) and codes
// from 0x8000 wrap negative. Each byte is at most 255, exact everywhere.
void ddigit(int lo, int hi) {
  float v = 1.0;
  if (bit(lo, 0)) v = min(v, dseg(vec2( 0.500,  0.063), vec2( 0.500,  0.937)));
  if (bit(lo, 1)) v = min(v, dseg(vec2( 0.438,  1.000), vec2( 0.063,  1.000)));
  if (bit(lo, 2)) v = min(v, dseg(vec2(-0.063,  1.000), vec2(-0.438,  1.000)));
  if (bit(lo, 3)) v = min(v, dseg(vec2(-0.500,  0.937), vec2(-0.500,  0.062)));
  if (bit(lo, 4)) v = min(v, dseg(vec2(-0.500, -0.063), vec2(-0.500, -0.938)));
  if (bit(lo, 5)) v = min(v, dseg(vec2(-0.438, -1.000), vec2(-0.063, -1.000)));
  if (bit(lo, 6)) v = min(v, dseg(vec2( 0.063, -1.000), vec2( 0.438, -1.000)));
  if (bit(lo, 7)) v = min(v, dseg(vec2( 0.500, -0.938), vec2( 0.500, -0.063)));
  if (bit(hi, 0)) v = min(v, dseg(vec2( 0.063,  0.000), vec2( 0.438, -0.000)));
  if (bit(hi, 1)) v = min(v, dseg(vec2( 0.063,  0.063), vec2( 0.438,  0.938)));
  if (bit(hi, 2)) v = min(v, dseg(vec2( 0.000,  0.063), vec2( 0.000,  0.937)));
  if (bit(hi, 3)) v = min(v, dseg(vec2(-0.063,  0.063), vec2(-0.438,  0.938)));
  if (bit(hi, 4)) v = min(v, dseg(vec2(-0.438,  0.000), vec2(-0.063, -0.000)));
  if (bit(hi, 5)) v = min(v, dseg(vec2(-0.063, -0.063), vec2(-0.438, -0.938)));
  if (bit(hi, 6)) v = min(v, dseg(vec2( 0.000, -0.938), vec2( 0.000, -0.063)));
  if (bit(hi, 7)) v = min(v, dseg(vec2( 0.063, -0.063), vec2( 0.438, -0.938)));
  ch_pos.x += ch_space.x;
  d = min(d, v);
}

// Segment codes. Each bit lights one of the 16 segments (see ddigit()).
// LO/HI split a literal code into its bytes at compile time, so no whole
// code ever reaches a (possibly 16-bit) register; see ddigit().
#define LO(c) ((c) - ((c) / 256) * 256)
#define HI(c) ((c) / 256)
#define DIGIT_0 0x22FF
#define DIGIT_1 0x0281
#define DIGIT_2 0x1177
#define DIGIT_3 0x11E7
#define DIGIT_4 0x5508
#define DIGIT_5 0x11EE
#define DIGIT_6 0x11FE
#define DIGIT_7 0x2206
#define DIGIT_8 0x11FF
#define DIGIT_9 0x11EF
#define G_A 0x119F
#define G_B 0x927E
#define G_C 0x007E
#define G_D 0x44E7
#define G_E 0x107E
#define G_F 0x101E
#define G_G 0x807E
#define G_H 0x1199
#define G_I 0x4466
#define G_J 0x4436
#define G_K 0x9218
#define G_L 0x0078
#define G_M 0x0A99
#define G_N 0x8899
#define G_O 0x00FF
#define G_P 0x111F
#define G_Q 0x80FF
#define G_R 0x911F
#define G_S 0x8866
#define G_T 0x4406
#define G_U 0x00F9
#define G_V 0x2218
#define G_W 0xA099
#define G_X 0xAA00
#define G_Y 0x4A00
#define G_Z 0x2266
#define G_MINUS 0x1100
#define G_PLUS 0x5500
#define G_MULT 0xBB00
#define G_DIV 0x2200
#define G_GREATER 0x2800
#define G_LESS 0x8200
#define G_OPEN 0x003C
#define G_CLOSE 0x00C3
#define G_SQRT 0x0C02
#define G_ULINE 0x0060
#define s_dot ddots(0);

// Compile cost (#3842): on Windows, ANGLE hands this to Microsoft's FXC,
// which inlines every ddigit() call. showDigit() used to branch to ten
// different ddigit() calls, and the digit loops below unrolled, so the
// numbers alone compiled ~270 ddigit() bodies. It now looks the code up and
// makes one call, and the digit loops carry loopMarker() so ANGLE emits
// them as [loop]: WebGL1 forbids uniform loop bounds, the usual way to stop
// FXC unrolling, and ANGLE only marks a loop [loop] when a texture read sits
// in it. The marker adds exactly 0.0, so the image is unchanged.
float loopMarker() {
  return texture2D(uMainImage, vec2(0.5)).a * 0.0;
}

// High byte of a digit's segment code (low byte in lo), or -1 to draw
// nothing (and not advance).
#define GLYPH(c) { lo = LO(c); return HI(c); }
int digitCode(float dd, out int lo) {
  lo = 0;
  if      (dd < 0.5) GLYPH(DIGIT_0)
  else if (dd < 1.5) GLYPH(DIGIT_1)
  else if (dd < 2.5) GLYPH(DIGIT_2)
  else if (dd < 3.5) GLYPH(DIGIT_3)
  else if (dd < 4.5) GLYPH(DIGIT_4)
  else if (dd < 5.5) GLYPH(DIGIT_5)
  else if (dd < 6.5) GLYPH(DIGIT_6)
  else if (dd < 7.5) GLYPH(DIGIT_7)
  else if (dd < 8.5) GLYPH(DIGIT_8)
  else if (dd < 9.5) GLYPH(DIGIT_9)
  return -1;
}

void showDigit(float dd) {
  int lo;
  int hi = digitCode(dd, lo);
  if (hi >= 0) ddigit(lo, hi);
}

void showFloat(float value) {
  for (int ni = 4; ni > -3; ni--) {
    if (ni == -1) s_dot;
    float dd = mod(floor(value / pow(10.0, float(ni))), 10.0) + loopMarker();
    showDigit(dd);
  }
}

void showInteger(int value) {
  bool startDisplay = false;
  float fv = float(value) / 10000.0;
  for (int ni = 5; ni > 0; ni--) {
    float dd = mod(floor(fv), 10.0) + loopMarker();
    if ((dd > 1.0) || (ni == 1)) startDisplay = true;
    if (startDisplay) showDigit(dd);
    fv = fv * 10.0;
  }
}

// Compile cost (#3842): each glyph macro used to expand to its own ddigit()
// call, ~120 inlined copies in main() alone. The static text is now a token
// list drawn by drawText() loops (marked [loop] by loopMarker()), and the live
// numbers are drawn between the runs, ~10 ddigit() bodies in all. Tokens run
// in the original order, so the glyph positions are unchanged.
//
// Trade-off, measured: on GPUs this draws faster than the unrolled text
// (Apple M1 ~15 vs ~18 ms). CPU rasterizers (WARP, SwiftShader) run every
// branch of a loop body on every iteration, and a run-time glyph code tests
// all 16 segments, so frames there cost ~4x the unrolled text. The numbers
// stay out of the loop because inside it they made that ~8x worse.
const int TK_SPACE = -1;
const int TK_NEWLINE = -2;
const int TK_DOT = -3;
const int TK_COLON = -4;
const int TK_NUMBER = -5;   // a live number, drawn by main() between runs
#define TEXT_RUN_MAX 83     // longest drawText() run (tokens 0..82)

// Token i of the text, in drawing order: the high byte of a segment code
// (low byte in lo), or a negative TK_*.
int textToken(int i, out int lo) {
  lo = 0;
  // n1 n6 s_minus S E G M E N T s_minus D I S P L A Y s_dot V n4 s_ddot nl
  if (i <= 22) {
    if (i == 0) GLYPH(DIGIT_1)
    if (i == 1) GLYPH(DIGIT_6)
    if (i == 2) GLYPH(G_MINUS)
    if (i == 3) GLYPH(G_S)
    if (i == 4) GLYPH(G_E)
    if (i == 5) GLYPH(G_G)
    if (i == 6) GLYPH(G_M)
    if (i == 7) GLYPH(G_E)
    if (i == 8) GLYPH(G_N)
    if (i == 9) GLYPH(G_T)
    if (i == 10) GLYPH(G_MINUS)
    if (i == 11) GLYPH(G_D)
    if (i == 12) GLYPH(G_I)
    if (i == 13) GLYPH(G_S)
    if (i == 14) GLYPH(G_P)
    if (i == 15) GLYPH(G_L)
    if (i == 16) GLYPH(G_A)
    if (i == 17) GLYPH(G_Y)
    if (i == 18) return TK_DOT;
    if (i == 19) GLYPH(G_V)
    if (i == 20) GLYPH(DIGIT_4)
    if (i == 21) return TK_COLON;
    return TK_NEWLINE;
  }
  // A B C D E F G H I J K L M N O P Q R S T U V W X Y Z nl
  if (i <= 49) {
    if (i == 23) GLYPH(G_A)
    if (i == 24) GLYPH(G_B)
    if (i == 25) GLYPH(G_C)
    if (i == 26) GLYPH(G_D)
    if (i == 27) GLYPH(G_E)
    if (i == 28) GLYPH(G_F)
    if (i == 29) GLYPH(G_G)
    if (i == 30) GLYPH(G_H)
    if (i == 31) GLYPH(G_I)
    if (i == 32) GLYPH(G_J)
    if (i == 33) GLYPH(G_K)
    if (i == 34) GLYPH(G_L)
    if (i == 35) GLYPH(G_M)
    if (i == 36) GLYPH(G_N)
    if (i == 37) GLYPH(G_O)
    if (i == 38) GLYPH(G_P)
    if (i == 39) GLYPH(G_Q)
    if (i == 40) GLYPH(G_R)
    if (i == 41) GLYPH(G_S)
    if (i == 42) GLYPH(G_T)
    if (i == 43) GLYPH(G_U)
    if (i == 44) GLYPH(G_V)
    if (i == 45) GLYPH(G_W)
    if (i == 46) GLYPH(G_X)
    if (i == 47) GLYPH(G_Y)
    if (i == 48) GLYPH(G_Z)
    return TK_NEWLINE;
  }
  // s_plus s_minus n0 n1 n2 n3 n4 n5 n6 n7 n8 n9 s_dot s_ddot s_uline s_less s_greater s_open s_close s_sqrt nl
  if (i <= 70) {
    if (i == 50) GLYPH(G_PLUS)
    if (i == 51) GLYPH(G_MINUS)
    if (i == 52) GLYPH(DIGIT_0)
    if (i == 53) GLYPH(DIGIT_1)
    if (i == 54) GLYPH(DIGIT_2)
    if (i == 55) GLYPH(DIGIT_3)
    if (i == 56) GLYPH(DIGIT_4)
    if (i == 57) GLYPH(DIGIT_5)
    if (i == 58) GLYPH(DIGIT_6)
    if (i == 59) GLYPH(DIGIT_7)
    if (i == 60) GLYPH(DIGIT_8)
    if (i == 61) GLYPH(DIGIT_9)
    if (i == 62) return TK_DOT;
    if (i == 63) return TK_COLON;
    if (i == 64) GLYPH(G_ULINE)
    if (i == 65) GLYPH(G_LESS)
    if (i == 66) GLYPH(G_GREATER)
    if (i == 67) GLYPH(G_OPEN)
    if (i == 68) GLYPH(G_CLOSE)
    if (i == 69) GLYPH(G_SQRT)
    return TK_NEWLINE;
  }
  // V I E W P O R T _ I S _ showInteger(int(uResolution.x)); _ s_mult _ showInteger(int(uResolution.y)); nl
  if (i <= 88) {
    if (i == 71) GLYPH(G_V)
    if (i == 72) GLYPH(G_I)
    if (i == 73) GLYPH(G_E)
    if (i == 74) GLYPH(G_W)
    if (i == 75) GLYPH(G_P)
    if (i == 76) GLYPH(G_O)
    if (i == 77) GLYPH(G_R)
    if (i == 78) GLYPH(G_T)
    if (i == 79) return TK_SPACE;
    if (i == 80) GLYPH(G_I)
    if (i == 81) GLYPH(G_S)
    if (i == 82) return TK_SPACE;
    if (i == 83) return TK_NUMBER;
    if (i == 84) return TK_SPACE;
    if (i == 85) GLYPH(G_MULT)
    if (i == 86) return TK_SPACE;
    if (i == 87) return TK_NUMBER;
    return TK_NEWLINE;
  }
  // R U N T I M E s_ddot showFloat(uTime); _ S E C O N D S nl
  if (i <= 106) {
    if (i == 89) GLYPH(G_R)
    if (i == 90) GLYPH(G_U)
    if (i == 91) GLYPH(G_N)
    if (i == 92) GLYPH(G_T)
    if (i == 93) GLYPH(G_I)
    if (i == 94) GLYPH(G_M)
    if (i == 95) GLYPH(G_E)
    if (i == 96) return TK_COLON;
    if (i == 97) return TK_NUMBER;
    if (i == 98) return TK_SPACE;
    if (i == 99) GLYPH(G_S)
    if (i == 100) GLYPH(G_E)
    if (i == 101) GLYPH(G_C)
    if (i == 102) GLYPH(G_O)
    if (i == 103) GLYPH(G_N)
    if (i == 104) GLYPH(G_D)
    if (i == 105) GLYPH(G_S)
    return TK_NEWLINE;
  }
  // M O U S E _ P O S I T I O N _ showInteger(int(mp.x)); s_mult showInteger(int(mp.y));
  {
    if (i == 107) GLYPH(G_M)
    if (i == 108) GLYPH(G_O)
    if (i == 109) GLYPH(G_U)
    if (i == 110) GLYPH(G_S)
    if (i == 111) GLYPH(G_E)
    if (i == 112) return TK_SPACE;
    if (i == 113) GLYPH(G_P)
    if (i == 114) GLYPH(G_O)
    if (i == 115) GLYPH(G_S)
    if (i == 116) GLYPH(G_I)
    if (i == 117) GLYPH(G_T)
    if (i == 118) GLYPH(G_I)
    if (i == 119) GLYPH(G_O)
    if (i == 120) GLYPH(G_N)
    if (i == 121) return TK_SPACE;
    if (i == 122) return TK_NUMBER;
    if (i == 123) GLYPH(G_MULT)
    return TK_NUMBER;
  }
}

// Draw tokens first..last of the text (never a TK_NUMBER).
void drawText(int first, int last) {
  for (int k = 0; k < TEXT_RUN_MAX; k++) {
    int i = first + k;
    if (i > last) break;
    int lo;
    int code = textToken(i, lo);
    d += loopMarker();
    if (code >= 0) ddigit(lo, code);
    else if (code == TK_SPACE) ch_pos.x += ch_space.x;
    else if (code == TK_NEWLINE) { ch_pos.x = ch_start.x; ch_pos.y -= 3.0; }
    else if (code == TK_DOT) ddots(0);
    else if (code == TK_COLON) ddots(1);
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
  // Static runs of the token list, with the live numbers drawn in between.
  drawText(0, 82);                            // ... VIEWPORT IS_
  showInteger(int(uResolution.x));
  ch_pos.x += ch_space.x; ddigit(LO(G_MULT), HI(G_MULT)); ch_pos.x += ch_space.x;
  showInteger(int(uResolution.y));
  drawText(88, 96);                           // nl RUNTIME:
  showFloat(uTime);
  drawText(98, 121);                          // _SECONDS nl MOUSE_POSITION_
  showInteger(int(mp.x));
  ddigit(LO(G_MULT), HI(G_MULT));
  showInteger(int(mp.y));

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
