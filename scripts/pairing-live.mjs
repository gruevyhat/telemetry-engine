import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { killGroup, spawnGroup } from "./lib/process-tree.mjs";

const host = "127.0.0.1";
const sharedPort = Number(process.env.PAIRING_SHARED_PORT ?? 4273);
const phonePort = Number(process.env.PAIRING_PHONE_PORT ?? 5273);
const sharedUrl = `http://${host}:${sharedPort}/telemetry-engine/social.html`;
const phoneUrl = `http://${host}:${phonePort}/`;
const screenshotDir = process.env.PAIRING_SMOKE_SCREENSHOT_DIR;
const players = ["Zhan", "Deuce", "Brennan"];

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
  throw new Error(
    "pairing live check could not find Chrome; set PLAYWRIGHT_CHROMIUM_PATH",
  );
}

function start(script, port) {
  return spawnGroup(
    "pnpm",
    [script, "--host", host, "--port", String(port), "--strictPort"],
    { stdio: "pipe" },
  );
}

const sharedServer = start("dev:shared", sharedPort);
const phoneServer = start("dev:phone", phonePort);
const serverOutput = new Map([
  [sharedServer, ""],
  [phoneServer, ""],
]);
for (const server of [sharedServer, phoneServer]) {
  server.stdout.on("data", (chunk) => {
    serverOutput.set(server, `${serverOutput.get(server)}${chunk}`);
  });
  server.stderr.on("data", (chunk) => {
    serverOutput.set(server, `${serverOutput.get(server)}${chunk}`);
  });
}

async function waitForServer(url, server) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `development server did not start at ${url}:\n${serverOutput.get(server)}`,
  );
}

let browser;
try {
  await Promise.all([
    waitForServer(sharedUrl, sharedServer),
    waitForServer(phoneUrl, phoneServer),
  ]);
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext();
  const sharedPage = await context.newPage();
  const phonePages = await Promise.all(players.map(() => context.newPage()));
  const browserErrors = [];
  for (const [label, page] of [
    ["shared", sharedPage],
    ...phonePages.map((page, index) => [`phone:${players[index]}`, page]),
  ]) {
    page.on("console", (message) => {
      if (message.type() === "error") {
        browserErrors.push(`${label}: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      browserErrors.push(`${label}: ${error.message}`);
    });
  }

  await sharedPage.goto(sharedUrl, { waitUntil: "domcontentloaded" });
  const codes = [];
  for (const player of players) {
    await sharedPage
      .getByRole("button", {
        name: `I am ${player}. Show private pairing card.`,
      })
      .click();
    codes.push(
      await sharedPage
        .getByRole("region", {
          name: `${player}'s private pairing card`,
        })
        .getByTestId("manual-pairing-code")
        .innerText(),
    );
  }

  await Promise.all(
    phonePages.map(async (page, index) => {
      await page.goto(phoneUrl, { waitUntil: "domcontentloaded" });
      await page
        .getByRole("textbox", { name: "pairing code" })
        .fill(codes[index]);
    }),
  );
  const startedAt = Date.now();
  await Promise.all(
    phonePages.map((page) =>
      page.getByRole("button", { name: "Pair" }).click(),
    ),
  );
  await sharedPage
    .getByRole("button", { name: "Deal agendas" })
    .waitFor({ state: "visible", timeout: 30_000 });
  const elapsedMs = Date.now() - startedAt;

  if (browserErrors.length > 0) {
    throw new Error(
      `browser console errors during simultaneous pairing:\n${browserErrors.join("\n")}`,
    );
  }
  if (screenshotDir) {
    mkdirSync(screenshotDir, { recursive: true });
    await sharedPage.screenshot({
      fullPage: true,
      path: join(screenshotDir, "bl-11-simultaneous-pairing.png"),
    });
  }
  console.log(
    `pairing live: three simultaneous phone claims reached the host in ${elapsedMs} ms with no browser errors`,
  );
} finally {
  await browser?.close();
  await Promise.all([killGroup(phoneServer), killGroup(sharedServer)]);
}
