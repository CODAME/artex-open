import { describe, expect, it } from "vitest";
import {
  ARTEX_HASH_FN,
  ARTEX_NOISE_FN,
  ARTEX_APPLY_FLOW_FN,
  ARTEX_BLEND_STATES_FN,
  ARTEX_SAMPLE_MAIN_FN,
  ARTEX_SAFE_RESOLUTION_FN,
} from "./helpers.ts";

describe("ARTEX_HASH_FN — precision safety", () => {
  it("declares the return type as highp", () => {
    expect(ARTEX_HASH_FN).toMatch(/^highp\s+float\s+artex_hash/);
  });

  it("declares the input parameter as highp vec2", () => {
    expect(ARTEX_HASH_FN).toMatch(/highp\s+vec2\s+p/);
  });

  it("keeps the canonical 43758.5453 constant (the reason highp is needed)", () => {
    expect(ARTEX_HASH_FN).toContain("43758.5453");
  });
});

describe("ARTEX_BLEND_STATES_FN — hardening", () => {
  it("short-circuits to iChannel0 when uUseStateBlending is not 1", () => {
    expect(ARTEX_BLEND_STATES_FN).toMatch(/uUseStateBlending\s*!=\s*1/);
    expect(ARTEX_BLEND_STATES_FN).toMatch(/texture2D\s*\(\s*iChannel0/);
  });

  it("clamps uStateCount into the 1..4 range before dispatch", () => {
    expect(ARTEX_BLEND_STATES_FN).toMatch(/if\s*\(\s*count\s*<\s*1\s*\)\s*count\s*=\s*1/);
    expect(ARTEX_BLEND_STATES_FN).toMatch(/if\s*\(\s*count\s*>\s*4\s*\)\s*count\s*=\s*4/);
  });

  it("dispatches on the clamped `count` local, not the raw uniform", () => {
    expect(ARTEX_BLEND_STATES_FN).toMatch(/if\s*\(\s*count\s*==\s*1\s*\)/);
    expect(ARTEX_BLEND_STATES_FN).toMatch(/if\s*\(\s*count\s*==\s*2\s*\)/);
    expect(ARTEX_BLEND_STATES_FN).toMatch(/if\s*\(\s*count\s*==\s*3\s*\)/);
  });
});

describe("ARTEX_SAFE_RESOLUTION_FN — zero-guard", () => {
  it("exports a non-empty helper string", () => {
    expect(ARTEX_SAFE_RESOLUTION_FN.length).toBeGreaterThan(0);
  });

  it("returns max(uResolution, vec2(1.0))", () => {
    expect(ARTEX_SAFE_RESOLUTION_FN).toMatch(/max\s*\(\s*uResolution\s*,\s*vec2\s*\(\s*1\.0\s*\)\s*\)/);
  });

  it("has the canonical `artex_safeResolution` function name", () => {
    expect(ARTEX_SAFE_RESOLUTION_FN).toMatch(/vec2\s+artex_safeResolution\s*\(/);
  });
});

describe("canonical helper compositing chain", () => {
  it("ARTEX_SAMPLE_MAIN_FN calls artex_applyFlow and artex_blendStates", () => {
    expect(ARTEX_SAMPLE_MAIN_FN).toContain("artex_applyFlow");
    expect(ARTEX_SAMPLE_MAIN_FN).toContain("artex_blendStates");
  });

  it("ARTEX_APPLY_FLOW_FN degrades to passthrough when uFlowEnabled != 1", () => {
    expect(ARTEX_APPLY_FLOW_FN).toMatch(/uFlowEnabled\s*!=\s*1/);
    expect(ARTEX_APPLY_FLOW_FN).toMatch(/return\s+uv\s*;/);
  });

  it("ARTEX_NOISE_FN calls artex_hash four times (2D lattice lookup)", () => {
    const matches = ARTEX_NOISE_FN.match(/artex_hash\s*\(/g) ?? [];
    expect(matches).toHaveLength(4);
  });
});
