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

## Robust Shader Patterns

These patterns keep your shader stable across the full tier range — desktop
high-tier down to low-end mobile — and avoid rare-but-fatal edge cases.

### 1. Always guard against a 0×0 canvas

Before the first resize, `uResolution` may be `(0, 0)`. Dividing by it
produces `NaN`/`Inf` UVs that poison every texture lookup. Always clamp:

```glsl
void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv  = gl_FragCoord.xy / res;
  // …
}
```

The validator emits a warning if you divide by `uResolution` without a guard.

### 2. Use `highp` for hash functions

Classic shader hashes like
`fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453)` overflow `mediump`
(~16-bit mantissa) on mobile GPUs, producing banding or a solid colour.
Always mark hash functions `highp`:

```glsl
highp float artex_hash(highp vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
```

If you import the helper from `@artex/shader-tools` (`ARTEX_HASH_FN`), the
`highp` qualifiers are already applied.

### 3. Avoid deep uniform-conditioned branching

Tile-based mobile GPUs serialise divergent branches on uniforms. A function
with more than ~3 sequential `if (uSomething == ...)` checks will cause a
noticeable fill-rate cliff on the low tier.

**Prefer:** `step()`, `mix()`, small lookup arrays, or index-driven helpers.

```glsl
// Bad: 4-way branch on a uniform
if (uMode == 0) return a;
else if (uMode == 1) return b;
else if (uMode == 2) return c;
else                 return d;

// Better: mix between two precomputed paths
vec4 result = mix(a, b, step(0.5, float(uMode)));
```

The validator emits an info-level diagnostic when it detects functions with
more than 3 uniform-conditioned `if` branches.

### 4. Clamp live-input uniforms defensively

Adapters try to hand you clean `0..1` values, but transient glitches happen
(a dropped camera frame, a bad proximity read). Wrap the value if your
effect visibly breaks when the uniform drifts outside its documented range:

```glsl
float proximity = clamp(uProximity, 0.0, 1.0);
```

### 5. Fallback-variant pattern (degrade gracefully)

Live-input uniforms (`uAudioLevel`, `uCameraLevel`, `uProximity`,
`uFlowEnabled`, `uUseStateBlending`, etc.) are **always** declared, but may
sit at `0` when no adapter is connected. Your shader must still look
intentional in that state — a black screen or a frozen frame is a bug.

**Passthrough-when-disabled** is the idiomatic pattern. Example from
`Sample Flow Field ARTEX.glsl`:

```glsl
vec2 artex_applyFlow(vec2 uv) {
  if (uFlowEnabled != 1) return uv;       // passthrough
  // … compute distortion …
  return uv + distortion;
}
```

Example from `Sample State Blend ARTEX.glsl`:

```glsl
vec4 artex_blendStates(vec2 uv) {
  if (uUseStateBlending != 1) {
    return texture2D(iChannel0, uv);       // fall back to base artwork
  }
  // … blend uStateA…uStateD …
}
```

**Rule of thumb:** a shader should render a pleasing still image when **every
live uniform is zero**. Use `iChannel0` as the canonical fallback source.

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
the ARTEX Studio Shaders panel.

### Author-Time Checks (via `@artex/shader-tools`)

The private ARTEX runtime uses `@artex/shader-tools` to validate shaders
before dispatch. When contributing shaders here, the same checks will run
against your file during PR CI. You can anticipate them locally — the
relevant diagnostic classes are:

- **error**: missing `void main()` entry point, missing `gl_FragColor`
  assignment, wrong uniform type.
- **warning**: missing `precision` declaration, Shadertoy remnants
  (`iTime`, `mainImage`), undeclared-but-used ARTEX uniforms, dividing by
  `uResolution` without a zero-guard (see *Robust Shader Patterns* §1).
- **info**: deep uniform-conditioned branching (see §3).

### Future work (not in scope today)

A browser-based **live editor** — in-page GLSL authoring with hot reload,
parameter sliders, and inline validator diagnostics — is planned but not
part of this package. Shader authoring today is a file-based workflow
(edit → PR → merge → appear in Studio). The live-editor design is tracked
in the private `ARTEX` repo roadmap.

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
