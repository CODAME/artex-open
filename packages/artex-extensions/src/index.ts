export type ExtensionCapability =
  | "shader:register"
  | "media-input:register"
  | "sandbox:register";

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

export interface SandboxModuleDefinition extends BaseExtensionDefinition {
  kind: "sandbox";
  mountKey: string;
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
  /** Camera-brightness signal — feeds uCameraLevel when camera is enabled. */
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
  const sandboxModules = new Map<string, Readonly<SandboxModuleDefinition>>();

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

    registerSandboxModule(definition: SandboxModuleDefinition): void {
      requireCapability("sandbox:register");
      assertBaseDefinition(definition, "sandbox:register");
      if (sandboxModules.has(definition.id)) {
        throw new ExtensionRegistrationError(`Sandbox module ${definition.id} is already registered.`);
      }
      assertNonEmpty(definition.mountKey, "Sandbox mount key");
      sandboxModules.set(definition.id, Object.freeze({ ...definition, capabilities: cloneCapabilities(definition.capabilities) }));
    },

    listShaderExtensions(): readonly Readonly<ShaderExtensionDefinition>[] {
      return [...shaders.values()];
    },

    listMediaInputs(): readonly Readonly<MediaInputAdapterDefinition>[] {
      return [...mediaInputs.values()];
    },

    listSandboxModules(): readonly Readonly<SandboxModuleDefinition>[] {
      return [...sandboxModules.values()];
    },
  };
};
