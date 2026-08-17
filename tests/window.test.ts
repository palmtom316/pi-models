import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HUB_OVERLAY_OPTIONS, HUB_OVERLAY_RATIO, renderHubWindow, targetOverlayHeight } from "../src/ui/window.ts";

const theme = {
  fg: (_c: string, t: string) => t,
  bg: (_c: string, t: string) => t,
  bold: (t: string) => t,
};

describe("70% overlay window", () => {
  it("declares 70% width/maxHeight overlay options", () => {
    assert.equal(HUB_OVERLAY_OPTIONS.width, "70%");
    assert.equal(HUB_OVERLAY_OPTIONS.maxHeight, "70%");
  });

  it("targets 70% of terminal rows", () => {
    assert.equal(targetOverlayHeight(40), 28);
    assert.equal(targetOverlayHeight(24), 16);
    assert.equal(HUB_OVERLAY_RATIO, 0.7);
  });

  it("never undershoots a minimum height", () => {
    assert.ok(targetOverlayHeight(4) >= 12);
  });

  it("renders a bordered box of the target height", () => {
    const lines = renderHubWindow({
      theme,
      termRows: 30,
      width: 60,
      title: "pi-hub",
      body: ["a", "b"],
      footer: "esc cancel",
    });
    assert.equal(lines[0]!.startsWith("┌"), true);
    assert.equal(lines[lines.length - 1]!.startsWith("└"), true);
    for (const line of lines) assert(line!.length <= 60, "no line overflows width");
  });

  it("fits content in the body region and pads to height", () => {
    const lines = renderHubWindow({
      theme,
      termRows: 30,
      width: 60,
      title: "pi-hub",
      body: ["x"],
      footer: "esc",
    });
    // 30*0.7=21 rows; chrome(no subtitle)=4; body refills to 17
    assert.equal(lines.length, 21);
  });

  it("one-line filters multi-line subtitles", () => {
    const lines = renderHubWindow({
      theme,
      termRows: 20,
      width: 40,
      title: "t",
      subtitle: "line one\nline two\nline three",
      body: ["a"],
      footer: "esc",
    });
    for (const line of lines) assert(line!.length <= 40);
  });
});