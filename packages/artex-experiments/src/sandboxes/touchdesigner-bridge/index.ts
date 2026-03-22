/**
 * TouchDesigner bridge sandbox — experimental entry-point.
 *
 * Investigates a package-level bridge between TouchDesigner exports
 * and the ARTEX runtime contract that can eventually be extracted
 * from the private creator app.
 *
 * Status: Active R&D. API is unstable.
 * See README.md for goals and scope.
 */

import type { ExperimentModule } from "../../index";

export const touchDesignerBridgeExperiment: ExperimentModule = {
  track: "touchdesigner-bridge",
  label: "TouchDesigner Bridge R&D",
  description: (
    "Package-level bridge between TouchDesigner .toe exports and the ARTEX " +
    "ConfigJson runtime contract. Explores alternative manifest parsing and " +
    "effect-stack compilation strategies."
  ),
  stable: false,
};
