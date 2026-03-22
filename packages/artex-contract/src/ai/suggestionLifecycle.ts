import type {
  ArtexSuggestion,
  ArtexSuggestionPatch,
  ArtexSuggestionSnapshot,
  ArtworkSuggestionState,
  ConfigJson,
  InteractionProfile,
} from "../types";

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null
);

const isInteractionProfile = (value: unknown): value is InteractionProfile => (
  value === "stable" || value === "expressive" || value === "performance"
);

const normalizeSuggestionPatch = (value: unknown): ArtexSuggestionPatch => {
  const candidate = isRecord(value) ? value : {};

  return {
    ...(typeof candidate.artistTemplate === "string" ? { artistTemplate: candidate.artistTemplate as ArtexSuggestionPatch["artistTemplate"] } : {}),
    ...(typeof candidate.mood === "number" && Number.isFinite(candidate.mood) ? { mood: Math.max(0, Math.min(1, candidate.mood)) } : {}),
    ...(Array.isArray(candidate.simpleInteractions)
      ? {
        simpleInteractions: candidate.simpleInteractions.filter(
          (interaction): interaction is NonNullable<ArtexSuggestionPatch["simpleInteractions"]>[number] => (
            interaction === "timeOfDay" || interaction === "presence" || interaction === "sound" || interaction === "random"
          ),
        ),
      }
      : {}),
    ...(isInteractionProfile(candidate.interactionProfile)
      ? { interactionProfile: candidate.interactionProfile }
      : {}),
  };
};

export const createInitialArtworkSuggestionState = (): ArtworkSuggestionState => ({
  suggestionAvailable: false,
  suggestionStale: false,
  suggestionSource: null,
  provider: null,
  currentSetupOrigin: "manual",
  snapshotCount: 0,
});

export const normalizeArtworkSuggestionState = (value: unknown): ArtworkSuggestionState => {
  const candidate = isRecord(value) ? value : {};
  const currentSetupOrigin = candidate.currentSetupOrigin === "ai"
    || candidate.currentSetupOrigin === "ai_edited"
    || candidate.currentSetupOrigin === "regenerated"
    ? candidate.currentSetupOrigin
    : "manual";

  return {
    suggestionAvailable: candidate.suggestionAvailable === true,
    suggestionStale: candidate.suggestionStale === true,
    suggestionSource: candidate.suggestionSource === "local" || candidate.suggestionSource === "remote"
      ? candidate.suggestionSource
      : null,
    provider: typeof candidate.provider === "string" && candidate.provider !== "disabled"
      ? candidate.provider as ArtworkSuggestionState["provider"]
      : null,
    currentSetupOrigin,
    ...(typeof candidate.lastAcceptedSuggestionId === "string" ? { lastAcceptedSuggestionId: candidate.lastAcceptedSuggestionId } : {}),
    snapshotCount: typeof candidate.snapshotCount === "number" && Number.isFinite(candidate.snapshotCount)
      ? Math.max(0, Math.floor(candidate.snapshotCount))
      : 0,
  };
};

export const normalizeArtexSuggestion = (value: unknown): ArtexSuggestion | null => {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string"
    || typeof value.createdAt !== "string"
    || typeof value.summary !== "string"
    || typeof value.provider !== "string"
    || (value.suggestionSource !== "local" && value.suggestionSource !== "remote")
  ) {
    return null;
  }

  return {
    id: value.id,
    createdAt: value.createdAt,
    provider: value.provider as ArtexSuggestion["provider"],
    suggestionSource: value.suggestionSource,
    summary: value.summary,
    ...(typeof value.rationale === "string" ? { rationale: value.rationale } : {}),
    ...(typeof value.inputSignature === "string" ? { inputSignature: value.inputSignature } : {}),
    patch: normalizeSuggestionPatch(value.patch),
  };
};

export const normalizeArtexSuggestionSnapshot = (value: unknown): ArtexSuggestionSnapshot | null => {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string"
    || typeof value.createdAt !== "string"
    || (value.origin !== "manual" && value.origin !== "ai" && value.origin !== "ai_edited" && value.origin !== "regenerated")
  ) {
    return null;
  }

  return {
    id: value.id,
    createdAt: value.createdAt,
    origin: value.origin,
    ...(typeof value.suggestionId === "string" ? { suggestionId: value.suggestionId } : {}),
    patch: normalizeSuggestionPatch(value.patch),
  };
};

export const extractSuggestionPatchFromConfig = (
  config: Pick<ConfigJson, "artistTemplate" | "mood" | "simpleInteractions" | "interactions">,
): ArtexSuggestionPatch => ({
  ...(config.artistTemplate ? { artistTemplate: config.artistTemplate } : {}),
  ...(typeof config.mood === "number" ? { mood: Math.max(0, Math.min(1, config.mood)) } : {}),
  ...(Array.isArray(config.simpleInteractions) ? { simpleInteractions: [...config.simpleInteractions] } : {}),
  ...(config.interactions?.interactionProfile ? { interactionProfile: config.interactions.interactionProfile } : {}),
});

export const createSuggestionSnapshot = (
  config: Pick<ConfigJson, "artistTemplate" | "mood" | "simpleInteractions" | "interactions">,
  state: ArtworkSuggestionState,
  suggestionId?: string,
): ArtexSuggestionSnapshot => ({
  id: `snapshot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  createdAt: new Date().toISOString(),
  origin: state.currentSetupOrigin,
  ...(suggestionId ? { suggestionId } : {}),
  patch: extractSuggestionPatchFromConfig(config),
});

export const markSuggestionAccepted = (
  previousState: ArtworkSuggestionState,
  suggestion: ArtexSuggestion,
): ArtworkSuggestionState => ({
  suggestionAvailable: true,
  suggestionStale: false,
  suggestionSource: suggestion.suggestionSource,
  provider: suggestion.provider,
  currentSetupOrigin: previousState.lastAcceptedSuggestionId ? "regenerated" : "ai",
  lastAcceptedSuggestionId: suggestion.id,
  snapshotCount: previousState.snapshotCount,
});

export const markSuggestionEdited = (
  previousState: ArtworkSuggestionState,
): ArtworkSuggestionState => (
  previousState.currentSetupOrigin === "ai" || previousState.currentSetupOrigin === "regenerated"
    ? { ...previousState, currentSetupOrigin: "ai_edited" }
    : previousState
);

export const setSuggestionStale = (
  previousState: ArtworkSuggestionState,
  stale: boolean,
): ArtworkSuggestionState => ({
  ...previousState,
  suggestionStale: stale,
});
