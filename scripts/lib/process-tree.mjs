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

/** True once no process in the group remains. `ESRCH` from a signal-0 probe is the success case. */
function groupIsGone(pid) {
  if (process.platform === "win32") return true;
  try {
    process.kill(-pid, 0);
    return false;
  } catch {
    return true;
  }
}

async function waitForGroupExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (groupIsGone(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return groupIsGone(pid);
}

/**
 * [BL-12] Terminates the whole process group and does not resolve until it is actually gone.
 *
 * Waiting only on the tracked child is not enough: `pages-smoke.mjs` spawns
 * `pnpm ... vite preview --strictPort`, so the process holding the port is vite, a *grandchild*
 * of the tracked `pnpm`. Resolving while it still lives leaks the port into the next run.
 *
 * The group is signalled even when the tracked child has already exited, because that is exactly
 * the case where an orphaned grandchild would otherwise survive unsignalled.
 */
export async function killGroup(child, { timeoutMs = 2_000 } = {}) {
  const signal = (name) => {
    try {
      if (process.platform === "win32") child.kill(name);
      else process.kill(-child.pid, name);
    } catch {
      // ESRCH: the group is already gone, which is the outcome this function wants.
    }
  };

  if (groupIsGone(child.pid) && hasExited(child)) return;

  signal("SIGTERM");
  if (!hasExited(child)) {
    await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
  }
  if (await waitForGroupExit(child.pid, timeoutMs)) return;

  signal("SIGKILL");
  if (!hasExited(child)) {
    await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
  }
  await waitForGroupExit(child.pid, timeoutMs);
}
