// Regenerates the README screenshots from the real frontend.
//
// The app runs in a normal browser against the fake IPC layer in mock-tauri.js,
// so every pane shows stable data without a physical Android device attached.
//
// Usage:
//   pnpm install
//   pnpm screenshots
//
// Install the browser once with `pnpm exec playwright install chromium`.
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const OUTPUT_DIR = path.join(REPO_ROOT, "docs/images");
const MOCK_SCRIPT = path.join(SCRIPT_DIR, "mock-tauri.js");
const PORT = Number(process.env.SCREENSHOT_PORT ?? 5199);
const APP_URL = `http://localhost:${PORT}/`;
const WINDOW_WIDTH = 1400;
const WINDOW_HEIGHT = 880;
const TITLE_BAR_HEIGHT = 30;
const PAGE_PADDING = 36;
const SNAPSHOT_TIME = new Date("2026-03-18T14:26:00Z");
const LABELS = {
  en: { ports: "Port forwarding", maximize: "Maximize log panel", query: "Logcat query", cpu: "System CPU", generate: "Generate (Ctrl/Command+Enter)" },
  "zh-CN": { ports: "端口转发", maximize: "铺满日志面板", query: "Logcat 查询", cpu: "整机 CPU", generate: "生成 (Ctrl/Command+Enter)" },
};

function requestedLocales() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args.length === 0) return ["en", "zh-CN"];
  if (args.length === 2 && args[0] === "--locale" && Object.hasOwn(LABELS, args[1])) return [args[1]];
  throw new Error("Usage: pnpm screenshots [--locale en|zh-CN]");
}

function startDevServer() {
  const bin = path.join(REPO_ROOT, "node_modules/.bin/vite");
  const server = spawn(bin, ["--port", String(PORT), "--strictPort"], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.kill("SIGTERM");
      reject(new Error("Vite dev server did not start within 60s"));
    }, 60_000);

    server.stdout.setEncoding("utf8");
    server.stdout.on("data", (chunk) => {
      if (chunk.includes("ready in") || chunk.includes("Local:")) {
        clearTimeout(timeout);
        resolve(server);
      }
    });
    server.stderr.setEncoding("utf8");
    server.stderr.on("data", (chunk) => process.stderr.write(`[vite] ${chunk}`));
    server.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Vite dev server exited early with code ${code}`));
    });
  });
}

function uiPreferences(pane, logOpen, logHeight) {
  return JSON.stringify({
    state: {
      activePane: pane,
      logOpenByPane: {
        tools: logOpen,
        apps: logOpen,
        files: logOpen,
        codegen: logOpen,
        decoder: logOpen,
        perf: logOpen,
      },
      logHeight,
    },
    version: 0,
  });
}

function framePage(dark) {
  const backdrop = dark
    ? "linear-gradient(140deg, #17181b 0%, #101114 100%)"
    : "linear-gradient(140deg, #eef0f3 0%, #dfe3e8 100%)";
  const chrome = dark ? "#232529" : "#e8eaee";
  const chromeBorder = dark ? "#303338" : "#d0d4da";
  const chromeText = dark ? "#9aa0a8" : "#6b7079";
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; padding: 0; background: ${backdrop}; }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: ${PAGE_PADDING}px;
        font-family: -apple-system, "Noto Sans CJK SC", sans-serif;
      }
      .window {
        width: ${WINDOW_WIDTH}px;
        height: ${WINDOW_HEIGHT + TITLE_BAR_HEIGHT}px;
        border-radius: 10px;
        overflow: hidden;
        background: ${chrome};
        box-shadow: 0 24px 60px rgba(15, 17, 21, ${dark ? "0.55" : "0.22"}),
          0 2px 8px rgba(15, 17, 21, ${dark ? "0.4" : "0.12"});
      }
      .titlebar {
        height: ${TITLE_BAR_HEIGHT}px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 12px;
        background: ${chrome};
        border-bottom: 1px solid ${chromeBorder};
      }
      .dot { width: 11px; height: 11px; border-radius: 50%; }
      .title {
        flex: 1;
        text-align: center;
        font-size: 12px;
        font-weight: 600;
        color: ${chromeText};
        margin-right: 45px;
      }
      iframe { display: block; width: 100%; height: ${WINDOW_HEIGHT}px; border: 0; }
    </style>
  </head>
  <body>
    <div class="window">
      <div class="titlebar">
        <span class="dot" style="background:#ff5f57"></span>
        <span class="dot" style="background:#febc2e"></span>
        <span class="dot" style="background:#28c840"></span>
        <span class="title">ADB GUI</span>
      </div>
      <iframe src="${APP_URL}"></iframe>
    </div>
  </body>
</html>`;
}

const SHOTS = [
  {
    name: "workspace-tools",
    pane: "tools",
    logOpen: true,
    logHeight: 240,
    async prepare(app, _page, labels) {
      await app.getByText(labels.ports, { exact: true }).first().waitFor();
    },
  },
  {
    name: "logcat",
    pane: "tools",
    logOpen: true,
    async prepare(app, page, labels) {
      await app.getByTitle(labels.maximize, { exact: true }).click();
      await app.getByLabel(labels.query, { exact: true }).fill("package:com.shopdemo.android & -tag:Choreographer");
      await app.getByLabel(labels.query, { exact: true }).press("Enter");
      await page.waitForTimeout(900);
    },
  },
  {
    name: "apps",
    pane: "apps",
    logOpen: false,
    async prepare(app, page) {
      await app.locator("text=购物 Demo").first().waitFor();
      await app.locator("text=购物 Demo").first().click();
      await page.waitForTimeout(300);
    },
  },
  {
    name: "files",
    pane: "files",
    logOpen: false,
    async prepare(app, page) {
      await app.locator("text=screenshot-20260318-142455.png").first().click();
      await page.waitForTimeout(700);
    },
  },
  {
    name: "performance",
    pane: "perf",
    logOpen: false,
    async prepare(app, page, labels) {
      await app.getByText(labels.cpu, { exact: true }).first().waitFor();
      await page.waitForTimeout(1200);
    },
  },
  {
    name: "codegen",
    pane: "codegen",
    logOpen: false,
    async prepare(app, page, labels) {
      const input = app.locator("textarea").first();
      await input.fill(
        [
          "https://adb-gui.dev/docs",
          "ADB-GUI-0001",
          "ADB-GUI-0002",
          "ADB-GUI-0003",
          "sn:9A271FFAZ004TR",
          "https://github.com/zechuan-start/adb-gui",
        ].join("\n"),
      );
      await app.getByTitle(labels.generate, { exact: true }).click();
      await page.waitForTimeout(900);
    },
  },
  {
    name: "dark-theme",
    pane: "tools",
    logOpen: false,
    dark: true,
    async prepare(app, _page, labels) {
      await app.getByText(labels.ports, { exact: true }).first().waitFor();
    },
  },
];

async function main() {
  const locales = requestedLocales();
  const server = await startDevServer();
  const browser = await chromium.launch();

  try {
    for (const locale of locales) {
      const outputDirectory = path.join(OUTPUT_DIR, locale);
      await mkdir(outputDirectory, { recursive: true });
      for (const shot of SHOTS) {
      const context = await browser.newContext({
        viewport: {
          width: WINDOW_WIDTH + PAGE_PADDING * 2,
          height: WINDOW_HEIGHT + TITLE_BAR_HEIGHT + PAGE_PADDING * 2,
        },
        deviceScaleFactor: 2,
        colorScheme: shot.dark ? "dark" : "light",
        locale,
        timezoneId: "Asia/Shanghai",
        reducedMotion: "reduce",
      });
      await context.addInitScript({ path: MOCK_SCRIPT });
      await context.addInitScript(
        ([preferences, theme, locale]) => {
          window.localStorage.setItem("adb-gui-ui", preferences);
          window.localStorage.setItem("theme", theme);
          window.localStorage.setItem("locale", locale);
        },
        [
          uiPreferences(shot.pane, shot.logOpen, shot.logHeight ?? 300),
          shot.dark ? "dark" : "light",
          locale,
        ],
      );

      const page = await context.newPage();
      await page.clock.setFixedTime(SNAPSHOT_TIME);
      const failures = [];
      page.on("pageerror", (error) => failures.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "warning" || message.type() === "error") {
          console.warn(`[${shot.name}] ${message.text()}`);
        }
      });
      await page.setContent(framePage(Boolean(shot.dark)), { waitUntil: "load" });
      const app = page.frameLocator("iframe");
      await app.locator("#pane-nav-tools").waitFor();
      await page.waitForTimeout(1500);
      await shot.prepare(app, page, LABELS[locale]);
      await app.locator("html").evaluate(async (element) => { await element.ownerDocument.fonts.ready; });
      await page.waitForTimeout(400);
      if (await app.locator("html").getAttribute("lang") !== locale) throw new Error(`Locale did not apply: ${locale}`);
      if (failures.length) throw new Error(failures.join("\n"));
      await page.locator(".window").screenshot({
        path: path.join(outputDirectory, `${shot.name}.png`),
        animations: "disabled",
        caret: "hide",
      });
      console.log(`captured docs/images/${locale}/${shot.name}.png`);
      await context.close();
      }
    }
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }
}

export { startDevServer, APP_URL, MOCK_SCRIPT, SNAPSHOT_TIME, uiPreferences };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
