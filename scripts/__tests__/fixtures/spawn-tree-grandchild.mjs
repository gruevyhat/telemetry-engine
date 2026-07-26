process.stdout.write(`grandchild-pid:${process.pid}\n`);

// [BL-12] Take a beat to shut down on SIGTERM, the way a real grandchild does — `pages-smoke.mjs`
// spawns `pnpm ... vite preview`, so the process actually holding the port is vite, a grandchild,
// and it does not exit the instant pnpm does. Without this delay the race in killGroup only
// surfaced intermittently (roughly one run in five); with it, a killGroup that waits solely on the
// tracked child fails every time.
process.on("SIGTERM", () => {
  setTimeout(() => process.exit(0), 300);
});

setInterval(() => {}, 1000);
