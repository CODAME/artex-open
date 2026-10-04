import type { ExperimentModule } from "../../index";

export {
  GhostFontEngine,
  sampleGlyphPoints,
  type GhostFontEngineOptions,
  type GlyphPoint,
  type GlyphSamplingOptions,
} from "./ghostFontEngine";
export {
  createDisplayTextSource,
  createStaticTextSource,
  createTextSourceWordSource,
  staticTextSourceExtension,
  type GhostTextSourceWordSource,
} from "./textSource";
export {
  GhostAdviceTheme,
  GhostEmotion,
  createAdviceWordSource,
  createEmotionWordSource,
  createPhraseSource,
  createSecretMessageSource,
  sanitizePhrase,
  type GhostRevealSource,
  type GhostSignalFrame,
  type GhostWordSource,
} from "./wordSources";

/**
 * ARTex Experiment Sandbox Wrapper
 */
export const ghostFontSandbox: ExperimentModule = {
  track: "renderer-r-and-d",
  label: "Ghost Font",
  description:
    "Phrase-driven particle typography: visitor words, emotion pools, " +
    "advice pools, and proximity-revealed secret messages materialise and " +
    "dissolve as ghostly glyph dust.",
  stable: false,
};
