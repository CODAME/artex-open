/**
 * The `scriptId` of the artwork base graph: the artwork contained in the frame,
 * through flow and state blending, as the WebGL backend's base pass draws it.
 * `@artex/shaders` registers the graph; render-core resolves it through the
 * injected `TslGraphResolver` when it composites a stack over the artwork
 * (`TslShaderStackCompositor.setFinalComposite`). Neither package can import the
 * other, so the id lives here. Dependency-free. Never change it.
 */
export const ARTEX_BASE_TSL_SCRIPT_ID = "artex-base-tsl";
