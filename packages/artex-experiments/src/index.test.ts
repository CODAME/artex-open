import { describe, expect, it } from "vitest";
import {
  ARTexExperimentTrack,
  threeRendererExperiment,
  touchDesignerBridgeExperiment,
  exampleMediaInputSandbox,
  sampleWebcamSandbox,
  sampleWebAudioSandbox,
} from "./index.ts";
import type { ExperimentModule } from "./index.ts";

const ALL_EXPERIMENTS: ExperimentModule[] = [
  threeRendererExperiment,
  touchDesignerBridgeExperiment,
  exampleMediaInputSandbox,
  sampleWebcamSandbox,
  sampleWebAudioSandbox,
];

describe("ARTexExperimentTrack constants", () => {
  it("exposes at least 5 experiment track identifiers", () => {
    const values = Object.values(ARTexExperimentTrack);
    expect(values.length).toBeGreaterThanOrEqual(5);
  });

  it("all track values are non-empty strings", () => {
    for (const value of Object.values(ARTexExperimentTrack)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

describe("experiment modules — shape validation", () => {
  it.each(ALL_EXPERIMENTS.map((e) => [e.label, e] as const))(
    "%s conforms to ExperimentModule interface",
    (_label, experiment) => {
      expect(experiment).toHaveProperty("track");
      expect(experiment).toHaveProperty("label");
      expect(experiment).toHaveProperty("description");
      expect(experiment).toHaveProperty("stable");

      expect(typeof experiment.track).toBe("string");
      expect(typeof experiment.label).toBe("string");
      expect(typeof experiment.description).toBe("string");
      expect(typeof experiment.stable).toBe("boolean");
    },
  );

  it("every experiment references a valid track", () => {
    const validTracks = new Set(Object.values(ARTexExperimentTrack));
    for (const experiment of ALL_EXPERIMENTS) {
      expect(
        validTracks.has(experiment.track),
        `"${experiment.label}" uses unknown track "${experiment.track}"`,
      ).toBe(true);
    }
  });

  it("every experiment has a meaningful description", () => {
    for (const experiment of ALL_EXPERIMENTS) {
      expect(experiment.description.length).toBeGreaterThan(10);
    }
  });
});
