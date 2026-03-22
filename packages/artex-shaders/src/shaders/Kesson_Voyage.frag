precision mediump float;

#define RAYMARCH_MAX_STEPS 150
#define RAYMARCH_MAX_DIST 20.
#define RAYMARCH_SURFACE_DIST 0.00001
#define SPEED 0.25
#define ROTSPEED 0.15
#define CAMDIST 4.0
#define colorB vec3(0.1, 0.72, 1.0)

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

float origgsize = 0.5;
float fov = 1.0;

float tmpo = 0.0;
float trianglesBeams = 0.0;

mat2 rotate(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

float repeat(float p, float s) {
    return (fract(p / s - 0.5) - 0.5) * s;
}

vec3 tunnel(vec3 p) {
    vec3 off = vec3(0.0);
    float dd = p.z * 0.005;  // linear — no floor/smoothstep stepping
    dd *= 20.1;
    dd += uTime * 0.25;
    off.x += sin(dd) * 6.0;
    off.y = sin(dd * 0.7) * 6.0;
    return off;
}

vec3 navigate(vec3 p) {
    p += tunnel(p);
    p.xy *= rotate((p.z * ROTSPEED) + (uTime * ROTSPEED));
    p.y -= 0.3;
    return p;
}

float sdGyroid(vec3 p, float scale, float thickness, float bias, float lx, float ly) {
    vec3 p2 = p;
    p2 *= scale;
    p2.z = sin(p2.z);
    p2.z += 10.0;
    float ls = max(lx, ly);
    float gyroid = abs(dot(sin(p2 * lx), cos(p2.zxy * ly)) - bias) / (scale * ls) - thickness;
    return gyroid;
}

float smin(float a, float b, float h) {
    float k = clamp((a - b) / h * 0.5 + 0.5, 0.0, 1.0);
    return mix(a, b, k) - k * (1.0 - k) * h;
}

float sdTriPrism(vec3 p, vec2 h) {
    vec3 q = abs(p);
    return max(q.z - h.y, max(q.x * 0.866025 + p.y * 0.5, -p.y) - h.x * 0.5);
}

// Returns a pseudo-random vec2 in [0, 1] from a float seed in [0, 1]
vec2 randomVec2(float seed) {
    float x = fract(sin(seed * 127.1) * 43758.5453);
    float y = fract(sin(seed * 311.7) * 43758.5453);
    return vec2(x, y);
}

float getDist(vec3 p) {
    vec3 pc = p;

    p.z += uTime * SPEED;

    p -= tunnel(p);
    vec3 p2 = p;
    vec3 ps = p2;
    ps += tunnel(ps);
    p2 = navigate(p2);

    vec3 pg = p2;
    pg.xy *= rotate(pg.z * 0.0001);
    float lz = fract((p.z / 100.0) * 0.02);
    float t = uTime;//pow(uTime, 0.6);
    vec2 rndLs = randomVec2(uEffectParam1); // [0, 1] from uEffectParam1
    float lx = 1.0 + 5.0 + ((sin((lz + t) * 0.2576) * 0.5) + 0.5); // [1, 10]
    float ly = 1.0 + 4.0 + ((cos((lz + t) * 0.1987) * 0.5) + 0.5); // [1, 10]
    float g1 = sdGyroid(pg, origgsize, 0.1, 1.4, lx, ly);
    g1 *= 0.8;

    float v = 10.63748;
    float m = 0.5;
    for(int i = 0; i < 8; i++) {
        g1 -= sdGyroid(p2, v, 0.03, 0.3, 1.0, 1.0) * m;
        v *= 2.0;
        m *= 0.85;
    }

    float camera = length(pc - vec3(0.0, 0.0, -CAMDIST)) - 0.2;
    g1 = max(g1, -camera);

    vec2 rndTunnel = randomVec2(uEffectParam2); // [0, 1] from uEffectParam2
    float tunnelX = 30.0;// + rndTunnel.x * 40.0;  // [1, 10]
    float tunnelY = 15.0;// + rndTunnel.y * 20.0;  // [1, 10]

    ps.z = repeat(ps.z, tunnelX);

    ps.xy *= rotate(ps.z * 0.1);
    float c11 = sdTriPrism(ps, vec2(1.0, tunnelY));
    float c12 = sdTriPrism(ps, vec2(0.9, tunnelX));
    float cc1 = max(c11, -c12);

    float d1 = g1;
    d1 = smin(d1, cc1, 0.2);

    tmpo = cc1;//0.02/(0.02+cc);
    d1 = min(d1, cc1);
    trianglesBeams += 0.01 / (0.08 + tmpo);

    return d1;

}

float rayMarch(vec3 ro, vec3 rd) {
    float dO = RAYMARCH_SURFACE_DIST;

    for(int i = 0; i < RAYMARCH_MAX_STEPS; i++) {
        vec3 p = ro + rd * dO;
        float dS = getDist(p);
        dO += dS;
        if(dO > RAYMARCH_MAX_DIST || dS < RAYMARCH_SURFACE_DIST)
            break;
    }

    return dO;
}

vec3 bg(vec3 rd) {
    vec3 col = vec3(0.0);
    float t = uTime * 0.2;

    float y = clamp(smoothstep(0.3, 1.0, rd.y * 0.5 + 0.5), 0.1, 1.0);
    col += y * vec3(0.05, 0.18, 0.38) * 6.0;

    float a = atan(rd.x, rd.z);
    float flares = 0.7 * sin(a * 20. + t) * sin(a * 2. - t) * sin(a * 6.);
    flares *= smoothstep(.0, 1.0, y);
    col += flares;
    col = max(col, 0.);
    return col;
}

void main() {

    vec2 uv = (gl_FragCoord.xy - .5 * uResolution.xy) / uResolution.y;

    float t = uTime * 0.01;
    uv += sin(uv * 20. + t) * .01;

    vec3 col = vec3(0.0);

    vec3 ro = vec3(0.0, 0.0, -CAMDIST);
    ro += vec3(sin(sin(ro.x) + cos(ro.y + uTime) + uTime * 0.17851), cos(cos(ro.z) + sin(ro.x + uTime) + uTime * 0.7851), sin(sin(ro.y) + cos(ro.z + uTime) + uTime * 0.35454)) * 0.1;
    vec3 ta = vec3(0.0);
    ta += vec3(sin(sin(ta.y) + cos(ta.z + uTime) + uTime * 0.53253), cos(cos(ta.x) + sin(ta.y + uTime) + uTime * 0.36521), sin(sin(ta.x) + cos(ta.y + uTime) + uTime * 0.56325)) * 0.1;

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = normalize(cross(uu, ww));

    vec3 rd = normalize(uv.x * uu + uv.y * vv + ww * fov);

    float d = rayMarch(ro, rd);

    float mindist = 5.0;
    col = mix(col, bg(rd), smoothstep(0.0, RAYMARCH_MAX_DIST, d));

    col += trianglesBeams * colorB * (0.2 + uAudioLevel * 2.0);

    col = 1.0 - exp(-col * 1.0);
    col = pow(col, vec3(1.2));

    vec4 finalColor = vec4(col, smoothstep(mindist, RAYMARCH_MAX_DIST * 0.5, d));

    gl_FragColor = finalColor;

}