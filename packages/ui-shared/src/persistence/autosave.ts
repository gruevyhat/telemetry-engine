import type { SaveBlob } from "@telemetry/engine";
import { openDB, type DBSchema } from "idb";

const DATABASE_NAME = "telemetry-engine";
const DATABASE_VERSION = 1;
const CAMPAIGNS_STORE = "campaigns";
const AUTOSAVE_KEY = "autosave";

interface TelemetryDatabase extends DBSchema {
  campaigns: {
    key: string;
    value: SaveBlob;
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

export async function saveAutosave(save: SaveBlob): Promise<void> {
  const database = await openSaveDatabase();
  await database.put(CAMPAIGNS_STORE, save, AUTOSAVE_KEY);
}

export async function loadAutosave(): Promise<SaveBlob | undefined> {
  const database = await openSaveDatabase();
  return database.get(CAMPAIGNS_STORE, AUTOSAVE_KEY);
}
