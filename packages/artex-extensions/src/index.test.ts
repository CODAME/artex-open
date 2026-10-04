import { describe, expect, it } from "vitest";
import {
  ExtensionRegistrationError,
  createExtensionHost,
  type BlockPlayerContext,
  type BlockPlayerDefinition,
} from "./index";

const noop = (): void => undefined;
const noopUnsubscribe = (): (() => void) => noop;

const noopContext = (overrides: Partial<BlockPlayerContext> = {}): BlockPlayerContext => ({
  pluginId: "test",
  pluginConfig: {},
  signalSnapshotRef: { current: null },
  log: noop,
  reportError: noop,
  width: 100,
  height: 100,
  dpr: 1,
  onResize: noopUnsubscribe,
  ...overrides,
});

const stubPlayer = (overrides: Partial<BlockPlayerDefinition> = {}): BlockPlayerDefinition => ({
  id: "stub-block",
  kind: "block",
  label: "Stub block",
  blockKey: "stub-block",
  capabilities: ["block:register"],
  mount: () => ({ unmount: noop }),
  ...overrides,
});

describe("extension host", () => {
  it("rejects registrations when the host capability is disabled", () => {
    const host = createExtensionHost({ allowedCapabilities: [] });

    expect(() => {
      host.registerShader({
        id: "demo",
        kind: "shader",
        label: "Demo shader",
        source: "void main() {}",
        capabilities: ["shader:register"],
      });
    }).toThrow(ExtensionRegistrationError);
  });

  it("rejects invalid manifests even when the host capability is enabled", () => {
    const host = createExtensionHost({ allowedCapabilities: ["media-input:register"] });

    expect(() => {
      host.registerMediaInput({
        id: "camera",
        kind: "media-input",
        label: "Camera adapter",
        adapterKey: "",
        capabilities: ["media-input:register"],
      });
    }).toThrow("Media adapter key");
  });

  describe("text source registration", () => {
    const stubTextSource = (overrides = {}) => ({
      id: "static-list",
      kind: "text-source" as const,
      label: "Static phrase list",
      adapterKey: "static-list",
      capabilities: ["text-source:register" as const],
      ...overrides,
    });

    it("rejects registrations when text-source:register is not allowed", () => {
      const host = createExtensionHost({ allowedCapabilities: [] });
      expect(() => {
        host.registerTextSource(stubTextSource());
      }).toThrow(ExtensionRegistrationError);
    });

    it("rejects empty adapterKey", () => {
      const host = createExtensionHost({ allowedCapabilities: ["text-source:register"] });
      expect(() => {
        host.registerTextSource(stubTextSource({ adapterKey: "" }));
      }).toThrow(/Text source adapter key/);
    });

    it("rejects duplicate id", () => {
      const host = createExtensionHost({ allowedCapabilities: ["text-source:register"] });
      host.registerTextSource(stubTextSource());
      expect(() => {
        host.registerTextSource(stubTextSource());
      }).toThrow(/already registered/);
    });

    it("lists registered text sources", () => {
      const host = createExtensionHost({ allowedCapabilities: ["text-source:register"] });
      host.registerTextSource(stubTextSource());
      expect(host.listTextSources()).toHaveLength(1);
      expect(host.listTextSources()[0]?.id).toBe("static-list");
    });
  });

  it("keeps sandbox modules isolated from shader and media registries", () => {
    const host = createExtensionHost({
      allowedCapabilities: ["shader:register", "sandbox:register"],
    });

    host.registerShader({
      id: "builtin-demo",
      kind: "shader",
      label: "Built-in Demo",
      source: "void main() {}",
      capabilities: ["shader:register"],
    });

    host.registerSandboxModule({
      id: "motion-lab",
      kind: "sandbox",
      label: "Motion Lab",
      mountKey: "motion-lab",
      capabilities: ["sandbox:register"],
    });

    expect(host.listShaderExtensions()).toHaveLength(1);
    expect(host.listSandboxModules()).toHaveLength(1);
    expect(host.listShaderExtensions()[0]?.id).toBe("builtin-demo");
    expect(host.listSandboxModules()[0]?.id).toBe("motion-lab");
  });

  describe("block player registration", () => {
    it("rejects registrations when block:register is not allowed", () => {
      const host = createExtensionHost({ allowedCapabilities: [] });
      expect(() => {
        host.registerBlockPlayer(stubPlayer());
      }).toThrow(ExtensionRegistrationError);
    });

    it("rejects definitions missing block:register from their manifest", () => {
      const host = createExtensionHost({ allowedCapabilities: ["block:register"] });
      expect(() => {
        host.registerBlockPlayer(stubPlayer({ capabilities: ["asset:read"] }));
      }).toThrow(/must declare block:register/);
    });

    it("rejects empty blockKey", () => {
      const host = createExtensionHost({ allowedCapabilities: ["block:register"] });
      expect(() => {
        host.registerBlockPlayer(stubPlayer({ blockKey: "" }));
      }).toThrow(/Block player key/);
    });

    it("rejects duplicate id", () => {
      const host = createExtensionHost({ allowedCapabilities: ["block:register"] });
      host.registerBlockPlayer(stubPlayer());
      expect(() => {
        host.registerBlockPlayer(stubPlayer());
      }).toThrow(/already registered/);
    });

    it("rejects duplicate blockKey from a different id", () => {
      const host = createExtensionHost({ allowedCapabilities: ["block:register"] });
      host.registerBlockPlayer(stubPlayer({ id: "first" }));
      expect(() => {
        host.registerBlockPlayer(stubPlayer({ id: "second", blockKey: "stub-block" }));
      }).toThrow(/already registered by first/);
    });

    it("freezes registered definitions", () => {
      const host = createExtensionHost({ allowedCapabilities: ["block:register"] });
      host.registerBlockPlayer(stubPlayer());
      const [registered] = host.listBlockPlayers();
      expect(Object.isFrozen(registered)).toBe(true);
    });

    it("dispatches mount with the supplied context", () => {
      const host = createExtensionHost({ allowedCapabilities: ["block:register"] });
      const calls: BlockPlayerContext[] = [];
      host.registerBlockPlayer(
        stubPlayer({
          mount: (_container, ctx) => {
            calls.push(ctx);
            return { unmount: noop };
          },
        }),
      );

      const [registered] = host.listBlockPlayers();
      const container = { tagName: "DIV" } as unknown as HTMLElement;
      const ctx = noopContext({ pluginId: "stub-block" });
      registered.mount(container, ctx);
      expect(calls).toHaveLength(1);
      expect(calls[0].pluginId).toBe("stub-block");
    });
  });
});
