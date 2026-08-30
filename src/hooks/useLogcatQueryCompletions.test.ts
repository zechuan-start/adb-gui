import { describe, expect, it } from "vitest";
import { sampleRecentLogcatTags } from "@/hooks/useLogcatQueryCompletions";
import { LogcatRingBuffer, normalizeLine } from "@/lib/logcat";

describe("sampleRecentLogcatTags", () => {
  it("keeps a newly observed tag when the buffer contains more than 200 distinct tags", () => {
    const buffer = new LogcatRingBuffer(201);
    for (let index = 0; index <= 200; index += 1) {
      buffer.push(normalizeLine({
        time: "08-30 12:00:00.000",
        level: "I",
        tag: `Tag${String(index).padStart(3, "0")}`,
        pid: "1",
        tid: "1",
        message: `message-${index}`,
        raw: `raw-${index}`,
      }, index));
    }

    const tags = sampleRecentLogcatTags(buffer);

    expect(tags).toHaveLength(200);
    expect(tags).toContain("Tag200");
    expect(tags).not.toContain("Tag000");
  });
});
