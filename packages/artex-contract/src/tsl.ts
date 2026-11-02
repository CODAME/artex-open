/**
 * TSL shader-pass contract — the canonical types for WebGPU node-graph passes.
 *
 * Lives in the open contract (since 2026-10-04) so `@artex/shaders/tsl` can
 * author graphs against it without depending on `@artex/render-core`, which is
 * private. render-core re-exports these from its own `webgpu/tslTypes.ts`, so
 * the dependency stays one-way: shaders and render-core both depend on the
 * contract, and neither on the other.
 *
 * Types only: `three` is an optional peer, needed only by a consumer that uses
 * this subpath, and nothing here runs.
 *
 * A factory is a pure builder: given the per-pass inputs (source + previous
 * accumulator textures, live-mutable uniforms, time/resolution/interaction
 * uniforms) it returns a vec4 colour node. It must NOT mutate uniform `.value`
 * or hold renderer state — the compositor owns the mutable surface and writes
 * `uniform.value` each frame (no graph rebuild).
 *
 * Uniforms are typed with the concrete `UniformNode<TNodeType, TValue>` so they
 * are usable both as math operands (a `Node<"float">`) AND as a mutable surface
 * (`.value`). A `ReturnType<typeof uniform>` alias would collapse to the generic
 * overload and lose the node-type tag, breaking TSL math operators.
 */
import type { Node, TextureNode, UniformNode, Vector2, Vector3, Vector4 } from "three/webgpu";

/** A live-mutable scalar (float) uniform node; `.value` is a number. */
export type TslScalarUniform = UniformNode<"float", number>;

/** A live-mutable vec2 uniform node (e.g. resolution); `.value` is a Vector2. */
export type TslVec2Uniform = UniformNode<"vec2", Vector2>;

/** A live-mutable vec3 uniform node (e.g. a colour); `.value` is a Vector3. */
export type TslVec3Uniform = UniformNode<"vec3", Vector3>;
/** A live-mutable vec4 uniform node; `.value` is a Vector4. */
export type TslVec4Uniform = UniformNode<"vec4", Vector4>;

/** A texture sampler node (`texture(...)`) whose `.value` the compositor swaps.
 *
 *  Named concretely for the same reason the uniforms above are, and three r186
 *  is what proved it: `texture` gained a generic overload, so
 *  `ReturnType<typeof texture>` began resolving against the LAST overload with
 *  `TNodeType` uninferred — i.e. `TextureNode<unknown>`. `unknown` fails the
 *  numeric constraint the swizzle accessors are declared under, so `.rgb` and
 *  `.a` silently left the type and every read of them became an error-typed
 *  value (5 TS errors, and 17 more `no-unsafe-*` lint errors cascading from
 *  them). The header above had already written down this exact hazard for
 *  `uniform`; this alias was the one place it was not applied.
 *
 *  Written bare rather than as `TextureNode<"vec4">` because "vec4" IS the
 *  declared default and lint rejects restating it; the fix is naming the type
 *  at all, not the argument. */
export type TslTextureUniform = TextureNode;

/** A colour node returned by a graph factory and assigned to a material's `colorNode`.
 *  Factories return a vec4 node (e.g. `vec4(rgb, alpha)`). */
export type TslColorNode = Node<"vec4">;

/**
 * The artwork pipeline a GLSL builtin reads through the patcher's
 * `artex_sampleMain` helpers (`uMainImageResolution`, `uMediaTransform`,
 * `uStateA..D`, `uStateCount`, `uBlendFactor`), for graphs ported from GLSL.
 * `@artex/shaders/tsl` turns these into `sampleMain` and friends; a native
 * graph can ignore them.
 */
export interface TslImageInputs {
  /** The artwork's own size in pixels, for aspect-correct (contained) sampling. 1x1 until known. */
  sourceResolution: TslVec2Uniform;
  /**
   * Pan / zoom / rotate of the artwork as (translateX, translateY, scale,
   * rotation in radians), the GLSL `uMediaTransform`. Identity (0, 0, 1, 0)
   * until the host sets it.
   */
  mediaTransform: TslVec4Uniform;
  /**
   * Evolution state images A–D, the GLSL `uStateA..D`. A slot with no image
   * samples transparent (WebGL borrowed the previous slot's image; the hosts
   * load states contiguously, so this never shows).
   */
  states: readonly [TslTextureUniform, TslTextureUniform, TslTextureUniform, TslTextureUniform];
  /** Each state image's size in pixels, with the same fallbacks. */
  stateResolutions: readonly [TslVec2Uniform, TslVec2Uniform, TslVec2Uniform, TslVec2Uniform];
  /** How many state images are loaded; 0 means no state blending (the artwork plays). */
  stateCount: TslScalarUniform;
  /** Position along the state sequence, 0..1. */
  blendFactor: TslScalarUniform;
}

/**
 * Face tracking, the GLSL `uFaceCenter` / `uLeftEye` / `uRightEye` /
 * `uHasFace` (and their unprefixed aliases, which carry the same values).
 * Points are in uv space from the bottom-left, as the GLSL reads them.
 * Until a host reports a face: centre (0.5, 0.52), eyes (0.42, 0.56) and
 * (0.58, 0.56), presence 0 — the WebGL backend's defaults.
 */
export interface TslFaceInputs {
  center: TslVec2Uniform;
  leftEye: TslVec2Uniform;
  rightEye: TslVec2Uniform;
  /** 0..1 smoothed presence. */
  present: TslScalarUniform;
}

/** Inputs handed to a graph factory when building one shader pass. */
export interface TslPassInputs {
  /** Source artwork texture node. Equal to `prevPass` for the first pass. */
  source: TslTextureUniform;
  /** Previous pass's accumulated output as a texture node. */
  prevPass: TslTextureUniform;
  /**
   * The source's previous FRAME (a new camera or video frame, not a new
   * render), so a graph can see motion (`source - previousSource`) on the GPU
   * without a CPU signal. Stored at the source's own resolution, so sampling
   * both at the same uv compares identical texels and a still source diffs to
   * exactly zero.
   *
   * Reading this is what turns it on: the compositor keeps the history only
   * while some compiled pass has read it, so graphs that never touch it pay
   * nothing. Spreading or proxying the inputs object counts as a read. On the
   * first frame, and after the source changes, it is a copy of the current
   * frame, so motion reads as zero rather than as one false burst.
   */
  previousSource: TslTextureUniform;
  /**
   * Live-mutable scalar uniforms — the union of `pass.params` and the stack's
   * `globalParams`, keyed by raw param name (no `u_` prefix). Read-only to the
   * factory; the compositor writes `.value` each frame.
   */
  uniforms: Map<string, TslScalarUniform>;
  /** Seconds since start (live). */
  time: TslScalarUniform;
  /** Canvas resolution in device pixels as a vec2 uniform (live). */
  resolution: TslVec2Uniform;
  /**
   * A live scalar the host sets by exact name: the TSL counterpart of a GLSL
   * shader declaring `uniform float uVoiceJump;`. Calling it is the
   * declaration; the returned node holds `initial` until the host writes it.
   *
   * The host writes, in order: the standard interaction names (`uProximity`,
   * `uAudioLevel`, `uBassLevel`, `uCameraLevel`) from `interaction`, then its
   * global uniforms (stack binding outputs, `uVoice*` envelopes), which win.
   * So a graph that reads `liveUniform("uProximity")` gets the raw signal
   * where no binding targets it and the binding's smoothed value where one
   * does, exactly as a GLSL pass does. Names are shared with `uniforms`, so a
   * pass param of the same name is the same node.
   */
  liveUniform: (name: string, initial?: number) => TslScalarUniform;
  /**
   * `liveUniform` for a vec2 or vec3 the host sets by exact name: the GLSL
   * `uniform vec2 uPresenceCentroid;` / `uniform vec3 uColorBase;` that a host
   * fills through `setCustomUniforms`. Holds `initial` (zero by default, as an
   * unset GLSL uniform reads) whenever the host is not sending it: before the
   * first value, after the host drops the name, or when the value it sends
   * has another length.
   */
  liveVec2: (name: string, initial?: readonly [number, number]) => TslVec2Uniform;
  liveVec3: (name: string, initial?: readonly [number, number, number]) => TslVec3Uniform;
  /** The artwork pipeline for graphs ported from GLSL (see `TslImageInputs`). */
  image: TslImageInputs;
  /** Face tracking (see `TslFaceInputs`). */
  face: TslFaceInputs;
  /** Live interaction signals from the signal bus, normalised to [0, 1]. */
  interaction: {
    audioLevel: TslScalarUniform;
    bassLevel: TslScalarUniform;
    proximity: TslScalarUniform;
    cameraLevel: TslScalarUniform;
  };
}

/** Pure builder for one shader pass — returns the pass's vec4 colour node. */
export type TslGraphFactory = (inputs: TslPassInputs) => TslColorNode;

/** A builtin TSL graph entry, mirroring `BuiltinShaderLibraryItem` for GLSL. */
export interface TslGraphEntry {
  /** Stable id referenced by `ShaderPassConfig.tslGraph.scriptId`. */
  id: string;
  /** Human-readable label for Studio listings. */
  label: string;
  /** One-line description. */
  description: string;
  /** Discovery tags. */
  tags: string[];
  /** The graph builder. */
  factory: TslGraphFactory;
}

/**
 * Resolves a `tslGraph.scriptId` reference to its graph factory. Returns `null`
 * to skip the pass (unknown id) — mirrors `ShaderSourceResolver` for GLSL.
 */
export type TslGraphResolver = (scriptId: string) => TslGraphFactory | null;
