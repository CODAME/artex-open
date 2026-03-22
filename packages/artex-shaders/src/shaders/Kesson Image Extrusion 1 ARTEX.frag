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
vec4 tex2D(sampler2D s, vec2 uv) { return texture2D(s, uv); }
vec4 tex2D(sampler2D s, vec3 uv) { return texture2D(s, uv.xy); }
vec4 tex2D(sampler2D s, vec4 uv) { return texture2D(s, uv.xy); }

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
  vec2 distortion = vec2(
    (nx - 0.5) * uFlowIntensity * 0.15,
    (ny - 0.5) * uFlowIntensity * 0.15
  );
  return uv + distortion;
}

vec4 artex_blendStates(vec2 uv) {
  if (uUseStateBlending != 1) {
    return tex2D(uMainImage, uv);
  }

  if (uStateCount <= 1) {
    return tex2D(uStateA, uv);
  } else if (uStateCount == 2) {
    vec4 stateA = tex2D(uStateA, uv);
    vec4 stateB = tex2D(uStateB, uv);
    return mix(stateA, stateB, uBlendFactor);
  } else if (uStateCount == 3) {
    if (uBlendFactor < 0.5) {
      float t = uBlendFactor * 2.0;
      vec4 stateA = tex2D(uStateA, uv);
      vec4 stateB = tex2D(uStateB, uv);
      return mix(stateA, stateB, t);
    } else {
      float t = (uBlendFactor - 0.5) * 2.0;
      vec4 stateB = tex2D(uStateB, uv);
      vec4 stateC = tex2D(uStateC, uv);
      return mix(stateB, stateC, t);
    }
  } else if (uStateCount >= 4) {
    float third = 1.0 / 3.0;
    float twoThirds = 2.0 / 3.0;
    if (uBlendFactor < third) {
      float t = uBlendFactor * 3.0;
      vec4 stateA = tex2D(uStateA, uv);
      vec4 stateB = tex2D(uStateB, uv);
      return mix(stateA, stateB, t);
    } else if (uBlendFactor < twoThirds) {
      float t = (uBlendFactor - third) * 3.0;
      vec4 stateB = tex2D(uStateB, uv);
      vec4 stateC = tex2D(uStateC, uv);
      return mix(stateB, stateC, t);
    } else {
      float t = (uBlendFactor - twoThirds) * 3.0;
      vec4 stateC = tex2D(uStateC, uv);
      vec4 stateD = tex2D(uStateD, uv);
      return mix(stateC, stateD, t);
    }
  }

  return tex2D(uMainImage, uv);
}

vec4 artex_sampleMain(vec2 uv) {
  vec2 flowUv = artex_applyFlow(uv);
  return artex_blendStates(flowUv);
}

vec4 artex_sampleMain(float uv) {
  return artex_sampleMain(vec2(uv));
}

vec4 artex_sampleMain(vec3 uv) {
  return artex_sampleMain(uv.xy);
}

vec4 artex_sampleMain(vec4 uv) {
  return artex_sampleMain(uv.xy);
}

// Shadertoy raymarched "image extrusion" (heightfield solid)
// uMainImage = input image (sRGB). Brightness -> extrusion height.
//
// Tips:
// - Set uMainImage to "Clamp" (not repeat) for best borders.
// - Works best with non-noisy images (or increase the smoothing taps).

#define MAX_STEPS 160
#define MAX_DIST  12.0
#define SURF_EPS  0.0007

// --- user controls ---
float GET_HEIGHT() { return 1.25 * max(0.01, uEffectParam2 * 2.0); }   // extrusion amount
const float BASE_Z       = 0.0;    // bottom plane at z=0
const float DOMAIN_HALF  = 1.0;    // xy domain is [-DOMAIN_HALF, +DOMAIN_HALF]
const float GAMMA_FIX    = 2.2;    // for brightness from sRGB-ish images
const float SMOOTH_RAD   = 1.25;   // height smoothing in texels (0..2 is typical)

// --- utilities ---
float hash11(float p){ return fract(sin(p*127.1)*43758.5453123); }
float sat(float x){ return clamp(x, 0.0, 1.0); }

// IQ's 2D rotation
mat2 rot(float a){ float s=sin(a), c=cos(a); return mat2(c,-s,s,c); }

// Luminance (perceived)
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Slightly safer texture sampling (clamp UV)
vec3 tex0(vec2 uv){
    uv = clamp(uv, 0.0, 1.0);
    return artex_sampleMain( uv).rgb;
}

// Simple 9-tap Gaussian-ish smoothing in texel space (to avoid "steppy" artifacts)
// SMOOTH_RAD controls the footprint.
float heightFromImage(vec2 uv){
    uv = clamp(uv, 0.0, 1.0);

    // texel size
    vec2 px = 1.0 / iChannelResolution[0].xy;
    vec2 r  = px * SMOOTH_RAD;

    // 3x3 kernel weights (approx Gaussian)
    float w00 = 0.077847, w10 = 0.123317, w20 = 0.077847;
    float w01 = 0.123317, w11 = 0.195346, w21 = 0.123317;
    float w02 = 0.077847, w12 = 0.123317, w22 = 0.077847;

    vec2 o00 = vec2(-r.x, -r.y);
    vec2 o10 = vec2( 0.0, -r.y);
    vec2 o20 = vec2( r.x, -r.y);

    vec2 o01 = vec2(-r.x,  0.0);
    vec2 o11 = vec2( 0.0,  0.0);
    vec2 o21 = vec2( r.x,  0.0);

    vec2 o02 = vec2(-r.x,  r.y);
    vec2 o12 = vec2( 0.0,  r.y);
    vec2 o22 = vec2( r.x,  r.y);

    // sample + luminance
    float b00 = luma(tex0(uv + o00));
    float b10 = luma(tex0(uv + o10));
    float b20 = luma(tex0(uv + o20));

    float b01 = luma(tex0(uv + o01));
    float b11 = luma(tex0(uv + o11));
    float b21 = luma(tex0(uv + o21));

    float b02 = luma(tex0(uv + o02));
    float b12 = luma(tex0(uv + o12));
    float b22 = luma(tex0(uv + o22));

    float b =
        b00*w00 + b10*w10 + b20*w20 +
        b01*w01 + b11*w11 + b21*w21 +
        b02*w02 + b12*w12 + b22*w22;

    // approximate linearization for sRGB-ish inputs
    b = pow(sat(b), GAMMA_FIX);

    return b;
}

// Map world XY to image UV
vec2 worldToUV(vec2 xy){
    // domain [-DOMAIN_HALF..+DOMAIN_HALF] -> uv [0..1]
    return xy / (2.0*DOMAIN_HALF) + 0.5;
}

// Signed distance to the "extruded heightfield" solid:
// - xy bounded to a square domain
// - z in [BASE_Z .. BASE_Z + h(xy)]
float sdf(vec3 p){
    // XY bounds (a box in xy)
    float bx = abs(p.x) - DOMAIN_HALF;
    float by = abs(p.y) - DOMAIN_HALF;
    float bxy = max(bx, by);

    // Height from image (only meaningful inside domain)
    vec2 uv = worldToUV(p.xy);
    float h = GET_HEIGHT() * heightFromImage(uv);

    // Solid in z between bottom and top height
    float bottom = BASE_Z - p.z;          // inside when p.z >= BASE_Z
    float top    = p.z - (BASE_Z + h);    // inside when p.z <= BASE_Z + h
    float bz = max(top, bottom);

    // Intersection: inside both the xy bounds and z bounds
    return max(bxy, bz);
}

vec3 calcNormal(vec3 p){
    // Tetrahedral-ish finite diff for stability
    vec2 e = vec2(1.0, -1.0) * 0.5773 * 0.0016;
    return normalize(
        e.xyy * sdf(p + e.xyy) +
        e.yyx * sdf(p + e.yyx) +
        e.yxy * sdf(p + e.yxy) +
        e.xxx * sdf(p + e.xxx)
    );
}

float softShadow(vec3 ro, vec3 rd, float mint, float maxt){
    float res = 1.0;
    float t = mint;
    for(int i=0; i<64; i++){
        float h = sdf(ro + rd*t);
        if(h < 0.0003) return 0.0;
        res = min(res, 10.0*h/t);
        t += clamp(h, 0.01, 0.25);
        if(t > maxt) break;
    }
    return clamp(res, 0.0, 1.0);
}

float ambientOcclusion(vec3 p, vec3 n){
    float ao = 0.0;
    float sca = 1.0;
    for(int i=0; i<6; i++){
        float h = 0.03 + 0.08*float(i);
        float d = sdf(p + n*h);
        ao += (h - d) * sca;
        sca *= 0.7;
    }
    return clamp(1.0 - 1.2*ao, 0.0, 1.0);
}

bool raymarch(vec3 ro, vec3 rd, out float tHit, out vec3 pHit){
    float t = 0.0;

    // tiny dither to reduce banding
    float jitter = (hash11(dot(ro, vec3(12.7, 78.2, 37.7)) + uTime) - 0.5) * 0.002;
    t += max(0.0, jitter);

    for(int i=0; i<MAX_STEPS; i++){
        vec3 p = ro + rd*t;
        float d = sdf(p);

        if(d < SURF_EPS){
            tHit = t;
            pHit = p;
            return true;
        }

        // Safety clamp to avoid "overstepping" thin details and to prevent visible bugs
        float stepLen = clamp(d * 0.75, 0.003, 0.25);
        t += stepLen;

        if(t > MAX_DIST) break;
    }

    return false;
}

vec3 shade(vec3 ro, vec3 rd, vec3 p, vec3 n){
    // Texture color from image
    vec2 uv = worldToUV(p.xy);
    vec3 albedo = tex0(uv);

    // Key light
    vec3 ldir = normalize(vec3(0.55, 0.35, 0.75));
    float ndl  = max(dot(n, ldir), 0.0);

    float sh = softShadow(p + n*0.002, ldir, 0.02, 5.0);
    float ao = ambientOcclusion(p, n);

    // Spec
    vec3 h = normalize(ldir - rd);
    float spec = pow(max(dot(n, h), 0.0), 64.0) * 0.35;

    // Rim
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.0) * 0.25;

    // Slight height-based shading for depth read
    float height01 = sat((p.z - BASE_Z) / max(GET_HEIGHT(), 0.0001));
    float cavity = 0.6 + 0.4*smoothstep(0.0, 1.0, height01);

    vec3 col = vec3(0.0);

    // Ambient + diffuse + spec
    col += albedo * (0.14 * ao) * cavity;
    col += albedo * (ndl * sh) * 1.15 * max(0.01, uEffectParam3 * 2.0);
    col += spec * sh;
    col += rim * ao;

    // Mild fog
    float dist = length(p - ro);
    float fog = 1.0 - exp(-0.18*dist*dist);
    vec3 fogCol = vec3(0.02, 0.025, 0.03);
    col = mix(col, fogCol, fog);

    return col;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord){
    vec2 uv = (fragCoord - 0.5*uResolution.xy) / uResolution.y;

    // Camera orbit
    float t = uTime * 0.25 * max(0.01, uEffectParam1 * 2.0);
    float yaw = 0.8 + 0.4*sin(t*1.1);
    float pit = 0.55 + 0.15*sin(t*0.9);

    vec3 target = vec3(0.0, 0.0, 0.55);
    vec3 ro = vec3(0.0, -3.0, 1.35);

    // rotate camera around target
    ro.yz = rot(pit) * ro.yz;
    ro.xz = rot(yaw) * ro.xz;
    ro += target;

    // Camera basis
    vec3 ww = normalize(target - ro);
    vec3 uu = normalize(cross(vec3(0.0, 0.0, 1.0), ww));
    vec3 vv = cross(ww, uu);

    // Ray (slight perspective)
    vec3 rd = normalize(uu*uv.x + vv*uv.y + ww*1.6);

    // Raymarch
    float tHit;
    vec3 pHit;
    vec3 col;

    if(raymarch(ro, rd, tHit, pHit)){
        vec3 n = calcNormal(pHit);
        col = shade(ro, rd, pHit, n);
    }else{
        // Background
        float v = 0.5 + 0.5*uv.y;
        col = mix(vec3(0.01,0.012,0.015), vec3(0.03,0.035,0.04), v);
    }

    // Tonemap + gamma
    col = col / (1.0 + col);
    col = pow(col, vec3(1.0/2.2));
    col *= uEffectStrength;

    fragColor = vec4(col, 1.0);
}

void main() {
  vec4 fragColor;
  vec2 fragCoord = gl_FragCoord.xy;
  mainImage(fragColor, fragCoord);
  gl_FragColor = fragColor;
}
