import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSec, type SecParseResult } from "./sec.js";

/**
 * [M3-02] Lead-authored acceptance tests. The worker implements `./sec.ts` and the fictional
 * fixture to make these pass, and does not modify this file.
 *
 * ## Public contract
 *
 * `parseSec(input)` is pure and never throws for text input. It returns every valid world plus
 * typed errors for invalid records:
 *
 * - `SecParseResult.worlds` is an ordered readonly array of `SecWorld`.
 * - `SecParseResult.errors` is an ordered readonly array of `SecParseError`.
 * - An error has `lineNumber` (one-based), `code` (`"malformed-row"` or `"duplicate-hex"`),
 *   and the original `line`.
 * - On a duplicate, the first valid record wins and the later record is omitted.
 *
 * A world contains `name`, `hex`, decomposed `uwp`, `tradeCodes`, `pbg`, `allegiance`, and
 * `stellarData`. `uwp` contains the original `raw` value plus `starport`, `size`, `atmosphere`,
 * `hydrographics`, `population`, `government`, `law`, and `techLevel`. Numeric UWP digits use
 * Traveller eHex values: `0`..`9`, then `A` = 10 through `H` = 17, skipping `I` and `O`.
 *
 * ## Accepted SEC record layout
 *
 * M3 accepts the TravellerMap legacy SEC export shape documented at
 * https://travellermap.com/doc/fileformats: name, hex, UWP, one-character base, remarks,
 * optional one-character zone, PBG, two-character allegiance, and stellar data. Fields are
 * separated by whitespace; name and remarks are padded columns and may contain spaces.
 * Comment lines beginning with `#`, `$`, or `@`, blank lines, the TravellerMap column header,
 * and its hyphen separator are metadata and produce neither worlds nor errors. This packet does
 * not accept T5 tab-delimited or T5 column-delimited records.
 */

const fixture = readFileSync(new URL("../fixtures/fictional-sector.sec", import.meta.url), "utf8");

const line = ({
  name,
  hex,
  uwp,
  base = " ",
  remarks = "",
  zone = " ",
  pbg = "000",
  allegiance = "--",
  stars = "",
}: {
  readonly name: string;
  readonly hex: string;
  readonly uwp: string;
  readonly base?: string;
  readonly remarks?: string;
  readonly zone?: string;
  readonly pbg?: string;
  readonly allegiance?: string;
  readonly stars?: string;
}): string =>
  `${name.padEnd(16)} ${hex} ${uwp} ${base} ${remarks.padEnd(20)} ${zone} ${pbg} ${allegiance} ${stars}`.trimEnd();

const worldLine = line({
  name: "Cinder Wake",
  hex: "0101",
  uwp: "A867A74-C",
  base: "N",
  remarks: "Ag Ri Cp",
  pbg: "703",
  allegiance: "Na",
  stars: "G2 V",
});

describe("parseSec", () => {
  it("parses the fictional fixture and preserves a hand-checked world", () => {
    const result = parseSec(fixture);

    expect(result.errors).toEqual([]);
    expect(result.worlds).toHaveLength(5);
    expect(result.worlds[0]).toEqual({
      name: "Cinder Wake",
      hex: "0101",
      uwp: {
        raw: "A867A74-C",
        starport: "A",
        size: 8,
        atmosphere: 6,
        hydrographics: 7,
        population: 10,
        government: 7,
        law: 4,
        techLevel: 12,
      },
      tradeCodes: ["Ag", "Ri", "Cp"],
      pbg: "703",
      allegiance: "Na",
      stellarData: "G2 V",
    });
  });

  it("skips comments, TravellerMap headers and separators, blank lines, and trailing whitespace", () => {
    const input = [
      "# fictional sector",
      "$ route metadata",
      "@ subsector metadata",
      "",
      "Name             Hex  UWP       B  Remarks               Z PBG A  Stellar",
      "---------------- ---- --------- -- -------------------- - --- -- -------",
      `${worldLine}       `,
      "",
    ].join("\n");

    const result = parseSec(input);
    expect(result.errors).toEqual([]);
    expect(result.worlds).toHaveLength(1);
    expect(result.worlds[0]?.name).toBe("Cinder Wake");
  });

  it("reports a malformed row by one-based line number and continues with good rows", () => {
    const secondWorld = line({
      name: "Glass Harbor",
      hex: "0202",
      uwp: "B554678-9",
      remarks: "Ni Ag",
      pbg: "411",
      allegiance: "Na",
      stars: "K4 V",
    });
    const malformed = "Broken Reach     9999 definitely-not-a-uwp";

    const result = parseSec([worldLine, malformed, secondWorld].join("\n"));

    expect(result.worlds.map((world) => world.hex)).toEqual(["0101", "0202"]);
    expect(result.errors).toEqual([{ lineNumber: 2, code: "malformed-row", line: malformed }]);
  });

  it("reports a duplicate hex and keeps the first valid record", () => {
    const duplicate = line({
      name: "Counterfeit Wake",
      hex: "0101",
      uwp: "C000000-0",
      remarks: "Ba",
      pbg: "000",
      allegiance: "--",
    });

    const result = parseSec([worldLine, duplicate].join("\n"));

    expect(result.worlds).toHaveLength(1);
    expect(result.worlds[0]?.name).toBe("Cinder Wake");
    expect(result.errors).toEqual([{ lineNumber: 2, code: "duplicate-hex", line: duplicate }]);
  });

  it("decomposes UWP digits above nine using Traveller eHex", () => {
    const result = parseSec(
      line({
        name: "High Lantern",
        hex: "3240",
        uwp: "AABCDEF-H",
        remarks: "Hi",
        pbg: "9AF",
        allegiance: "Na",
        stars: "F7 V",
      }),
    );

    expect(result.errors).toEqual([]);
    expect(result.worlds[0]?.uwp).toEqual({
      raw: "AABCDEF-H",
      starport: "A",
      size: 10,
      atmosphere: 11,
      hydrographics: 12,
      population: 13,
      government: 14,
      law: 15,
      techLevel: 17,
    });
  });

  it("is pure and byte-identical across repeated parses", () => {
    const first: SecParseResult = parseSec(fixture);
    const second: SecParseResult = parseSec(fixture);

    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(fixture).toBe(readFileSync(new URL("../fixtures/fictional-sector.sec", import.meta.url), "utf8"));
  });
});
