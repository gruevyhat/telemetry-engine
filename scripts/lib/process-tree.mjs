import { spawn } from "node:child_process";
import { once } from "node:events";

export function spawnGroup(command, args, options = {}) {
  return spawn(command, args, options);
}

export async function killGroup(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await once(child, "exit");
}
