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
// based on shader from coyote => https://www.shadertoy.com/view/ltfGzS

mat3 getRotYMat(float a) {
    return mat3(cos(a), 0.0, sin(a),
                0.0,    1.0, 0.0,
               -sin(a), 0.0, cos(a));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 s = uResolution.xy;
    float t = uTime * 0.2 * max(0.01, uEffectParam1 * 2.0);
    float pt = uTime * 0.2 * max(0.01, uEffectParam2 * 2.0);

    float c = 1.0;
    float d = 0.0;
    float m = 1.0;

    vec3 p = vec3((2.0 * fragCoord.xy - s) / s.x, 1.0);
    vec3 r = vec3(0.0);
    vec3 q = r;

    p *= getRotYMat(-t);
    q.zx += 10.0 + vec2(sin(pt), cos(pt)) * 3.0;

    for (int step = 0; step < 100; step++) {
        float i = 1.0 - float(step) * 0.01;
        c = i;
        d = 0.0;
        m = 1.0;

        for (int j = 0; j < 3; j++) {
            vec3 v = mod(q * m + 1.0, 2.0) - 1.0;
            // Equivalent to the original chained r*=r*=r*=r pattern, but compiler-safe.
            v *= v;
            v *= v;
            v *= v;
            r = max(v, v.yzx);

            d = max(d, (0.29 - length(r) * 0.6) / m) * 0.8;
            m *= 1.1;
        }

        q += p * d;
        if (d < 1e-5) break;
    }

    float k = dot(r, r + 0.15);
    fragColor = vec4((vec3(1.0, k, k / c) - 0.8) * uEffectStrength * max(0.01, uEffectParam3 * 1.5), 1.0);
}

void main() {
  vec4 fragColor;
  vec2 fragCoord = gl_FragCoord.xy;
  mainImage(fragColor, fragCoord);
  gl_FragColor = fragColor;
}
