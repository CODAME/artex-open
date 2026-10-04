// World Signals Test Field — a V3 shaderStack diagnostic shader.
//
// Renders four horizontal bands, each driven by one bound parameter, so a
// World Signal moving its bound value produces an obvious, isolated change:
//
//   bottom band → u_tempNorm   (cold blue → warm orange)
//   2nd band    → u_severity   (calm dark → agitated bright flicker)
//   3rd band    → u_season     (winter grey → summer green)
//   top band    → u_sunrise    (night dark → midday bright)
//
// V3 contract: the ShaderStackCompositor supplies `varying vec2 v_uv`,
// `u_time`, and `u_<paramName>` for every pass param / binding (it prefixes the
// binding's `uniform` name with `u_`). WebGL1, writes gl_FragColor.

precision mediump float;

varying vec2 v_uv;

uniform float u_time;
uniform float u_tempNorm;
uniform float u_severity;
uniform float u_season;
uniform float u_sunrise;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = v_uv;
  float band = floor(uv.y * 4.0); // 0 (bottom) .. 3 (top)

  vec3 col;
  if (band < 1.0) {
    // Temperature: cold blue → warm orange.
    col = mix(vec3(0.10, 0.32, 0.92), vec3(1.0, 0.55, 0.12), clamp(u_tempNorm, 0.0, 1.0));
  } else if (band < 2.0) {
    // Weather severity: calm dark → agitated bright flicker.
    float sev = clamp(u_severity, 0.0, 1.0);
    float n = hash(floor(uv * vec2(48.0, 14.0)) + floor(u_time * (2.0 + 14.0 * sev)));
    col = mix(vec3(0.14, 0.18, 0.24), vec3(0.95, 0.96, 1.0), n * sev);
  } else if (band < 3.0) {
    // Season: winter grey → summer green.
    col = mix(vec3(0.55, 0.55, 0.50), vec3(0.10, 0.80, 0.22), clamp(u_season, 0.0, 1.0));
  } else {
    // Time of day: night dark → midday bright.
    float b = clamp(u_sunrise, 0.0, 1.0);
    col = b * vec3(1.0, 0.95, 0.82);
  }

  // Thin dark separators between bands.
  float f = fract(uv.y * 4.0);
  float sep = smoothstep(0.0, 0.03, f) * smoothstep(0.0, 0.03, 1.0 - f);
  col *= mix(0.35, 1.0, sep);

  gl_FragColor = vec4(col, 1.0);
}
