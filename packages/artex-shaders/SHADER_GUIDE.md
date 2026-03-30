# ARTEX Shader Contribution Guide

> **What you're contributing to:**
> `packages/artex-shaders` is the open creative layer of ARTEX — GLSL fragment
> shaders that artists use to give living artwork its visual character.
> Everything here is Apache 2.0 licensed; you keep rights to your work.

---

## Quick Start

1. **Write your shader** — it's a standard GLSL fragment shader with
   ARTEX-specific uniform conventions (see below).
2. **Drop it** in `packages/artex-shaders/src/shaders/My Shader Name ARTEX.glsl`.
3. **Add a description** in `builtinShaderLibrary.ts` (one line is enough).
4. **Verify** with `npm test && npm run build` — both must pass with zero errors.
5. **Open a PR** — use the shader contribution issue template.

---

## File Naming

| Convention | Example |
|---|---|
| Proper case + `ARTEX` suffix | `Coral Drift ARTEX.glsl` |
| Extension: `.glsl` or `.frag` | either works |
| No underscores — spaces are fine | `My Cool Shader ARTEX.glsl` |

The file name becomes the shader ID (slug) and the auto-generated label.
A file named `Coral Drift ARTEX.glsl` becomes `id: "coral-drift-artex"`.

---

## ARTEX Uniform Conventions

ARTEX injects a standard set of uniforms into every shader. Use them to make
your shader responsive to live inputs.

### Always Available

| Uniform | Type | Range | Description |
|---|---|---|---|
| `uTime` | `float` | 0 → ∞ (seconds) | Monotonic playback time |
| `uResolution` | `vec2` | pixels | Canvas width × height |
| `uMood` | `float` | 0..1 | Artist-controlled macro parameter |
| `iChannel0` | `sampler2D` | — | Primary artwork / video frame |
| `iChannel1` | `sampler2D` | — | State image 1 (optional) |
| `iChannel2` | `sampler2D` | — | State image 2 (optional) |
| `iChannel3` | `sampler2D` | — | State image 3 (optional) |

### Shader Parameters

| Uniform | Type | Range | Description |
|---|---|---|---|
| `uParam1` | `float` | 0..2 | User-tunable parameter 1 |
| `uParam2` | `float` | 0..2 | User-tunable parameter 2 |
| `uParam3` | `float` | 0..2 | User-tunable parameter 3 |
| `uMix` | `float` | 0..1 | Blend strength with base artwork |

### Live Inputs (optional — degrade gracefully when 0)

| Uniform | Type | Range | Description |
|---|---|---|---|
| `uAudioLevel` | `float` | 0..1 | Overall audio amplitude |
| `uBassLevel` | `float` | 0..1 | Bass frequency amplitude |
| `uTransientLevel` | `float` | 0..1 | Transient / clap energy |
| `uCameraLevel` | `float` | 0..1 | Camera brightness signal |
| `uProximity` | `float` | 0..1 | Viewer proximity (0=far, 1=close) |

### Flow / Motion

| Uniform | Type | Default | Description |
|---|---|---|---|
| `uFlowEnabled` | `bool` | `false` | Whether optical flow is active |
| `uFlowIntensity` | `float` | 0..1 | Strength of flow displacement |
| `uFlowSpeed` | `float` | 0..1 | Speed of flow evolution |
| `uFlowScale` | `float` | 0..1 | Spatial scale of flow field |

### State Blending

| Uniform | Type | Description |
|---|---|---|
| `uUseStateBlending` | `bool` | Whether state images are available |
| `uStateA` | `sampler2D` | State A image |
| `uStateB` | `sampler2D` | State B image |

### Mask

| Uniform | Type | Description |
|---|---|---|
| `uMask` | `sampler2D` | Optional mask channel |
| `uMaskSource` | `int` | Source selector for the mask |

---

## Minimal Shader Template

```glsl
// My Shader Name ARTEX.glsl
// Apache-2.0 — Your Name <you@example.com>

precision highp float;

uniform float uTime;
uniform vec2  uResolution;
uniform float uMood;
uniform float uMix;
uniform float uParam1;
uniform float uParam2;
uniform float uParam3;
uniform sampler2D iChannel0;

// Live inputs (always declare; will be 0 when inactive)
uniform float uAudioLevel;
uniform float uBassLevel;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;

  // --- Your effect here ---
  vec4 base = texture2D(iChannel0, uv);
  vec3 color = base.rgb;

  // Example: audio-reactive brightness pulse
  color += uAudioLevel * 0.3 * uParam1;

  gl_FragColor = vec4(mix(base.rgb, color, uMix), base.a);
}
```

---

## Capability Detection

The library auto-infers capabilities by scanning your shader source for
uniform names. Make sure to declare and use the uniforms you intend —
capability badges in the UI are generated from this scan.

| Capability badge | Triggered by |
|---|---|
| Audio | `uAudioLevel` or `uBassLevel` |
| Camera | `uCameraLevel` |
| Proximity | `uProximity` |
| Channels | `iChannel0–3`, `uMask`, `uState1–4` |
| Flow | `uFlowEnabled`, `uFlowIntensity`, `uFlowSpeed`, `uFlowScale` |
| States | `uUseStateBlending`, `uStateA`, `uStateB` |

---

## Metadata Entry

After adding your file, open `packages/artex-shaders/src/builtinShaderLibrary.ts`
and add a metadata entry for the shader's slug (auto-derived from the filename):

```typescript
// In BUILTIN_SHADER_LIBRARY_METADATA:
"coral-drift-artex": {
  description: "A soft coral drift with audio-reactive blooms.",
},
```

Optional: supply a `label` override if you want a different display name
than what's auto-generated from the filename.

---

## Testing

`artex-open` is a library-only repo — there is no local dev server. Validate
your shader with:

```bash
npm test
npm run build
```

For visual confirmation, open a PR. Once merged, your shader will appear in
the Shaders panel at [artex.art](https://artex.art).

---

## Submitting Your Shader

1. Run `npm run check:boundaries` — must pass with no violations.
2. Run `npm run build` — must compile cleanly.
3. Sign your commit with the DCO: `git commit -s`.
4. Open a PR using the **🎨 Shader Contribution** template.
5. Describe what the shader does and what artist workflow it supports.

---

## License

By contributing a shader to this package you license it to ARTEX under
**Apache 2.0**. You keep the copyright; ARTEX can use, modify, and evolve
your contribution. No CLA or NDA required.

See `packages/artex-shaders/LICENSE`.
