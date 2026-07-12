import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { killGroup, spawnGroup } from "../lib/process-tree.mjs";

const parentFixture = fileURLToPath(new URL("./fixtures/spawn-tree-parent.mjs", import.meta.url));

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(predicate, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("condition never became true");
}

describe("killGroup", () => {
  let spawned = [];

  afterEach(() => {
    for (const pid of spawned) {
      if (isAlive(pid)) process.kill(pid, "SIGKILL");
    }
    spawned = [];
  });

  it("terminates the full process tree spawned by the tracked child, not just the child itself", async () => {
    const parent = spawnGroup(process.execPath, [parentFixture], { stdio: "pipe" });
    spawned.push(parent.pid);
    let output = "";
    parent.stdout.on("data", (chunk) => {
      output += chunk;
    });

    const grandchildPid = await waitFor(() => {
      const match = output.match(/grandchild-pid:(\d+)/);
      return match ? Number(match[1]) : undefined;
    });
    spawned.push(grandchildPid);

    await killGroup(parent);

    expect(isAlive(parent.pid)).toBe(false);
    expect(isAlive(grandchildPid)).toBe(false);
  }, 10_000);
});
