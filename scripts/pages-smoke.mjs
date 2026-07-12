import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { killGroup, spawnGroup } from "./lib/process-tree.mjs";

const host = "127.0.0.1";
const port = Number(process.env.PAGES_SMOKE_PORT ?? 4173);
const projectUrl = `http://${host}:${port}/telemetry-engine/`;
const distIndex = new URL("../packages/ui-shared/dist/index.html", import.meta.url);
const screenshotDir = process.env.PAGES_SMOKE_SCREENSHOT_DIR;

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

const preview = spawnGroup(
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
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto(projectUrl, { waitUntil: "networkidle" });

  const sharedScreen = page.getByTestId("shared-screen");
  if ((await sharedScreen.count()) !== 1) throw new Error("built page did not boot the shared-screen shell");
  const mainText = await page.getByTestId("main-panel").textContent();
  if (!mainText?.includes("Dockside systems are open")) throw new Error("built page did not load the demo turn");
  if ((await page.getByTestId("beat-DOCKSIDE").getAttribute("aria-current")) !== "step") {
    throw new Error("built page did not start at DOCKSIDE");
  }
  const moduleSource = await page.locator('script[type="module"]').getAttribute("src");
  if (!moduleSource?.startsWith("/telemetry-engine/assets/")) {
    throw new Error(`built page used the wrong GitHub Pages asset base: ${moduleSource}`);
  }

  const handoff = page.getByRole("button", { name: "I am Zhan" });
  if ((await handoff.count()) !== 1) throw new Error("built page did not show the Zhan hotseat handoff");
  await handoff.click();
  if ((await page.getByText("agenda.actionTaken", { exact: true }).count()) !== 1) {
    throw new Error("Zhan's private view did not show agenda.actionTaken");
  }
  const ticker = page.getByTestId("ticker");
  if ((await ticker.getByText("agenda.actionTaken", { exact: true }).count()) !== 0) {
    throw new Error("private agenda.actionTaken leaked into the public ship's log");
  }
  if (screenshotDir) {
    mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ fullPage: true, path: join(screenshotDir, "m0-dockside.png") });
  }

  const advance = page.getByRole("button", { name: "Advance demo turn" });
  if ((await advance.count()) !== 1) throw new Error("built page did not expose the demo advance control");
  await advance.click();
  if ((await page.getByTestId("beat-COMMS").getAttribute("aria-current")) !== "step") {
    throw new Error("demo did not advance to COMMS");
  }
  if ((await ticker.getByText("cargo.loaded", { exact: true }).count()) !== 1) {
    throw new Error("DOCKSIDE did not publish cargo.loaded");
  }

  await advance.click();
  if ((await page.getByTestId("beat-TRANSIT").getAttribute("aria-current")) !== "step") {
    throw new Error("demo did not advance to TRANSIT");
  }

  await advance.click();
  if ((await page.getByTestId("beat-ARRIVAL").getAttribute("aria-current")) !== "step") {
    throw new Error("demo did not advance to ARRIVAL");
  }
  if ((await ticker.getByText("jump.plotted", { exact: true }).count()) !== 1) {
    throw new Error("TRANSIT did not publish jump.plotted");
  }

  await advance.click();
  if ((await page.getByTestId("beat-DOCKSIDE").getAttribute("aria-current")) !== "step") {
    throw new Error("demo did not cycle back to DOCKSIDE");
  }
  if ((await ticker.getByText("sale.settled", { exact: true }).count()) !== 1) {
    throw new Error("ARRIVAL did not publish sale.settled");
  }
  if ((await page.getByTestId("status-funds").innerText()) !== "Cr169,200") {
    throw new Error("sale.settled did not update the funds projection");
  }
  if (browserErrors.length > 0) throw new Error(`browser console errors:\n${browserErrors.join("\n")}`);
  if (screenshotDir) {
    await page.screenshot({ fullPage: true, path: join(screenshotDir, "m0-complete.png") });
  }

  console.log("pages smoke: M0 hotseat and four-beat demo passed under /telemetry-engine/");
} finally {
  await browser?.close();
  await killGroup(preview);
}
