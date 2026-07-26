import { useState } from "react";
import { importSector, type TravellerSector } from "@telemetry/plugin-traveller";

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export interface SectorImportProps {
  readonly onImport: (sector: TravellerSector) => void;
}

export function SectorImport({ onImport }: SectorImportProps) {
  const [sectorName, setSectorName] = useState<string | null>(null);
  const [worldCount, setWorldCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    try {
      const text = await readFileAsText(file);
      const sectorId = file.name.replace(/\.sec$/i, "");
      const result = importSector(sectorId, text);

      if (!result.ok) {
        const firstError = result.error.errors[0];
        const lineNumber = firstError?.lineNumber ?? 0;
        setError(`That file has a malformed record on line ${lineNumber}. I kept the sector I already had.`);
        return;
      }

      const sector = result.sector;
      setSectorName(file.name);
      setWorldCount(sector.record.worlds.length);
      setError(null);
      onImport(sector);
    } catch {
      setError("That file could not be read.");
    }
  };

  return (
    <div>
      <label>
        Sector file
        <input
          type="file"
          accept=".sec"
          onChange={handleFileChange}
        />
      </label>
      {error && (
        <div role="alert">
          {error}
        </div>
      )}
      {sectorName && (
        <div>
          <p>{sectorName}</p>
          <p>{worldCount} world{worldCount === 1 ? "" : "s"}</p>
        </div>
      )}
    </div>
  );
}
