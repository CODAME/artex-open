/**
 * `TslImageInputs` (and the face and vector inputs) for graph tests, shaped as the compositor builds it: the
 * identity media transform, no states, and one transparent 1x1 texture per
 * state slot (never shared: three merges texture bindings by uuid at compile).
 * Test-only; nothing in the package barrel imports this.
 */
import { texture, uniform } from "three/tsl";
import { DataTexture, Vector2, Vector3, Vector4 } from "three/webgpu";
import type { TslFaceInputs, TslImageInputs, TslPassInputs } from "@artex/contract/tsl";

const blank = (): DataTexture => {
  const tex = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  tex.needsUpdate = true;
  return tex;
};

export function stubImageInputs(sourceWidth = 1, sourceHeight = 1): TslImageInputs {
  return {
    sourceResolution: uniform(new Vector2(sourceWidth, sourceHeight)),
    mediaTransform: uniform(new Vector4(0, 0, 1, 0)),
    states: [texture(blank()), texture(blank()), texture(blank()), texture(blank())],
    stateResolutions: [
      uniform(new Vector2(1, 1)),
      uniform(new Vector2(1, 1)),
      uniform(new Vector2(1, 1)),
      uniform(new Vector2(1, 1)),
    ],
    stateCount: uniform(0),
    blendFactor: uniform(0),
  };
}

/** A `TslFaceInputs` at the compositor's defaults: no face reported. */
export function stubFaceInputs(): TslFaceInputs {
  return {
    center: uniform(new Vector2(0.5, 0.52)),
    leftEye: uniform(new Vector2(0.42, 0.56)),
    rightEye: uniform(new Vector2(0.58, 0.56)),
    present: uniform(0),
  };
}

/**
 * `liveVec2` / `liveVec3` as the compositor implements them: one node per
 * name, zero until set. Spread into a test's inputs; `vectors` lets the test
 * set them.
 */
export function stubLiveVectors(): Pick<TslPassInputs, "liveVec2" | "liveVec3"> & {
  vectors: Map<string, { value: Vector2 | Vector3 }>;
} {
  const vectors = new Map<string, { value: Vector2 | Vector3 }>();
  return {
    vectors,
    liveVec2(name, initial = [0, 0]) {
      const node = vectors.get(name) ?? uniform(new Vector2(...initial));
      vectors.set(name, node);
      return node as ReturnType<TslPassInputs["liveVec2"]>;
    },
    liveVec3(name, initial = [0, 0, 0]) {
      const node = vectors.get(name) ?? uniform(new Vector3(...initial));
      vectors.set(name, node);
      return node as ReturnType<TslPassInputs["liveVec3"]>;
    },
  };
}
