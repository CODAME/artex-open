---
owner: bruno
status: experimental
scope: packages/artex-experiments/src/sandboxes/echo-workflow/
---

# Echo Lab: Echo workflow

Editable, first-party sandbox plugin. ARTEX loads it at `/experiment/echo-workflow`.
The existing public-repo sync exports this package to `CODAME/artex-open` when
ARTEX main changes. artex-open is a library repository, not a running host.

Import `createEchoWorkflowSandbox` and `echoWorkflowExtension` from
`@artex/experiments/echo-workflow`. Register the definition with the extension
host's `sandbox:register` capability, then resolve its `mountKey` to the factory.
Pass the included HTML/CSS/app/WGSL/reference GLSL/p5 sketch as strings and a
locally bundled p5.js URL. Mount returns a teardown that stops camera tracks,
animation, GPU resources, p5 buffers and download URLs. No private ARTEX imports
or bundler-specific imports are required by the plugin.

The 24 fps demonstration compares four enabled delayed taps with p5.Graphics
circular history. Echo stores 145 frames; p5 stores 241. Tap i (1-based) samples
`offset + round(i × depth / count)` frames ago. Controls also expose blending,
pause, presets, clear history and extended p5 sampling. Guided settings and
raw JSON share the same session-only recipe, with snap transitions, editable
numeric interpretation boundaries and an empty gesture map. Two independent
side-by-side outputs are compared, rather than composited into a Studio recipe. Camera is opt-in,
video-only, local, and stopped on unmount. Nothing is persisted.

`app.js`, `index.html`, and `style.css` are the editable playground. `echo.wgsl`
is the running WebGPU shader. Original `echo.frag` and `p5-sketch.js` remain
readable/downloadable references. Unsupported WebGPU keeps a static Echo cover;
the independent p5 Canvas comparison is still usable. This is a workflow lab,
not a Studio experience type or production renderer adapter.

Source imported with its owner's authorization from
https://artex-echo-lab.codame-7674.chatgpt.site at source commit
`5686def2f83a80777f3e6926efe96844b45a342e`. The original WebGL renderer was
replaced by an equivalent WebGPU weighted mix, following ARTEX's root renderer
policy. The original vendored p5 1.11.11 is replaced by the host's existing p5
bundle (LGPL-2.1); no duplicate dependency or CDN request is introduced.
