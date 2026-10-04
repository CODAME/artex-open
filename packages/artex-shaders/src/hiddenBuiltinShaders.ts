// Shaders that exist for a pipeline, not for an artist to pick freeform.
//   echo-artex             — reads u_delayed_frame from the artex.frame-buffer
//                            adapter; launched as an experience type.
//   world-signals-test-field — a V3 ShaderStackCompositor diagnostic. It expects
//                            the compositor to supply u_tempNorm/u_severity/…;
//                            the legacy backend binds none of them, so applying
//                            it renders a frozen test card with dead sliders.
export const HIDDEN_BUILTIN_SHADER_LIBRARY_IDS = new Set<string>([
  "echo-artex",
  "world-signals-test-field",
]);

export const isBuiltinShaderHiddenFromLibrary = (shaderId: string): boolean =>
  HIDDEN_BUILTIN_SHADER_LIBRARY_IDS.has(shaderId);
