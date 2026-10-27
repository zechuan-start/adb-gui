import assert from "node:assert/strict";
import { APP_URL, MOCK_SCRIPT, uiPreferences } from "./capture.mjs";

// Exercise the real development renderer: a production bundle or store-only
// test cannot detect React's retained performance-track prop diffs.
export async function logcatMemoryCase(browser, url = APP_URL) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await context.addInitScript({ path: MOCK_SCRIPT });
  await context.addInitScript((ui) => localStorage.setItem("adb-gui-ui", ui),
    uiPreferences("tools", true, 320));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(url);
    await page.waitForFunction(async () => {
      const { useLogcatStore } = await import("/src/store/logcat.ts");
      return useLogcatStore.getState().streamState === "live";
    });
    // The mock's initial dump is delayed. Finish it before measuring.
    await page.waitForTimeout(250);
    for (const softWrap of [false, true]) {
      await page.evaluate(async (wrap) => {
        const { useSettingsStore } = await import("/src/store/settings.ts");
        const { useLogcatStore } = await import("/src/store/logcat.ts");
        const settings = useSettingsStore.getState();
        settings.update("logcat", { ...settings.preferences.logcat, softWrap: wrap });
        const store = useLogcatStore.getState();
        store.clearScreen();
        store.setFollowMode("follow");
        const line = { time: "10-25 19:00:00.000", pid: "123", tid: "123",
          level: "I", tag: "MemorySmoke", raw: "memory smoke", message: "synthetic log row" };
        store.flushFrame(Array.from({ length: 10_000 }, () => ({ ...line })), store.sessionId, null);
      }, softWrap);
      await page.waitForTimeout(250);
      // Only discard setup records; preserve every measured update below.
      await page.evaluate(() => performance.clearMeasures());
      for (let batch = 0; batch < 40; batch++) {
        await page.evaluate(async (index) => {
          const { useLogcatStore } = await import("/src/store/logcat.ts");
          const store = useLogcatStore.getState();
          const lines = Array.from({ length: 25 }, (_, row) => ({
            time: "10-25 19:00:00.000", pid: "123", tid: "123", level: "I",
            tag: "MemorySmoke", raw: "memory smoke", message: `memory-smoke-${index}-${row}`,
          }));
          store.flushFrame(lines, store.sessionId, null);
        }, batch);
        await page.waitForTimeout(100);
      }
      const result = await page.evaluate(async () => {
        const { useLogcatStore } = await import("/src/store/logcat.ts");
        const store = useLogcatStore.getState();
        const records = performance.getEntriesByType("measure")
          .filter((entry) => entry.name.includes("LogcatVirtualRows"));
        const sizes = records.map((entry) => JSON.stringify(entry.detail)?.length ?? 0);
        const rows = [...document.querySelectorAll("[data-logcat-seq]")];
        return { records: records.length, bytes: sizes.reduce((sum, size) => sum + size, 0),
          max: Math.max(0, ...sizes), count: store.buffer.count, rows: rows.length,
          renderedLastSeq: Math.max(...rows.map((row) => Number(row.dataset.logcatSeq))),
          lastSeq: store.nextSeq - 1,
          lastText: rows.at(-1)?.querySelector("[data-logcat-message]")?.textContent };
      });
      assert(result.records >= 40, "the development performance tracks must be active");
      assert(result.max < 16_384, `one prop diff must stay bounded: ${JSON.stringify(result)}`);
      assert(result.bytes < 1_048_576, `40 batches must not retain full-array diffs: ${JSON.stringify(result)}`);
      assert.equal(result.count, 10_000, "FIFO retains its capacity");
      assert(result.rows > 0 && result.rows < 300, "only the virtual viewport is rendered");
      assert.equal(result.renderedLastSeq, result.lastSeq, "full-buffer updates invalidate the accessor");
      assert.equal(result.lastText, "memory-smoke-39-24", "the latest row remains visible");
      assert.deepEqual(errors, [], "streaming must not cause browser errors");
      console.log(`passed development Logcat memory (${softWrap ? "wrapped" : "fixed"}): ${JSON.stringify(result)}`);
    }
  } finally {
    await context.close();
  }
}
