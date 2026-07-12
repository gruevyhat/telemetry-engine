import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";

const repoRoot = new URL("..", import.meta.url).pathname;
const pluginTravellerDir = join(repoRoot, "packages", "plugin-traveller");
const parkedDir = join(repoRoot, "packages", ".plugin-traveller.parked");
const engineSrcDir = join(repoRoot, "packages", "engine", "src");

for (const file of readdirSync(engineSrcDir, { recursive: true })) {
  if (typeof file === "string" && file.endsWith(".ts")) {
    const contents = readFileSync(join(engineSrcDir, file), "utf8");
    if (contents.includes("plugin-traveller")) {
      console.error(`build:stub: packages/engine/src/${file} references plugin-traveller (INV-1 violation).`);
      process.exit(1);
    }
  }
}

const parked = existsSync(pluginTravellerDir);
if (parked) {
  renameSync(pluginTravellerDir, parkedDir);
}

try {
  execFileSync(
    "npx",
    [
      "tsc",
      "--build",
      "packages/engine/tsconfig.json",
      "packages/plugin-stub/tsconfig.json",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );
  console.log("build:stub: packages/engine + plugin-stub built with plugin-traveller absent (INV-1 holds).");
} finally {
  if (parked) {
    renameSync(parkedDir, pluginTravellerDir);
  }
}
