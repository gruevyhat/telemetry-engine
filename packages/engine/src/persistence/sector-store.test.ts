import { describe, expect, it, vi } from "vitest";
import { loadLegacyV1Save, type LegacySaveV1 } from "./index.js";
import {
  SECTOR_STORE_SCHEMA_VERSION,
  createSectorStore,
  sectorContentHashes,
  type SectorStorageBackend,
  type StoredSector,
} from "./sector-store.js";

/**
 * [M3-04] Lead-authored acceptance tests. The implementation may not modify this file.
 *
 * The engine owns only setting-neutral storage. World records are opaque JSON-compatible data;
 * parsing and distance behavior remain on the plugin side of INV-1. The store defaults to the
 * browser's IndexedDB, while this deterministic backend models the same keyed object store.
 */

type TestWorld = {
  readonly locationId: string;
  readonly name: string;
};

const sectorA: StoredSector<TestWorld> = {
  schemaVersion: SECTOR_STORE_SCHEMA_VERSION,
  sectorId: "fictional-alpha",
  contentHash: "sec:alpha-v1",
  worlds: [
    { locationId: "0101", name: "Cinder Wake" },
    { locationId: "0202", name: "Glass Harbor" },
  ],
};

function memoryBackend() {
  const records = new Map<string, unknown>();
  const backend: SectorStorageBackend = {
    get: vi.fn(async (sectorId: string) => records.get(sectorId)),
    put: vi.fn(async (sectorId: string, sector: unknown) => {
      records.set(sectorId, structuredClone(sector));
    }),
  };
  return { backend, records };
}

describe("sector store", () => {
  it("stores and reloads byte-identical opaque world records", async () => {
    const { backend } = memoryBackend();
    const store = createSectorStore<TestWorld>(backend);

    await expect(store.put(sectorA)).resolves.toEqual({ status: "stored" });
    const loaded = await store.get(sectorA.sectorId);

    expect(loaded).toEqual({ status: "loaded", sector: sectorA });
    if (loaded.status !== "loaded") throw new Error("expected a loaded sector");
    expect(JSON.stringify(loaded.sector.worlds)).toBe(JSON.stringify(sectorA.worlds));
    expect(loaded.sector.worlds).not.toBe(sectorA.worlds);
  });

  it("survives a simulated fresh launch without consulting the network", async () => {
    const { backend } = memoryBackend();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await createSectorStore<TestWorld>(backend).put(sectorA);
    const freshLaunch = createSectorStore<TestWorld>(backend);

    await expect(freshLaunch.get(sectorA.sectorId)).resolves.toEqual({
      status: "loaded",
      sector: sectorA,
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("re-importing the same sector is idempotent", async () => {
    const { backend, records } = memoryBackend();
    const store = createSectorStore<TestWorld>(backend);

    await expect(store.put(sectorA)).resolves.toEqual({ status: "stored" });
    await expect(store.put(structuredClone(sectorA))).resolves.toEqual({ status: "unchanged" });

    expect(records.size).toBe(1);
    expect(backend.put).toHaveBeenCalledOnce();
  });

  it("returns an explicit no-data result", async () => {
    const { backend } = memoryBackend();

    await expect(createSectorStore<TestWorld>(backend).get("missing")).resolves.toEqual({
      status: "none",
    });
  });

  it("refuses an unsupported sector schema rather than loading it best-effort", async () => {
    const { backend, records } = memoryBackend();
    records.set(sectorA.sectorId, { ...sectorA, schemaVersion: SECTOR_STORE_SCHEMA_VERSION + 1 });

    await expect(createSectorStore<TestWorld>(backend).get(sectorA.sectorId)).rejects.toThrow(
      /sector schema version 2.*supports.*1/i,
    );
  });

  it("links sector drift through the existing named content-hash warning path", () => {
    const save: LegacySaveV1 = {
      schemaVersion: 1,
      seedState: {},
      facts: [],
      contentHashes: sectorContentHashes(sectorA),
    };
    const sectorB = { ...sectorA, contentHash: "sec:alpha-v2" };

    const loaded = loadLegacyV1Save(JSON.stringify(save), {
      schemaVersion: 1,
      contentHashes: sectorContentHashes(sectorB),
      replay: () => ({ replayed: true }),
    });

    expect(loaded.state).toEqual({ replayed: true });
    expect(loaded.warnings).toHaveLength(1);
    expect(loaded.warnings[0]).toMatchObject({
      code: "content-hash-mismatch",
      paths: ["sector:fictional-alpha"],
    });
  });
});
