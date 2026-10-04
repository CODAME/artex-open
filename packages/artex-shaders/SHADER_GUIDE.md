# ARTEX Shader Contribution Guide

> **What you're contributing to:**
> `packages/artex-shaders` is the open creative layer of ARTEX — GLSL fragment
> shaders that artists use to give living artwork its visual character.
> Everything here is Apache 2.0 licensed; you keep rights to your work.

---

## Quick Start

1. **Write your shader** — it's a standard GLSL fragment shader with
   ARTEX-specific uniform conventions (see below).
2. **Drop it in BOTH shader dirs** (same file, identical contents):
   - `packages/artex-shaders/src/shaders/My Shader Name ARTEX.glsl` — feeds the
     shader-library picker and the runtime resolver.
   - `apps/creator/src/shaders/My Shader Name ARTEX.glsl` — feeds the Studio's
     apply / share-URL / AI / swap path (`EvolutionPage` globs this dir).

   > ⚠️ **Both copies are required.** They are two separate `import.meta.glob`
   > registries. A shader present in only the package dir shows up in the
   > library picker but fails to apply — the Studio logs
   > `Unknown builtinShaderId in URL: <id>. Ignoring.` and renders nothing.
   > Keep the two files byte-identical until the registries are unified.
3. **Add a description** in `builtinShaderLibrary.ts` (one line is enough). For
   live Studio sliders, also add a `BUILTIN_SHADER_METADATA` entry in
   `apps/creator/src/pages/EvolutionPage.tsx` with three `controls` labels.
4. **Test locally** with `npm run dev` — open Studio and find your shader in the Shaders tab.
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

| Uniform | Type | Range | Default | Description |
|---|---|---|---|---|
| `uEffectParam1` | `float` | 0..2 | 1.0 | User-tunable parameter 1 |
| `uEffectParam2` | `float` | 0..2 | 1.0 | User-tunable parameter 2 |
| `uEffectParam3` | `float` | 0..2 | 1.0 | User-tunable parameter 3 |
| `uEffectStrength` | `float` | 0..1 | 1.0 | Blend strength with base artwork |

### Live Inputs (optional — degrade gracefully when 0)

| Uniform | Type | Range | Description |
|---|---|---|---|
| `uAudioLevel` | `float` | 0..1 | Overall audio amplitude |
| `uBassLevel` | `float` | 0..1 | Bass frequency amplitude |
| `uTransientLevel` | `float` | 0..1 | Transient / clap energy |
| `uCameraLevel` | `float` | 0..1 | Movement energy: how much the camera picture is changing (0 still) |
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

precision mediump float;

uniform float uTime;
uniform vec2  uResolution;
uniform float uMood;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;
uniform sampler2D iChannel0;

// Live inputs (always declare; will be 0 when inactive)
uniform float uAudioLevel;
uniform float uBassLevel;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  // --- Your effect here ---
  vec4 base = texture2D(iChannel0, uv);
  vec3 color = base.rgb;

  // Example: audio-reactive brightness pulse
  color += uAudioLevel * 0.3 * uEffectParam1;

  gl_FragColor = vec4(mix(base.rgb, color, clamp(uEffectStrength, 0.0, 1.0)), base.a);
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

## Local Testing

```bash
# Start the dev server
npm run dev

# Open Studio in your browser
# http://localhost:5173/studio

# Click "Shaders" in the top panel — your shader should appear in the list.
```

---

## Using an LLM to generate ARTEX shaders

LLMs (Claude, GPT, Gemini, local Ollama) can write ARTEX-compatible GLSL if you
prime them with the exact uniform names and the constraints below. The common
failure mode is an LLM inventing uniform names it saw in other frameworks
(`uParam1`, `uMix`, `iTime`) — those won't be bound by the ARTEX engine and
your shader will render black.

Paste this as a system/user prompt prefix when asking for a new shader:

```
You are writing a GLSL fragment shader for ARTEX (WebGL1 / GLSL ES 1.00).
Use ONLY these ARTEX uniform names — the engine will not bind anything else:

  precision mediump float;           // NOT highp — some mobile GPUs reject it
  uniform float     uTime;           // seconds since start
  uniform vec2      uResolution;     // canvas pixels
  uniform sampler2D iChannel0;       // primary artwork / video frame
  uniform float     uEffectStrength; // 0..1, default 1.0 — blend with base
  uniform float     uEffectParam1;   // 0..2, default 1.0 — user slider 1
  uniform float     uEffectParam2;   // 0..2, default 1.0 — user slider 2
  uniform float     uEffectParam3;   // 0..2, default 1.0 — user slider 3
  uniform float     uMood;           // 0..1 — artist macro control
  // Optional live inputs (declare only what you use; 0 when inactive):
  uniform float     uAudioLevel;     // 0..1 overall amplitude
  uniform float     uBassLevel;      // 0..1 bass band
  uniform float     uCameraLevel;    // 0..1 camera movement energy (0 still)
  uniform float     uProximity;      // 0..1 viewer proximity

Entry point:
  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec3 base = texture2D(iChannel0, uv).rgb;
    vec3 color = /* your effect */;
    gl_FragColor = vec4(mix(base, color, clamp(uEffectStrength, 0.0, 1.0)), 1.0);
  }

Hard rules:
- No `#version` directive. No `in`/`out`; use `varying` / `gl_FragColor`.
- No `texture()` — use `texture2D()`.
- Float-counted for-loops must have a compile-time upper bound.
- Do NOT invent uniforms. Do NOT use `uMix`, `uParam1`, `iTime`, `iResolution`.
- Live-input uniforms must degrade gracefully when they read 0.
```

After the LLM replies, sanity-check by grepping for banned names:

```bash
grep -nE '\b(uMix|uParam[123]|iTime|iResolution)\b' my-shader.glsl
# Any hit → tell the LLM to rename to the ARTEX equivalent and try again.
```

Drop the result in `packages/artex-shaders/src/shaders/` and follow the
submission steps below.

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
