import type { SandboxModule, SandboxModuleDefinition } from "@artex/extensions";
import type { ExperimentModule } from "../../index.js";

export interface EchoWorkflowAssets {
  html: string;
  css: string;
  app: string;
  shader: string;
  wgsl: string;
  sketch: string;
  /** Local, host-bundled p5.js URL. Never loaded from a CDN. */
  p5Url: string;
}

export const echoWorkflowExperimentModule: ExperimentModule = {
  track: "renderer-r-and-d", label: "Echo Lab: Echo workflow",
  description: "Compares delayed frame taps with a p5.js circular buffer.", stable: false,
};

export const echoWorkflowExtension: SandboxModuleDefinition = {
  id: "echo-workflow", label: "Echo Lab: Echo workflow", kind: "sandbox",
  capabilities: ["sandbox:register"], mountKey: "echo-workflow",
};

const scriptText = (value: string): string => value.replace(/<\/script/gi, "<\\/script");
const attribute = (value: string): string => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Host supplies text assets so the open plugin has no bundler-specific imports. */
export function createEchoWorkflowSandbox(assets: EchoWorkflowAssets): SandboxModule {
  return {
    id: echoWorkflowExtension.id, label: echoWorkflowExtension.label,
    description: "Four delayed frame taps compared with a p5.js circular buffer.",
    mount(container) {
      const frame = document.createElement("iframe");
      frame.title = echoWorkflowExtension.label;
      frame.allow = "camera";
      // Trusted first-party document; the iframe scopes styles and enables local camera,
      // clipboard access and direct lifecycle cleanup on route changes.
      frame.style.cssText = "width:100%;height:1600px;border:0;display:block";
      const downloads = {
        shader: URL.createObjectURL(new Blob([assets.shader], { type: "text/plain" })),
        p5: URL.createObjectURL(new Blob([assets.sketch], { type: "text/javascript" })),
      };
      frame.srcdoc = assets.html
        .replace("<!--ECHO_STYLE-->", `<style>${assets.css.replace(/<\/style/gi, "<\\/style")}</style>`)
        .replace("<!--ECHO_P5-->", `<script src="${attribute(assets.p5Url)}"></script>`)
        .replace("<!--ECHO_APP-->", "")
        .replace("</body>", `<script>window.__echoAssets=${scriptText(JSON.stringify({shader:assets.shader,wgsl:assets.wgsl,sketch:assets.sketch}))};window.__echoDownloads=${JSON.stringify(downloads)};</script><script defer>${scriptText(assets.app)}</script></body>`);
      let observer: ResizeObserver | undefined;
      const onLoad = () => {
        const body = frame.contentDocument?.body;
        if (!body) return;
        observer = new ResizeObserver(() => { frame.style.height = `${Math.ceil(body.getBoundingClientRect().height)}px`; });
        observer.observe(body);
      };
      frame.addEventListener("load", onLoad);
      container.append(frame);
      return () => {
        const scope: (Window & { __echoDispose?: () => void }) | null = frame.contentWindow;
        scope?.__echoDispose?.();
        observer?.disconnect();frame.removeEventListener("load", onLoad);frame.remove();
        Object.values(downloads).forEach(url => { URL.revokeObjectURL(url); });
      };
    },
  };
}
