// Identity Echo: the visitor's face becomes a window into the artwork.
//
// Composites the live camera (iChannel1) over the artwork (uMainImage) through
// a face-shaped mask from the FaceLandmarker cues (uFaceCenter, uLeftEye,
// uRightEye, uHasFace). Lived in ExperiencePresetsPanel.tsx as raw GLSL the
// preset pushed into the shader editor; moved here so it is a builtin like
// every other experience shader and a preset can pick it by id (#3913).
//
// The camera is on channel 1, as the lab read it. On WebGL channel 0 IS
// uMainImage (the patcher renames channel 0 to it), so a camera there replaced
// the artwork and this file did not compile (2026-11-12).
//
// ARTEX binds uEffectParam1..3 (0..2, default 1.0); each is halved to 0..1:
//   uEffectParam1 -> blend opacity
//   uEffectParam2 -> mask softness
//   uEffectParam3 -> mask mode: 0..0.33 face, 0.34..0.66 eyes, 0.67..1 aura
//
// The camera covers the frame, cropped and never stretched, and the face
// points (in the camera's own uv) go through the same mapping, so the window
// lands on the face whatever the shapes of the camera and the screen
// (2026-11-12; before, the camera was stretched to the frame and the window
// met the face only when the two shared an aspect).
precision mediump float;
uniform sampler2D uMainImage;
uniform sampler2D iChannel1;
uniform vec3      iChannelResolution[4];
uniform vec2      uFaceCenter;
uniform vec2      uLeftEye;
uniform vec2      uRightEye;
uniform float     uHasFace;
uniform vec2      uResolution;
uniform float     uTime;
uniform float     uEffectParam1;
uniform float     uEffectParam2;
uniform float     uEffectParam3;
void main() {
  vec2 uv   = gl_FragCoord.xy / uResolution.xy;
  vec4 art  = texture2D(uMainImage, uv);
  // Cover: the part of the camera frame the screen shows, per axis.
  vec2 camRes     = max(iChannelResolution[1].xy, vec2(1.0));
  float camAspect = camRes.x / camRes.y;
  float frameAspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 window = mix(
    vec2(1.0, camAspect / frameAspect),
    vec2(frameAspect / camAspect, 1.0),
    step(frameAspect, camAspect)
  );
  vec4 cam  = texture2D(iChannel1, (uv - 0.5) * window + 0.5);
  // Face points from the camera's uv to the screen's.
  vec2 px       = uv * uResolution;
  vec2 facePx   = ((uFaceCenter - 0.5) / window + 0.5) * uResolution;
  vec2 lEyePx   = ((uLeftEye   - 0.5) / window + 0.5) * uResolution;
  vec2 rEyePx   = ((uRightEye  - 0.5) / window + 0.5) * uResolution;
  float eyeDist = distance(lEyePx, rEyePx);
  float faceR   = max(eyeDist * 1.85, 64.0);
  float p1       = clamp(uEffectParam1 * 0.5, 0.0, 1.0);
  float p2       = clamp(uEffectParam2 * 0.5, 0.0, 1.0);
  float p3       = clamp(uEffectParam3 * 0.5, 0.0, 1.0);
  float opacity  = mix(0.85, 1.0, p1);
  float softness = p2;
  float maskMode = p3 * 3.0;
  float mask    = 0.0;
  if (maskMode < 1.0) {
    float soft = faceR * mix(0.04, 0.55, softness);
    mask = 1.0 - smoothstep(faceR - soft, faceR + soft, distance(px, facePx));
  } else if (maskMode < 2.0) {
    float eyeR = eyeDist * 0.58;
    float soft = eyeR * mix(0.1, 0.65, softness);
    mask = max(
      1.0 - smoothstep(eyeR - soft, eyeR + soft, distance(px, lEyePx)),
      1.0 - smoothstep(eyeR - soft, eyeR + soft, distance(px, rEyePx))
    );
  } else {
    float auraR = faceR * 2.4;
    float soft  = auraR * mix(0.28, 0.72, softness);
    mask = 1.0 - smoothstep(auraR - soft, auraR + soft, distance(px, facePx));
  }
  gl_FragColor = mix(art, cam, mask * opacity * uHasFace);
}

