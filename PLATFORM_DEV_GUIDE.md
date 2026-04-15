# ARTEX Platform Developer Guide

> **Audience:** Core platform developers and invited collaborators building
> on the ARTEX open layer packages.
>
> **North star:** Everything serves living art.
> If a change doesn't help artists make or show their work, question it first.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Repo Access Model](#2-repo-access-model)
3. [Development Setup](#3-development-setup)
4. [Package Map & Boundaries](#4-package-map--boundaries)
5. [What You Can Build](#5-what-you-can-build)
6. [Shader Contributions](#6-shader-contributions)
6b. [P5.js Sketch Contributions](#6b-p5js-sketch-contributions)
6c. [HTML Experience Contributions](#6c-html-experience-contributions)
7. [Extension API Contributions](#7-extension-api-contributions)
8. [Experiment / Sandbox Tracks](#8-experiment--sandbox-tracks)
9. [Contract Changes](#9-contract-changes)
10. [Testing & Quality Gates](#10-testing--quality-gates)
11. [Contribution Workflow](#11-contribution-workflow)
12. [Versioning & Publishing](#12-versioning--publishing)
13. [Governance & Legal](#13-governance--legal)
14. [FAQ](#14-faq)

---

## 1. Architecture Overview

ARTEX is organized across capability layers. Each layer has a clear
access level and dependency direction — dependencies always flow downward;
a lower layer never imports from a higher one.

```
┌─────────────────────────────────────────────────────────────────┐
│  🌐  PLATFORM API  (Open — extends .services/artex-platform-api)│
│  REST + WebSocket API for external integrations                 │
│  Project CRUD · Live config/state updates · Event push          │
│  Auth: dev tokens → Firebase JWT → OAuth2                       │
└───────────────────────┬─────────────────────────────────────────┘
                        │ deployed alongside
┌───────────────────────▼─────────────────────────────────────────┐
│  🔒  CORE PLATFORM  (Private — CODAME only)                     │
│  apps/creator · packages/artex-core · .services/               │
│  Rendering engine · Pipeline · Auth/Tracking · Revenue APIs     │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  🖼️  RENDER CORE  (packages/artex-render-core)            │   │
│  │  Renderer adapters for each engine:                       │   │
│  │  Shader (WebGL) · 3D Scene · P5.js · HTML Canvas          │   │
│  │  Signal bridge (24 signals) · Sandboxed iframes           │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────────────┘
                        │ consumes via package exports only
┌───────────────────────▼─────────────────────────────────────────┐
│  🔌  EXTENSION LAYER  (Semi-Open — Apache 2.0)                  │
│  packages/artex-extensions                                       │
│  ExtensionHost API · Shader hooks · Media input adapters        │
│  Sandbox module registry                                         │
└───────────────────────┬─────────────────────────────────────────┘
                        │ implements types from
┌───────────────────────▼─────────────────────────────────────────┐
│  📜  CONTRACT LAYER  (Open — Apache 2.0)                         │
│  packages/artex-contract                                         │
│  ConfigJson · StateJson · ProjectPackageData                     │
│  RendererMode: webgl | p5js | html | hybrid-reactive-field      │
│  P5jsSketchConfig · HtmlExperienceConfig                         │
│  Package read/write · AI policy types                           │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  🎨  CREATIVE LAYER  (Open — Apache 2.0)                        │
│  packages/artex-shaders                                          │
│  GLSL shaders · Shader library · Shader licensing metadata      │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  🧪  EXPERIMENT LAYER  (Open — Apache 2.0)                      │
│  packages/artex-experiments                                      │
│  R&D sandbox modules · Three.js · TD bridge · AI research       │
└─────────────────────────────────────────────────────────────────┘
```

### Rendering Engines

ARTEX supports four rendering engines, each with its own renderer adapter
and creative workflow in the Studio:

| Engine | `rendererMode` | Config field | Creative layer |
|--------|---------------|--------------|----------------|
| Shader | `webgl` | `layers.base`, shaders | GLSL shaders with ARTEX uniforms |
| 3D Scene | `hybrid-reactive-field` | scene config | Three.js reactive scenes |
| P5.js | `p5js` | `p5js: P5jsSketchConfig` | P5.js instance-mode sketches |
| HTML Canvas | `html` | `html: HtmlExperienceConfig` | Full HTML+JS experiences |

P5.js and HTML experiences run in sandboxed iframes and receive live signals
(audio, proximity, gestures, pose) via the ARTEX signal bridge — a `postMessage`
protocol that injects an `artex` global object with 24 signal properties per frame.

### Dependency Rule

```
artex-shaders        → (no deps)
artex-experiments    → artex-contract
artex-extensions     → artex-contract
artex-contract       → (no deps)
artex-render-core    → artex-contract, artex-extensions
artex-platform-api   → artex-contract

apps/creator         → all packages (through exports only)
artex-core           → artex-contract
```

Run `npm run check:boundaries` at any time to verify this rule holds.

---

## 2. Repo Access Model

| Repository | Visibility | Who has access |
|---|---|---|
| `github.com/codame/artex` *(private)* | Private | CODAME core team only |
| `github.com/codame/artex-open` *(public — coming Phase 3)* | Public | Everyone |

### What lives in the private repo

```
artex/                          ← private monorepo
├── apps/creator/               ← product app (all UI, engine orchestration)
├── packages/artex-core/        ← internal platform types
├── packages/artex-render-core/ ← renderer adapters (Shader, 3D, P5.js, HTML)
├── .services/artex-platform-api/  ← Cloud Run API
├── firestore.rules             ← security rules
├── .env.*                      ← secrets / credentials
└── CLOUD_BETA_RUNBOOK.md       ← deployment runbook
```

### What will be public (artex-open)

```
artex-open/                     ← public repo (coming Phase 3)
├── packages/artex-contract/    ← stable package contract
├── packages/artex-shaders/     ← GLSL shader library
├── packages/artex-extensions/  ← extension host API
└── packages/artex-experiments/ ← R&D sandbox tracks
```

> During the current phase the monorepo contains everything. The public split
> happens when the first external contributor is ready to submit a PR.
> See [§12 Versioning & Publishing](#12-versioning--publishing).

---

## 3. Development Setup

### Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | ≥ 20 LTS | Runtime |
| npm | ≥ 10 | Package manager (workspace-aware) |
| Git | any | Source control with DCO support |

### Clone & install

```bash
# Core team — clone the private monorepo
git clone git@github.com:codame/artex.git
cd artex
npm install
```

If you have access to the public `artex-open` repo only:

```bash
git clone git@github.com:codame/artex-open.git artex
cd artex
npm install
```

### Available scripts (open repo)

`artex-open` is a library-only workspace — there is no dev server or runnable
app in this repo. The creator studio (`apps/creator`) lives in the private
monorepo.

```bash
# Run all tests
npm test

# TypeScript build — zero errors required
npm run build
```

To preview your shader or experiment visually, open a PR — once merged it will
appear in the ARTEX Studio shader library.

### Run the full test suite

```bash
npm test
# Runs: check:boundaries + all vitest suites
# Must pass before any PR is opened
```

### Build for production

```bash
npm run build
# Zero TypeScript errors = green
```

---

## 4. Package Map & Boundaries

### Quick reference

| Package | NPM name | Layer | Imports allowed from |
|---|---|---|---|
| `artex-contract` | `@artex/contract` | Contract | nothing |
| `artex-shaders` | `@artex/shaders` | Creative | `@artex/extensions` |
| `artex-extensions` | `@artex/extensions` | Extension | `@artex/contract` |
| `artex-experiments` | `@artex/experiments` | Experiment | `@artex/contract`, `@artex/extensions` |
| `artex-render-core` | `@artex/render-core` | Render (private) | `@artex/contract`, `@artex/extensions` |
| `artex-core` | `@artex/core` | Core (private) | `@artex/contract` |
| `artex-platform-api` | `@artex/platform-api` | Platform | `@artex/contract` |
| `apps/creator` | `@artex/creator` | App (private) | all packages |

### Hard rules

1. **Open packages never import from `apps/creator` or `artex-core`.**
   Those are private. Read their docs for interface ideas; do not import them.
2. **Use package exports — never relative cross-package paths.**
   `import { X } from "@artex/extensions"` ✅
   `import { X } from "../../artex-extensions/src/index"` ❌
3. **Run `npm run check:boundaries` before every PR.**
   CI will fail if imports cross the boundary.

---

## 5. What You Can Build

### As a shader contributor (lowest friction)

- A new GLSL shader in `packages/artex-shaders/src/shaders/`
- Requires: understanding of ARTEX uniform conventions (see §6)
- No platform access needed

### As a P5.js sketch contributor

- A P5.js instance-mode sketch that runs inside the ARTEX sandbox
- Access 24 live signals (audio, proximity, gestures, pose) via the `artex` global object
- Sketches run in a sandboxed iframe with P5.js v1.11.3 from CDN
- Optional WebGL mode toggle and additional libraries (e.g. `p5.sound`)
- Import existing global-mode sketches — ARTEX auto-converts to instance mode
- See §6b for the signal bridge reference and starter template
- No platform access needed

### As an HTML experience creator

- A full HTML+JS canvas experience that runs inside the ARTEX sandbox
- Same 24-signal bridge as P5.js — the `artex` global is injected automatically
- MediaPipe compatibility shim: if your HTML uses MediaPipe (Pose, Hands, Holistic),
  ARTEX auto-detects and bridges its own signal data into those APIs
- Upload a standalone `.html` file or write directly in the Studio editor
- See §6c for the signal bridge reference
- No platform access needed

### As an extension contributor

- A new media input adapter implementing `MediaInputAdapter`
  (e.g. OSC signal input, MIDI, Bluetooth sensor, custom camera pipeline)
- A new sandbox module in `artex-experiments`
- Requires: TypeScript familiarity + understanding of the extension host API

### As an external integration developer

- An application that creates and manages ARTEX projects via the Platform API
- A live controller that tunes running experiences in real-time (mood, animation, state)
- A sensor bridge that pushes interaction events (proximity, sound, custom triggers) into running artworks
- A dashboard or monitoring tool that subscribes to project state via WebSocket
- Requires: HTTP client + optional WebSocket client. No platform access needed.
- See `.services/artex-platform-api/README.md` for the full API reference, quick start, and sample apps
- Two working examples in `.services/artex-platform-api/examples/`:
  `run-new-project.ts` (Use Case 1) and `update-running-experience.ts` (Use Case 2)

### As a core-layer platform builder (invite-only)

- Improvements to the rendering engine in `apps/creator/src/engine/`
- Performance work on `WebGLRendererBackend.ts`
- New capability surfaces in `artex-extensions` that the app wires up
- Changes to `artex-core` or `artex-contract`
- Contact CODAME to get private repo access

---

## 6. Shader Contributions

> See **[SHADER_GUIDE.md](./packages/artex-shaders/SHADER_GUIDE.md)** for
> the full reference. This section is a quick orientation.

### Flow

```
Write GLSL → Drop in src/shaders/ → Add metadata →
Test in Studio → Run check:boundaries + build → Open PR
```

### ARTEX uniform conventions (summary)

| Uniform | Type | Description |
|---|---|---|
| `uTime` | `float` | Playback time (seconds) |
| `uResolution` | `vec2` | Canvas size (pixels) |
| `uMood` | `float` 0..1 | Artist macro control |
| `iChannel0–3` | `sampler2D` | Artwork / state images |
| `uAudioLevel` | `float` 0..1 | Overall audio amplitude |
| `uBassLevel` | `float` 0..1 | Bass frequency amplitude |
| `uCameraLevel` | `float` 0..1 | Camera brightness signal |
| `uProximity` | `float` 0..1 | Viewer proximity |
| `uParam1–3` | `float` 0..2 | Artist-tunable parameters |
| `uMix` | `float` 0..1 | Blend with base artwork |

All live-input uniforms (audio, camera, proximity) must degrade gracefully
to their `= 0` default when the input is inactive.

### Capability auto-detection

Capabilities are auto-inferred from which uniforms your shader declares.
Audio badge appears when `uAudioLevel` or `uBassLevel` is present.
Camera badge appears when `uCameraLevel` is present. etc.

---

## 6b. P5.js Sketch Contributions

> See **[docs/proposals/p5js-support.md](./docs/proposals/p5js-support.md)** in
> the private repo for the full design. This section is a quick orientation.

### Flow

```
Write P5.js sketch (instance mode) → Test locally →
Import into Studio or paste in P5.js panel → Run check:boundaries + build → Open PR
```

### Instance mode requirement

ARTEX runs P5.js sketches in **instance mode**, not global mode. This means
your sketch receives a `p` argument and all P5.js calls go through it:

```javascript
// ✅ Instance mode (what ARTEX expects)
export default function sketch(p) {
  p.setup = function () {
    p.createCanvas(p.windowWidth, p.windowHeight);
  };
  p.draw = function () {
    p.background(0);
    p.ellipse(p.width / 2, p.height / 2, 50);
  };
}
```

If you have an existing global-mode sketch (`function setup() { ... }`), the
ARTEX import workflow auto-converts it to instance mode.

### ARTEX signal bridge

Inside a P5.js sketch, the `artex` global provides 24 live signals per frame:

| Signal | Type | Description |
|--------|------|-------------|
| `artex.time` | `number` | Playback time (seconds) |
| `artex.proximity` | `number` 0..1 | Viewer proximity |
| `artex.soundLevel` | `number` 0..1 | Overall audio amplitude |
| `artex.soundPeak` | `number` 0..1 | Peak detection |
| `artex.gesture` | `string` | Current detected gesture name |
| `artex.pose` | `object` | Full body pose landmarks |
| `artex.handPose` | `object` | Hand pose landmarks |
| `artex.pinch` | `number` 0..1 | Pinch gesture intensity |
| `artex.openPalm` | `number` 0..1 | Open palm detection |
| `artex.fist` | `number` 0..1 | Fist detection |
| `artex.pointX` | `number` | Pointing direction X |
| `artex.pointY` | `number` | Pointing direction Y |
| `artex.movement` | `number` 0..1 | Overall body movement |
| `artex.stillness` | `number` 0..1 | Stillness detection |
| `artex.width` | `number` | Canvas width (pixels) |
| `artex.height` | `number` | Canvas height (pixels) |

All signals degrade gracefully to `0` (or empty) when the corresponding
input is inactive — no null checks needed.

### Config type

```typescript
interface P5jsSketchConfig {
  sketchSource: string;    // P5.js sketch code (instance-mode)
  webglMode?: boolean;     // WEBGL vs 2D canvas (default: 2D)
  libraries?: string[];    // Optional extra libs (e.g. "p5.sound")
}
```

Set `rendererMode: "p5js"` and provide the `p5js` field in your `ConfigJson`.

---

## 6c. HTML Experience Contributions

### Flow

```
Write HTML + JS → Test in browser →
Upload .html file or paste in HTML panel in Studio → Open PR
```

### How it works

HTML experiences run in a sandboxed `<iframe>` with `allow-scripts`. ARTEX
automatically injects the signal bridge script before your HTML loads, making
the `artex` global available with the same 24 signals as P5.js (see §6b table).

### MediaPipe compatibility

If your HTML uses MediaPipe APIs (`new Pose()`, `new Hands()`, `new Camera()`,
`navigator.mediaDevices.getUserMedia()`), ARTEX auto-detects this and injects
a compatibility shim that bridges ARTEX's own signal data into those APIs.
You don't need to change your existing MediaPipe code — it works as-is with
ARTEX signals replacing the camera feed.

### Config type

```typescript
interface HtmlExperienceConfig {
  htmlSource: string;      // Full HTML source including scripts
}
```

Set `rendererMode: "html"` and provide the `html` field in your `ConfigJson`.

---

## 7. Extension API Contributions

The `artex-extensions` package exposes a typed, capability-scoped API that
the app wires through the `ExtensionHost`. All registered extensions become
first-class ARTEX capabilities — the same API used by built-in shaders.

### Register a shader programmatically

```typescript
import { createExtensionHost } from "@artex/extensions";

const host = createExtensionHost({
  allowedCapabilities: ["shader:register"],
});

host.registerShader({
  id: "my-custom-shader",
  kind: "shader",
  label: "My Custom Shader",
  source: `/* GLSL here */`,
  capabilities: ["shader:register"],
});

// List all registered shaders
host.listShaderExtensions(); // → ReadonlyArray<ShaderExtensionDefinition>
```

### Implement a MediaInputAdapter

```typescript
import type { MediaInputAdapter, MediaInputFrame } from "@artex/extensions";

export class WebAudioAdapter implements MediaInputAdapter {
  id = "web-audio-analyser";
  label = "Browser Web Audio";

  private callbacks = new Set<(frame: MediaInputFrame) => void>();
  private animFrame = 0;
  private analyser?: AnalyserNode;

  async start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext();
    this.analyser = ctx.createAnalyser();
    ctx.createMediaStreamSource(stream).connect(this.analyser);
    this.tick();
  }

  stop(): void {
    cancelAnimationFrame(this.animFrame);
  }

  onFrame(cb: (frame: MediaInputFrame) => void): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  private tick(): void {
    this.animFrame = requestAnimationFrame(() => {
      const data = new Uint8Array(this.analyser!.frequencyBinCount);
      this.analyser!.getByteFrequencyData(data);
      const audioLevel = data.reduce((a, b) => a + b, 0) / data.length / 255;
      const bassLevel = data.slice(0, 8).reduce((a, b) => a + b, 0) / 8 / 255;
      const frame: MediaInputFrame = {
        timestamp: performance.now(),
        audioLevel,
        bassLevel,
      };
      this.callbacks.forEach((cb) => cb(frame));
      this.tick();
    });
  }
}
```

Then register via:

```typescript
host.registerMediaInput({
  id: "web-audio-analyser",
  kind: "media-input",
  label: "Browser Web Audio",
  adapterKey: "webaudio",
  capabilities: ["media-input:register"],
});
```

### Access the host from inside the app (invited core devs)

```typescript
import { useExtensionHost, useShaderExtensions } from "../context/ExtensionContext";

// Anywhere inside the React tree:
const host = useExtensionHost();
const shaders = useShaderExtensions();
```

---

## 8. Experiment / Sandbox Tracks

> See **[EXPERIMENTS_GUIDE.md](./packages/artex-experiments/EXPERIMENTS_GUIDE.md)** for the full guide.

Use `artex-experiments` when:

- You want to prototype without touching the private creator app
- You're exploring a long-horizon idea (new renderer, signal source, protocol)
- You want to leave a breadcrumb for future contributors

### Add a sandbox

```
packages/artex-experiments/src/sandboxes/<my-experiment>/
├── README.md   ← purpose, status, scope
└── index.ts    ← exports ExperimentModule
```

```typescript
// index.ts
import type { ExperimentModule } from "../../index";

export const myExperiment: ExperimentModule = {
  track: "renderer-r-and-d",
  label: "My Renderer Prototype",
  description: "Explores X to eventually unlock Y for artists.",
  stable: false,
};
```

### Existing tracks

| Track | Status | Goal |
|---|---|---|
| `three-renderer` | 🟡 Early R&D | Three.js backend for 3D-scene artworks |
| `touchdesigner-bridge` | 🟡 Active R&D | TD→ARTEX contract bridge at package level |
| `local-ai` | 🔵 Planned | Local inference for shader / signal suggestions |
| `media-input-research` | 🔵 Planned | Novel live-signal sources (OSC, MIDI, BT) |

---

## 9. Contract Changes

Changes to `packages/artex-contract` affect **every package and every future
runtime implementation**, including the Platform API (`.services/artex-platform-api`),
which validates all input against contract types. Treat the contract as a public API.

### Compatibility rules (from ARCHITECTURE.md)

1. `config.json.version` is explicit and validated — bump it for breaking changes
2. Forward-newer configs are rejected with a clear error
3. Unknown extra fields are preserved when packages are read
4. Missing optional assets generate warnings
5. Missing required assets fail clearly

Recent contract additions include `RendererMode` (`webgl | p5js | html |
hybrid-reactive-field`), `P5jsSketchConfig`, and `HtmlExperienceConfig` —
all consumed by both the render-core adapters and the Platform API.

### Before changing `ConfigJson` or `StateJson`

1. Post a proposal in the `extension_proposal` issue template
2. Check with a CODAME core dev (changes may affect the runtime player contract)
3. Add a test in `packages/artex-contract/` covering parse and round-trip
4. Update `PACKAGE_CONTRACT.md` and `CHANGELOG.md`

---

## 10. Testing & Quality Gates

### The test pyramid

```
┌─────────────────────────────────────────┐
│  check:boundaries   (import-level)      │  npm run check:boundaries
├─────────────────────────────────────────┤
│  Unit tests         (package-level)     │  npm test
├─────────────────────────────────────────┤
│  Build check        (TypeScript)        │  npm run build
└─────────────────────────────────────────┘
```

All three gates must be green before a PR is opened.

### Running individually

```bash
# Just boundary rules
npm run check:boundaries

# Tests for a single package
npm run test --workspace packages/artex-extensions

# Full suite (boundaries + all workspaces)
npm test

# TypeScript build (must produce zero errors)
npm run build
```

### Adding tests

All packages use **Vitest**. Place test files next to the source they cover:

```
src/
  myFeature.ts
  myFeature.test.ts
```

---

## 11. Contribution Workflow

### Branch model

```
main            ← production, protected; CODAME only
develop         ← integration branch for invited core devs
feature/*       ← contributor branches (from develop)
experiment/*    ← sandbox/R&D (lower stability bar)
```

### Step-by-step

1. **Fork** or branch from `develop`
2. **Make your change** in the appropriate open package
3. **Verify gates:**
   ```bash
   npm run check:boundaries
   npm run build
   npm test
   ```
4. **Sign your commit** with DCO:
   ```bash
   git commit -s -m "feat(shaders): add Coral Drift shader"
   ```
5. **Open a PR** against `develop` using the appropriate issue template
6. A CODAME core dev will review, request changes, or merge

### PR checklist (from template)

- [ ] `check:boundaries` passes
- [ ] Build passes with zero TypeScript errors
- [ ] Tests updated or added
- [ ] DCO sign-off on all commits
- [ ] No `apps/creator` or `artex-core` imports in open packages
- [ ] "Does this serve living art?" — briefly described in PR body

---

## 12. Versioning & Publishing

Open packages (`artex-contract`, `artex-shaders`, `artex-extensions`,
`artex-experiments`) will be published to npm under the `@artex` scope.

The monorepo uses **Changesets** for semver versioning:

```bash
# When you make a change that warrants a version bump
npm run changeset
# → Interactive prompt: pick affected packages + bump type

# Core team: prepare a release
npm run version:open
# → Updates package.json versions and CHANGELOG.md

# Core team: publish to npm
npm run publish:open
# → Runs changeset publish → pushes to npm
```

### Versioning rules

| Change type | Bump |
|---|---|
| New shader added | `patch` |
| New uniform / capability | `minor` |
| Breaking ConfigJson change | `major` |
| New extension API method | `minor` |
| Breaking extension API change | `major` |

### Current state

All open packages are at `0.0.0` (pre-publish / internal baseline).
First public release will happen when the `artex-open` public repo is created.

---

## 13. Governance & Legal

### License

The four open packages are licensed under **Apache License 2.0**.

- You keep copyright over your contribution
- You license it to ARTEX under Apache 2.0
- ARTEX can use, modify, and evolve your work
- No CLA, no NDA required for shared-layer work

### DCO (Developer Certificate of Origin)

Every commit intended for review must carry a DCO sign-off:

```bash
git commit -s
```

The sign-off certifies you have the right to submit the change under the
package license. See <https://developercertificate.org> for the full text.

### What's NOT covered by the open license

- `apps/creator/` — all rights reserved, CODAME
- `packages/artex-core/` — all rights reserved, CODAME
- `.services/` — all rights reserved, CODAME

These are private and may not be forked, copied, or redistributed.

### Contribution decisions

All merge decisions are made by CODAME core devs. Contributions may be
rejected if they:

- Import from private packages (boundary violation)
- Don't improve artist capability or codebase clarity
- Introduce a hardcoded dependency on a specific artist's assets
- Conflict with the living art product direction

---

## 14. FAQ

**Q: Can I add a custom shader and use it in production ARTEX?**
Yes. Submit a PR to `artex-shaders` following SHADER_GUIDE.md. Once merged
and published, your shader will appear in the ARTEX Studio shader library
for all artists.

**Q: Can I build a plugin that adds a new live-input source (e.g. MIDI)?**
Yes. Implement `MediaInputAdapter` from `@artex/extensions`. It can live
in the `artex-experiments` sandbox until it's stable enough for `artex-extensions`.

**Q: Can I modify the WebGL rendering engine?**
Only with private repo access (invite from CODAME). The engine lives in
`apps/creator/src/engine/` which is private. You can propose changes through
an issue or discussion; core devs will implement them if they fit the roadmap.

**Q: Can I fork and redistribute the creator app?**
No. `apps/creator` and `artex-core` are all-rights-reserved. The four open
packages (`artex-contract`, `artex-shaders`, `artex-extensions`,
`artex-experiments`) can be forked and used under Apache 2.0.

**Q: How do I test my shader before submitting?**
Run the test suite and build check:
```bash
npm test
npm run build
```
For visual confirmation, the shader will appear in ARTEX Studio once your PR
is merged. There is no local studio in `artex-open`.

**Q: Does ARTEX run without Firebase?**
The open packages (`artex-contract`, `artex-shaders`, `artex-extensions`,
`artex-experiments`) have no Firebase dependency — `npm test` and
`npm run build` work out of the box with no credentials. The creator studio,
which does use Firebase, is part of the private monorepo and is not available
in `artex-open`.

**Q: Can I use my existing P5.js sketch in ARTEX?**
Yes. ARTEX supports P5.js as a first-class rendering engine. If your sketch
uses global mode (`function setup() { ... }`), the import workflow auto-converts
it to instance mode. Your sketch also gets access to 24 live signals (audio,
proximity, gestures, pose) via the `artex` global. See §6b.

**Q: Can I use my existing HTML/Canvas project in ARTEX?**
Yes. Upload a standalone `.html` file or paste it in the HTML panel in Studio.
ARTEX runs it in a sandboxed iframe and injects the signal bridge automatically.
If your HTML uses MediaPipe APIs, ARTEX auto-detects and provides a compatibility
shim so your code works without changes. See §6c.

**Q: What rendering engines does ARTEX support?**
Four: Shader (`webgl`) for GLSL, 3D Scene (`hybrid-reactive-field`) for Three.js,
P5.js (`p5js`) for creative coding sketches, and HTML Canvas (`html`) for
standalone HTML+JS experiences. Set `rendererMode` in your `ConfigJson` to
choose the engine.

**Q: How do I build an external integration with ARTEX?**
Use the Platform API at `.services/artex-platform-api/`. It provides REST
endpoints for project management and WebSocket subscriptions for real-time
state updates — no platform-layer access needed. See the README for a quick
start and working sample apps in `examples/`.

**Q: What's the difference between artex-extensions and artex-experiments?**
`artex-extensions` is the **stable, versioned extension API** — code here
goes to npm, is used by the app, and must pass all quality gates.
`artex-experiments` is a **lower-stability R&D sandbox** — ideas can fail,
APIs can change, things might not work. Graduate stable experiments to
`artex-extensions` when they're ready.
