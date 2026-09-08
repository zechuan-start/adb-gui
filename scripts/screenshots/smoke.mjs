import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startDevServer, APP_URL, MOCK_SCRIPT, SNAPSHOT_TIME, uiPreferences } from "./capture.mjs";

const PANES = ["tools", "apps", "files", "codegen", "decoder", "perf"];
const SECTIONS = ["general", "logcat", "capture", "files", "apps", "codegen"];

async function layout(page, context) {
  const overflow = await page.evaluate(() => {
    const roots = [document.documentElement, ...document.querySelectorAll("#settings-dialog, #settings-content")];
    const buttons = [...document.querySelectorAll("button")].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width && rect.height && rect.bottom > 0 && rect.top < innerHeight;
    });
    return [...roots, ...buttons].filter(element => element.scrollWidth > element.clientWidth + 2)
      .map(element => ({ id: element.id, text: element.textContent?.slice(0, 100), width: element.clientWidth, scroll: element.scrollWidth }));
  });
  assert.deepEqual(overflow, [], `${context}: horizontal overflow`);
}

async function settings(page) {
  await page.locator('button[aria-controls="settings-dialog"]').first().click();
  await page.locator("#settings-dialog").waitFor();
}

async function closeSettings(page) {
  await page.locator("#settings-dialog header button").click();
  await page.locator("#settings-dialog").waitFor({ state: "hidden" });
}

async function matrixCase(browser, locale, theme, viewport) {
  const label = `${locale}/${theme}/${viewport.width}x${viewport.height}`;
  const context = await browser.newContext({ locale, viewport, colorScheme: theme, reducedMotion: "reduce" });
  await context.addInitScript({ path: MOCK_SCRIPT });
  await context.addInitScript(({ locale, theme, ui }) => {
    if (localStorage.getItem("locale") === null) localStorage.setItem("locale", locale);
    if (localStorage.getItem("theme") === null) localStorage.setItem("theme", theme);
    if (localStorage.getItem("adb-gui-ui") === null) localStorage.setItem("adb-gui-ui", ui);
  }, { locale, theme, ui: uiPreferences("tools", false, 240) });
  const page = await context.newPage();
  await page.clock.setFixedTime(SNAPSHOT_TIME);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(APP_URL);
    await page.getByText("Pixel 7", { exact: true }).first().waitFor();
    for (const pane of PANES) {
      await page.locator(`#pane-nav-${pane}`).click();
      assert.equal(await page.locator(`#pane-nav-${pane}`).getAttribute("aria-current"), "page");
      await page.waitForTimeout(180);
      await layout(page, `${label}/${pane}`);
    }
    await settings(page);
    for (const section of SECTIONS) {
      await page.locator(`#settings-nav-${section}`).click();
      await page.waitForTimeout(100);
      await layout(page, `${label}/settings/${section}`);
    }
    await page.locator("#settings-code-separator").click();
    const menu = await page.getByRole("listbox").boundingBox();
    assert(menu && menu.x >= 0 && menu.y >= 0 && menu.x + menu.width <= viewport.width && menu.y + menu.height <= viewport.height,
      `${label}: separator menu is clipped`);
    await page.keyboard.press("Escape");
    await page.locator("#settings-nav-general").click();
    const next = locale === "en" ? "zh-CN" : "en";
    const starts = await page.evaluate(() => ({ log: window.__ADB_GUI_MOCK_CALLS.start_logcat, metrics: window.__ADB_GUI_MOCK_CALLS.start_device_metrics }));
    await page.getByRole("radio", { name: next === "en" ? "English" : "简体中文", exact: true }).click();
    assert.equal(await page.locator("html").getAttribute("lang"), next);
    assert.equal(await page.locator("#settings-title").innerText(), next === "en" ? "Settings" : "设置");
    assert.deepEqual(await page.evaluate(() => ({ log: window.__ADB_GUI_MOCK_CALLS.start_logcat, metrics: window.__ADB_GUI_MOCK_CALLS.start_device_metrics })), starts,
      `${label}: switching locale restarted a stream`);
    await closeSettings(page);
    await page.reload();
    assert.equal(await page.locator("html").getAttribute("lang"), next, `${label}: locale did not persist`);
    assert.deepEqual(errors, [], `${label}: browser errors`);
    console.log(`passed ${label}: six workspaces, six settings sections, menu, switch and reload`);
  } finally {
    await context.close();
  }
}

async function systemLocale(browser, system, expected) {
  const context = await browser.newContext({ locale: system });
  await context.addInitScript({ path: MOCK_SCRIPT });
  const page = await context.newPage();
  try {
    await page.goto(APP_URL);
    await page.locator("#pane-nav-tools").waitFor();
    assert.equal(await page.locator("html").getAttribute("lang"), expected);
    console.log(`passed system ${system} -> ${expected}`);
  } finally { await context.close(); }
}

async function retainedState(browser) {
  const context = await browser.newContext({ locale: "en-US" });
  await context.addInitScript({ path: MOCK_SCRIPT });
  await context.addInitScript(() => localStorage.setItem("locale", "en"));
  const page = await context.newPage();
  try {
    await page.goto(APP_URL);
    await page.getByRole("combobox").fill("invalidkey:value");
    await page.getByRole("combobox").press("Enter");
    await page.locator('[role="alert"]').filter({ hasText: "invalidkey" }).waitFor({ state: "attached" });
    const before = await page.locator('[role="alert"]').allTextContents();
    assert(before.some(text => text.includes("invalidkey")), "query error is visible");
    await page.locator("#pane-nav-codegen").click();
    await page.locator("textarea").fill("locale-smoke-123");
    await settings(page);
    await page.getByRole("radio", { name: "简体中文", exact: true }).click();
    await closeSettings(page);
    assert.equal(await page.locator("textarea").inputValue(), "locale-smoke-123");
    await page.locator("#pane-nav-tools").click();
    assert.equal(await page.getByRole("combobox").inputValue(), "invalidkey:value");
    const after = await page.locator('[role="alert"]').allTextContents();
    assert(after.some(text => text.includes("invalidkey") && /\p{Script=Han}/u.test(text)));
    assert.notDeepEqual(after, before, "retained query error follows locale");
    console.log("passed retained input and query error across locale switch");
  } finally { await context.close(); }
}

const server = await startDevServer();
const browser = await chromium.launch();
try {
  for (const locale of ["en", "zh-CN"]) {
    for (const theme of ["light", "dark"]) {
      for (const viewport of [{ width: 900, height: 600 }, { width: 1400, height: 880 }]) {
        await matrixCase(browser, locale, theme, viewport);
      }
    }
  }
  for (const [system, expected] of [["zh-TW", "zh-CN"], ["en-US", "en"], ["ja-JP", "en"]]) await systemLocale(browser, system, expected);
  await retainedState(browser);
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
