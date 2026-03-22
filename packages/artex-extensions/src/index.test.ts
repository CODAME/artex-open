import { describe, expect, it } from "vitest";
import {
  ExtensionRegistrationError,
  createExtensionHost,
} from "./index";

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
    }).toThrowError(ExtensionRegistrationError);
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
    }).toThrowError("Media adapter key");
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
});
