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
// Front camera + proper top-right lighting + soft shadows
//
// Compile cost (#3842): on Windows, ANGLE hands this to Microsoft's FXC,
// which inlines every call site. sdf() carries the 9-tap image blur, so each
// call site costs a full artex_sampleMain copy. Every distance query of the
// frame (march, normal, shadow, AO) goes through the single sdf() call in
// traceScene(), so FXC compiles it once. The arithmetic and its order are
// unchanged; only the call structure moved.

#define MAX_STEPS 180
#define MAX_DIST  12.0
#define SURF_EPS  0.0006

float GET_HEIGHT() { return 1.25 * max(0.01, uEffectParam1 * 2.0); }
const float BASE_Z       = 0.0;
const float DOMAIN_HALF  = 1.0;
const float GAMMA_FIX    = 2.2;
float GET_SMOOTH() { return 1.25 * max(0.01, uEffectParam2 * 2.0); }

float sat(float x){ return clamp(x, 0.0, 1.0); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

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

float heightFromImage(vec2 uv){

    uv = clamp(uv, 0.0, 1.0);

    vec2 px = 1.0 / iChannelResolution[0].xy;
    vec2 r  = px * GET_SMOOTH();

    float b = 0.0;
    float w = 0.0;

    for(int y=-1;y<=1;y++)
    for(int x=-1;x<=1;x++){
        vec2 off = vec2(x,y)*r;
        float weight = 1.0 - 0.3*length(vec2(x,y));
        b += luma(tex0(uv+off))*weight;
        w += weight;
    }

    b /= w;
    b = pow(sat(b), GAMMA_FIX);
    return b;
}

vec2 worldToUV(vec2 xy){
    return xy / (2.0*DOMAIN_HALF) + 0.5;
}

float sdf(vec3 p){

    float bx = abs(p.x) - DOMAIN_HALF;
    float by = abs(p.y) - DOMAIN_HALF;
    float bxy = max(bx, by);

    vec2 uv = worldToUV(p.xy);
    float h = GET_HEIGHT() * heightFromImage(uv);

    float bottom = BASE_Z - p.z;
    float top    = p.z - (BASE_Z + h);
    float bz = max(top, bottom);

    return max(bxy, bz);
}

// Top-right-front light
vec3 keyLight(){ return normalize(vec3(0.8, 0.9, 0.6)); }

// Central-difference normal taps: +x, -x, +y, -y, +z, -z
vec3 normalTapDir(int i){
    vec3 axis = i < 2 ? vec3(1.0, 0.0, 0.0) : (i < 4 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0));
    return (i == 0 || i == 2 || i == 4) ? axis : -axis;
}

// Query phases, in the order the shading needs them.
#define PHASE_MARCH  0   // primary ray
#define PHASE_NORMAL 1   // 6 normal taps
#define PHASE_SHADOW 2   // soft shadow toward the key light
#define PHASE_AO     3   // 6 ambient occlusion taps
#define NORMAL_TAPS  6
#define SHADOW_STEPS 60
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
    float e = 0.0012;

    int phase = PHASE_MARCH;
    int k = 0;     // step within the current phase

    float t = 0.0;         // primary march
    vec3 nAcc = vec3(0.0); // normal
    vec3 sro = vec3(0.0);  // soft shadow
    float st = 0.02;
    float res = 1.0;
    float ao = 0.0;        // ambient occlusion
    float sca = 1.0;

    for(int i=0; i<MAX_STEPS + NORMAL_TAPS + SHADOW_STEPS + AO_TAPS; i++){
        vec3 q;
        if(phase == PHASE_MARCH)       q = ro + rd*t;
        else if(phase == PHASE_NORMAL) q = tr.p + normalTapDir(k)*e;
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
                t += clamp(d*0.6, 0.002, 0.2);
                k++;
                if(t > MAX_DIST || k >= MAX_STEPS) break;   // miss
            }
        }else if(phase == PHASE_NORMAL){
            nAcc += normalTapDir(k) * d;
            k++;
            if(k == NORMAL_TAPS){
                tr.n = normalize(nAcc);
                sro = tr.p + tr.n*0.002;
                phase = PHASE_SHADOW;
                k = 0;
            }
        }else if(phase == PHASE_SHADOW){
            bool shadowDone = false;
            if(d < 0.0004){
                tr.sh = 0.0;
                shadowDone = true;
            }else{
                res = min(res, 8.0*d/st);
                st += clamp(d*0.7, 0.01, 0.25);
                k++;
                if(st > 6.0 || k >= SHADOW_STEPS){
                    tr.sh = clamp(res,0.0,1.0);
                    shadowDone = true;
                }
            }
            if(shadowDone){
                phase = PHASE_AO;
                k = 0;
            }
        }else{
            float h = 0.03 + 0.08*float(k);
            ao += (h - d)*sca;
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

vec3 shade(vec3 ro, vec3 rd, vec3 p, vec3 n, float shadow, float ao){

    vec2 uv = worldToUV(p.xy);
    vec3 albedo = tex0(uv);

    // Top-right-front light
    vec3 ldir = keyLight();

    float ndl = max(dot(n, ldir), 0.0);

    vec3 h = normalize(ldir - rd);
    float spec = pow(max(dot(n,h),0.0),64.0)*0.35;
    float rim = pow(1.0 - max(dot(n,-rd),0.0),2.0)*0.25;

    float height01 = sat((p.z - BASE_Z)/GET_HEIGHT());
    float cavity = 0.6 + 0.4*smoothstep(0.0,1.0,height01);

    vec3 col = vec3(0.0);

    col += albedo * 0.12 * ao * cavity;       // ambient
    col += albedo * ndl * shadow * 1.4 * max(0.01, uEffectParam3 * 2.0);       // lit
    col += spec * shadow;                     // spec
    col += rim * ao;                          // rim

    float dist = length(p - ro);
    float fog = 1.0 - exp(-0.18*dist*dist);
    vec3 fogCol = vec3(0.02,0.025,0.03);
    col = mix(col, fogCol, fog);

    return col;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord){

    vec2 uv = (fragCoord - 0.5*uResolution.xy)/uResolution.y;

    // FRONT CAMERA
    vec3 ro = vec3(0.0, 0.0, 3.0);
    vec3 target = vec3(0.0, 0.0, 0.0);

    vec3 ww = normalize(target - ro);
    vec3 uu = normalize(cross(vec3(0.0,1.0,0.0), ww));
    vec3 vv = cross(ww, uu);

    vec3 rd = normalize(uu*uv.x + vv*uv.y + ww*1.8);

    // Raymarch + normal + shadow + AO
    Trace tr = traceScene(ro, rd);
    vec3 col;

    if(tr.hit){
        col = shade(ro, rd, tr.p, tr.n, tr.sh, tr.ao);
    }
    else{
        float v = 0.5 + 0.5*uv.y;
        col = mix(vec3(0.01,0.012,0.015), vec3(0.03,0.035,0.04), v);
    }

    col = col/(1.0+col);
    col = pow(col,vec3(1.0/2.2));

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
