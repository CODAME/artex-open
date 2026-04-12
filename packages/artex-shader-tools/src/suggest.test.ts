import { describe, expect, it } from "vitest";
import { suggestShaders } from "./suggest.ts";

describe("suggestShaders", () => {
  it("returns up to the requested limit", () => {
    const results = suggestShaders({ limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns shader objects with score and reasons", () => {
    const [first] = suggestShaders({ limit: 1 });
    expect(first).toHaveProperty("shader");
    expect(first).toHaveProperty("score");
    expect(first).toHaveProperty("reasons");
    expect(first.shader).toHaveProperty("id");
    expect(first.shader).toHaveProperty("source");
  });

  it("ranks shaders with required audio capability higher", () => {
    const results = suggestShaders({ requiredCapabilities: ["audio"], limit: 10 });
    const audioShaders = results.filter((r) => r.shader.capabilities.usesAudio);
    const nonAudioShaders = results.filter((r) => !r.shader.capabilities.usesAudio);
    if (audioShaders.length > 0 && nonAudioShaders.length > 0) {
      expect(audioShaders[0].score).toBeGreaterThan(nonAudioShaders[0].score);
    }
  });

  it("boosts dream template shaders matching fractal/spiral keywords", () => {
    const results = suggestShaders({ template: "dream", limit: 20 });
    const topIds = results.slice(0, 5).map((r) => r.shader.id);
    // At least one top-5 result should match dream-associated keywords
    const dreamKeywords = ["fractal", "spiral", "tunnel", "voyage", "apparition", "ghost"];
    const hasMatch = topIds.some((id) => dreamKeywords.some((kw) => id.includes(kw)));
    expect(hasMatch).toBe(true);
  });

  it("penalises shaders missing required capabilities", () => {
    const results = suggestShaders({ requiredCapabilities: ["flow"], limit: 30 });
    const withFlow = results.filter((r) => r.shader.capabilities.usesFlow);
    const withoutFlow = results.filter((r) => !r.shader.capabilities.usesFlow);
    if (withFlow.length > 0 && withoutFlow.length > 0) {
      const bestWith = Math.max(...withFlow.map((r) => r.score));
      const bestWithout = Math.max(...withoutFlow.map((r) => r.score));
      expect(bestWith).toBeGreaterThan(bestWithout);
    }
  });

  it("returns default 5 results when no limit specified", () => {
    const results = suggestShaders({});
    expect(results).toHaveLength(5);
  });
});
