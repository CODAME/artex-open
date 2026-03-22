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
//two tweet version of fb39ca4's Menger Tunnel https://www.shadertoy.com/view/XslGzl

//265 and one more Menger step for more windows :P
void mainImage( out vec4 o,  vec2 w )
{
    vec4 p = vec4(w,0,1)/uResolution.x-.5, r, q = o = p-p;
    q.x = .3*sin(q.z=-uTime * max(0.01, uEffectParam1 * 2.0));
    o++;
    float depth = 99.0 * max(0.1, uEffectParam2);
    float colorShift = max(0.01, uEffectParam3);

    for( int i=0; i<99; i++ ) {
        if (float(i) >= depth) break;
        float d=0.,s=1.;
        for( int j=0; j<6; j++ ) { // 6 passes (3**6==729)
            r = max( r = abs(mod(q*s+1.,2.)-1.) , r.yzxw );
            d = max(d, (.29-min(r.x,min(r.y,r.z))) / s );
            s *= 3.;
        }
        if (d > 1e-5) {
            q += p*d;
            o -= .01 * colorShift;
        }
    }
}


//thanks to Fabrice it is again under 2 tweets
//274 chars:


//2015-11-12
//had to change it once again to accomodate new shadertoy framework which prohibits using
//mainImage declaration with "inout vec4 fragColor"
//280 chars:
/*
#define X r = max( r = abs(mod(q*s+1.,2.)-1.) , r.yzxw ), d = max(d, (.29-min(r.x,min(r.y,r.z))) / s ),  s *= 3.
void mainImage( out vec4 o,  vec2 w )
{
    vec4 p = vec4(w,0,1)/uResolution.x-.5, r, q = p-p;
    q.x = .3*sin(q.z=-uTime * max(0.01, uEffectParam1 * 2.0));
    o = p/p; //hm, can this fail? for example for w.x == uResolution.x / 2.

    for (int i=0; i < 99; i++) {
        float d=0.,s=1.;
        X; X; X; X; X;
        d > 1e-5 ? q += p*d, o -= .01 * colorShift : o;
    }
}
/**/


//----------------------------------------------------------------------------
//below is the [2TC 15] version
//originally it was 280, but after the last shadertoy interface change it went
//to 295 chars
//----------------------------------------------------------------------------

//an attempt to fit fb39ca4's Menger Tunnel https://www.shadertoy.com/view/XslGzl
//into two tweets
//
//I managed to do it, sort of, but didn't like the too simple coloring, and especailly
//the fact that camera was static
//
//so here it is now, with the camera movement that I wanted (291 chars)
//feel free to add coloring to your liking ;)
//btw, after 200 or so seconds fp errors might kick in...


//UPDATE: Thanks to the great community here at ShaderToy, it is now 280 chars

/*
void mainImage( out vec4 f, vec2 w )
{
    vec4 p=vec4(w,0,1)/uResolution.x-.5,r=p-p,q=r;
    q.x=.3*sin(q.z=-uTime);

    for (float i=1.; i>0.; i-=.01) {

        float d=0.,s=1.;

        for (int j = 0; j < 5; j++)
            r=max(r=abs(mod(q*s+1.,2.)-1.),r.yzxw),
            d=max(d,(.29-min(r.x,min(r.y,r.z)))/s),
            s*=3.;

        q+=p*d;
        
        f = p-p+i;

        if(d<1e-5) break;
    }
}
*/
void main() {
  vec4 fragColor;
  vec2 fragCoord = gl_FragCoord.xy;
  mainImage(fragColor, fragCoord);
  gl_FragColor = fragColor * uEffectStrength;
}
