import { parseHex } from "./hex.js";

export type SecUwp = {
  readonly raw: string;
  readonly starport: string;
  readonly size: number;
  readonly atmosphere: number;
  readonly hydrographics: number;
  readonly population: number;
  readonly government: number;
  readonly law: number;
  readonly techLevel: number;
};

export type SecWorld = {
  readonly name: string;
  readonly hex: string;
  readonly uwp: SecUwp;
  readonly tradeCodes: readonly string[];
  readonly pbg: string;
  readonly allegiance: string;
  readonly stellarData: string;
};

export type SecParseError = {
  readonly lineNumber: number;
  readonly code: "malformed-row" | "duplicate-hex";
  readonly line: string;
};

export type SecParseResult = {
  readonly worlds: readonly SecWorld[];
  readonly errors: readonly SecParseError[];
};

const EHEX_DIGITS = "0123456789ABCDEFGH";

function parseEhex(raw: string): number | undefined {
  const value = EHEX_DIGITS.indexOf(raw);
  return value === -1 ? undefined : value;
}

function parseUwp(raw: string): SecUwp | undefined {
  if (!/^[A-Z][0-9A-H]{6}-[0-9A-H]$/.test(raw) || raw.includes("I")) {
    return undefined;
  }

  const digits = [raw[1], raw[2], raw[3], raw[4], raw[5], raw[6], raw[8]].map((digit) =>
    digit === undefined ? undefined : parseEhex(digit),
  );
  if (digits.some((digit) => digit === undefined)) {
    return undefined;
  }

  const [size, atmosphere, hydrographics, population, government, law, techLevel] = digits as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];

  return {
    raw,
    starport: raw[0] as string,
    size,
    atmosphere,
    hydrographics,
    population,
    government,
    law,
    techLevel,
  };
}

function isMetadata(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "") {
    return true;
  }

  if (trimmed.startsWith("#") || trimmed.startsWith("$") || trimmed.startsWith("@")) {
    return true;
  }

  if (/^Name\s+Hex\s+UWP\b/i.test(trimmed)) {
    return true;
  }

  return /^[\s-]+$/.test(line);
}

function parseWorld(line: string): SecWorld | undefined {
  if (
    line.length < 63 ||
    line[16] !== " " ||
    line[21] !== " " ||
    line[31] !== " " ||
    line[33] !== " " ||
    line[54] !== " " ||
    line[56] !== " " ||
    line[60] !== " "
  ) {
    return undefined;
  }

  const name = line.slice(0, 16).trim();
  const hex = line.slice(17, 21);
  const uwp = parseUwp(line.slice(22, 31));
  const base = line[32];
  const remarks = line.slice(34, 54).trim();
  const zone = line[55];
  const pbg = line.slice(57, 60);
  const allegiance = line.slice(61, 63);
  const stellarData = line.slice(63).trim();

  if (
    name === "" ||
    !parseHex(hex).ok ||
    uwp === undefined ||
    base === undefined ||
    !/^[A-Z ]$/.test(base) ||
    zone === undefined ||
    !/^[A-Z ]$/.test(zone) ||
    !/^[0-9A-H]{3}$/.test(pbg) ||
    pbg.includes("I") ||
    !/^(?:[A-Za-z0-9]{2}|--)$/.test(allegiance)
  ) {
    return undefined;
  }

  return {
    name,
    hex,
    uwp,
    tradeCodes: remarks === "" ? [] : remarks.split(/\s+/),
    pbg,
    allegiance,
    stellarData,
  };
}

export function parseSec(input: string): SecParseResult {
  const worlds: SecWorld[] = [];
  const errors: SecParseError[] = [];
  const seenHexes = new Set<string>();

  for (const [index, line] of input.split(/\r?\n/).entries()) {
    if (isMetadata(line)) {
      continue;
    }

    const world = parseWorld(line);
    if (world === undefined) {
      errors.push({ lineNumber: index + 1, code: "malformed-row", line });
      continue;
    }

    if (seenHexes.has(world.hex)) {
      errors.push({ lineNumber: index + 1, code: "duplicate-hex", line });
      continue;
    }

    seenHexes.add(world.hex);
    worlds.push(world);
  }

  return { worlds, errors };
}
