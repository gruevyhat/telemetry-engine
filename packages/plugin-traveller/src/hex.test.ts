import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { distance, parseHex } from "./hex.js";

/**
 * [M3-01] Lead-authored acceptance tests. The worker implements `./hex.ts` to make these pass and
 * does not modify this file.
 *
 * ## The contract, stated rather than implied
 *
 * `packages/plugin-traveller/src/hex.ts` exports exactly two things:
 *
 * ```ts
 * type Hex = { readonly column: number; readonly row: number };
 * type HexParseError = "bad-length" | "not-numeric" | "column-out-of-range" | "row-out-of-range";
 * type HexParseResult = { ok: true; hex: Hex } | { ok: false; error: HexParseError };
 *
 * function parseHex(raw: string): HexParseResult;
 * function distance(from: string, to: string): number | "unknown";
 * ```
 *
 * `parseHex` returns a result union and never throws — same shape as `JumpValidation` in the
 * engine's plugin API, for the same reason: a caller must handle the failure to get at the value.
 *
 * ## Two clarifications the card did not settle
 *
 * **What `'unknown'` means here.** Spec §15 says `distance()` is `'unknown'` when a hex is "not in
 * loaded data." At M3-01 there is no loaded sector data — that arrives in M3-02/M3-04 — so the
 * condition degenerates to "the string is not a valid sector hex." Sector *membership* layers on
 * top in M3-06, when the `TravelModel` is assembled and has data to consult. This is an
 * extrapolation, recorded in PROJECT.md.
 *
 * **The return type is written inline, not imported.** The engine declares the canonical
 * `Distance = number | 'unknown'` in `plugin-api/travel.ts`, but this module deliberately does not
 * import it: the card requires that `hex.ts` need nothing from the engine, and structural typing
 * makes the two compatible without a dependency. M3-06 is where conformance to `TravelModel` is
 * proven.
 *
 * ## The grid
 *
 * Traveller sector hexes are 4-character `CCRR` strings — 2-digit column 01..32, 2-digit row
 * 01..40 — on an offset grid where **odd columns sit half a hex lower than even columns**. A
 * Chebyshev or Euclidean distance passes a surprising number of naive checks and is still wrong;
 * the six-neighbour cases below are what catch it, which is why they cover both an odd-column and
 * an even-column origin.
 */

const hexString = (column: number, row: number): string =>
  `${String(column).padStart(2, "0")}${String(row).padStart(2, "0")}`;

/** Every valid hex in a sector, as an arbitrary. */
const anyHex = fc
  .record({ column: fc.integer({ min: 1, max: 32 }), row: fc.integer({ min: 1, max: 40 }) })
  .map(({ column, row }) => hexString(column, row));

describe("parseHex", () => {
  it("accepts hexes at both ends of the sector range", () => {
    expect(parseHex("0101")).toEqual({ ok: true, hex: { column: 1, row: 1 } });
    expect(parseHex("3240")).toEqual({ ok: true, hex: { column: 32, row: 40 } });
    expect(parseHex("1910")).toEqual({ ok: true, hex: { column: 19, row: 10 } });
  });

  it("round-trips every valid hex in the sector", () => {
    fc.assert(
      fc.property(anyHex, (raw) => {
        const parsed = parseHex(raw);
        expect(parsed.ok).toBe(true);
        if (parsed.ok) expect(hexString(parsed.hex.column, parsed.hex.row)).toBe(raw);
      }),
    );
  });

  it("rejects anything that is not four characters", () => {
    for (const raw of ["", "1", "101", "01010", "  0101  "]) {
      expect(parseHex(raw)).toEqual({ ok: false, error: "bad-length" });
    }
  });

  it("rejects non-numeric input, including the forms Number() would quietly accept", () => {
    // "0x10" and " 101" parse as numbers under coercion; they are not hexes.
    for (const raw of ["abcd", "01o1", "0x10", " 101", "01.1", "+101", "-101"]) {
      expect(parseHex(raw)).toEqual({ ok: false, error: "not-numeric" });
    }
  });

  it("rejects a column outside 1..32", () => {
    expect(parseHex("0001")).toEqual({ ok: false, error: "column-out-of-range" });
    expect(parseHex("3301")).toEqual({ ok: false, error: "column-out-of-range" });
    expect(parseHex("9901")).toEqual({ ok: false, error: "column-out-of-range" });
  });

  it("rejects a row outside 1..40", () => {
    expect(parseHex("0100")).toEqual({ ok: false, error: "row-out-of-range" });
    expect(parseHex("0141")).toEqual({ ok: false, error: "row-out-of-range" });
    expect(parseHex("0199")).toEqual({ ok: false, error: "row-out-of-range" });
  });

  it("reports the column problem first when both are out of range", () => {
    expect(parseHex("0000")).toEqual({ ok: false, error: "column-out-of-range" });
  });

  it("never throws, whatever it is handed", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        expect(() => parseHex(raw)).not.toThrow();
      }),
    );
  });
});

describe("distance", () => {
  it("is zero from a hex to itself", () => {
    fc.assert(
      fc.property(anyHex, (hex) => {
        expect(distance(hex, hex)).toBe(0);
      }),
    );
  });

  it("is symmetric", () => {
    fc.assert(
      fc.property(anyHex, anyHex, (a, b) => {
        expect(distance(a, b)).toBe(distance(b, a));
      }),
    );
  });

  it("satisfies the triangle inequality", () => {
    fc.assert(
      fc.property(anyHex, anyHex, anyHex, (a, b, c) => {
        const ab = distance(a, b);
        const bc = distance(b, c);
        const ac = distance(a, c);
        if (typeof ab !== "number" || typeof bc !== "number" || typeof ac !== "number") {
          throw new Error("valid hexes must yield numbers");
        }
        expect(ac).toBeLessThanOrEqual(ab + bc);
      }),
    );
  });

  // The offset-grid cases. An even-column origin and an odd-column origin have *different*
  // neighbour sets, because odd columns sit half a hex lower. Getting one right and the other
  // wrong is the single most likely implementation error, so both are pinned.
  it("finds all six neighbours of an even-column hex at distance 1", () => {
    const neighbours = ["1009", "1011", "0909", "0910", "1109", "1110"];
    for (const neighbour of neighbours) {
      expect({ neighbour, d: distance("1010", neighbour) }).toEqual({ neighbour, d: 1 });
    }
  });

  it("finds all six neighbours of an odd-column hex at distance 1", () => {
    const neighbours = ["1109", "1111", "1010", "1011", "1210", "1211"];
    for (const neighbour of neighbours) {
      expect({ neighbour, d: distance("1110", neighbour) }).toEqual({ neighbour, d: 1 });
    }
  });

  it("puts the hexes an offset-blind implementation would call neighbours at distance 2", () => {
    // These are the diagonals a Chebyshev distance wrongly reports as 1.
    expect(distance("1010", "0911")).toBe(2);
    expect(distance("1010", "1111")).toBe(2);
    expect(distance("1110", "1009")).toBe(2);
    expect(distance("1110", "1209")).toBe(2);
  });

  it("has exactly six hexes at distance 1 from any interior hex", () => {
    fc.assert(
      fc.property(
        fc.record({ column: fc.integer({ min: 2, max: 31 }), row: fc.integer({ min: 2, max: 39 }) }),
        ({ column, row }) => {
          const origin = hexString(column, row);
          let adjacent = 0;
          for (let c = column - 1; c <= column + 1; c += 1) {
            for (let r = row - 2; r <= row + 2; r += 1) {
              if (c === column && r === row) continue;
              if (c < 1 || c > 32 || r < 1 || r > 40) continue;
              if (distance(origin, hexString(c, r)) === 1) adjacent += 1;
            }
          }
          expect(adjacent).toBe(6);
        },
      ),
    );
  });

  it("matches hand-computed distances", () => {
    // Straight down one column, then across, then a diagonal, then corner to corner.
    expect(distance("0101", "0104")).toBe(3);
    expect(distance("0101", "0501")).toBe(4);
    expect(distance("0101", "0505")).toBe(6);
    expect(distance("0204", "0306")).toBe(3);
    expect(distance("3240", "0101")).toBe(54);
  });

  it("is 'unknown' when either hex is not a valid sector hex, and never throws", () => {
    expect(distance("9999", "0101")).toBe("unknown");
    expect(distance("0101", "9999")).toBe("unknown");
    expect(distance("", "0101")).toBe("unknown");
    expect(distance("0101", "abcd")).toBe("unknown");
    expect(distance("nope", "nope")).toBe("unknown");
  });

  it("never throws and never returns a non-integer, whatever it is handed", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        const result = distance(a, b);
        if (typeof result === "number") {
          expect(Number.isInteger(result)).toBe(true);
          expect(result).toBeGreaterThanOrEqual(0);
        } else {
          expect(result).toBe("unknown");
        }
      }),
    );
  });
});
