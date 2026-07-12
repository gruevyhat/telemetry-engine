import { describe, expect, it } from "vitest";
import type { EconomyPluginApi } from "@telemetry/engine";
import { economy } from "./index.js";

describe("plugin-stub economy (Spec §15 Plugin.economy, M1-01)", () => {
  it("provides an EconomyPluginApi-shaped goods list so build:stub and engine tests can exercise a real plugin without plugin-traveller", () => {
    const api: EconomyPluginApi = economy;
    expect(api.goods.length).toBeGreaterThan(0);
    expect(api.goods.every((good) => typeof good.id === "string" && typeof good.basePrice === "number")).toBe(true);
  });
});
