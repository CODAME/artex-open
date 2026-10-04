import type { SignalSnapshot } from "@artex/contract";

export type ExtensionCapability =
  | "shader:register"
  | "media-input:register"
  | "text-source:register"
  | "sandbox:register"
  | "block:register"
  | "asset:read"
  | "secret:read";

export interface BaseExtensionDefinition {
  id: string;
  label: string;
  capabilities: ExtensionCapability[];
}

export interface ShaderExtensionDefinition extends BaseExtensionDefinition {
  kind: "shader";
  source: string;
  tags?: string[];
}

export interface MediaInputAdapterDefinition extends BaseExtensionDefinition {
  kind: "media-input";
  adapterKey: string;
}

export interface TextSourceAdapterDefinition extends BaseExtensionDefinition {
  kind: "text-source";
  adapterKey: string;
}

export interface SandboxModuleDefinition extends BaseExtensionDefinition {
  kind: "sandbox";
  mountKey: string;
}

// ---------------------------------------------------------------------------
// Block player — composition block dispatch contract (v0: Tier-1 same-origin)
// ---------------------------------------------------------------------------

/**
 * Size data the host hands to a block player at mount and on resize.
 * Pixel size = `width * dpr` × `height * dpr`.
 */
export interface BlockPlayerSize {
  width: number;
  height: number;
  dpr: number;
}

/**
 * Runtime context handed to a block player at mount.
 *
 * Optional fields are capability-gated: the host omits them entirely when the
 * plugin's manifest does not declare the matching capability. Plugins that need
 * an optional field must declare its capability in their manifest.
 */
export interface BlockPlayerContext {
  /** PluginRecord.id this instance is running under. */
  pluginId: string;
  /** PluginBlockConfig.pluginConfig — opaque to the host, validated by the plugin. */
  pluginConfig: Record<string, unknown>;
  /** Live signal ref. Plugins read `current` each frame. May be null when no signals are wired. */
  signalSnapshotRef: { readonly current: SignalSnapshot | null };
  /** Plugin-scoped log. Routes to console with a `[plugin:<id>]` prefix. */
  log: (...args: unknown[]) => void;
  /** Structured error reporting. Surfaces in Studio's diagnostics drawer. */
  reportError: (error: unknown) => void;
  /** Initial size. Pixel dimensions = `width * dpr` × `height * dpr`. */
  width: number;
  height: number;
  dpr: number;
  /**
   * Subscribe to host-driven resize events. The plugin should re-bind any
   * GL viewport / canvas dimensions on each call. Returns an unsubscribe.
   */
  onResize: (cb: (size: BlockPlayerSize) => void) => () => void;
  /**
   * Per-plugin secret lookup. Present only when the plugin declares
   * `secret:read`. Returns undefined when the secret is unset.
   */
  getSecret?: (name: string) => string | undefined;
  /**
   * Resolves an asset id from the piece's package to a usable URL. Present
   * only when the plugin declares `asset:read` AND the block's
   * `assetReferences[]` listed the id. Returns null when not found.
   */
  getAsset?: (assetId: string) => Promise<string | null>;
}

/**
 * Handle returned by `BlockPlayerDefinition.mount()`. The host calls
 * `unmount()` when the block is removed, the piece changes, or the host
 * tears down. The plugin must release every resource it owns
 * (rAF handles, GL contexts, sockets, listeners).
 */
export interface BlockPlayerInstance {
  unmount: () => void;
}

/**
 * Block-player extension definition.
 *
 * Plugins register one of these via `extensionHost.registerBlockPlayer()` to
 * provide a custom renderer for `PluginBlockConfig` blocks. The runtime
 * resolves a piece's `block.config.pluginId` against `blockKey` to dispatch.
 *
 * v0 contract: Tier-1 same-origin only. Plugin code is loaded from the host
 * bundle (compile-time `import` of the plugin's npm package); the
 * `PluginRecord` admin-approval gate is the trust boundary.
 */
export interface BlockPlayerDefinition extends BaseExtensionDefinition {
  kind: "block";
  /** Stable key the runtime resolves PluginBlockConfig.pluginId against. */
  blockKey: string;
  /**
   * Imperative mount. Synchronous: returns the lifecycle handle immediately.
   * Async setup (asset fetches, model loads, network) runs after mount; the
   * plugin is responsible for rendering a placeholder or empty frame until
   * its setup completes.
   */
  mount: (container: HTMLElement, context: BlockPlayerContext) => BlockPlayerInstance;
}

// ---------------------------------------------------------------------------
// Media Input Frame — the live signal data contract for media input adapters
// ---------------------------------------------------------------------------

/**
 * A single frame of live input signals delivered by a MediaInputAdapter.
 * All numeric fields are normalized to 0..1 unless noted otherwise.
 */
export interface MediaInputFrame {
  /** Monotonic DOMHighResTimeStamp at frame capture (milliseconds). */
  timestamp: number;
  /** Overall audio amplitude — feeds uAudioLevel in shaders. */
  audioLevel: number;
  /** Low-frequency bass amplitude — feeds uBassLevel in shaders. */
  bassLevel: number;
  /** Short transient energy (claps, snaps) — feeds uTransientLevel. */
  transientLevel?: number;
  /**
   * Movement energy, the real frame-to-frame change in the camera picture
   * (0 still, 1 a lot of movement). Not brightness, presence or gesture
   * activity: it feeds uCameraLevel on every surface (#4795).
   */
  cameraLevel?: number;
  /** Viewer proximity, 0 = far / absent, 1 = very close — feeds uProximity. */
  proximity?: number;
}

/**
 * Contract for a pluggable live-input adapter.
 *
 * Implement this interface in `packages/artex-extensions` or your own package
 * and register it via `extensionHost.registerMediaInput()`.
 *
 * The host will call `start()` when the user enables the input and `stop()`
 * when they disable it or the session ends.
 */
export interface MediaInputAdapter {
  /** Stable, URL-safe identifier — e.g. "web-audio-analyser". */
  id: string;
  /** Human-readable name shown in the ARTEX Studio UI. */
  label: string;
  /**
   * Initialize hardware/OS access and start delivering frames.
   * Resolves once the adapter is ready to fire `onFrame` callbacks.
   * Rejecting the promise signals the host that the adapter could not start.
   */
  start(): Promise<void>;
  /** Release hardware/OS resources and stop all frame callbacks. */
  stop(): void;
  /**
   * Register a frame callback.
   * Returns a cleanup function; call it to unsubscribe.
   */
  onFrame(callback: (frame: MediaInputFrame) => void): () => void;
}

// ---------------------------------------------------------------------------
// Text source — owner-supplied phrases for text-driven experiences
// ---------------------------------------------------------------------------

/**
 * Contract for a pluggable text source.
 *
 * A text source supplies short phrases to text-driven experiences (particle
 * typography, poetry clocks, message walls). Where the phrases come from is
 * the adapter's concern: a static list from device setup, an owner's HTTP
 * feed, a webhook inbox. See docs/personal-text-sources-proposal.md for the
 * source taxonomy and privacy model — personal phrases are resolved at play
 * time on the owner's device and never enter the published artwork snapshot.
 *
 * The host calls `start()` when a consuming piece begins playback and
 * `stop()` when it ends. Adapters emit the *complete current phrase list*
 * on every refresh (not deltas); consumers decide ordering and cadence.
 */
export interface TextSourceAdapter {
  /** Stable, URL-safe identifier — e.g. "static-list", "http-poll". */
  id: string;
  /** Human-readable name shown in configuration UIs. */
  label: string;
  /**
   * Begin delivering phrases. Resolves once the adapter is ready to fire
   * `onPhrases` callbacks. Rejecting signals the host that the source could
   * not start (consumers fall back to their own authored phrases).
   */
  start(): Promise<void>;
  /** Release resources and stop all phrase callbacks. */
  stop(): void;
  /**
   * Register a phrase-list callback, fired on start and on every refresh
   * with the full current list. Returns a cleanup function to unsubscribe.
   */
  onPhrases(callback: (phrases: readonly string[]) => void): () => void;
}

// ---------------------------------------------------------------------------
// Sandbox module — an isolated R&D or experiment entry-point
// ---------------------------------------------------------------------------

/**
 * Describes a sandbox module that can be registered for R&D experiments.
 * The host may choose to render sandbox modules in a dedicated experiment tab.
 */
export interface SandboxModule {
  /** Stable, URL-safe identifier — e.g. "three-renderer-v2". */
  id: string;
  /** Human-readable name. */
  label: string;
  /** Optional description of what the sandbox explores. */
  description?: string;
  /**
   * Mount function called by the host when the sandbox should render.
   * The host passes a container element; the sandbox is responsible for
   * cleaning up when the returned teardown function is called.
   */
  mount(container: HTMLElement): () => void;
}

// ---------------------------------------------------------------------------
// Extension host
// ---------------------------------------------------------------------------

export interface ExtensionHostOptions {
  allowedCapabilities: ExtensionCapability[];
}

export class ExtensionRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtensionRegistrationError";
  }
}

const assertNonEmpty = (value: string, label: string): void => {
  if (value.trim().length === 0) {
    throw new ExtensionRegistrationError(`${label} must be a non-empty string.`);
  }
};

const cloneCapabilities = (capabilities: ExtensionCapability[]): ExtensionCapability[] => [...new Set(capabilities)];

/**
 * The type returned by `createExtensionHost()`.
 * Import this type when you need to pass the host around without creating
 * circular dependencies.
 */
export type ExtensionHost = ReturnType<typeof createExtensionHost>;

export const createExtensionHost = ({ allowedCapabilities }: ExtensionHostOptions) => {
  const allowed = new Set(allowedCapabilities);
  const shaders = new Map<string, Readonly<ShaderExtensionDefinition>>();
  const mediaInputs = new Map<string, Readonly<MediaInputAdapterDefinition>>();
  const textSources = new Map<string, Readonly<TextSourceAdapterDefinition>>();
  const sandboxModules = new Map<string, Readonly<SandboxModuleDefinition>>();
  const blockPlayers = new Map<string, Readonly<BlockPlayerDefinition>>();

  const requireCapability = (capability: ExtensionCapability): void => {
    if (!allowed.has(capability)) {
      throw new ExtensionRegistrationError(`Capability ${capability} is not enabled for this host.`);
    }
  };

  const assertBaseDefinition = (definition: BaseExtensionDefinition, expectedCapability: ExtensionCapability): void => {
    assertNonEmpty(definition.id, "Extension id");
    assertNonEmpty(definition.label, "Extension label");
    if (!definition.capabilities.includes(expectedCapability)) {
      throw new ExtensionRegistrationError(
        `Extension ${definition.id} must declare ${expectedCapability} in its manifest capabilities.`,
      );
    }
  };

  return {
    registerShader(definition: ShaderExtensionDefinition): void {
      requireCapability("shader:register");
      assertBaseDefinition(definition, "shader:register");
      if (shaders.has(definition.id)) {
        throw new ExtensionRegistrationError(`Shader extension ${definition.id} is already registered.`);
      }
      assertNonEmpty(definition.source, "Shader source");
      shaders.set(definition.id, Object.freeze({ ...definition, capabilities: cloneCapabilities(definition.capabilities) }));
    },

    registerMediaInput(definition: MediaInputAdapterDefinition): void {
      requireCapability("media-input:register");
      assertBaseDefinition(definition, "media-input:register");
      if (mediaInputs.has(definition.id)) {
        throw new ExtensionRegistrationError(`Media input adapter ${definition.id} is already registered.`);
      }
      assertNonEmpty(definition.adapterKey, "Media adapter key");
      mediaInputs.set(definition.id, Object.freeze({ ...definition, capabilities: cloneCapabilities(definition.capabilities) }));
    },

    registerTextSource(definition: TextSourceAdapterDefinition): void {
      requireCapability("text-source:register");
      assertBaseDefinition(definition, "text-source:register");
      if (textSources.has(definition.id)) {
        throw new ExtensionRegistrationError(`Text source adapter ${definition.id} is already registered.`);
      }
      assertNonEmpty(definition.adapterKey, "Text source adapter key");
      textSources.set(definition.id, Object.freeze({ ...definition, capabilities: cloneCapabilities(definition.capabilities) }));
    },

    registerSandboxModule(definition: SandboxModuleDefinition): void {
      requireCapability("sandbox:register");
      assertBaseDefinition(definition, "sandbox:register");
      if (sandboxModules.has(definition.id)) {
        throw new ExtensionRegistrationError(`Sandbox module ${definition.id} is already registered.`);
      }
      assertNonEmpty(definition.mountKey, "Sandbox mount key");
      sandboxModules.set(definition.id, Object.freeze({ ...definition, capabilities: cloneCapabilities(definition.capabilities) }));
    },

    registerBlockPlayer(definition: BlockPlayerDefinition): void {
      requireCapability("block:register");
      assertBaseDefinition(definition, "block:register");
      if (blockPlayers.has(definition.id)) {
        throw new ExtensionRegistrationError(`Block player ${definition.id} is already registered.`);
      }
      assertNonEmpty(definition.blockKey, "Block player key");
      if (typeof definition.mount !== "function") {
        throw new ExtensionRegistrationError(`Block player ${definition.id} must provide a mount function.`);
      }
      for (const existing of blockPlayers.values()) {
        if (existing.blockKey === definition.blockKey) {
          throw new ExtensionRegistrationError(
            `Block player key ${definition.blockKey} is already registered by ${existing.id}.`,
          );
        }
      }
      blockPlayers.set(definition.id, Object.freeze({ ...definition, capabilities: cloneCapabilities(definition.capabilities) }));
    },

    listShaderExtensions(): readonly Readonly<ShaderExtensionDefinition>[] {
      return [...shaders.values()];
    },

    listMediaInputs(): readonly Readonly<MediaInputAdapterDefinition>[] {
      return [...mediaInputs.values()];
    },

    listTextSources(): readonly Readonly<TextSourceAdapterDefinition>[] {
      return [...textSources.values()];
    },

    listSandboxModules(): readonly Readonly<SandboxModuleDefinition>[] {
      return [...sandboxModules.values()];
    },

    listBlockPlayers(): readonly Readonly<BlockPlayerDefinition>[] {
      return [...blockPlayers.values()];
    },
  };
};
