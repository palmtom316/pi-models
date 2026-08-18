import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setLang, t } from "../src/i18n.ts";

describe("menu dispatch robustness", () => {
  it("menuLang labels differ between languages so dispatch by label is unambiguous", () => {
    setLang("en");
    const en = t().menuLang("en");
    setLang("zh");
    const zh = t().menuLang("zh");
    assert.notEqual(en, zh);
    // and neither collides with other menu labels
    setLang("en");
    const enLabels = [t().menuNew, t().menuAdd, t().menuManage, t().menuView, t().menuRefresh, t().menuExit];
    setLang("zh");
    const zhLabels = [t().menuNew, t().menuAdd, t().menuManage, t().menuView, t().menuRefresh, t().menuExit];
    assert.ok(!enLabels.includes(en));
    assert.ok(!zhLabels.includes(zh));
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
