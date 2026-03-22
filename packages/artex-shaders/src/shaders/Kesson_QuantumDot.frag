precision mediump float;

#define PI 3.1415
#define RAYMARCH_MAX_STEPS      256
#define RAYMARCH_MAX_DIST       200.0
#define RAYMARCH_SURFACE_DIST   0.01

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
float shine = 0.0;
float bands = 0.0;

mat2 rotateZ(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

float smin(float a, float b, float h) {
    float k = clamp((a - b) / h * 0.5 + 0.5, 0.0, 1.0);
    return mix(a, b, k) - k * (1.0 - k) * h;
}

vec3 smin(vec3 a, vec3 b, float h) {
    vec3 k = clamp((a - b) / h * 0.5 + 0.5, 0.0, 1.0);
    return mix(a, b, k) - k * (1.0 - k) * h;
}

vec3 kifs(vec3 p, float t) {
    float s = 4.0 + (uAudioLevel * bands * 5.0);

    for (int i = 0; i < 4; i++) {
        float t2 = t + float(i);
        p.xz *= rotateZ(t2);
        p.xy *= rotateZ(t2 * 0.7);
        p = smin(p, -p, -uEffectParam2 * 2.0);
        p -= s;
        s *= 0.7;
    }

    return p;
}

float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

float getDist(vec3 p) {
    p = abs(p);

    vec3 p2 = kifs(p, uTime * 0.1452);
    vec3 p3 = kifs(p + vec3(3.0, 2.0, 1.0), uTime * 0.1);

    float d1 = sdSphere(p2, uAudioLevel * 10.0);
    float d2 = sdSphere(p3, uEffectParam1);
    float d = smin(d1, d2, -0.0);

    float s = 5.0 / (5.0 + d1);
    shine += s;

    return d;
}

float rayMarch(vec3 ro, vec3 rd) {
    float dO = RAYMARCH_SURFACE_DIST;

    for (int i = 0; i < RAYMARCH_MAX_STEPS; i++) {
        vec3 p = ro + rd * dO;
        float dS = getDist(p);
        dO += dS;
        if (dO > RAYMARCH_MAX_DIST) break;
        if (dS < RAYMARCH_SURFACE_DIST) break;
    }

    return dO;
}

vec3 getNormal(vec3 p) {
    float d = getDist(p);
    vec2 e = vec2(0.01, 0.0);

    vec3 n = d - vec3(
        getDist(p - e.xyy),
        getDist(p - e.yxy),
        getDist(p - e.yyx)
    );

    return normalize(n);
}

float getLight(vec3 p, vec3 lightPos) {
    vec3 l = normalize(lightPos - p);
    vec3 n = getNormal(p);
    float dif = dot(n, l);

    float d = rayMarch(p + n * 0.0002, l);
    if (d < length(lightPos - p)) dif *= 0.1;

    return dif;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;
    vec2 st = (gl_FragCoord.xy / uResolution.xy);

    vec2 uvv = uv * rotateZ(PI / 2.0);
    bands = uBassLevel;//texture2D(spectrum, vec2(abs(uvv.y), 0.975)).r;

    vec3 ro = vec3(0.0, 0.0, -30.0);
    vec3 ta = vec3(0.0);
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = normalize(cross(uu, ww));
    vec3 rd = normalize(uv.x * uu + uv.y * vv + ww * 1.0);

    float d = rayMarch(ro, rd);
    vec3 p = ro + rd * d;

    vec3 col = vec3(0.0);
    vec3 lightPos = vec3(0.0, 0.0, -55.0);

    vec3 orbColor = vec3(1.0);
    col += shine * orbColor * 0.05 * uAudioLevel * 5.0;

    gl_FragColor = vec4(col, 1.0);
}