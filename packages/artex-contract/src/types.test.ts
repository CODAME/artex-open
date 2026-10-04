// Shape tests for the Phase 2 Interactions types. These are additive and
// carry no runtime; the tests exist so that accidental breaking changes to
// `ContinuousBinding`, `ParameterExposure`, or the `InteractionsConfig`
// optional field show up in CI as a failed compile + failed assertion.

import { describe, expect, it } from "vitest";
import type {
  ContinuousBinding,
  InteractionsConfig,
  ParameterExposure,
} from "./types";

describe("ContinuousBinding", () => {
  it("accepts the minimum required fields", () => {
    const binding: ContinuousBinding = {
      id: "b1",
      sourceId: "camera",
      signal: "proximity",
      parameter: "bloomAmount",
      enabled: true,
    };
    expect(binding.id).toBe("b1");
    expect(binding.enabled).toBe(true);
  });

  it("accepts all optional modulation fields", () => {
    const binding: ContinuousBinding = {
      id: "b2",
      sourceId: "mic",
      signal: "level",
      parameter: "shake",
      gain: 1.5,
      range: [0, 0.8],
      smoothing: 0.6,
      enabled: false,
    };
    expect(binding.gain).toBe(1.5);
    expect(binding.range).toEqual([0, 0.8]);
    expect(binding.smoothing).toBe(0.6);
  });
});

describe("ParameterExposure", () => {
  it("requires id and label; range/unit/default are optional", () => {
    const exposure: ParameterExposure = {
      id: "bloomAmount",
      label: "Bloom",
    };
    expect(exposure.id).toBe("bloomAmount");
    expect(exposure.range).toBeUndefined();
    expect(exposure.unit).toBeUndefined();
    expect(exposure.default).toBeUndefined();
  });

  it("carries metadata when provided", () => {
    const exposure: ParameterExposure = {
      id: "rotation",
      label: "Rotation",
      range: [0, 360],
      unit: "°",
      default: 0,
    };
    expect(exposure.range).toEqual([0, 360]);
    expect(exposure.unit).toBe("°");
  });
});

describe("InteractionsConfig.continuousBindings", () => {
  it("is optional and defaults to undefined when omitted", () => {
    const config: InteractionsConfig = {};
    expect(config.continuousBindings).toBeUndefined();
  });

  it("accepts an empty array (opt-in phase 2 authoring)", () => {
    const config: InteractionsConfig = { continuousBindings: [] };
    expect(config.continuousBindings).toEqual([]);
  });

  it("accepts an array of continuous bindings", () => {
    const config: InteractionsConfig = {
      continuousBindings: [
        {
          id: "b1",
          sourceId: "time",
          signal: "elapsed",
          parameter: "phase",
          enabled: true,
        },
      ],
    };
    expect(config.continuousBindings).toHaveLength(1);
    expect(config.continuousBindings?.[0]?.sourceId).toBe("time");
  });
});
