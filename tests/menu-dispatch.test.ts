import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setLang, t } from "../src/i18n.ts";
import { mainMenuItems, mainMenuOptions } from "../src/wizard.ts";

describe("menu dispatch robustness", () => {
  it("dispatches on stable ids, never on localized labels", () => {
    for (const lang of ["en", "zh"] as const) {
      setLang(lang);
      const items = mainMenuItems();
      assert.deepEqual(
        items.map((item) => item.value),
        ["providers", "switchDefault", "new", "add", "usage", "settings", "exit"],
      );
      // Labels are free to repeat a word across languages; ids never change.
      assert.deepEqual(mainMenuOptions(), items.map((item) => item.label));
    }
    setLang("en");
  });

  it("every main-menu row carries a one-line hint", () => {
    for (const lang of ["en", "zh"] as const) {
      setLang(lang);
      for (const item of mainMenuItems()) {
        assert.ok(item.description && item.description.length > 0, `missing description for ${item.value}`);
      }
    }
    setLang("en");
  });

  it("groupSkipped exists in both languages", () => {
    setLang("en");
    assert.match(t().groupSkipped("SSPL-2"), /SSPL-2/);
    setLang("zh");
    assert.match(t().groupSkipped("SSPL-2"), /SSPL-2/);
    setLang("en");
  });
});
