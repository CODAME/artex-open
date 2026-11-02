// Which host inputs a shader responds to, read from its source. Kept apart
// from the library module so a caller that only needs the check (the Studio,
// which globs its own copy of the sources) does not pull in the library's
// shader glob with it.

export interface BuiltinShaderLibraryCapabilities {
  usesAudio: boolean;
  usesCamera: boolean;
  usesProximity: boolean;
  usesChannels: boolean;
  usesFlow: boolean;
  usesStates: boolean;
}

const stripGlslComments = (source: string): string => {
  const noBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "));
  return noBlocks.replace(/\/\/[^\n]*/g, "");
};

/**
 * What a shader READS, not what it declares (#5415). Nearly every built-in
 * declares the full set of standard uniforms whether it uses them or not, so
 * a name anywhere in the source tagged 39 of 41 shaders with every capability.
 * Comments and `uniform …;` declarations are stripped first, the same rule as
 * `shaderReadsCameraLevel` in the creator's public interaction hints, and a
 * token matches as a whole word (`uState1` is not `uState10`).
 */
export const inferBuiltinShaderCapabilities = (source: string): BuiltinShaderLibraryCapabilities => {
  const body = stripGlslComments(source).replace(/\buniform\b[^;]*;/g, "");
  const hasAny = (tokens: string[]) => tokens.some((token) => new RegExp(`\\b${token}\\b`).test(body));
  return {
    usesAudio: hasAny(["uAudioLevel", "uBassLevel"]),
    usesCamera: hasAny(["uCameraLevel"]),
    usesProximity: hasAny(["uProximity"]),
    usesChannels: hasAny(["iChannel0", "iChannel1", "iChannel2", "iChannel3", "uMask", "uState1", "uState2"]),
    usesFlow: hasAny(["uFlowEnabled", "uFlowIntensity", "uFlowSpeed", "uFlowScale"]),
    usesStates: hasAny(["uUseStateBlending", "uStateA", "uStateB", "uStateC", "uStateD"]),
  };
};
