import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startDevServer, APP_URL, MOCK_SCRIPT, SNAPSHOT_TIME, uiPreferences } from "./capture.mjs";

const DEFAULT_ORDER = ["A-01", "A-02", "A-03", "A-04", "A-05", "A-06", "A-09", "A-07", "A-08"];

async function order(page) {
  return page.locator("#tool-grid > section").evaluateAll(
    (nodes) => nodes.map((node) => node.querySelector("header > span:last-child").textContent.trim()),
  );
}

async function headerBox(page, reference) {
  const box = await page
    .locator("#tool-grid > section")
    .filter({ hasText: reference })
    .first()
    .locator("header")
    .boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function dragTo(page, from, to, { drop = true } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * step) / 10,
      from.y + ((to.y - from.y) * step) / 10,
    );
    await page.waitForTimeout(16);
  }
  if (drop) {
    await page.mouse.up();
    await page.waitForTimeout(80);
  }
}

async function open(browser, { storage, viewport, theme = "light" } = {}) {
  const context = await browser.newContext({
    locale: "en",
    viewport: viewport ?? { width: 1200, height: 800 },
    colorScheme: theme,
    reducedMotion: "reduce",
  });
  await context.addInitScript({ path: MOCK_SCRIPT });
  // Seed once only: a reload must read back what the application stored.
  await context.addInitScript((ui) => {
    if (localStorage.getItem("locale") === null) localStorage.setItem("locale", "en");
    if (localStorage.getItem("theme") === null) localStorage.setItem("theme", "light");
    if (localStorage.getItem("adb-gui-ui") === null) localStorage.setItem("adb-gui-ui", ui);
  }, storage ?? uiPreferences("tools", false, 240));
  const page = await context.newPage();
  await page.clock.setFixedTime(SNAPSHOT_TIME);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(APP_URL);
  await page.getByText("Pixel 7", { exact: true }).first().waitFor();
  return { context, page, errors };
}

const server = await startDevServer();
const browser = await chromium.launch();

try {
  // 1. Drag reorders, survives a reload, and the reset entry follows the state.
  {
    const { context, page, errors } = await open(browser);
    assert.deepEqual(await order(page), DEFAULT_ORDER, "default order");
    assert.equal(await page.getByRole("button", { name: "Restore default layout" }).count(), 0);

    await dragTo(page, await headerBox(page, "A-01"), await headerBox(page, "A-04"));
    const reordered = await order(page);
    assert.notDeepEqual(reordered, DEFAULT_ORDER, "drag changed the order");
    assert.equal(reordered.indexOf("A-01"), 3, "A-01 took the fourth slot");
    console.log("  after drag:", reordered.join(" "));

    await page.getByRole("button", { name: "Restore default layout" }).waitFor();

    await page.reload();
    await page.getByText("Pixel 7", { exact: true }).first().waitFor();
    assert.deepEqual(await order(page), reordered, "order survived the reload");

    await page.getByRole("button", { name: "Restore default layout" }).click();
    await page.waitForTimeout(60);
    assert.deepEqual(await order(page), DEFAULT_ORDER, "reset restored the default");
    assert.equal(await page.getByRole("button", { name: "Restore default layout" }).count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
    console.log("passed drag reorder, persistence and reset entry");
  }

  // 2. A plain header click does not reorder; Escape rolls a drag back.
  {
    const { context, page, errors } = await open(browser);
    const first = await headerBox(page, "A-01");
    await page.mouse.click(first.x, first.y);
    await page.waitForTimeout(60);
    assert.deepEqual(await order(page), DEFAULT_ORDER, "a click is not a drag");

    await dragTo(page, first, await headerBox(page, "A-05"), { drop: false });
    assert.notDeepEqual(await order(page), DEFAULT_ORDER, "preview reordered mid-drag");
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await page.waitForTimeout(60);
    assert.deepEqual(await order(page), DEFAULT_ORDER, "Escape rolled the drag back");
    assert.deepEqual(errors, []);
    await context.close();
    console.log("passed header click and Escape rollback");
  }

  // 3. Keyboard reordering keeps focus on the grip and announces the position.
  {
    const { context, page, errors } = await open(browser);
    const grip = page.getByRole("button", { name: /^Reorder Screenshot/ });
    await grip.focus();
    await page.keyboard.press("Control+ArrowRight");
    await page.waitForTimeout(60);

    const moved = await order(page);
    assert.equal(moved.indexOf("A-01"), 1, "Ctrl+ArrowRight moved the module one slot");
    const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    assert.match(focused ?? "", /^Reorder Screenshot, 2 of 9$/, "focus stayed on the grip");
    const announced = await page.locator('[role="status"]').first().textContent();
    assert.equal(announced?.trim(), "Screenshot, 2 of 9", "live region announced the position");

    await page.keyboard.press("Control+ArrowLeft");
    await page.waitForTimeout(60);
    assert.deepEqual(await order(page), DEFAULT_ORDER, "Ctrl+ArrowLeft moved it back");
    assert.deepEqual(errors, []);
    await context.close();
    console.log("passed keyboard reordering, focus and announcement");
  }

  // 4. A corrupt stored order still renders every module exactly once.
  {
    const corrupt = JSON.stringify({
      state: {
        activePane: "tools",
        logOpenByPane: { tools: false, apps: false, files: false, codegen: false, decoder: false, perf: false },
        logHeight: 240,
        toolOrder: ["ports", "retired", "ports", 7],
      },
      version: 0,
    });
    const { context, page, errors } = await open(browser, { storage: corrupt });
    const rendered = await order(page);
    assert.equal(rendered.length, DEFAULT_ORDER.length, "nine modules rendered");
    assert.deepEqual([...rendered].sort(), [...DEFAULT_ORDER].sort(), "no module lost or duplicated");
    assert.deepEqual(errors, []);
    await context.close();
    console.log("passed corrupt stored order recovery");
  }

  // 5. The narrow layout still reorders, and holding at the top edge
  //    auto-scrolls far enough to reach the first slot.
  {
    const { context, page, errors } = await open(browser, {
      viewport: { width: 900, height: 600 },
    });
    assert.deepEqual(await order(page), DEFAULT_ORDER, "default order when narrow");

    await dragTo(page, await headerBox(page, "A-01"), await headerBox(page, "A-02"));
    const narrow = await order(page);
    assert.equal(narrow.indexOf("A-01"), 1, "a narrow-layout drag still reorders");
    await page.getByRole("button", { name: "Restore default layout" }).click();
    await page.waitForTimeout(60);

    const scroller = await page.locator("#tool-grid").evaluate((grid) => {
      const box = grid.parentElement.parentElement.getBoundingClientRect();
      grid.parentElement.parentElement.scrollTop = grid.parentElement.parentElement.scrollHeight;
      return { top: box.top, bottom: box.bottom };
    });
    await page.waitForTimeout(80);

    const last = await headerBox(page, "A-08");
    await page.mouse.move(last.x, last.y);
    await page.mouse.down();
    await page.mouse.move(last.x, last.y - 20);
    await page.mouse.move(last.x, scroller.top + 8);
    // Hold still in the edge band and let the animation frames scroll.
    await page.waitForTimeout(2500);
    await page.mouse.up();
    await page.waitForTimeout(80);

    const scrolled = await order(page);
    assert.equal(scrolled.indexOf("A-08"), 0, "edge auto-scroll reached the first slot");
    assert.deepEqual(errors, []);
    await context.close();
    console.log("passed narrow layout drag and edge auto-scroll");
  }

  // 6. Module bodies keep working, and a reorder moves them without remounting:
  //    local state such as a typed address must survive.
  {
    const { context, page, errors } = await open(browser);
    const deepLink = () => page.locator("#tool-grid > section").filter({ hasText: "A-04" }).first();
    await deepLink().locator("input").first().fill("myapp://home");
    assert.equal(await deepLink().locator("input").first().inputValue(), "myapp://home");
    assert.deepEqual(await order(page), DEFAULT_ORDER, "typing did not reorder");

    await dragTo(page, await headerBox(page, "A-04"), await headerBox(page, "A-01"));
    assert.notDeepEqual(await order(page), DEFAULT_ORDER, "the typed module moved");
    assert.equal(
      await deepLink().locator("input").first().inputValue(),
      "myapp://home",
      "reordering moved the module without remounting it",
    );
    assert.deepEqual(errors, []);
    await context.close();
    console.log("passed module body interaction and state survival");
  }
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
