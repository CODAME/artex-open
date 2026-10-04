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
import type { Node, TextureNode, UniformNode, Vector2 } from "three/webgpu";

/** A live-mutable scalar (float) uniform node; `.value` is a number. */
export type TslScalarUniform = UniformNode<"float", number>;

/** A live-mutable vec2 uniform node (e.g. resolution); `.value` is a Vector2. */
export type TslVec2Uniform = UniformNode<"vec2", Vector2>;

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
