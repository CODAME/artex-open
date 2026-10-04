export { synthesizeFromLegacy, detectLegacyKind, normalizeEnvelope } from "./synthesizeFromLegacy";
export type {
  LegacyKind,
  LegacyPackageEnvelope,
  LegacyPackageInput,
  SynthesisResult,
  SynthesisWarning,
} from "./synthesizeFromLegacy";

export { synthesizeFromV2Shader } from "./synthesizeFromV2Shader";
export {
  synthesizeFromPlugin,
  synthesizeFromV2Html,
  synthesizeFromV2P5,
  synthesizeFromV2Three,
} from "./synthesizeFromV2NonShader";
