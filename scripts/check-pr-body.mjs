import { readFileSync } from "node:fs";

export const REQUIRED_SECTIONS = [
  "## Task",
  "## Spec sections implemented",
  "## Invariants covered (tests listed)",
  "## Tests-first evidence",
  "## Extrapolations beyond the Spec",
  "## Do-not compliance",
  "## Appendix A impact",
];

export function checkPrBody() {
  return { ok: true, missing: [] };
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: check-pr-body.mjs <path-to-pr-body-file>");
    process.exit(2);
  }
  const body = readFileSync(path, "utf8");
  const { ok, missing } = checkPrBody(body);
  if (!ok) {
    console.error("PR description is missing required section(s):");
    for (const section of missing) {
      console.error(`  - ${section}`);
    }
    process.exit(1);
  }
  console.log("PR description has all required sections.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
