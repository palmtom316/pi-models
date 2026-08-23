import { Key, matchesKey } from "@earendil-works/pi-tui";

export interface MultiSelectItem {
  value: string;
  label: string;
  description?: string;
  checked?: boolean;
  hiddenByDefault?: boolean;
}

export const BULK_ACTIONS = ["selectAll", "invert", "deselectAll"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

export interface MultiSelectSession {
  items: MultiSelectItem[];
  checked: Set<string>;
  filter: string;
  showHidden: boolean;
  /** `"bulk"` = action bar; `"list"` = model rows. */
  focus: "bulk" | "list";
  bulkIndex: number;
  cursor: number;
  offset: number;
}

export function createMultiSelectSession(items: MultiSelectItem[]): MultiSelectSession {
  return {
    items,
    checked: new Set(items.filter((item) => item.checked).map((item) => item.value)),
    filter: "",
    showHidden: false,
    focus: "list",
    bulkIndex: 0,
    cursor: 0,
    offset: 0,
  };
}

export function visibleItems(session: MultiSelectSession): MultiSelectItem[] {
  const base = session.items.filter((item) => session.showHidden || !item.hiddenByDefault);
  if (!session.filter) return base;
  const q = session.filter.toLowerCase();
  return base.filter((item) => item.label.toLowerCase().includes(q) || item.value.toLowerCase().includes(q));
}

export function applyBulk(session: MultiSelectSession, action: BulkAction): void {
  const list = visibleItems(session);
  if (action === "selectAll") {
    for (const item of list) session.checked.add(item.value);
    return;
  }
  if (action === "deselectAll") {
    for (const item of list) session.checked.delete(item.value);
    return;
  }
  for (const item of list) {
    if (session.checked.has(item.value)) session.checked.delete(item.value);
    else session.checked.add(item.value);
  }
}

export function clampCursor(session: MultiSelectSession): void {
  const list = visibleItems(session);
  if (list.length === 0) {
    session.cursor = 0;
    session.offset = 0;
    return;
  }
  if (session.cursor >= list.length) session.cursor = list.length - 1;
  if (session.cursor < 0) session.cursor = 0;
}

function resetListCursor(session: MultiSelectSession): void {
  session.cursor = 0;
  session.offset = 0;
  session.focus = "list";
  clampCursor(session);
}

export type MultiSelectOutcome = "pending" | "confirm" | "cancel";

export function handleMultiSelectInput(session: MultiSelectSession, data: string): MultiSelectOutcome {
  const list = visibleItems(session);

  if (matchesKey(data, Key.escape)) {
    if (session.filter) {
      session.filter = "";
      resetListCursor(session);
      return "pending";
    }
    return "cancel";
  }
  if (matchesKey(data, Key.enter)) return "confirm";

  if (matchesKey(data, Key.ctrl("a"))) {
    applyBulk(session, "selectAll");
    return "pending";
  }
  if (matchesKey(data, Key.ctrl("r"))) {
    applyBulk(session, "invert");
    return "pending";
  }
  if (matchesKey(data, Key.ctrl("u"))) {
    applyBulk(session, "deselectAll");
    return "pending";
  }
  if (matchesKey(data, Key.ctrl("h"))) {
    session.showHidden = !session.showHidden;
    clampCursor(session);
    return "pending";
  }

  if (matchesKey(data, Key.left)) {
    if (session.focus === "bulk") {
      session.bulkIndex = Math.max(0, session.bulkIndex - 1);
    }
    return "pending";
  }
  if (matchesKey(data, Key.right)) {
    if (session.focus === "bulk") {
      session.bulkIndex = Math.min(BULK_ACTIONS.length - 1, session.bulkIndex + 1);
    }
    return "pending";
  }
  if (matchesKey(data, Key.up)) {
    if (session.focus === "list") {
      if (session.cursor <= 0) session.focus = "bulk";
      else session.cursor -= 1;
    }
    return "pending";
  }
  if (matchesKey(data, Key.down)) {
    if (session.focus === "bulk") {
      session.focus = "list";
      if (list.length === 0) session.cursor = 0;
    } else if (list.length > 0) {
      session.cursor = Math.min(list.length - 1, session.cursor + 1);
    }
    return "pending";
  }

  if (matchesKey(data, Key.space)) {
    if (session.focus === "bulk") {
      applyBulk(session, BULK_ACTIONS[session.bulkIndex]!);
      return "pending";
    }
    const item = list[session.cursor];
    if (item) {
      if (session.checked.has(item.value)) session.checked.delete(item.value);
      else session.checked.add(item.value);
    }
    return "pending";
  }

  if (matchesKey(data, Key.backspace)) {
    session.filter = session.filter.slice(0, -1);
    resetListCursor(session);
    return "pending";
  }
  if (data.length === 1 && data.charCodeAt(0) >= 32 && data !== " ") {
    session.filter += data;
    resetListCursor(session);
  }
  return "pending";
}

export function syncWindow(session: MultiSelectSession, maxVisible: number): MultiSelectItem[] {
  const list = visibleItems(session);
  clampCursor(session);
  if (session.focus === "list") {
    if (session.cursor < session.offset) session.offset = session.cursor;
    if (session.cursor >= session.offset + maxVisible) session.offset = session.cursor - maxVisible + 1;
  }
  if (session.offset < 0) session.offset = 0;
  const maxOffset = Math.max(0, list.length - maxVisible);
  if (session.offset > maxOffset) session.offset = maxOffset;
  return list.slice(session.offset, session.offset + maxVisible);
}
