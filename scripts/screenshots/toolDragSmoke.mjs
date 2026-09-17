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

/** Restores the default order through its only entry, the settings dialog. */
async function resetFromSettings(page, whileOpen) {
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await dialog.getByRole("button", { name: "Restore default layout" }).click();
  await whileOpen?.();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
}

function section(page, reference) {
  return page.locator("#tool-grid > section").filter({ hasText: reference }).first();
}

/** References of the modules with a running animation. */
async function animated(page) {
  return page.locator("#tool-grid > section").evaluateAll(
    (nodes) => nodes
      .filter((node) => node.getAnimations().length > 0)
      .map((node) => node.querySelector("header > span:last-child").textContent.trim()),
  );
}

/** Whether the page cancels a text selection starting inside a module body. */
async function selectionBlocked(page) {
  return page.locator("#tool-grid > section > div").first().evaluate((body) => {
    const event = new Event("selectstart", { bubbles: true, cancelable: true });
    body.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

async function open(browser, { storage, viewport, theme = "light", motion = "reduce" } = {}) {
  const context = await browser.newContext({
    locale: "en",
    viewport: viewport ?? { width: 1200, height: 800 },
    colorScheme: theme,
    reducedMotion: motion,
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
    assert.deepEqual(await animated(page), [], "reduced motion moves modules without animating");
    console.log("  after drag:", reordered.join(" "));

    // The only reset entry lives in the settings dialog.
    assert.equal(
      await page.getByRole("button", { name: "Restore default layout" }).count(),
      0,
      "neither the tools page nor the sidebar offers a reset",
    );

    await page.reload();
    await page.getByText("Pixel 7", { exact: true }).first().waitFor();
    assert.deepEqual(await order(page), reordered, "order survived the reload");

    await resetFromSettings(page);
    assert.deepEqual(await order(page), DEFAULT_ORDER, "reset restored the default");
    assert.deepEqual(errors, []);
    await context.close();
    console.log("passed drag reorder, persistence and reset entry");
  }

  // 2. A plain header click does not reorder; Escape rolls a drag back; text
  //    selection is blocked only while a drag is in progress.
  {
    const { context, page, errors } = await open(browser);
    const first = await headerBox(page, "A-01");
    await page.mouse.click(first.x, first.y);
    await page.waitForTimeout(60);
    assert.deepEqual(await order(page), DEFAULT_ORDER, "a click is not a drag");
    assert.equal(await selectionBlocked(page), false, "module text is selectable at rest");

    await dragTo(page, first, await headerBox(page, "A-05"), { drop: false });
    assert.notDeepEqual(await order(page), DEFAULT_ORDER, "preview reordered mid-drag");
    // Chromium never starts this selection, WebKit does; the guard is what
    // keeps the Tauri webview from highlighting text the pointer crosses.
    assert.equal(await selectionBlocked(page), true, "a drag cancels text selection");
    // The reset entry reflects the stored order, not the live preview.
    assert.equal(
      await page.getByRole("button", { name: "Restore default layout" }).count(),
      0,
      "the reset entry stays hidden until the drag is committed",
    );
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await page.waitForTimeout(60);
    assert.deepEqual(await order(page), DEFAULT_ORDER, "Escape rolled the drag back");
    assert.equal(await selectionBlocked(page), false, "selection returns after the drag");
    assert.deepEqual(errors, []);
    await context.close();
    console.log("passed header click, Escape rollback and selection guard");
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
    await resetFromSettings(page);

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
  // 7. Sweeping across the wide module neither flips the order back and forth
  //    nor lets the lifted module drift from the pointer.
  {
    const { context, page, errors } = await open(browser);
    await page.evaluate(() => {
      window.__frames = [];
      let pointer = null;
      window.addEventListener("pointermove", (event) => {
        pointer = { x: event.clientX, y: event.clientY };
      });
      const sections = () => [...document.querySelectorAll("#tool-grid > section")];
      const reference = (node) => node.querySelector("header > span:last-child").textContent.trim();
      const sample = () => {
        const lifted = sections().find((node) => reference(node) === "A-01");
        if (pointer && lifted) {
          const box = lifted.getBoundingClientRect();
          window.__frames.push({
            dx: box.left - pointer.x,
            dy: box.top - pointer.y,
            x: pointer.x,
            order: sections().map(reference).join(" "),
          });
        }
        window.__sampling = requestAnimationFrame(sample);
      };
      window.__sampling = requestAnimationFrame(sample);
    });

    const start = await headerBox(page, "A-01");
    const ports = await section(page, "A-05").boundingBox();
    const y = ports.y + ports.height / 2;
    const xs = [];
    for (let x = ports.x - 60; x <= ports.x + ports.width + 20; x += 20) xs.push(x);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y + 10);
    await page.waitForTimeout(32);
    await page.evaluate(() => { window.__frames = []; });
    for (const x of [...xs, ...[...xs].reverse()]) {
      await page.mouse.move(x, y);
      await page.waitForTimeout(16);
    }
    const frames = await page.evaluate(() => {
      cancelAnimationFrame(window.__sampling);
      return window.__frames;
    });
    await page.mouse.up();

    assert.ok(frames.length > xs.length, "sampled every step");
    const drift = Math.max(...frames.map((frame) =>
      Math.hypot(frame.dx - frames[0].dx, frame.dy - frames[0].dy)));
    assert.ok(drift <= 2, `the lifted module stayed under the pointer (drift ${drift.toFixed(1)} px)`);

    const changes = [];
    for (const frame of frames) {
      if (changes.at(-1)?.order !== frame.order) changes.push(frame);
    }
    // Into the wide module's row, onto the slot past it, and back.
    assert.ok(changes.length <= 4, `order changed ${changes.length} times`);
    for (let index = 2; index < changes.length; index += 1) {
      if (changes[index].order === changes[index - 2].order) {
        assert.ok(
          Math.abs(changes[index].x - changes[index - 1].x) >= 100,
          "undoing a swap took real pointer travel",
        );
      }
    }
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`passed wide module sweep without flips (${changes.length} orders, drift ${drift.toFixed(1)} px)`);
  }

  // 8. With motion allowed, displaced modules slide, a dropped module lands
  //    lifted, keyboard moves stay instant and a reset slides back.
  {
    const { context, page, errors } = await open(browser, { motion: "no-preference" });
    const first = await headerBox(page, "A-01");
    const second = await section(page, "A-02").boundingBox();

    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    await page.mouse.move(first.x + 10, first.y);
    await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2);
    const shifting = await animated(page);
    assert.ok(shifting.includes("A-02"), "the displaced module slides");
    assert.ok(!shifting.includes("A-01"), "the dragged module follows the pointer without animating");

    await page.mouse.up();
    assert.ok((await animated(page)).includes("A-01"), "the dropped module lands");
    assert.match(await section(page, "A-01").getAttribute("class"), /z-10/, "it stays lifted while landing");

    await page.waitForTimeout(400);
    assert.deepEqual(await animated(page), [], "every animation finished");
    assert.doesNotMatch(await section(page, "A-01").getAttribute("class"), /z-10/, "it settled");
    assert.deepEqual(
      await page.locator("#tool-grid > section").evaluateAll((nodes) => nodes.map((node) => node.style.transform)),
      Array(DEFAULT_ORDER.length).fill(""),
      "no transform is left behind",
    );
    assert.equal((await order(page)).indexOf("A-01"), 1, "the drop committed");

    const grip = page.getByRole("button", { name: /^Reorder Install APK/ });
    await grip.focus();
    await page.keyboard.press("Control+ArrowRight");
    assert.equal((await order(page)).indexOf("A-03"), 3, "the keyboard moved it");
    assert.deepEqual(await animated(page), [], "a keyboard move is instant");

    await resetFromSettings(page, async () => {
      assert.ok((await animated(page)).length > 0, "a reset slides the modules home");
      await page.waitForTimeout(400);
      assert.deepEqual(await animated(page), []);
    });
    assert.deepEqual(await order(page), DEFAULT_ORDER, "the reset restored the default");
    assert.deepEqual(errors, []);
    await context.close();
    console.log("passed layout animations, landing and instant keyboard moves");
  }

  // 9. The settings dialog marks a changed layout and restores it.
  {
    const { context, page, errors } = await open(browser);
    const dialog = page.getByRole("dialog");
    const reset = dialog.getByRole("button", { name: "Restore default layout" });
    const openSettings = () => page.getByRole("button", { name: "Settings", exact: true }).click();

    await openSettings();
    assert.equal(await reset.isDisabled(), true, "nothing to restore at first");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });

    await dragTo(page, await headerBox(page, "A-01"), await headerBox(page, "A-04"));
    assert.notDeepEqual(await order(page), DEFAULT_ORDER);

    await openSettings();
    const row = dialog.getByText("Tools layout", { exact: true }).locator("..");
    assert.equal(await row.getByText("Modified", { exact: true }).count(), 1, "the row is marked");
    assert.equal(await reset.isDisabled(), false);
    await reset.click();
    assert.equal(await reset.isDisabled(), true, "restored");
    assert.equal(await row.getByText("Modified", { exact: true }).count(), 0, "the mark cleared");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.deepEqual(await order(page), DEFAULT_ORDER, "the dialog restored the default");
    assert.equal(await page.getByRole("button", { name: "Restore default layout" }).count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
    console.log("passed settings entry for the tools layout");
  }
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
