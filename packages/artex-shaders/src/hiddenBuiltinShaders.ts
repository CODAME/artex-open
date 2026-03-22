export const HIDDEN_BUILTIN_SHADER_LIBRARY_IDS = new Set<string>([]);

export const isBuiltinShaderHiddenFromLibrary = (shaderId: string): boolean =>
  HIDDEN_BUILTIN_SHADER_LIBRARY_IDS.has(shaderId);
