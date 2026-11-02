/**
 * Artwork base — what the WebGL backend's base pass draws, as a TSL graph.
 *
 * The artwork contained in the frame (through the media transform), with the
 * evolution flow effect and the state blend applied: `artex_sampleMain`, the
 * same helper every ported graph reads the artwork through, clamped to 0..1 as
 * the base pass clamps its output, with the evolution effects ported so far
 * (`helpers/evolutionEffects.ts`: slices, depth parallax, inside, colour
 * evolution, paint and feedback). The WebGL base pass also runs particles;
 * that is not ported yet.
 *
 * Not a picker entry. `TslShaderStackCompositor` renders it as the base layer
 * when it composites a stack over the artwork the way the WebGL backend
 * composites a user shader (mix, blend mode, mask, temporal smoothing).
 */
import { Fn, clamp, uv, vec4 } from "three/tsl";
import type { Node } from "three/webgpu";
import { ARTEX_BASE_TSL_SCRIPT_ID } from "@artex/contract";
import type { TslGraphEntry, TslGraphFactory } from "@artex/contract/tsl";
import { applyFlow, blendStates } from "../helpers/artexImage";
import { fromDisplay } from "../helpers/displaySpace";
import {
  applyColorEvolution,
  applyDepthParallax,
  applyFeedback,
  applyInsideColor,
  applyInsideUv,
  applyPaintLocal,
  applySliceDisplace,
  declareEvolutionUniforms,
} from "../helpers/evolutionEffects";

export { ARTEX_BASE_TSL_SCRIPT_ID };

/** A node held in a shader variable, so every later use reads it rather than re-inlining its tree. */
function held<T extends Node>(node: T): T {
  return (node as unknown as { toVar(): T }).toVar();
}

const artexBaseFactory: TslGraphFactory = (inputs) => {
  // The body below builds lazily, at compile; the uniforms are declared now.
  declareEvolutionUniforms(inputs);
  return Fn(() => {
    // The base pass's order: the uv distortions (flow, slices, depth
    // parallax, the inside warp), the state blend, then the colour effects
    // (colour evolution, paint, feedback, the inside light; particles,
    // between paint and feedback on WebGL, are not ported), then the clamp.
    // Paint and feedback resample the artwork around the distorted uv.
    //
    // Each stage reads its input several times, so each is held in a
    // variable: inline, every stage would repeat the whole chain beneath it
    // at each use, and the shader grows multiplicatively (seconds to compile
    // and to draw a frame).
    const flowed = held(applyFlow(inputs, uv()));
    const sliced = held(applySliceDisplace(inputs, flowed));
    const deep = held(applyDepthParallax(inputs, sliced));
    const distorted = held(applyInsideUv(inputs, deep));
    const evolved = held(applyColorEvolution(inputs, blendStates(inputs, distorted)));
    const painted = held(applyPaintLocal(inputs, evolved, distorted));
    const fed = held(applyFeedback(inputs, painted, distorted));
    const color = held(clamp(applyInsideColor(inputs, fed, distorted), 0, 1));
    return vec4(fromDisplay(color.rgb), color.a);
  })();
};

export const ARTEX_BASE_TSL_GRAPH: TslGraphEntry = {
  id: ARTEX_BASE_TSL_SCRIPT_ID,
  label: "Artwork base",
  description: "The artwork as the WebGL base pass draws it: contained, with every evolution effect but particles, and state blending.",
  tags: ["artwork", "base"],
  factory: artexBaseFactory,
};
