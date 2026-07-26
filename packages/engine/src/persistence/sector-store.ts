import type { ContentHashes } from "./index.js";

export const SECTOR_STORE_SCHEMA_VERSION = 1 as const;

const DATABASE_NAME = "telemetry-engine-sectors";
const DATABASE_VERSION = 1;
const OBJECT_STORE_NAME = "sectors";

export interface StoredSector<TWorld = unknown> {
  readonly schemaVersion: typeof SECTOR_STORE_SCHEMA_VERSION;
  readonly sectorId: string;
  readonly contentHash: string;
  readonly worlds: readonly TWorld[];
}

export interface SectorStorageBackend {
  get(sectorId: string): Promise<unknown>;
  put(sectorId: string, sector: unknown): Promise<void>;
}

export type SectorLoadResult<TWorld> =
  | { readonly status: "loaded"; readonly sector: StoredSector<TWorld> }
  | { readonly status: "none" };

export interface SectorStore<TWorld> {
  get(sectorId: string): Promise<SectorLoadResult<TWorld>>;
  put(sector: StoredSector<TWorld>): Promise<{ readonly status: "stored" | "unchanged" }>;
}

interface RequestLike<T> {
  result: T;
  error?: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
}

interface OpenRequestLike extends RequestLike<DatabaseLike> {
  onupgradeneeded: (() => void) | null;
}

interface ObjectStoreLike {
  get(key: string): RequestLike<unknown>;
  put(value: unknown, key: string): RequestLike<unknown>;
}

interface TransactionLike {
  error?: unknown;
  oncomplete: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  objectStore(name: string): ObjectStoreLike;
}

interface DatabaseLike {
  readonly objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string): unknown;
  transaction(name: string, mode: "readonly" | "readwrite"): TransactionLike;
}

interface IndexedDbFactoryLike {
  open(name: string, version: number): OpenRequestLike;
}

function requestError(error: unknown, action: string): Error {
  return error instanceof Error ? error : new Error(`IndexedDB could not ${action} the sector.`);
}

function indexedDbFactory(): IndexedDbFactoryLike {
  const factory = (globalThis as { indexedDB?: IndexedDbFactoryLike }).indexedDB;
  if (factory === undefined) {
    throw new Error("Sector storage requires the platform IndexedDB API.");
  }
  return factory;
}

function openSectorDatabase(): Promise<DatabaseLike> {
  return new Promise((resolve, reject) => {
    const request = indexedDbFactory().open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(OBJECT_STORE_NAME)) {
        request.result.createObjectStore(OBJECT_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(requestError(request.error, "open"));
  });
}

function indexedDbBackend(): SectorStorageBackend {
  let database: Promise<DatabaseLike> | undefined;
  const open = () => {
    database ??= openSectorDatabase();
    return database;
  };

  return {
    async get(sectorId) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(OBJECT_STORE_NAME, "readonly");
        const request = transaction.objectStore(OBJECT_STORE_NAME).get(sectorId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(requestError(request.error, "read"));
      });
    },

    async put(sectorId, sector) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(OBJECT_STORE_NAME, "readwrite");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(requestError(transaction.error, "write"));
        transaction.onabort = () => reject(requestError(transaction.error, "write"));
        transaction.objectStore(OBJECT_STORE_NAME).put(sector, sectorId);
      });
    },
  };
}

function storedSector<TWorld>(value: unknown): StoredSector<TWorld> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Stored sector data is malformed.");
  }

  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== SECTOR_STORE_SCHEMA_VERSION) {
    throw new Error(
      `Cannot load sector schema version ${String(record.schemaVersion)}. ` +
        `This build supports sector schema version ${SECTOR_STORE_SCHEMA_VERSION}.`,
    );
  }
  if (
    typeof record.sectorId !== "string" ||
    record.sectorId === "" ||
    typeof record.contentHash !== "string" ||
    record.contentHash === "" ||
    !Array.isArray(record.worlds)
  ) {
    throw new Error("Stored sector data is malformed.");
  }

  return value as StoredSector<TWorld>;
}

export function createSectorStore<TWorld>(
  backend: SectorStorageBackend = indexedDbBackend(),
): SectorStore<TWorld> {
  return {
    async get(sectorId) {
      const value = await backend.get(sectorId);
      return value === undefined
        ? { status: "none" }
        : { status: "loaded", sector: storedSector<TWorld>(value) };
    },

    async put(sector) {
      const valid = storedSector<TWorld>(sector);
      const existing = await backend.get(valid.sectorId);
      if (existing !== undefined) {
        const loaded = storedSector<TWorld>(existing);
        if (JSON.stringify(loaded) === JSON.stringify(valid)) {
          return { status: "unchanged" };
        }
      }

      await backend.put(valid.sectorId, valid);
      return { status: "stored" };
    },
  };
}

export function sectorContentHashes(sector: Pick<StoredSector, "sectorId" | "contentHash">): ContentHashes {
  return { [`sector:${sector.sectorId}`]: sector.contentHash };
}
