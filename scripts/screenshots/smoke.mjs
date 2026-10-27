import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startDevServer, APP_URL, MOCK_SCRIPT, SNAPSHOT_TIME, uiPreferences } from "./capture.mjs";
import { logcatMemoryCase } from "./logcatMemorySmoke.mjs";

const PANES = ["tools", "apps", "files", "codegen", "decoder", "perf"];
const SECTIONS = ["general", "logcat", "capture", "mirror", "files", "apps", "codegen"];
const MIRROR_SERIAL = "9A271FFAZ004TR";
const MIRROR_TEXT = {
  en: {
    start: "Start mirroring", stop: "Stop mirroring", running: "Mirroring · Pixel 7", failed: "Failed to start:",
    disconnected: "Device disconnected", notFound: "scrcpy not found", tooOld: "scrcpy 1.21 is too old",
    pathInvalid: "Invalid scrcpy path", rows: ["scrcpy", "Quality", "Options", "Extra arguments"], reset: "Restore defaults",
  },
  "zh-CN": {
    start: "开始投屏", stop: "停止投屏", running: "投屏中 · Pixel 7", failed: "启动失败:",
    disconnected: "设备已断开", notFound: "未找到 scrcpy", tooOld: "scrcpy 1.21 过旧",
    pathInvalid: "scrcpy 路径无效", rows: ["scrcpy", "画质", "选项", "额外参数"], reset: "恢复默认",
  },
};

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
  const vertical = await page.evaluate(() => ({ height: innerHeight, scroll: document.documentElement.scrollHeight }));
  assert(vertical.scroll <= vertical.height + 2,
    `${context}: vertical document overflow (scrollHeight ${vertical.scroll} > innerHeight ${vertical.height})`);
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
    console.log(`passed ${label}: six workspaces, seven settings sections, menu, switch and reload`);
  } finally {
    await context.close();
  }
}

async function mirrorPage(browser, locale, theme, viewport, scrcpy) {
  const context = await browser.newContext({ locale, viewport, colorScheme: theme, reducedMotion: "reduce" });
  await context.addInitScript({ path: MOCK_SCRIPT });
  await context.addInitScript(({ locale, theme, ui, scrcpy }) => {
    localStorage.setItem("locale", locale);
    localStorage.setItem("theme", theme);
    localStorage.setItem("adb-gui-ui", ui);
    window.__ADB_GUI_MOCK_SCRCPY = scrcpy;
  }, { locale, theme, ui: uiPreferences("tools", false, 240), scrcpy });
  const page = await context.newPage();
  await page.clock.setFixedTime(SNAPSHOT_TIME);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(APP_URL);
  await page.getByText("Pixel 7", { exact: true }).first().waitFor();
  const module = page.locator("#tool-grid > section").filter({ hasText: "A-10" }).first();
  await module.scrollIntoViewIfNeeded();
  // The header holds the drag handle; the start/stop button opens the body.
  return { context, page, errors, module, status: module.locator('[role="status"]'), button: module.locator(":scope > div button").first() };
}

async function mirrorCase(browser, locale, theme, viewport) {
  const label = `mirror ${locale}/${theme}/${viewport.width}x${viewport.height}`;
  const text = MIRROR_TEXT[locale];
  for (const scrcpy of ["notFound", "tooOld", "pathInvalid"]) {
    const { context, page, errors, status, button } = await mirrorPage(browser, locale, theme, viewport, scrcpy);
    try {
      await status.getByText(text[scrcpy]).waitFor();
      assert(await button.isDisabled(), `${label}/${scrcpy}: start stays disabled`);
      await layout(page, `${label}/${scrcpy}`);
      assert.deepEqual(errors, [], `${label}/${scrcpy}: browser errors`);
    } finally { await context.close(); }
  }

  const { context, page, errors, status, button } = await mirrorPage(browser, locale, theme, viewport, "ready");
  try {
    const exit = (outcome) => page.evaluate(([serial, outcome]) => window.__ADB_GUI_MOCK_MIRROR_EXIT(serial, outcome), [MIRROR_SERIAL, outcome]);
    await button.getByText(text.start).waitFor();
    assert(await button.isEnabled(), `${label}: start is available`);
    await button.click();
    await button.getByText(text.stop).waitFor();
    await status.getByText(text.running).waitFor();
    await layout(page, `${label}/running`);

    // A long scrcpy error wraps inside the module and keeps the retry button.
    await exit("failed");
    await status.getByText(text.failed).waitFor();
    await button.getByText(text.start).waitFor();
    assert(await button.isEnabled(), `${label}: start is the retry after a failure`);
    await layout(page, `${label}/failed`);

    await button.click();
    await button.getByText(text.stop).waitFor();
    await button.click();
    await button.getByText(text.start).waitFor();
    assert.equal((await status.innerText()).trim(), "", `${label}: a stop leaves no error`);

    await button.click();
    await button.getByText(text.stop).waitFor();
    await exit("disconnected");
    await status.getByText(text.disconnected).waitFor();

    await settings(page);
    await page.locator("#settings-nav-mirror").click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator("#settings-nav-mirror").getAttribute("aria-current"), "true", `${label}: anchor index marks the mirror section`);
    const section = page.locator("#settings-section-mirror");
    for (const row of text.rows) await section.getByText(row, { exact: true }).first().waitFor();
    assert.equal(await section.getByText("/opt/homebrew/bin/scrcpy").count(), 1, `${label}: detected path shown`);
    const extra = section.getByRole("textbox");
    await extra.fill("--max-fps=60 -s abc");
    await section.locator('[role="alert"]').filter({ hasText: "-s" }).waitFor();
    await layout(page, `${label}/settings/mirror`);
    await section.getByRole("button", { name: text.reset }).click();
    assert.equal(await extra.inputValue(), "", `${label}: section reset clears extra arguments`);
    await section.locator('[role="alert"]').waitFor({ state: "detached" });
    await closeSettings(page);
    assert.deepEqual(errors, [], `${label}: browser errors`);
    console.log(`passed ${label}: A-10 states, start/stop/exit and the mirror settings section`);
  } finally { await context.close(); }
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

// WebKit (the macOS webview) does not focus a clicked button. A dispatched click
// does the same in Chromium, so this reproduces a mouse-opened bookmark popover.
async function bookmarkPopoverFocus(browser) {
  const context = await browser.newContext({ locale: "en-US" });
  await context.addInitScript({ path: MOCK_SCRIPT });
  await context.addInitScript(({ ui, bookmarks }) => {
    localStorage.setItem("locale", "en");
    localStorage.setItem("adb-gui-ui", ui);
    localStorage.setItem("adb-gui-file-bookmarks", bookmarks);
  }, {
    ui: uiPreferences("files", false, 240),
    bookmarks: JSON.stringify({
      state: { bookmarks: [{ path: "/sdcard", color: null }, { path: "/sdcard/DCIM", color: "blue" }, { path: "/sdcard/Download", color: null }] },
      version: 1,
    }),
  });
  const page = await context.newPage();
  const focused = () => page.evaluate(() => {
    const element = document.activeElement;
    return { label: element?.getAttribute("aria-label"), title: element?.getAttribute("title"), role: element?.getAttribute("role") };
  });
  try {
    await page.goto(APP_URL);
    await page.getByText("DCIM", { exact: true }).first().waitFor();

    const menu = page.getByRole("button", { name: "Bookmarks", exact: true });
    await menu.dispatchEvent("click");
    await page.getByRole("dialog", { name: "Bookmarks" }).waitFor();
    assert.equal((await focused()).label, "Bookmarks", "mouse-opened list keeps focus on its trigger");
    await page.keyboard.press("ArrowDown");
    assert.equal((await focused()).title, "/sdcard", "ArrowDown reaches the first bookmark");
    await page.keyboard.press("End");
    assert.equal((await focused()).title, "/sdcard/Download", "End reaches the last bookmark");
    await page.keyboard.press("Escape");
    assert.equal((await focused()).label, "Bookmarks", "Escape returns focus to the trigger");

    await page.getByRole("button", { name: "Edit bookmark", exact: true }).dispatchEvent("click");
    await page.getByRole("dialog", { name: "Bookmark /sdcard" }).waitFor();
    await page.keyboard.press("Tab");
    const swatch = await focused();
    assert.deepEqual([swatch.role, swatch.label], ["radio", "No color"], "Tab moves from the star into the editor");
    console.log("passed mouse-opened bookmark popovers keep keyboard focus");
  } finally { await context.close(); }
}

const AUTO_PUSH_TEXT = {
  en: {
    module: "Push to phone automatically",
    row: "Push clipboard to phone automatically",
    watching: "Watching the computer clipboard",
    pushed: "Pushed · ",
    locked: "Not pushed: The phone is locked. Unlock it and try again",
    tooLarge: "The last copy exceeds 256 KiB; nothing was pushed",
    unsupported: "Automatic push is not supported on this platform",
    rowUnsupported: "Not supported on this platform",
    reset: "Restore defaults",
  },
  "zh-CN": {
    module: "自动推送到手机",
    row: "自动推送剪贴板到手机",
    watching: "正在监听电脑剪贴板",
    pushed: "已推送 · ",
    locked: "未推送: 手机已锁屏, 请解锁后重试",
    tooLarge: "最近一次复制超过 256 KiB, 未推送",
    unsupported: "当前平台暂不支持自动推送",
    rowUnsupported: "当前平台暂不支持",
    reset: "恢复默认",
  },
};

async function autoPushContext(browser, locale, theme, viewport, supported = true) {
  const context = await browser.newContext({ locale, viewport, colorScheme: theme, reducedMotion: "reduce" });
  await context.addInitScript({ path: MOCK_SCRIPT });
  await context.addInitScript(({ locale, theme, ui, supported }) => {
    localStorage.setItem("locale", locale);
    localStorage.setItem("theme", theme);
    localStorage.setItem("adb-gui-ui", ui);
    window.__ADB_GUI_MOCK_CLIPBOARD_AUTO_PUSH.supported = supported;
  }, { locale, theme, ui: uiPreferences("tools", false, 240), supported });
  return context;
}

function autoPushStatus(page, text) {
  return page.locator('[role="status"][aria-live="polite"]').filter({ hasText: text });
}

// Rust emits the status events; the mock stands in for it with the generation it returned.
async function emitAutoPush(page, status, generationOffset = 0) {
  await page.evaluate(({ status, generationOffset }) => {
    const generation = window.__ADB_GUI_MOCK_CLIPBOARD_AUTO_PUSH.generation + generationOffset;
    window.__ADB_GUI_MOCK_EMIT("clipboard-auto-push", { generation, at: Date.now(), ...status });
  }, { status, generationOffset });
}

async function clipboardAutoPush(browser, locale, theme, viewport) {
  const label = `auto push ${locale}/${theme}/${viewport.width}x${viewport.height}`;
  const text = AUTO_PUSH_TEXT[locale];
  const context = await autoPushContext(browser, locale, theme, viewport);
  const page = await context.newPage();
  await page.clock.setFixedTime(SNAPSHOT_TIME);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const target = () => page.evaluate(() => window.__ADB_GUI_MOCK_CLIPBOARD_AUTO_PUSH.target);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("adb-gui-settings") ?? "null")?.settings?.clipboard?.autoPush ?? null);
  try {
    await page.goto(APP_URL);
    await page.getByText("Pixel 7", { exact: true }).first().waitFor();
    const moduleSwitch = page.getByRole("switch", { name: text.module, exact: true });
    assert.equal(await moduleSwitch.getAttribute("aria-checked"), "false", `${label}: off by default`);
    assert.equal(await target(), null, `${label}: no target while off`);

    // The whole row toggles, not only the switch.
    await page.getByText(text.module, { exact: true }).click();
    assert.equal(await moduleSwitch.getAttribute("aria-checked"), "true", `${label}: row click turns it on`);
    assert.equal(await stored(), true, `${label}: switch persists to settings`);
    await autoPushStatus(page, text.watching).waitFor();
    assert.equal((await target())?.serial, "9A271FFAZ004TR", `${label}: target is the selected device`);

    await emitAutoPush(page, { kind: "pushed" });
    const time = await page.evaluate(locale => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(Date.now()), locale);
    await autoPushStatus(page, `${text.pushed}${time}`).waitFor();
    await emitAutoPush(page, { kind: "failed", error: { code: "clipboard.locked" } });
    await autoPushStatus(page, text.locked).waitFor();
    assert.equal(await page.locator('[role="alert"]').filter({ hasText: text.locked }).count(), 0, `${label}: failure must not toast`);
    await layout(page, `${label}/locked`);
    await emitAutoPush(page, { kind: "skipped", reason: "too_large" });
    await autoPushStatus(page, text.tooLarge).waitFor();
    await emitAutoPush(page, { kind: "pushed" }, -1);
    await page.waitForTimeout(50);
    assert.equal(await autoPushStatus(page, text.tooLarge).count(), 1, `${label}: stale generation ignored`);
    await layout(page, `${label}/too-large`);

    await settings(page);
    await page.locator("#settings-nav-general").click();
    const rowSwitch = page.getByRole("switch", { name: new RegExp(`^${text.row}`) });
    assert.equal(await rowSwitch.getAttribute("aria-checked"), "true", `${label}: settings row follows the module`);
    await layout(page, `${label}/settings`);
    await rowSwitch.click();
    assert.equal(await rowSwitch.getAttribute("aria-checked"), "false");
    await rowSwitch.click();
    await page.locator("#settings-section-general").getByRole("button", { name: text.reset, exact: true }).click();
    assert.equal(await rowSwitch.getAttribute("aria-checked"), "false", `${label}: section reset turns it off`);
    await closeSettings(page);
    assert.equal(await moduleSwitch.getAttribute("aria-checked"), "false", `${label}: module follows the settings row`);
    assert.equal(await stored(), false);
    await page.waitForFunction(() => window.__ADB_GUI_MOCK_CLIPBOARD_AUTO_PUSH.target === null);
    assert.deepEqual(errors, [], `${label}: browser errors`);
    console.log(`passed ${label}: switch, status line, settings sync and reset`);
  } finally { await context.close(); }
}

async function clipboardAutoPushUnsupported(browser, locale, theme, viewport) {
  const label = `auto push unsupported ${locale}/${theme}/${viewport.width}x${viewport.height}`;
  const text = AUTO_PUSH_TEXT[locale];
  const context = await autoPushContext(browser, locale, theme, viewport, false);
  const page = await context.newPage();
  try {
    await page.goto(APP_URL);
    await page.getByText("Pixel 7", { exact: true }).first().waitFor();
    await autoPushStatus(page, text.unsupported).waitFor();
    assert(await page.getByRole("switch", { name: text.module, exact: true }).isDisabled(), `${label}: module switch disabled`);
    await layout(page, label);
    await settings(page);
    await page.locator("#settings-nav-general").click();
    const rowSwitch = page.getByRole("switch", { name: new RegExp(`^${text.row}`) });
    assert(await rowSwitch.isDisabled(), `${label}: settings row disabled`);
    await page.locator("#settings-section-general").getByText(text.rowUnsupported, { exact: true }).waitFor();
    console.log(`passed ${label}: both switches disabled with the reason`);
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
  for (const locale of ["en", "zh-CN"]) {
    for (const theme of ["light", "dark"]) {
      for (const viewport of [{ width: 900, height: 600 }, { width: 1200, height: 800 }]) {
        await mirrorCase(browser, locale, theme, viewport);
      }
    }
  }
  for (const [system, expected] of [["zh-TW", "zh-CN"], ["en-US", "en"], ["ja-JP", "en"]]) await systemLocale(browser, system, expected);
  await retainedState(browser);
  await logcatMemoryCase(browser);
  await bookmarkPopoverFocus(browser);
  for (const theme of ["light", "dark"]) {
    for (const viewport of [{ width: 900, height: 600 }, { width: 1200, height: 800 }]) {
      for (const locale of ["en", "zh-CN"]) await clipboardAutoPush(browser, locale, theme, viewport);
    }
  }
  await clipboardAutoPushUnsupported(browser, "en", "light", { width: 900, height: 600 });
  await clipboardAutoPushUnsupported(browser, "zh-CN", "dark", { width: 1200, height: 800 });
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
