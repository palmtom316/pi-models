import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setLang, t } from "../src/i18n.ts";
import {
  applyBulk,
  createMultiSelectSession,
  handleMultiSelectInput,
  visibleItems,
  type MultiSelectItem,
} from "../src/ui/multi-select.ts";

const CTRL_A = "\x01";
const CTRL_R = "\x12";
const CTRL_U = "\x15";
const CTRL_H = "\x08";
const UP = "\x1b[A";
const DOWN = "\x1b[B";
const RIGHT = "\x1b[C";
const LEFT = "\x1b[D";
const ENTER = "\r";
const ESC = "\x1b";
const BACKSPACE = "\x7f";

function items(): MultiSelectItem[] {
  return [
    { value: "gpt-5", label: "gpt-5", checked: true },
    { value: "claude-opus", label: "claude-opus" },
    { value: "embed-3", label: "embed-3", hiddenByDefault: true },
  ];
}

function checked(session: ReturnType<typeof createMultiSelectSession>): string[] {
  return [...session.checked].sort();
}

describe("multi-select bulk actions", () => {
  it("selects, inverts, and clears currently visible models", () => {
    const session = createMultiSelectSession(items());
    assert.deepEqual(checked(session), ["gpt-5"]);

    applyBulk(session, "selectAll");
    assert.deepEqual(checked(session), ["claude-opus", "gpt-5"]);

    applyBulk(session, "invert");
    assert.deepEqual(checked(session), []);

    session.checked.add("gpt-5");
    session.checked.add("embed-3");
    applyBulk(session, "deselectAll");
    assert.deepEqual(checked(session), ["embed-3"]);
  });

  it("bulk actions follow the filter and leave hidden models alone", () => {
    const session = createMultiSelectSession(items());
    session.filter = "claude";
    applyBulk(session, "selectAll");
    assert.deepEqual(checked(session), ["claude-opus", "gpt-5"]);

    session.filter = "gpt";
    applyBulk(session, "deselectAll");
    assert.deepEqual(checked(session), ["claude-opus"]);

    session.filter = "";
    session.showHidden = true;
    applyBulk(session, "selectAll");
    assert.deepEqual(checked(session), ["claude-opus", "embed-3", "gpt-5"]);
  });

  it("ctrl+a / ctrl+r / ctrl+u match the action bar", () => {
    const session = createMultiSelectSession(items());
    assert.equal(handleMultiSelectInput(session, CTRL_A), "pending");
    assert.deepEqual(checked(session), ["claude-opus", "gpt-5"]);

    assert.equal(handleMultiSelectInput(session, CTRL_R), "pending");
    assert.deepEqual(checked(session), []);

    session.checked.add("claude-opus");
    assert.equal(handleMultiSelectInput(session, CTRL_U), "pending");
    assert.deepEqual(checked(session), []);
  });

  it("arrow keys reach the action bar; space runs the focused action", () => {
    const session = createMultiSelectSession(items());
    assert.equal(session.focus, "list");
    handleMultiSelectInput(session, UP);
    assert.equal(session.focus, "bulk");
    assert.equal(session.bulkIndex, 0);

    handleMultiSelectInput(session, RIGHT);
    handleMultiSelectInput(session, RIGHT);
    assert.equal(session.bulkIndex, 2);
    handleMultiSelectInput(session, RIGHT);
    assert.equal(session.bulkIndex, 2);
    handleMultiSelectInput(session, LEFT);
    assert.equal(session.bulkIndex, 1);

    session.checked.add("claude-opus");
    handleMultiSelectInput(session, " ");
    assert.deepEqual(checked(session), []);

    handleMultiSelectInput(session, DOWN);
    assert.equal(session.focus, "list");
    handleMultiSelectInput(session, " ");
    assert.deepEqual(checked(session), ["gpt-5"]);
  });

  it("enter confirms and esc cancels, while filter esc only clears the query", () => {
    const session = createMultiSelectSession(items());
    handleMultiSelectInput(session, "g");
    assert.equal(session.filter, "g");
    assert.deepEqual(visibleItems(session).map((item) => item.value), ["gpt-5"]);
    assert.equal(handleMultiSelectInput(session, ESC), "pending");
    assert.equal(session.filter, "");
    assert.equal(handleMultiSelectInput(session, ESC), "cancel");
    assert.equal(handleMultiSelectInput(session, ENTER), "confirm");
  });

  it("ctrl+h reveals hidden models; backspace edits the filter", () => {
    const session = createMultiSelectSession(items());
    assert.equal(visibleItems(session).length, 2);
    handleMultiSelectInput(session, CTRL_H);
    assert.equal(session.showHidden, true);
    assert.equal(visibleItems(session).length, 3);

    handleMultiSelectInput(session, "e");
    handleMultiSelectInput(session, "m");
    assert.equal(session.filter, "em");
    handleMultiSelectInput(session, BACKSPACE);
    assert.equal(session.filter, "e");
  });
});

describe("multi-select copy", () => {
  it("exposes select-all / invert / deselect-all in both languages", () => {
    setLang("en");
    assert.equal(t().multiSelectAll, "Select all");
    assert.equal(t().multiSelectInvert, "Invert");
    assert.equal(t().multiSelectNone, "Deselect all");
    assert.match(t().multiSelectFooter(3), /\^A all/);
    setLang("zh");
    assert.equal(t().multiSelectAll, "全选");
    assert.equal(t().multiSelectInvert, "反选");
    assert.equal(t().multiSelectNone, "全不选");
    assert.match(t().multiSelectFooter(3), /\^A全选/);
    setLang("en");
  });
});
