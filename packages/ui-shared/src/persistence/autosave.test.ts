import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveBlob } from "@telemetry/engine";
import { openDB } from "idb";
import { loadAutosave, saveAutosave } from "./autosave.js";

vi.mock("idb", () => ({ openDB: vi.fn() }));

const save: SaveBlob = {
  schemaVersion: 1,
  seedState: { campaignSeed: "skim" },
  facts: [],
  contentHashes: { "frames/turn.json": "sha256:turn-v1" },
};

describe("IndexedDB autosave", () => {
  const put = vi.fn();
  const get = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(openDB).mockResolvedValue({ put, get } as never);
  });

  it("stores and retrieves the latest save blob through idb", async () => {
    get.mockResolvedValue(save);

    await saveAutosave(save);
    await expect(loadAutosave()).resolves.toEqual(save);

    expect(openDB).toHaveBeenCalledWith("telemetry-engine", 1, expect.any(Object));
    expect(put).toHaveBeenCalledWith("campaigns", save, "autosave");
    expect(get).toHaveBeenCalledWith("campaigns", "autosave");
  });
});
