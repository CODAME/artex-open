precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_frame;
uniform sampler2D u_delayed_frame;
uniform sampler2D u_delayed_frame_2;
uniform sampler2D u_delayed_frame_3;
uniform sampler2D u_delayed_frame_4;
uniform float u_capture_count;
uniform float u_blend;
uniform vec4 u_tap_enabled;

void main() {
  vec4 live = texture2D(u_frame, v_uv);
  vec4 enabled = u_tap_enabled * vec4(
    step(1.0, u_capture_count), step(2.0, u_capture_count),
    step(3.0, u_capture_count), step(4.0, u_capture_count));
  float n = dot(enabled, vec4(1.0));
  vec4 past = texture2D(u_delayed_frame, v_uv) * enabled.x
    + texture2D(u_delayed_frame_2, v_uv) * enabled.y
    + texture2D(u_delayed_frame_3, v_uv) * enabled.z
    + texture2D(u_delayed_frame_4, v_uv) * enabled.w;
  gl_FragColor = n > 0.0 ? mix(live, past / n, u_blend) : live;
}
