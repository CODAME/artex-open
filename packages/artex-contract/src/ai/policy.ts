import type { AISettings, LLMProvider, ProjectAIPolicy } from "../types";

export const DEFAULT_PROJECT_AI_POLICY: ProjectAIPolicy = {
  allowRemoteAI: true,
  allowMetadataSend: true,
  allowImageSend: false,
  forceLocalOnly: false,
};

const VALID_PROVIDERS = new Set<LLMProvider>([
  "disabled",
  "local",
  "openai",
  "anthropic",
  "mistral",
  "google",
  "custom_openai_compatible",
]);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null
);

export const normalizeProjectAIPolicy = (value: unknown): ProjectAIPolicy => {
  const candidate = isRecord(value) ? value : {};

  return {
    allowRemoteAI: typeof candidate.allowRemoteAI === "boolean"
      ? candidate.allowRemoteAI
      : DEFAULT_PROJECT_AI_POLICY.allowRemoteAI,
    allowMetadataSend: typeof candidate.allowMetadataSend === "boolean"
      ? candidate.allowMetadataSend
      : DEFAULT_PROJECT_AI_POLICY.allowMetadataSend,
    allowImageSend: typeof candidate.allowImageSend === "boolean"
      ? candidate.allowImageSend
      : DEFAULT_PROJECT_AI_POLICY.allowImageSend,
    forceLocalOnly: typeof candidate.forceLocalOnly === "boolean"
      ? candidate.forceLocalOnly
      : DEFAULT_PROJECT_AI_POLICY.forceLocalOnly,
  };
};

export const canProviderUseRemote = (provider: LLMProvider): boolean => (
  provider !== "disabled" && provider !== "local"
);

export interface EffectiveAIPolicy {
  provider: LLMProvider;
  remoteAllowed: boolean;
  metadataAllowed: boolean;
  imageAllowed: boolean;
}

export const resolveEffectiveAIPolicy = (
  settings: AISettings,
  projectPolicy: ProjectAIPolicy,
): EffectiveAIPolicy => {
  const normalizedProjectPolicy = normalizeProjectAIPolicy(projectPolicy);
  const provider = VALID_PROVIDERS.has(settings.provider) ? settings.provider : "disabled";
  const remoteAllowed = canProviderUseRemote(provider)
    ? (!settings.localOnly && !normalizedProjectPolicy.forceLocalOnly && normalizedProjectPolicy.allowRemoteAI)
    : true;
  const metadataAllowed = settings.allowMetadataSend && normalizedProjectPolicy.allowMetadataSend;
  const imageAllowed = settings.allowImageSend && normalizedProjectPolicy.allowImageSend;

  return {
    provider,
    remoteAllowed,
    metadataAllowed,
    imageAllowed,
  };
};

export interface SuggestionPolicyDecision {
  ok: boolean;
  reason?: string;
}

export const evaluateSuggestionPolicy = (
  settings: AISettings,
  projectPolicy: ProjectAIPolicy,
): SuggestionPolicyDecision => {
  const effectivePolicy = resolveEffectiveAIPolicy(settings, projectPolicy);

  if (!settings.enabled || effectivePolicy.provider === "disabled") {
    return { ok: false, reason: "Enable a provider in AI settings to use suggestions." };
  }

  if (!effectivePolicy.metadataAllowed) {
    return { ok: false, reason: "Metadata sending is disabled by creator or project policy." };
  }

  if (canProviderUseRemote(effectivePolicy.provider) && !effectivePolicy.remoteAllowed) {
    return { ok: false, reason: "This project is locked to local AI only." };
  }

  return { ok: true };
};
