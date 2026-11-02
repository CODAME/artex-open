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
//
// Compile cost (#3842): on Windows, ANGLE hands this to Microsoft's FXC,
// which inlines every call site. sdf() carries the 9-tap image blur, so each
// call site costs nine full artex_sampleMain copies. The blur is a loop and
// every distance query of the frame (march, normal, shadow, AO) goes through
// the single sdf() call in traceScene(), so FXC compiles the blur once. The
// arithmetic and its order are unchanged; only the call structure moved.

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
    vec4 s = artex_sampleMain(uv);
    // If no media loaded, generate procedural color/height
    if (s.a < 0.01) {
        float n1 = artex_noise(uv * 8.0 + vec2(uTime * 0.1));
        float n2 = artex_noise(uv * 4.0 + vec2(0.0, uTime * 0.07));
        float n3 = artex_noise(uv * 12.0);
        return vec3(
            0.3 + 0.4 * n1,
            0.25 + 0.35 * n2,
            0.35 + 0.4 * n3
        );
    }
    return s.rgb;
}

// Simple 9-tap Gaussian-ish smoothing in texel space (to avoid "steppy" artifacts)
// SMOOTH_RAD controls the footprint. Rows run -y..+y, columns -x..+x: the
// same taps, weights and summation order as the original unrolled sum.
float heightFromImage(vec2 uv){
    uv = clamp(uv, 0.0, 1.0);

    // texel size
    vec2 px = 1.0 / iChannelResolution[0].xy;
    vec2 r  = px * SMOOTH_RAD;

    float b = 0.0;
    for(int y=-1; y<=1; y++)
    for(int x=-1; x<=1; x++){
        // 3x3 kernel weights (approx Gaussian): centre, edge, corner
        float w = (x == 0 && y == 0) ? 0.195346
                : ((x == 0 || y == 0) ? 0.123317 : 0.077847);
        b += luma(tex0(uv + vec2(float(x), float(y)) * r)) * w;
    }

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

// Key light
vec3 keyLight(){ return normalize(vec3(0.55, 0.35, 0.75)); }

// Tetrahedral-ish finite diff taps for stability: e.xyy, e.yyx, e.yxy, e.xxx
vec3 normalTap(int i){
    vec2 e = vec2(1.0, -1.0) * 0.5773 * 0.0016;
    if(i == 0) return e.xyy;
    if(i == 1) return e.yyx;
    if(i == 2) return e.yxy;
    return e.xxx;
}

// Query phases, in the order the shading needs them.
#define PHASE_MARCH  0   // primary ray
#define PHASE_NORMAL 1   // 4 normal taps
#define PHASE_SHADOW 2   // soft shadow toward the key light
#define PHASE_AO     3   // 6 ambient occlusion taps
#define NORMAL_TAPS  4
#define SHADOW_STEPS 64
#define AO_TAPS      6

struct Trace {
    bool hit;
    vec3 p;      // hit point
    vec3 n;      // surface normal
    float sh;    // soft shadow
    float ao;    // ambient occlusion
};

// Primary march, normal, soft shadow and AO, each step one sdf() query.
// Every phase steps exactly as its own loop did; the loop bound is the sum
// of the phase maxima, so no phase is ever cut short.
Trace traceScene(vec3 ro, vec3 rd){
    Trace tr = Trace(false, vec3(0.0), vec3(0.0), 1.0, 1.0);
    vec3 ldir = keyLight();

    int phase = PHASE_MARCH;
    int k = 0;     // step within the current phase

    // primary march; tiny dither to reduce banding
    float jitter = (hash11(dot(ro, vec3(12.7, 78.2, 37.7)) + uTime) - 0.5) * 0.002;
    float t = 0.0 + max(0.0, jitter);
    // normal
    vec3 nAcc = vec3(0.0);
    // soft shadow
    vec3 sro = vec3(0.0);
    float st = 0.02;
    float res = 1.0;
    // ambient occlusion
    float ao = 0.0;
    float sca = 1.0;

    for(int i=0; i<MAX_STEPS + NORMAL_TAPS + SHADOW_STEPS + AO_TAPS; i++){
        vec3 q;
        if(phase == PHASE_MARCH)       q = ro + rd*t;
        else if(phase == PHASE_NORMAL) q = tr.p + normalTap(k);
        else if(phase == PHASE_SHADOW) q = sro + ldir*st;
        else                           q = tr.p + tr.n*(0.03 + 0.08*float(k));

        float d = sdf(q);

        if(phase == PHASE_MARCH){
            if(d < SURF_EPS){
                tr.hit = true;
                tr.p = q;
                phase = PHASE_NORMAL;
                k = 0;
            }else{
                // Safety clamp to avoid "overstepping" thin details and to prevent visible bugs
                t += clamp(d * 0.75, 0.003, 0.25);
                k++;
                if(t > MAX_DIST || k >= MAX_STEPS) break;   // miss
            }
        }else if(phase == PHASE_NORMAL){
            nAcc += normalTap(k) * d;
            k++;
            if(k == NORMAL_TAPS){
                tr.n = normalize(nAcc);
                sro = tr.p + tr.n*0.002;
                phase = PHASE_SHADOW;
                k = 0;
            }
        }else if(phase == PHASE_SHADOW){
            bool shadowDone = false;
            if(d < 0.0003){
                tr.sh = 0.0;
                shadowDone = true;
            }else{
                res = min(res, 10.0*d/st);
                st += clamp(d, 0.01, 0.25);
                k++;
                if(st > 5.0 || k >= SHADOW_STEPS){
                    tr.sh = clamp(res, 0.0, 1.0);
                    shadowDone = true;
                }
            }
            if(shadowDone){
                phase = PHASE_AO;
                k = 0;
            }
        }else{
            float h = 0.03 + 0.08*float(k);
            ao += (h - d) * sca;
            sca *= 0.7;
            k++;
            if(k == AO_TAPS){
                tr.ao = clamp(1.0 - 1.2*ao, 0.0, 1.0);
                break;
            }
        }
    }
    return tr;
}

vec3 shade(vec3 ro, vec3 rd, vec3 p, vec3 n, float sh, float ao){
    // Texture color from image
    vec2 uv = worldToUV(p.xy);
    vec3 albedo = tex0(uv);

    // Key light
    vec3 ldir = keyLight();
    float ndl  = max(dot(n, ldir), 0.0);

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

    // Raymarch + normal + shadow + AO
    Trace tr = traceScene(ro, rd);
    vec3 col;

    if(tr.hit){
        col = shade(ro, rd, tr.p, tr.n, tr.sh, tr.ao);
    }else{
        // Background
        float v = 0.5 + 0.5*uv.y;
        col = mix(vec3(0.01,0.012,0.015), vec3(0.03,0.035,0.04), v);
    }

    // Tonemap + gamma
    col = col / (1.0 + col);
    col = pow(col, vec3(1.0/2.2));

    // mediaPresence crossfade for standalone mode
    vec2 baseUv = fragCoord / uResolution.xy;
    vec4 artworkCheck = artex_sampleMain(baseUv);
    float mediaPresence = smoothstep(0.0, 0.05, artworkCheck.a);
    col *= uEffectStrength;
    fragColor = vec4(col, max(artworkCheck.a, uEffectStrength * (1.0 - mediaPresence)));
}

void main() {
  vec4 fragColor;
  vec2 fragCoord = gl_FragCoord.xy;
  mainImage(fragColor, fragCoord);
  gl_FragColor = fragColor;
}
