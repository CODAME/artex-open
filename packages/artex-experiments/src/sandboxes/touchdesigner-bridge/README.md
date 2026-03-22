# TouchDesigner Bridge — Experiment Sandbox

**Track:** `touchdesigner-bridge`
**Status:** 🟡 Active R&D — compiler exists in `apps/creator`, this sandbox tracks improvements

---

## Goal

Investigate a cleaner, package-level bridge between TouchDesigner `.toe` exports
and the ARTEX runtime contract. The current TouchDesigner import path lives inside
`apps/creator` (private). This sandbox tracks protocol design and alternative
parsing strategies that can eventually be extracted to a public bridge package.

---

## What Belongs Here

- TouchDesigner manifest parsing experiments
- Alternative effect-stack-to-ConfigJson compilation strategies
- Signal graph mapping research

---

## What Does NOT Belong Here

- Direct imports from `apps/creator/src/` (private)
- Production compiler code — keep that in the private app until stable

---

## Key Reference Documents

- `ARCHITECTURE.md §Experimental Tracks`
- `ARTEX_EVALS_PLAN.md` — evaluation criteria for TD import quality

---

## Contributing

See `EXPERIMENTS_GUIDE.md` in this package. Apache 2.0 — you keep rights to your work.
