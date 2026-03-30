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
  "2tc-15-fractal-complex-265ch-artex": {
    description: "ARTEX-compatible fractal tunnel shader.",
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
  "exit-sunlight-artex": {
    description: "ARTEX-compatible sunlight landscape shader.",
  },
  "ghost-flora-column-artex": {
    description: "Translucent flora cluster with coral filament column.",
  },
  "gif-tile-dancer-grid-artex": {
    description: "GIF-inspired tiled dancer wall with per-cell motion and silhouette edge glow.",
  },
  "golden-electric-spiral-artex": {
    description: "ARTEX-compatible electric spiral shader.",
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
  "kirby-jump-artex": {
    description: "ARTEX-compatible Kirby jump shader.",
  },
  "lavender-poppy-veils-artex": {
    description: "Large translucent lavender poppy veils with orange buds.",
  },
  "lupine-apparition-artex": {
    description: "Central lupine-like spike with layered ghost petals.",
  },
  "mactuitui-filament-column-artex": {
    description: "Dense luminous ribbon column modeled on the mactuitui reference clip.",
  },
  "mactuitui-masterpiece-mesh-artex": {
    label: "Mactuitui Mesh A - Continuous Column",
    description: "Version A. Keep the artwork as one continuous moving column inside the mactuitui structure.",
  },
  "matrix-op-artex": {
    description: "ARTEX-compatible matrix operator shader.",
  },
  "moon-surface-ii-artex": {
    description: "ARTEX-compatible moon surface shader.",
  },
  "neon-botanical-filaments-artex": {
    description: "Generative translucent wireframe flower field.",
  },
  "pastel-wave-trails-artex": {
    description: "Layered pastel wave ribbons with drifting shimmer and face-driven pull.",
  },
  rain: {
    description: "Layered rain streaks over the artwork.",
  },
  "reactive-compute-splat-bloom-artex": {
    description: "Floating translucent particle veil with white micro-sparks and curl-like drift.",
  },
  sampleinteractive: {
    description: "Audio and proximity reactive glow.",
  },
  "sixteen-segment-display-v4-artex": {
    description: "ARTEX-compatible sixteen-segment display shader.",
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
  "sample-proximity-bloom-artex": {
    description: "Starter shader: proximity-driven soft bloom with mood tint and camera exposure.",
  },
  sunshine: {
    description: "Warm sun rays and soft glow.",
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
    const id = toShaderSlug(filename);
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
