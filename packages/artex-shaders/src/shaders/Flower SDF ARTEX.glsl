// Flower SDF ARTEX.glsl
// Apache-2.0 — ARTEX
//
// Procedural top-down flower built from a rhodonea (rose-curve) petal
// envelope. A platform-native reimagining of the "shape petals, blend colors"
// idea from HelloEnjoy's Flower, expressed in the ARTEX living-art idiom:
// the bloom is driven by signals and time, not by a user dragging handles.
//
// Two ways to drive it:
//   - V3 pieceConfigV3 path: u_<param> uniforms (u_petals, u_openness, …) set
//     from the shader pass `params`, plus uProximity/uAudioLevel signal bindings.
//   - Legacy Studio control path: the three generic sliders (uEffectParam1..3,
//     0..2, default 1.0) modulate bloom / curl / spin so they are live here too.
//
// Artist params (V3, bound as u_<name>):
//   u_petals     petal count                (sensible default 8 when 0)
//   u_openness   bud (0) -> full bloom (1)   (default 0.65)
//   u_curl       petal tip shape: round->sharp (default 0.4)
//   u_spin       continuous rotation speed   (0 = still)
//   u_hue        base hue of the gradient    (0..1, 0 = warm red)
//   u_hueSpread  tip<->base hue spread       (default 0.15)
//
// Live signals (degrade gracefully to 0 when inactive):
//   uProximity   viewer approaches -> flower opens further
//   uAudioLevel  drives sway energy and petal glow

precision mediump float;

uniform float uTime;
uniform vec2  uResolution;

// Artist params (u_-prefixed: bound from the pass `params` record).
uniform float u_petals;
uniform float u_openness;
uniform float u_curl;
uniform float u_spin;
uniform float u_hue;
uniform float u_hueSpread;

// Generic Studio controls (0..2, default 1.0): modulate bloom / curl / spin.
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

// Live inputs (exact-name binding; 0 when no signal is present).
uniform float uProximity;
uniform float uAudioLevel;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// One layer of petals. Returns rgb in .xyz and coverage mask in .w.
vec4 flowerLayer(
  vec2 p,
  float petals,
  float bloom,
  float curl,
  float baseHue,
  float hueSpread,
  float rot,
  float aa
) {
  float a = atan(p.y, p.x) + rot;
  float r = length(p);

  // Rhodonea petal envelope: `petals` rounded lobes. `curl` sharpens the tips.
  float lobe = abs(cos(petals * 0.5 * a));
  lobe = pow(lobe, mix(2.2, 0.45, clamp(curl, 0.0, 1.0)));
  float petalRadius = 0.12 + bloom * 0.30 * lobe;

  float mask = smoothstep(petalRadius + aa, petalRadius - aa, r);

  // Gradient from base (center) to tip, with a per-lobe vein shade.
  float t = clamp(r / max(petalRadius, 1e-3), 0.0, 1.0);
  float hue = fract(baseHue + hueSpread * (1.0 - t));
  vec3 col = hsv2rgb(vec3(hue, mix(0.45, 0.85, t), mix(1.0, 0.82, t)));
  col *= mix(0.65, 1.0, lobe);

  return vec4(col, mask);
}

void main() {
  // Centered, aspect-correct coordinates (~[-0.5, 0.5] on the short axis).
  float minDim = max(min(uResolution.x, uResolution.y), 1.0);
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / minDim;
  float r = length(p);
  float aa = 1.5 / minDim;

  // Effective params: exact 0 is treated as "unset" so the shader still
  // reads well in the Shaders-tab preview before a piece configures it.
  float petals    = u_petals    > 0.5   ? u_petals    : 8.0;
  float openness  = u_openness  > 0.001 ? u_openness  : 0.65;
  float curl      = u_curl      > 0.001 ? u_curl      : 0.40;
  float hueSpread = u_hueSpread > 0.001 ? u_hueSpread : 0.15;
  float spin      = u_spin;
  float baseHue   = u_hue;

  // Generic Studio sliders modulate bloom / curl / spin. Neutral (1.0) when
  // unset (0), so the V3 u_<param> / signal path is unaffected.
  float e1 = uEffectParam1 > 0.0001 ? uEffectParam1 : 1.0;
  float e2 = uEffectParam2 > 0.0001 ? uEffectParam2 : 1.0;
  float e3 = uEffectParam3 > 0.0001 ? uEffectParam3 : 1.0;
  openness *= e1;
  curl     *= e2;
  spin     *= e3;

  // Live drivers: proximity opens the bloom, audio adds sway and glow.
  float bloom = clamp(openness + uProximity * 0.40, 0.0, 1.3);
  float sway  = (0.04 + uAudioLevel * 0.18) * sin(uTime * 0.9);
  float rot   = spin * uTime * 0.30 + sway;

  // Background: a soft dark vignette so the flower reads on any surface.
  vec3 color = mix(vec3(0.03, 0.03, 0.05), vec3(0.06, 0.05, 0.09), r);

  // Two counter-rotated layers for depth: a wide outer corolla and a
  // smaller, brighter inner whorl.
  vec4 outer = flowerLayer(p, petals, bloom, curl, baseHue, hueSpread, rot, aa);
  vec4 inner = flowerLayer(p * 1.7, petals, bloom, curl, fract(baseHue + 0.06), hueSpread, -rot * 1.3, aa);
  color = mix(color, outer.xyz, outer.w);
  color = mix(color, inner.xyz * 1.08, inner.w);

  // Pulsing center eye.
  float disc = 0.05 + 0.012 * sin(uTime * 1.3);
  float discMask = smoothstep(disc + aa, disc - aa, r);
  vec3 centerCol = hsv2rgb(vec3(fract(baseHue + 0.08), 0.8, 1.0));
  color = mix(color, centerCol, discMask);

  // Rim glow around the petal edge, lifted by audio.
  float edge = abs(r - (0.12 + bloom * 0.30));
  float glow = exp(-7.0 * edge) * (0.12 + 0.30 * uAudioLevel);
  color += outer.xyz * glow;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
