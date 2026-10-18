import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PIM_OVERLAY_OPTIONS, PIM_OVERLAY_RATIO, renderPimWindow, subtitleRows, targetOverlayHeight, windowBodyRows, windowChromeRows } from "../src/ui/window.ts";

const theme = {
  fg: (_c: string, t: string) => t,
  bg: (_c: string, t: string) => t,
  bold: (t: string) => t,
};

describe("70% overlay window", () => {
  it("declares 70% width/maxHeight overlay options", () => {
    assert.equal(PIM_OVERLAY_OPTIONS.width, "70%");
    assert.equal(PIM_OVERLAY_OPTIONS.maxHeight, "70%");
  });

  it("targets 70% of terminal rows", () => {
    assert.equal(targetOverlayHeight(40), 28);
    assert.equal(targetOverlayHeight(24), 16);
    assert.equal(PIM_OVERLAY_RATIO, 0.7);
  });

  it("never undershoots a minimum height", () => {
    assert.ok(targetOverlayHeight(4) >= 12);
  });

  it("renders a bordered box of the target height", () => {
    const lines = renderPimWindow({
      theme,
      termRows: 30,
      width: 60,
      title: "pim",
      body: ["a", "b"],
      footer: "esc cancel",
    });
    assert.equal(lines[0]!.startsWith("┌"), true);
    assert.equal(lines[lines.length - 1]!.startsWith("└"), true);
    for (const line of lines) assert(line!.length <= 60, "no line overflows width");
  });

  it("fits content in the body region and pads to height", () => {
    const lines = renderPimWindow({
      theme,
      termRows: 30,
      width: 60,
      title: "pim",
      body: ["x"],
      footer: "esc",
    });
    // 30*0.7=21 rows; chrome(no subtitle)=4; body refills to 17
    assert.equal(lines.length, 21);
  });

  it("keeps multi-line subtitles as separate rows", () => {
    const lines = renderPimWindow({
      theme,
      termRows: 20,
      width: 40,
      title: "t",
      subtitle: "line one\nline two\nline three",
      body: ["x"],
      footer: "esc",
    });
    // 20*0.7=14 rows total; chrome = 4 + 3 subtitle rows = 7; body = 7.
    assert.equal(lines.length, 14);
    assert.equal(lines[1]!.includes("line one"), true);
    assert.equal(lines[2]!.includes("line two"), true);
    assert.equal(lines[3]!.includes("line three"), true);
    assert.equal(windowBodyRows(20, "a\nb\nc"), 7);
    for (const line of lines) assert(line!.length <= 40);
  });

  it("accepts a subtitle array and drops trailing blanks", () => {
    const lines = renderPimWindow({
      theme,
      termRows: 20,
      width: 40,
      title: "t",
      subtitle: ["a", "", "b", ""],
      body: ["x"],
      footer: "esc",
    });
    assert.deepEqual(subtitleRows(["a", "", "b", ""]), ["a", "", "b"]);
    assert.equal(lines.length, 14);
    assert.equal(windowChromeRows(["a", "", "b"]), 7);
  });
});
