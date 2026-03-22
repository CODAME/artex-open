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

/*

	Bumped Sinusoidal Warp
	----------------------

	Sinusoidal planar deformation, or the 2D sine warp effect to people 
	like me. The effect has been around for years, and there are
	countless examples on the net. IQ's "Sculpture III" is basically a 
	much more sophisticated, spherical variation.

    This particular version was modified from Fabrice's "Plop 2," which in 
	turn was a simplified version of Fantomas's "Plop." I simply reduced 
	the frequency and iteration count in order to make it less busy.

	I also threw in a texture, added point-lit bump mapping, speckles... 
	and that's pretty much it. As for why a metallic surface would be 
	defying	the laws of physics and moving like this is anyone's guess. :)

	By the way, I have a 3D version, similar to this, that I'll put up at 
	a later date.
    


	Related examples:

    Fantomas - Plop
    https://www.shadertoy.com/view/ltSSDV

    Fabrice - Plop 2
    https://www.shadertoy.com/view/MlSSDV

	IQ - Sculpture III (loosely related)
	https://www.shadertoy.com/view/XtjSDK

	Shane - Lit Sine Warp (far less code)
	https://www.shadertoy.com/view/Ml2XDV

*/


// Warp function. Variations have been around for years. This is
// almost the same as Fabrice's version:
// Fabrice - Plop 2
// https://www.shadertoy.com/view/MlSSDV
vec2 W(vec2 p){
    
    p = (p + 3.)*4.;

    float t = uTime/2. * uEffectParam1;

    // Layered, sinusoidal feedback, with time component.
    for (int i=0; i<3; i++){
        p += cos(p.yx*3. + vec2(t, 1.57))/3.;
        p += sin(p.yx + t + vec2(1.57, 0))/2.;
        p *= 1.3;
    }

    // A bit of jitter to counter the high frequency sections.
    p +=  fract(sin(p+vec2(13, 7))*5e5)*.03 - .015;

    return mod(p, 2.) - 1.; // Range: [vec2(-1), vec2(1)]
    
}

// Bump mapping function. Put whatever you want here. In this case, 
// we're returning the length of the sinusoidal warp function.
float bumpFunc(vec2 p){ 

	return length(W(p))*.7071; // Range: [0, 1]

}

/*
// Standard ray-plane intersection.
vec3 rayPlane(vec3 p, vec3 o, vec3 n, vec3 rd) {
    
    float dn = dot(rd, n);

    float s = 1e8;
    
    if (abs(dn) > 0.0001) {
        s = dot(p-o, n) / dn;
        s += float(s < 0.0) * 1e8;
    }
    
    return o + s*rd;
}
*/

vec3 smoothFract(vec3 x){ x = fract(x); return min(x, x*(1.-x)*12.); }

void mainImage( out vec4 fragColor, in vec2 fragCoord ){

    // Screen coordinates.
	vec2 uv = (fragCoord - uResolution.xy*.5)/uResolution.y;
    
    
    // PLANE ROTATION
    //
    // Rotating the canvas back and forth. I don't feel it adds value, in this case,
    // but feel free to uncomment it.
    //float th = sin(uTime*0.1)*sin(uTime*0.12)*2.;
    //float cs = cos(th), si = sin(th);
    //uv *= mat2(cs, -si, si, cs);
  

    // VECTOR SETUP - surface postion, ray origin, unit direction vector, and light postion.
    //
    // Setup: I find 2D bump mapping more intuitive to pretend I'm raytracing, then lighting a bump mapped plane 
    // situated at the origin. Others may disagree. :)  
    vec3 sp = vec3(uv, 0); // Surface posion. Hit point, if you prefer. Essentially, a screen at the origin.
    vec3 rd = normalize(vec3(uv, 1)); // Unit direction vector. From the origin to the screen plane.
    vec3 lp = vec3(cos(uTime)*.5, sin(uTime)*.2, -1); // Light position - Back from the screen.
	vec3 sn = vec3(0, 0, -1); // Plane normal. Z pointing toward the viewer.
 
     
/*
	// I deliberately left this block in to show that the above is a simplified version
	// of a raytraced plane. The "rayPlane" equation is commented out above.
	vec3 rd = normalize(vec3(uv, 1));
	vec3 ro = vec3(0, 0, -1);

	// Plane normal.
	vec3 sn = normalize(vec3(cos(uTime)*.25, sin(uTime)*.25, -1));
    //vec3 sn = normalize(vec3(0, 0, -1));
	
	vec3 sp = rayPlane(vec3(0), ro, sn, rd);
    vec3 lp = vec3(cos(uTime)*.5, sin(uTime)*.25, -1); 
*/    
    
    
    // BUMP MAPPING - PERTURBING THE NORMAL
    //
    // Setting up the bump mapping variables. Normally, you'd amalgamate a lot of the following,
    // and roll it into a single function, but I wanted to show the workings.
    //
    // f - Function value
    // fx - Change in "f" in in the X-direction.
    // fy - Change in "f" in in the Y-direction.
    vec2 eps = vec2(4./uResolution.y, 0);
    
    float f = bumpFunc(sp.xy); // Sample value multiplied by the amplitude.
    float fx = bumpFunc(sp.xy - eps.xy); // Same for the nearby sample in the X-direction.
    float fy = bumpFunc(sp.xy - eps.yx); // Same for the nearby sample in the Y-direction.
   
 	// Controls how much the bump is accentuated.
	float bumpFactor = .05 * max(0.01, uEffectParam2 * 2.0);
    
    // Using the above to determine the dx and dy function gradients.
    fx = (fx - f)/eps.x; // Change in X
    fy = (fy - f)/eps.x; // Change in Y.
    // Using the gradient vector, "vec3(fx, fy, 0)," to perturb the XY plane normal ",vec3(0, 0, -1)."
    // By the way, there's a redundant step I'm skipping in this particular case, on account of the 
    // normal only having a Z-component. Normally, though, you'd need the commented stuff below.
    //vec3 grad = vec3(fx, fy, 0);
    //grad -= sn*dot(sn, grad);
    //sn = normalize(sn + grad*bumpFactor ); 
    sn = normalize(sn + vec3(fx, fy, 0)*bumpFactor);   
    // Equivalent to the following.
    //sn = cross(-vec3(1, 0, fx*bumpFactor), vec3(0, 1, fy*bumpFactor));
    //sn = normalize(sn);
   
    
    // LIGHTING
    //
	// Determine the light direction vector, calculate its distance, then normalize it.
	vec3 ld = lp - sp;
	float lDist = max(length(ld), .0001);
	ld /= lDist;

    // Light attenuation.    
    float atten = 1./(1. + lDist*lDist*.15);
	//float atten = min(1./(lDist*lDist*1.), 1.);
    
    // Using the bump function, "f," to darken the crevices. Completely optional, but I
    // find it gives extra depth.
    atten *= f*.9 + .1; // Or... f*f*.7 + .3; //  pow(f, .75); // etc.

	

	// Diffuse value.
	float diff = max(dot(sn, ld), 0.);  
    // Enhancing the diffuse value a bit. Made up.
    diff = pow(diff, 4.)*.66 + pow(diff, 8.)*.34; 
    // Specular highlighting.
    float spec = pow(max(dot( reflect(-ld, sn), -rd), 0.), 12.); 
    //float spec = pow(max(dot(normalize(ld - rd), sn), 0.), 32.);
    
	
    // TEXTURE COLOR
    //
	// Combining the surface postion with a fraction of the warped surface position to index 
    // into the texture. The result is a slightly warped texture, as a opposed to a completely 
    // warped one. By the way, the warp function is called above in the "bumpFunc" function,
    // so it's kind of wasteful doing it again here, but the function is kind of cheap, and
    // it's more readable this way.
    vec3 texCol = artex_sampleMain( sp.xy + W(sp.xy)/8.).xyz; 
    texCol *= texCol; // Rough sRGB to linear conversion... That's a whole other conversation. :)
    // A bit of color processing.
    texCol = smoothstep(.05, .75, pow(texCol, vec3(.75, .8, .85)));    
    
    // Textureless. Simple and elegant... so it clearly didn't come from me. Thanks Fabrice. :)
    //vec3 texCol = smoothFract( W(sp.xy).xyy )*.1 + .2;
    
	
    
    // FINAL COLOR
    // Using the values above to produce the final color.   
    vec3 col = (texCol*(diff*vec3(1, .97, .92)*2. + .5) + vec3(1, .6, .2)*spec*2.)*atten;
    
    // Faux environment mapping: I added this in at a later date out of sheer boredome, and  
    // because I like shiny stuff. You can comment it out if it's not to your liking. :)
    float ref = max(dot(reflect(rd, sn), vec3(1)), 0.);
    col += col*pow(ref, 4.)*vec3(.25, .5, 1)*3.;
    

    // Perform some statistically unlikely (but close enough) 2.0 gamma correction. :) 
	fragColor = vec4(sqrt(clamp(col * uEffectStrength * max(0.01, uEffectParam3), 0., 1.)), 1);
}
void main() {
  vec4 fragColor;
  vec2 fragCoord = gl_FragCoord.xy;
  mainImage(fragColor, fragCoord);
  gl_FragColor = fragColor;
}
