// Flower SDF ARTEX.glsl
// Apache-2.0 — ARTEX
//
// The Procedural Flower template plays the WebGPU/TSL port of this shader
// (`packages/artex-shaders/src/tsl/graphs/flowerSdf.ts`, scriptId
// `flower-sdf-tsl`). This file stays for pieces that reference
// `flower-sdf-artex`. Change both together.
//
// Procedural top-down flower built from a rhodonea (rose-curve) petal
// envelope. A platform-native reimagining of the "shape petals, blend colors"
// idea from HelloEnjoy's Flower, expressed in the ARTEX living-art idiom:
// the bloom is driven by signals and time, not by a user dragging handles.
//
// It lives underwater: the flower drifts on a slow current, its petals ripple
// like fins, the frame refracts as if seen through moving water, and caustic
// light and rising bubbles move behind it. All of that is arithmetic on uTime,
// with no extra passes and no loops over a uniform bound.
//
// Three ways to drive it:
//   - V3 pieceConfigV3 path: u_<param> uniforms (u_petals, u_openness, …) set
//     from the shader pass `params`, plus uProximity/uAudioLevel signal bindings.
//   - Legacy Studio control path: the three generic sliders (uEffectParam1..3,
//     0..2, default 1.0) modulate bloom / curl / spin so they are live here too.
//   - Voice commands: uVoice<Command> envelopes (0..1) bound from the
//     `voice_<command>` signals the Sense tab's Voice commands section produces.
//
// Artist params (V3, bound as u_<name>):
//   u_petals     petal count                (sensible default 8 when 0)
//   u_openness   bud (0) -> full bloom (1)   (default 0.65)
//   u_curl       petal tip shape: round->sharp (default 0.4)
//   u_spin       continuous rotation speed   (0 = still)
//   u_hue        base hue of the gradient    (0..1, 0 = warm red)
//   u_hueSpread  tip<->base hue spread       (default 0.15)
//   u_current    underwater drift strength   (0 = still water; default 1)
//
// Live signals (degrade gracefully to 0 when inactive):
//   uProximity   viewer approaches -> flower opens further
//   uAudioLevel  drives sway energy, current, and petal glow
//   uVoiceJump    hop upward and settle back
//   uVoiceDance   bob and wiggle to a beat
//   uVoiceSpin    whirl around
//   uVoiceStop    the water goes still and the flower comes to rest
//   uVoiceExplode petals burst outward with a flash, then regather
//   uVoiceGrow    bloom larger
//   uVoiceShrink  close toward a bud
//   uVoiceGlow    brighter rim and center
//   uVoiceColor   sweep the hue around the wheel
//   uVoiceCalm    slow, gentle drift

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
uniform float u_current;

// Generic Studio controls (0..2, default 1.0): modulate bloom / curl / spin.
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

// Live inputs (exact-name binding; 0 when no signal is present).
uniform float uProximity;
uniform float uAudioLevel;

// Voice command envelopes (exact-name binding; 0 when nobody has spoken).
uniform float uVoiceJump;
uniform float uVoiceDance;
uniform float uVoiceSpin;
uniform float uVoiceStop;
uniform float uVoiceExplode;
uniform float uVoiceGrow;
uniform float uVoiceShrink;
uniform float uVoiceGlow;
uniform float uVoiceColor;
uniform float uVoiceCalm;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Cheap caustic web: two interfering warped sine lattices, sharpened.
float caustics(vec2 p, float t) {
  vec2 q = p * 6.0;
  q += vec2(sin(q.y * 0.8 + t * 0.7), cos(q.x * 0.9 - t * 0.6)) * 0.9;
  float a = sin(q.x + t) * sin(q.y - t * 0.8);
  q = mat2(0.8, -0.6, 0.6, 0.8) * q * 1.3;
  float b = sin(q.x - t * 0.9) * sin(q.y + t * 0.5);
  float c = 1.0 - abs(a + b);
  return pow(clamp(c, 0.0, 1.0), 6.0);
}

// Rising bubbles: one per cell column, wrapping vertically. Fixed-size grid,
// so the cost is a constant handful of ALU ops per pixel.
float bubbles(vec2 p, float t) {
  vec2 g = p * vec2(7.0, 4.0);
  float col = floor(g.x);
  float seed = hash12(vec2(col, 3.7));
  float speed = 0.35 + seed * 0.45;
  vec2 cell = vec2(fract(g.x) - 0.5, fract(g.y - t * speed + seed * 5.0) - 0.5);
  cell.x += 0.18 * sin(t * 2.0 + seed * 12.0 + g.y * 2.0);
  float radius = 0.05 + 0.06 * seed;
  float d = length(cell * vec2(1.0, 1.75));
  float ring = smoothstep(radius, radius - 0.02, d) - smoothstep(radius - 0.02, radius - 0.05, d);
  return ring * step(0.35, seed);
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
  float ripple,
  float burst,
  float t,
  float aa
) {
  float a = atan(p.y, p.x) + rot;
  // "Explode" pushes every petal outward from the center, leaving a gap.
  float r = length(p) - burst * 0.2;

  // Rhodonea petal envelope: `petals` rounded lobes. `curl` sharpens the tips.
  float lobe = abs(cos(petals * 0.5 * a));
  lobe = pow(lobe, mix(2.2, 0.45, clamp(curl, 0.0, 1.0)));
  // Petals undulate like fins in a current: a wave that travels around the
  // flower and outward along each petal.
  float fin = ripple * sin(a * 3.0 - t * 2.1 + r * 9.0);
  float petalRadius = 0.12 + bloom * 0.30 * lobe * (1.0 + fin);

  float mask = smoothstep(petalRadius + aa, petalRadius - aa, r) * step(0.0, r);
  // Torn petals: each lobe splits into shards while the burst is strong.
  mask *= 1.0 - burst * smoothstep(0.55, 0.75, abs(sin(petals * a + r * 14.0)));

  // Gradient from base (center) to tip, with a per-lobe vein shade.
  float tt = clamp(r / max(petalRadius, 1e-3), 0.0, 1.0);
  float hue = fract(baseHue + hueSpread * (1.0 - tt));
  vec3 col = hsv2rgb(vec3(hue, mix(0.45, 0.85, tt), mix(1.0, 0.82, tt)));
  col *= mix(0.65, 1.0, lobe);

  return vec4(col, mask);
}

void main() {
  // Centered, aspect-correct coordinates (~[-0.5, 0.5] on the short axis).
  float minDim = max(min(uResolution.x, uResolution.y), 1.0);
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / minDim;
  float aa = 1.5 / minDim;

  // Effective params: exact 0 is treated as "unset" so the shader still
  // reads well in the Shaders-tab preview before a piece configures it.
  float petals    = u_petals    > 0.5   ? u_petals    : 8.0;
  float openness  = u_openness  > 0.001 ? u_openness  : 0.65;
  float curl      = u_curl      > 0.001 ? u_curl      : 0.40;
  float hueSpread = u_hueSpread > 0.001 ? u_hueSpread : 0.15;
  float current   = u_current   > 0.001 ? u_current   : 1.0;
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

  // Voice envelopes, clamped once. "Stop" and "calm" scale every motion term,
  // so the flower settles rather than snapping (the envelope eases in).
  float vJump    = clamp(uVoiceJump, 0.0, 1.0);
  float vDance   = clamp(uVoiceDance, 0.0, 1.0);
  float vSpin    = clamp(uVoiceSpin, 0.0, 1.0);
  float vStop    = clamp(uVoiceStop, 0.0, 1.0);
  float vExplode = clamp(uVoiceExplode, 0.0, 1.0);
  float vGrow    = clamp(uVoiceGrow, 0.0, 1.0);
  float vShrink  = clamp(uVoiceShrink, 0.0, 1.0);
  float vGlow    = clamp(uVoiceGlow, 0.0, 1.0);
  float vColor   = clamp(uVoiceColor, 0.0, 1.0);
  float vCalm    = clamp(uVoiceCalm, 0.0, 1.0);

  float motion = (1.0 - vStop) * mix(1.0, 0.35, vCalm);
  float flow   = current * motion * (1.0 + uAudioLevel * 0.8 + vDance * 0.6);
  float t      = uTime;

  // Water refraction: a gentle, slowly travelling warp of the whole frame.
  vec2 warp = vec2(
    sin(uv.y * 7.0 + t * 0.9) + 0.5 * sin(uv.y * 13.0 - t * 1.4),
    cos(uv.x * 6.0 - t * 0.8) + 0.5 * cos(uv.x * 11.0 + t * 1.2)
  ) * 0.006 * flow;
  vec2 wuv = uv + warp;

  // The flower floats: a slow Lissajous drift on the current, a hop for
  // "jump" (an arc that peaks mid-envelope), and a beat-bob for "dance".
  vec2 drift = vec2(
    0.055 * sin(t * 0.23) + 0.025 * sin(t * 0.61 + 1.3),
    0.040 * sin(t * 0.31 + 0.7) + 0.020 * cos(t * 0.53)
  ) * flow;
  float hop = sin(vJump * 3.14159) * 0.22;
  vec2 bob = vec2(0.05 * sin(t * 6.0), 0.045 * abs(sin(t * 6.0))) * vDance;
  vec2 center = drift + vec2(0.0, hop) + bob;

  // Squash on take-off and landing, stretch mid-air: the jump reads as alive.
  float stretch = 1.0 + 0.18 * sin(vJump * 6.28318) * vJump;
  vec2 p = wuv - center;
  p *= vec2(stretch, 1.0 / stretch);

  // Tilt with the current, wiggle with the dance.
  float tilt = 0.12 * sin(t * 0.4) * flow + 0.35 * sin(t * 6.0) * vDance;
  float cs = cos(tilt), sn = sin(tilt);
  p = mat2(cs, -sn, sn, cs) * p;

  float r = length(p);

  // Explode: petals fly outward and the bloom swells past full, then the
  // envelope's decay regathers them. Grow/shrink bias the bloom.
  float scatter = vExplode * vExplode;
  p /= 1.0 + scatter * 0.5;

  // Live drivers: proximity opens the bloom, audio adds sway and glow.
  float bloom = clamp(openness + uProximity * 0.40 + vGrow * 0.45 - vShrink * 0.55 + scatter * 0.3, 0.05, 1.6);
  float sway  = (0.04 + uAudioLevel * 0.18) * sin(t * 0.9) * motion;
  float rot   = spin * t * 0.30 * motion + sway + vSpin * vSpin * 6.28318 * 1.5 + vDance * 0.6 * sin(t * 3.0);
  float ripple = (0.05 + 0.10 * uAudioLevel + 0.12 * vDance) * flow + 0.25 * scatter;
  float hueNow = fract(baseHue + vColor * (0.5 + 0.5 * sin(t * 0.8)) + vColor * t * 0.1);

  // Background: deep water, lighter toward the surface, with caustics and
  // bubbles. Both fade under "stop" so the scene genuinely goes still.
  float depth = clamp(0.5 - uv.y * 0.7, 0.0, 1.0);
  vec3 color = mix(vec3(0.05, 0.16, 0.22), vec3(0.01, 0.04, 0.08), depth);
  color *= mix(1.0, 0.75, smoothstep(0.3, 0.9, length(uv)));
  float ct = t * 0.6 * mix(0.2, 1.0, motion);
  color += vec3(0.10, 0.22, 0.24) * caustics(wuv, ct) * (1.0 - depth * 0.7);
  // God rays from the surface: soft slanted bands.
  float rays = 0.5 + 0.5 * sin(uv.x * 9.0 + uv.y * 3.0 + t * 0.25 * motion);
  color += vec3(0.04, 0.09, 0.10) * rays * rays * (1.0 - depth);
  color += vec3(0.55, 0.75, 0.80) * bubbles(wuv, t * motion + vDance * t * 0.5) * 0.35;

  // Two counter-rotated layers for depth: a wide outer corolla and a
  // smaller, brighter inner whorl.
  vec4 outer = flowerLayer(p, petals, bloom, curl, hueNow, hueSpread, rot, ripple, scatter, t, aa);
  vec4 inner = flowerLayer(p * 1.7, petals, bloom, curl, fract(hueNow + 0.06), hueSpread, -rot * 1.3, ripple, scatter, t, aa);
  // Seen through water: the flower takes a little of the water's tint.
  vec3 waterTint = vec3(0.86, 0.97, 1.0);
  color = mix(color, outer.xyz * waterTint, outer.w * (1.0 - scatter * 0.35));
  color = mix(color, inner.xyz * 1.08 * waterTint, inner.w);

  // Pulsing center eye.
  float disc = 0.05 + 0.012 * sin(t * 1.3) + 0.02 * vGlow;
  float discMask = smoothstep(disc + aa, disc - aa, r);
  vec3 centerCol = hsv2rgb(vec3(fract(hueNow + 0.08), 0.8, 1.0));
  color = mix(color, centerCol, discMask);

  // Rim glow around the petal edge, lifted by audio and "glow".
  float edge = abs(length(p) - (0.12 + bloom * 0.30));
  float glow = exp(-7.0 * edge) * (0.12 + 0.30 * uAudioLevel + 0.55 * vGlow);
  color += outer.xyz * glow;

  // Explode flash: a bright shock ring that races outward as the envelope decays.
  float ringR = (1.0 - vExplode) * 0.9;
  float shock = exp(-60.0 * abs(r - ringR)) * vExplode;
  color += vec3(1.0, 0.92, 0.8) * shock * 0.8 + centerCol * scatter * 0.25;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
