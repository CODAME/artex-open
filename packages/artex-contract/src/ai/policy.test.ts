import { describe, expect, it } from "vitest";
import {
  normalizeProjectAIPolicy,
  DEFAULT_PROJECT_AI_POLICY,
  resolveEffectiveAIPolicy,
  evaluateSuggestionPolicy,
  canProviderUseRemote,
} from "./policy.ts";
import type { AISettings, ProjectAIPolicy } from "../types.ts";

describe("normalizeProjectAIPolicy", () => {
  it("returns defaults for null/undefined", () => {
    expect(normalizeProjectAIPolicy(null)).toEqual(DEFAULT_PROJECT_AI_POLICY);
    expect(normalizeProjectAIPolicy(undefined)).toEqual(DEFAULT_PROJECT_AI_POLICY);
  });

  it("preserves valid boolean fields", () => {
    const custom = { allowRemoteAI: false, allowMetadataSend: false, allowImageSend: true, forceLocalOnly: true };
    expect(normalizeProjectAIPolicy(custom)).toEqual(custom);
  });

  it("replaces non-boolean fields with defaults", () => {
    const broken = { allowRemoteAI: "yes", allowMetadataSend: 1 };
    const result = normalizeProjectAIPolicy(broken);
    expect(result.allowRemoteAI).toBe(DEFAULT_PROJECT_AI_POLICY.allowRemoteAI);
    expect(result.allowMetadataSend).toBe(DEFAULT_PROJECT_AI_POLICY.allowMetadataSend);
  });
});

describe("canProviderUseRemote", () => {
  it("returns false for disabled and local", () => {
    expect(canProviderUseRemote("disabled")).toBe(false);
    expect(canProviderUseRemote("local")).toBe(false);
  });

  it("returns true for cloud providers", () => {
    expect(canProviderUseRemote("openai")).toBe(true);
    expect(canProviderUseRemote("anthropic")).toBe(true);
    expect(canProviderUseRemote("google")).toBe(true);
  });
});

describe("resolveEffectiveAIPolicy", () => {
  const baseSettings: AISettings = {
    enabled: true,
    provider: "openai",
    localOnly: false,
    allowMetadataSend: true,
    allowImageSend: true,
    allowSuggestionHistoryStorage: false,
    connectionStatus: "unknown",
  };

  const openPolicy: ProjectAIPolicy = {
    allowRemoteAI: true,
    allowMetadataSend: true,
    allowImageSend: true,
    forceLocalOnly: false,
  };

  it("allows remote when both settings and policy permit", () => {
    const result = resolveEffectiveAIPolicy(baseSettings, openPolicy);
    expect(result.remoteAllowed).toBe(true);
    expect(result.provider).toBe("openai");
  });

  it("blocks remote when project forces local only", () => {
    const result = resolveEffectiveAIPolicy(baseSettings, { ...openPolicy, forceLocalOnly: true });
    expect(result.remoteAllowed).toBe(false);
  });

  it("blocks image send when project policy disallows", () => {
    const result = resolveEffectiveAIPolicy(baseSettings, { ...openPolicy, allowImageSend: false });
    expect(result.imageAllowed).toBe(false);
  });

  it("treats invalid provider as disabled", () => {
    const result = resolveEffectiveAIPolicy({ ...baseSettings, provider: "invalid_provider" as never }, openPolicy);
    expect(result.provider).toBe("disabled");
  });
});

describe("evaluateSuggestionPolicy", () => {
  const enabledSettings: AISettings = {
    enabled: true,
    provider: "anthropic",
    localOnly: false,
    allowMetadataSend: true,
    allowImageSend: false,
    allowSuggestionHistoryStorage: false,
    connectionStatus: "unknown",
  };

  const openPolicy: ProjectAIPolicy = DEFAULT_PROJECT_AI_POLICY;

  it("allows suggestions when enabled with valid provider", () => {
    const result = evaluateSuggestionPolicy(enabledSettings, openPolicy);
    expect(result.ok).toBe(true);
  });

  it("rejects when AI is disabled", () => {
    const result = evaluateSuggestionPolicy({ ...enabledSettings, enabled: false }, openPolicy);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Enable a provider");
  });

  it("rejects when provider is disabled", () => {
    const result = evaluateSuggestionPolicy({ ...enabledSettings, provider: "disabled" }, openPolicy);
    expect(result.ok).toBe(false);
  });

  it("rejects when metadata is blocked", () => {
    const result = evaluateSuggestionPolicy(
      { ...enabledSettings, allowMetadataSend: false },
      openPolicy,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Metadata");
  });

  it("rejects remote provider when locked to local", () => {
    const result = evaluateSuggestionPolicy(enabledSettings, { ...openPolicy, forceLocalOnly: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("local AI only");
  });
});
