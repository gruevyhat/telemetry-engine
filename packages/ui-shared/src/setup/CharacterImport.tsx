import { useState } from "react";
import { importCharacter, type ImportedCrewMember } from "@telemetry/plugin-traveller";

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export interface CharacterImportProps {
  readonly onImport: (crewMember: ImportedCrewMember) => void;
}

export function CharacterImport({ onImport }: CharacterImportProps) {
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState({
    name: "",
    str: "",
    dex: "",
    end: "",
    int: "",
    edu: "",
    soc: "",
    career: "",
    broker: "",
  });

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    try {
      const text = await readFileAsText(file);
      const json = JSON.parse(text);
      const result = importCharacter(json);

      if (!result.ok) {
        setError(`That character file has an invalid ${result.error.field}. I kept the roster I already had.`);
        return;
      }

      setError(null);
      onImport(result.value.crewMember);
    } catch {
      setError("That file could not be read.");
    }
  };

  const handleManualSubmit = () => {
    const characterObj: Record<string, unknown> = {
      name: manualForm.name,
      str: parseInt(manualForm.str, 10),
      dex: parseInt(manualForm.dex, 10),
      end_stat: parseInt(manualForm.end, 10),
      int_stat: parseInt(manualForm.int, 10),
      edu: parseInt(manualForm.edu, 10),
      soc: parseInt(manualForm.soc, 10),
      career: manualForm.career,
      skills: [],
    };

    if (manualForm.broker) {
      (characterObj.skills as Array<{ name: string; level: number }>).push({
        name: "Broker",
        level: parseInt(manualForm.broker, 10),
      });
    }

    const result = importCharacter(characterObj);
    if (result.ok) {
      setError(null);
      onImport(result.value.crewMember);
    } else {
      setError(`That entry has an invalid ${result.error.field}. I kept the roster I already had.`);
    }
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.currentTarget;
    setManualForm((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div>
      <label>
        Character file
        <input
          type="file"
          accept=".json"
          onChange={handleFileChange}
        />
      </label>
      <button type="button" onClick={() => setShowManualEntry(!showManualEntry)}>
        Enter by hand
      </button>
      {error && (
        <div role="alert">
          {error}
        </div>
      )}
      {showManualEntry && (
        <div>
          <label>
            Name
            <input
              type="text"
              name="name"
              value={manualForm.name}
              onChange={handleFormChange}
            />
          </label>
          <label>
            STR
            <input
              type="number"
              name="str"
              value={manualForm.str}
              onChange={handleFormChange}
            />
          </label>
          <label>
            DEX
            <input
              type="number"
              name="dex"
              value={manualForm.dex}
              onChange={handleFormChange}
            />
          </label>
          <label>
            END
            <input
              type="number"
              name="end"
              value={manualForm.end}
              onChange={handleFormChange}
            />
          </label>
          <label>
            INT
            <input
              type="number"
              name="int"
              value={manualForm.int}
              onChange={handleFormChange}
            />
          </label>
          <label>
            EDU
            <input
              type="number"
              name="edu"
              value={manualForm.edu}
              onChange={handleFormChange}
            />
          </label>
          <label>
            SOC
            <input
              type="number"
              name="soc"
              value={manualForm.soc}
              onChange={handleFormChange}
            />
          </label>
          <label>
            Career
            <input
              type="text"
              name="career"
              value={manualForm.career}
              onChange={handleFormChange}
            />
          </label>
          <label>
            Broker
            <input
              type="number"
              name="broker"
              value={manualForm.broker}
              onChange={handleFormChange}
            />
          </label>
          <button type="button" onClick={handleManualSubmit}>
            Add crew member
          </button>
        </div>
      )}
    </div>
  );
}
