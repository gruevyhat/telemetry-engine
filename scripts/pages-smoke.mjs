import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const host = "127.0.0.1";
const port = Number(process.env.PAGES_SMOKE_PORT ?? 4173);
const projectUrl = `http://${host}:${port}/telemetry-engine/`;
const distIndex = new URL("../packages/ui-shared/dist/index.html", import.meta.url);

if (!existsSync(distIndex)) {
  throw new Error("pages smoke requires packages/ui-shared/dist; run pnpm build:pages first");
}

const chromeCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const executablePath = chromeCandidates.find(existsSync);
if (!executablePath) {
  throw new Error("pages smoke could not find Chrome; set PLAYWRIGHT_CHROMIUM_PATH");
}

const preview = spawn(
  "pnpm",
  ["--filter", "@telemetry/ui-shared", "exec", "vite", "preview", "--host", host, "--port", String(port), "--strictPort"],
  { stdio: "pipe" },
);
let previewOutput = "";
preview.stdout.on("data", (chunk) => {
  previewOutput += chunk;
});
preview.stderr.on("data", (chunk) => {
  previewOutput += chunk;
});

async function waitForPreview() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(projectUrl);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`pages preview did not start:\n${previewOutput}`);
}

let browser;
try {
  await waitForPreview();
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto(projectUrl, { waitUntil: "networkidle" });

  const sharedScreen = page.getByTestId("shared-screen");
  if ((await sharedScreen.count()) !== 1) throw new Error("built page did not boot the shared-screen shell");
  const mainText = await page.getByTestId("main-panel").textContent();
  if (!mainText?.includes("Dockside systems are open")) throw new Error("built page did not load the demo turn");
  const moduleSource = await page.locator('script[type="module"]').getAttribute("src");
  if (!moduleSource?.startsWith("/telemetry-engine/assets/")) {
    throw new Error(`built page used the wrong GitHub Pages asset base: ${moduleSource}`);
  }

  console.log("pages smoke: built shared-screen demo booted under /telemetry-engine/");
} finally {
  await browser?.close();
  preview.kill("SIGTERM");
}
