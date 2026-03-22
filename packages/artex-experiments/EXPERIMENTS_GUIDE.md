# ARTEX Experiments Contributor Guide

> **What you're contributing to:**
> `packages/artex-experiments` is the sandbox track for R&D and unstable
> explorations. The stability bar is lower here — ideas can fail fast.
> Everything here is Apache 2.0 licensed; you keep rights to your work.

---

## When to Use This Package

Use `artex-experiments` when:

- You want to prototype a new renderer, signal adapter, or compiler without
  touching the private creator app
- You're exploring a long-horizon idea that isn't ready for `artex-extensions`
- You want to leave a documented breadcrumb for future contributors

**Do not** use it to ship artist-facing features. Promoted experiments go to
`artex-extensions` (extension API) or `artex-shaders` (shaders).

---

## Adding a Sandbox

1. Create a folder under `src/sandboxes/<your-experiment-name>/`
2. Add a `README.md` describing the goal, scope, and status
3. Add an `index.ts` exporting an `ExperimentModule` object:

```typescript
import type { ExperimentModule } from "../../index";

export const myExperiment: ExperimentModule = {
  track: "renderer-r-and-d",   // from ARTexExperimentTrack
  label: "My Renderer Prototype",
  description: "Explores X by doing Y so that Z becomes possible.",
  stable: false,
};
```

4. Import and re-export it from `src/sandboxes/index.ts` (create if missing)

---

## Existing Tracks

| Track constant | ID string | Description |
|---|---|---|
| `threeRenderer` | `three-renderer` | Three.js renderer backend R&D |
| `touchDesignerBridge` | `touchdesigner-bridge` | TD→ARTEX contract bridge |
| `localAI` | `local-ai` | Local inference and AI signal research |
| `rendererRAndD` | `renderer-r-and-d` | General renderer experiments |
| `mediaInputResearch` | `media-input-research` | Novel live-signal sources |

---

## Rules

1. **No imports from `apps/creator/` or `packages/artex-core/`.**
   Those are private. Read their docs for interface ideas, but don't import them.
2. **No production artist data.**
   Sandboxes should work with synthetic or procedurally generated inputs.
3. **Mark stability** — set `stable: false` until others can reliably run your sandbox.

---

## Submitting

1. Run `npm run check:boundaries` — must pass.
2. Sign your commit: `git commit -s`.
3. Open a PR using the **🔌 Extension Proposal** template (experiments count as proposals).
4. Answer: *"What artist workflow might this eventually unlock?"*
