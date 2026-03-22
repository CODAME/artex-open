precision mediump float;
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
float seg(in vec2 p, in vec2 a, in vec2 b) {
    vec2 pa = p-a, ba = b-a;
    float h = clamp( dot(pa,ba)/dot(ba,ba), 0.0, 1.0 );
    return length( pa - ba*h );
}

float coshCompat(float x) {
    float ex = exp(x);
    float enx = exp(-x);
    return 0.5 * (ex + enx);
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = (fragCoord - 0.5 * uResolution.xy) / uResolution.y;
    float a = atan(uv.y, uv.x);
    float t = iTime * uEffectParam1;
    vec2 p = cos(a + t) * vec2(cos(0.5 * t), sin(0.3 * t));
    vec2 q = (cos(t)) * vec2(cos(t), sin(t));
    
    float d1 = length(uv - p);
    float d2 = length(uv - 0.);
    
    float denom = max(d1 + d2, 1e-4);
    vec2 uv2 = 2. * cos(log(length(uv))*0.25 - 0.5 * t + log(vec2(d1,d2)/denom));///(d1+d2);
    //uv = mix(uv, uv2, exp(-12. * length(uv)));
    //uv = uv2;
    
    vec2 fpos = fract(4. *  uv2) - 0.5;
    float d = max(abs(fpos.x), abs(fpos.y));
    float k = 5. / uResolution.y;
    float s = smoothstep(-k, k, 0.25 - d);
    vec3 col = vec3(s, 0.5 * s, 0.1-0.1 * s);
    col += 1./coshCompat(-2.5 * (length(uv - p) + length(uv))) * vec3(1,0.5,0.1);
    
    float c = cos(10. * max(1.0, uEffectParam2 * 2.0) * length(uv2) + 4. * t);
    col += (0.5 + 0.5 * c) * vec3(0.5,1,1) *
           exp(-9. * abs(cos(9. * a + t) * uv.x
                       + sin(9. * a + t) * uv.y 
                       + 0.1 * c));
    
    fragColor = vec4(col * uEffectStrength * max(0.01, uEffectParam3 * 1.5),1.0);
}

void main() {
  vec4 fragColor;
  vec2 fragCoord = gl_FragCoord.xy;
  mainImage(fragColor, fragCoord);
  gl_FragColor = fragColor;
}
