import { spawn } from "node:child_process";
import { once } from "node:events";

export function spawnGroup(command, args, options = {}) {
  return spawn(command, args, {
    ...options,
    detached: process.platform !== "win32",
  });
}

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

export async function killGroup(child, { timeoutMs = 2_000 } = {}) {
  if (hasExited(child)) return;
  const signal = (name) => {
    if (process.platform === "win32") child.kill(name);
    else process.kill(-child.pid, name);
  };
  signal("SIGTERM");
  await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
  if (!hasExited(child)) {
    signal("SIGKILL");
    await once(child, "exit");
  }
}
