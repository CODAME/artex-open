import { describe, expect, it } from "vitest";
import {
  WORK_AI_GENERATED_ASKED_SINCE,
  WORK_AI_GENERATED_VALUES,
  workAiGenerated,
  workAiGeneratedRequired,
  workAiGeneratedWrite,
} from "./workAiGenerated";

describe("workAiGenerated", () => {
  it("reads each of the three answers", () => {
    for (const value of WORK_AI_GENERATED_VALUES) expect(workAiGenerated(value)).toBe(value);
  });

  it("reads anything else as not set", () => {
    for (const value of [undefined, null, "", "Yes", "true", true, 1, "maybe", { value: "yes" }]) {
      expect(workAiGenerated(value)).toBeNull();
    }
  });
});

describe("workAiGeneratedWrite", () => {
  it("carries a real answer", () => {
    expect(workAiGeneratedWrite("assisted")).toEqual({ aiGenerated: "assisted" });
  });

  it("carries nothing for no answer, so a merge keeps the stored one", () => {
    expect(workAiGeneratedWrite(undefined)).toEqual({});
    expect(workAiGeneratedWrite("bogus")).toEqual({});
  });
});

describe("workAiGeneratedRequired", () => {
  it("asks a work not saved yet", () => {
    expect(workAiGeneratedRequired(null)).toBe(true);
    expect(workAiGeneratedRequired(undefined)).toBe(true);
  });

  it("asks a project created since the question existed", () => {
    expect(workAiGeneratedRequired({ createdAt: WORK_AI_GENERATED_ASKED_SINCE })).toBe(true);
    expect(workAiGeneratedRequired({ createdAt: "2026-12-01T09:00:00.000Z" })).toBe(true);
  });

  it("never forces an older project, published, unpublished or never published", () => {
    expect(workAiGeneratedRequired({ createdAt: "2026-06-01T09:00:00.000Z" })).toBe(false);
    expect(workAiGeneratedRequired({})).toBe(false);
    expect(workAiGeneratedRequired({ createdAt: 12 })).toBe(false);
  });
});
