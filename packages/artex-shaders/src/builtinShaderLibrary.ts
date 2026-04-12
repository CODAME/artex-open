import { isBuiltinShaderHiddenFromLibrary } from "./hiddenBuiltinShaders";
import type { ShaderExtensionDefinition } from "@artex/extensions";

export interface BuiltinShaderLibraryCapabilities {
  usesAudio: boolean;
  usesCamera: boolean;
  usesProximity: boolean;
  usesChannels: boolean;
  usesFlow: boolean;
  usesStates: boolean;
}

export interface BuiltinShaderLibraryItem {
  id: string;
  label: string;
  filename: string;
  description: string;
  tags: string[];
  capabilities: BuiltinShaderLibraryCapabilities;
  source: string;
}

interface BuiltinShaderLibraryMetadata {
  label?: string;
  description: string;
}

const SHADER_SOURCE_EXTENSION = /\.(glsl|frag)$/i;

const BUILTIN_SHADER_SOURCES: Record<string, string> = import.meta.glob("./shaders/*", {
  eager: true,
  query: "?raw",
  import: "default",
});

const BUILTIN_SHADER_LIBRARY_METADATA: Partial<Record<string, BuiltinShaderLibraryMetadata>> = {
  "artex-living-field-v3": {
    label: "ARTEX Living Field V3",
    description: "Living light / living matter field with slow memory and presence-driven deformation.",
  },
  "anemone-dustfield-artex": {
    description: "Blue cup blooms with sparkling pollen dust.",
  },
  "bumped-sinusoidal-warp-artex": {
    description: "ARTEX-compatible bumped sine warp shader.",
  },
  "cobalt-petal-plume-artex": {
    description: "Luminous cobalt flower plume with particle spray.",
  },
  "comic-wall-mosaic-artex": {
    description: "Pinned comic board mosaic with sketchy marker panels.",
  },
  "ghost-flora-column-artex": {
    description: "Translucent flora cluster with coral filament column.",
  },
  "gif-tile-dancer-grid-artex": {
    description: "GIF-inspired tiled dancer wall with per-cell motion and silhouette edge glow.",
  },
  "golden-electric-spiral-artex": {
    description: "Golden electric spiral that distorts the artwork with pulsing arcs and radial grid patterns.",
  },
  "golden-porous-rift-artex": {
    description: "Molten porous cavern with glowing golden ridges.",
  },
  "kesson-fbm-image-distortion-artex": {
    description: "ARTEX-compatible FBM distortion shader.",
  },
  "kesson-image-extrusion-1-artex": {
    description: "ARTEX-compatible image extrusion shader (variant 1).",
  },
  "kesson-image-extrusion-2-artex": {
    description: "ARTEX-compatible image extrusion shader (variant 2).",
  },
  "kesson-image-extrusion-3-artex": {
    description: "ARTEX-compatible image extrusion shader (variant 3).",
  },
  "kesson-kifs-fractal-artex": {
    description: "ARTEX-compatible KIFS fractal shader.",
  },
  "kesson-voyage": {
    label: "Kesson Voyage",
    description: "Gyroid tunnel that warps the artwork through twisting organic corridors with glowing beam accents.",
  },
  "kirby-jump-artex": {
    description: "ARTEX-compatible Kirby jump shader.",
  },
  "lavender-poppy-veils-artex": {
    description: "Large translucent lavender poppy veils with orange buds.",
  },
  "lupine-apparition-artex": {
    description: "Central lupine-like spike with layered ghost petals.",
  },
  "filament-column-artex": {
    description: "Dense luminous ribbon column with reactive filaments.",
  },
  "masterpiece-mesh-artex": {
    label: "Mesh A - Continuous Column",
    description: "Version A. Keep the artwork as one continuous moving column inside the filament structure.",
  },
  "matrix-op-artex": {
    description: "Menger fractal geometry that distorts and tints the artwork through recursive 3D structure.",
  },
  "moon-surface-ii-artex": {
    description: "Lunar terrain that sculpts the artwork with FBM-driven topography and depth lighting.",
  },
  "neon-botanical-filaments-artex": {
    description: "Generative translucent wireframe flower field.",
  },
  "pastel-wave-trails-artex": {
    description: "Layered pastel wave ribbons with drifting shimmer and face-driven pull.",
  },
  "primitive-intelligence-study-artex": {
    description: "Near-black synthetic face study with reactive iris, harmonic shell, and sparse telemetry dust.",
  },
  "reactive-compute-splat-bloom-artex": {
    description: "Floating translucent particle veil with white micro-sparks and curl-like drift.",
  },
  "sixteen-segment-display-v4-artex": {
    description: "Neon 16-segment LED text overlaid on the artwork, reactive to audio and proximity.",
  },
  "station-17-artex": {
    description: "ARTEX-compatible STATION 17 shader.",
  },
  "sample-audio-reactive-artex": {
    description: "Starter shader: audio-reactive chromatic aberration, bass warp, and transient flash.",
  },
  "sample-hello-world-artex": {
    description: "Starter shader: minimal hue-shift and vignette — copy this as your base.",
  },
  "sample-flow-field-artex": {
    description: "Starter shader: flow-field UV warp demonstrating uFlowEnabled, uFlowIntensity, uFlowSpeed, and uFlowScale with graceful passthrough when flow is off.",
  },
  "sample-proximity-bloom-artex": {
    description: "Starter shader: proximity-driven soft bloom with mood tint and camera exposure.",
  },
  "sample-state-blend-artex": {
    description: "Starter shader: state blending across up to 4 artwork states with mood-tinted edge-glow — shows the artex_blendStates / artex_sampleMain pattern.",
  },
  "verdant-synapse-web-artex": {
    description: "Green synaptic membrane network with bright nodes.",
  },
};

const stripShaderExtension = (filename: string): string => filename.replace(SHADER_SOURCE_EXTENSION, "");

const toShaderSlug = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const toShaderLabel = (baseName: string): string => {
  const normalized = baseName
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "Unnamed shader";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const inferBuiltinShaderCapabilities = (source: string): BuiltinShaderLibraryCapabilities => {
  const lowerSource = source.toLowerCase();
  const hasAny = (tokens: string[]) => tokens.some((token) => lowerSource.includes(token.toLowerCase()));
  return {
    usesAudio: hasAny(["uAudioLevel", "uBassLevel"]),
    usesCamera: hasAny(["uCameraLevel"]),
    usesProximity: hasAny(["uProximity"]),
    usesChannels: hasAny(["iChannel0", "iChannel1", "iChannel2", "iChannel3", "uMask", "uState1", "uState2"]),
    usesFlow: hasAny(["uFlowEnabled", "uFlowIntensity", "uFlowSpeed", "uFlowScale"]),
    usesStates: hasAny(["uUseStateBlending", "uStateA", "uStateB", "uStateC", "uStateD"]),
  };
};

const getBuiltinShaderCapabilityTags = (capabilities: BuiltinShaderLibraryCapabilities): string[] => {
  const tags: string[] = [];
  if (capabilities.usesAudio) tags.push("Audio");
  if (capabilities.usesCamera) tags.push("Camera");
  if (capabilities.usesProximity) tags.push("Proximity");
  if (capabilities.usesChannels) tags.push("Channels");
  if (capabilities.usesFlow) tags.push("Flow");
  if (capabilities.usesStates) tags.push("States");
  if (tags.length === 0) tags.push("Simple");
  return tags;
};

export const BUILTIN_SHADER_LIBRARY_ITEMS: BuiltinShaderLibraryItem[] = Object.entries(BUILTIN_SHADER_SOURCES)
  .filter(([path]) => SHADER_SOURCE_EXTENSION.test(path))
  .map(([path, source]) => {
    const filename = path.split("/").pop() ?? path;
    const baseName = stripShaderExtension(filename);
    const id = toShaderSlug(baseName);
    const metadata = BUILTIN_SHADER_LIBRARY_METADATA[id];
    const capabilities = inferBuiltinShaderCapabilities(source);
    const isGeneratedMotionShader = /-motion-\d+-artex$/.test(id);

    return {
      id,
      label: metadata?.label ?? toShaderLabel(baseName),
      filename,
      description: metadata?.description
        ?? (isGeneratedMotionShader
          ? "Video-converted motion shader with seeded palette and rhythm."
          : `Built-in shader loaded from packages/artex-shaders/src/shaders/${filename}.`),
      tags: getBuiltinShaderCapabilityTags(capabilities),
      capabilities,
      source,
    };
  })
  .filter((shader) => !isBuiltinShaderHiddenFromLibrary(shader.id))
  .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

export const createBuiltinShaderExtensionDefinitions = (): ShaderExtensionDefinition[] => (
  BUILTIN_SHADER_LIBRARY_ITEMS.map((shader) => ({
    id: shader.id,
    kind: "shader",
    label: shader.label,
    source: shader.source,
    tags: [...shader.tags],
    capabilities: ["shader:register"],
  }))
);
