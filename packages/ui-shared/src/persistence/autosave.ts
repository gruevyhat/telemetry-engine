import { openDB, type DBSchema } from "idb";

const DATABASE_NAME = "telemetry-engine";
const DATABASE_VERSION = 2;
const CAMPAIGNS_STORE = "campaigns";
const AUTOSAVE_KEY = "autosave";

interface TelemetryDatabase extends DBSchema {
  campaigns: {
    key: string;
    value: string;
  };
}

function openSaveDatabase() {
  return openDB<TelemetryDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(CAMPAIGNS_STORE)) {
        database.createObjectStore(CAMPAIGNS_STORE);
      }
    },
  });
}

/** M2-10 accepts only an already-encrypted schema-v2 serialization. The UI persistence layer
 * has no plaintext SaveBlob overload or compatibility fallback. */
export async function saveAutosave(encryptedSave: string): Promise<void> {
  const parsed = JSON.parse(encryptedSave) as { schemaVersion?: unknown };
  if (parsed.schemaVersion !== 2) throw new Error("Autosave requires encrypted save schema version 2.");
  const database = await openSaveDatabase();
  await database.put(CAMPAIGNS_STORE, encryptedSave, AUTOSAVE_KEY);
}

export async function loadAutosave(): Promise<string | undefined> {
  const database = await openSaveDatabase();
  return database.get(CAMPAIGNS_STORE, AUTOSAVE_KEY);
}
