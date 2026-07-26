export type Hex = { readonly column: number; readonly row: number };
export type HexParseError = "bad-length" | "not-numeric" | "column-out-of-range" | "row-out-of-range";
export type HexParseResult = { ok: true; hex: Hex } | { ok: false; error: HexParseError };

export function parseHex(raw: string): HexParseResult {
  if (raw.length !== 4) {
    return { ok: false, error: "bad-length" };
  }

  // Require all four characters to be ASCII digits, rejecting forms Number() would coerce
  // (e.g., "0x10", " 101", "-101" parse as numbers but are not valid hex strings).
  if (!/^\d{4}$/.test(raw)) {
    return { ok: false, error: "not-numeric" };
  }

  const column = parseInt(raw.substring(0, 2), 10);
  const row = parseInt(raw.substring(2, 4), 10);

  if (column < 1 || column > 32) {
    return { ok: false, error: "column-out-of-range" };
  }

  if (row < 1 || row > 40) {
    return { ok: false, error: "row-out-of-range" };
  }

  return { ok: true, hex: { column, row } };
}

export function distance(from: string, to: string): number | "unknown" {
  const fromResult = parseHex(from);
  const toResult = parseHex(to);

  if (!fromResult.ok || !toResult.ok) {
    return "unknown";
  }

  const fromHex = fromResult.hex;
  const toHex = toResult.hex;

  // Convert offset-q coordinates to cube coordinates for distance calculation.
  // In an offset-q grid, odd columns are shifted down by 0.5 hexes relative to even columns.
  // We adjust the row coordinate (row_ax = row - floor(col / 2)) to flatten this offset into
  // the axial layer, then apply standard cube distance: (|x| + |y| + |z|) / 2.
  // This correction ensures that the six neighbours at distance 1 differ correctly between
  // even and odd columns (the most common source of offset-grid bugs).
  const convertToCube = (hex: Hex): { x: number; y: number; z: number } => {
    const x = hex.column;
    const z = hex.row - Math.floor(hex.column / 2);
    const y = -x - z;
    return { x, y, z };
  };

  const fromCube = convertToCube(fromHex);
  const toCube = convertToCube(toHex);

  const dist =
    (Math.abs(fromCube.x - toCube.x) + Math.abs(fromCube.y - toCube.y) + Math.abs(fromCube.z - toCube.z)) / 2;

  return Math.round(dist);
}
