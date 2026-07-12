import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const grandchildPath = fileURLToPath(new URL("./spawn-tree-grandchild.mjs", import.meta.url));
const grandchild = spawn(process.execPath, [grandchildPath], { stdio: "pipe" });
grandchild.stdout.on("data", (chunk) => process.stdout.write(chunk));

setInterval(() => {}, 1000);
