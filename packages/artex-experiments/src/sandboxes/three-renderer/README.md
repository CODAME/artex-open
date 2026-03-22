# Three.js Renderer — Experiment Sandbox

**Track:** `renderer-r-and-d` / `three-renderer`
**Status:** 🟡 Early Research — not production-ready

---

## Goal

Explore a Three.js-based renderer backend as an alternative to the WebGL2
compositor for 3D-scene-based artworks and reference-effect replication.

This sandbox informs the future direction described in `ARCHITECTURE.md §Later Reference-Effect Direction`.

---

## What Belongs Here

- Three.js renderer prototype that can consume an ARTEX `ConfigJson` package
- Scene recipe experiments (particle systems, depth-driven geometry)
- Performance comparison notes against the current WebGL compositor

---

## What Does NOT Belong Here

- Any import from `apps/creator` or `packages/artex-core`
- Revenue or auth logic
- Production-ready code (graduate it to `artex-extensions` first)

---

## Getting Started

```bash
# Install workspace deps (already done if you ran npm install at root)
npm install

# Run the workspace tests
npm test --workspace packages/artex-experiments
```

---

## Contributing

See `EXPERIMENTS_GUIDE.md` in this package for the full contributor guide.
All contributions are Apache 2.0 — you keep rights to your work.
