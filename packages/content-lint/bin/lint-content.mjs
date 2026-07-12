import { existsSync, readdirSync } from "node:fs";

const contentDir = new URL("../../../content", import.meta.url);

if (!existsSync(contentDir)) {
  console.log("content-lint: no content/ directory found; nothing to lint.");
  process.exit(0);
}

const entries = readdirSync(contentDir).filter((entry) => entry !== ".gitkeep");
console.log(`content-lint: skeleton pass — ${entries.length} top-level content entr${entries.length === 1 ? "y" : "ies"}, no rules implemented yet (Spec §19 lands with M1 content tasks).`);
process.exit(0);
