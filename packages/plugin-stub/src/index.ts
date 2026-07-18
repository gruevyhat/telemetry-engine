import type { EconomyPluginApi } from "@telemetry/engine";

/**
 * Minimal, setting-free goods list — enough for build:stub (INV-1) and engine economy tests to
 * exercise a real EconomyPluginApi without depending on plugin-traveller's content.
 */
export const economy: EconomyPluginApi = {
  goods: [
    { id: "generic-goods", basePrice: 100 },
    { id: "refined-materials", basePrice: 250 },
  ],
};
