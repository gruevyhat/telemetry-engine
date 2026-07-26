import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDB } from "idb";
import { loadAutosave, saveAutosave } from "./autosave.js";

vi.mock("idb", () => ({ openDB: vi.fn() }));

const encryptedSave = JSON.stringify({ schemaVersion: 2, security: { ciphertext: "aabbcc" }, facts: [] });

describe("IndexedDB autosave", () => {
  const put = vi.fn();
  const get = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(openDB).mockResolvedValue({ put, get } as never);
  });

  it("stores and retrieves the latest save blob through idb", async () => {
    get.mockResolvedValue(encryptedSave);

    await saveAutosave(encryptedSave);
    await expect(loadAutosave()).resolves.toEqual(encryptedSave);

    expect(openDB).toHaveBeenCalledWith("telemetry-engine", 2, expect.any(Object));
    expect(put).toHaveBeenCalledWith("campaigns", encryptedSave, "autosave");
    expect(get).toHaveBeenCalledWith("campaigns", "autosave");
  });
});
