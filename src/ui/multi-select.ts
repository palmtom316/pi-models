import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

export interface MultiSelectItem {
  value: string;
  label: string;
  description?: string;
  checked?: boolean;
  hiddenByDefault?: boolean;
}

export async function multiSelect(
  ctx: { ui: { custom: Function } },
  title: string,
  items: MultiSelectItem[],
): Promise<string[] | undefined> {
  return ctx.ui.custom((tui: { requestRender: () => void }, theme: { fg: Function; bold: Function }, _kb: unknown, done: (v: string[] | undefined) => void) => {
    const checked = new Set(items.filter((i) => i.checked).map((i) => i.value));
    let filter = "";
    let cursor = 0;
    let showHidden = false;
    let offset = 0;
    const maxVisible = 12;

    const visible = () => {
      const base = items.filter((i) => showHidden || !i.hiddenByDefault);
      if (!filter) return base;
      const q = filter.toLowerCase();
      return base.filter((i) => i.label.toLowerCase().includes(q) || i.value.toLowerCase().includes(q));
    };

    return {
      render(width: number) {
        const list = visible();
        if (cursor >= list.length) cursor = Math.max(0, list.length - 1);
        if (cursor < offset) offset = cursor;
        if (cursor >= offset + maxVisible) offset = cursor - maxVisible + 1;
        const slice = list.slice(offset, offset + maxVisible);
        const lines = [
          theme.fg("accent", theme.bold(title)),
          theme.fg("dim", filter ? `filter: ${filter}` : "type to filter"),
        ];
        if (slice.length === 0) lines.push(theme.fg("warning", "no matches"));
        for (let i = 0; i < slice.length; i++) {
          const item = slice[i]!;
          const abs = offset + i;
          const mark = checked.has(item.value) ? "[x]" : "[ ]";
          const prefix = abs === cursor ? "> " : "  ";
          const desc = item.description ? `  ${item.description}` : "";
          const body = `${prefix}${mark} ${item.label}${desc}`;
          const painted = abs === cursor ? theme.fg("accent", body) : body;
          lines.push(truncateToWidth(painted, width));
        }
        if (list.length > maxVisible) {
          lines.push(theme.fg("dim", `${offset + 1}-${Math.min(offset + maxVisible, list.length)} / ${list.length}`));
        }
        const n = checked.size;
        lines.push(theme.fg("dim", `space toggle • a visible • h hidden • enter ${n} selected • esc cancel`));
        return lines;
      },
      handleInput(data: string) {
        const list = visible();
        if (matchesKey(data, Key.escape)) {
          if (filter) {
            filter = "";
            tui.requestRender();
            return;
          }
          done(undefined);
          return;
        }
        if (matchesKey(data, Key.enter)) {
          done([...checked]);
          return;
        }
        if (matchesKey(data, Key.up)) {
          cursor = Math.max(0, cursor - 1);
          tui.requestRender();
          return;
        }
        if (matchesKey(data, Key.down)) {
          cursor = Math.min(Math.max(list.length - 1, 0), cursor + 1);
          tui.requestRender();
          return;
        }
        if (matchesKey(data, Key.space)) {
          const item = list[cursor];
          if (item) {
            if (checked.has(item.value)) checked.delete(item.value);
            else checked.add(item.value);
          }
          tui.requestRender();
          return;
        }
        if (data === "a" && !filter) {
          for (const item of list) checked.add(item.value);
          tui.requestRender();
          return;
        }
        if (data === "h" && !filter) {
          showHidden = !showHidden;
          tui.requestRender();
          return;
        }
        if (matchesKey(data, Key.backspace)) {
          filter = filter.slice(0, -1);
          cursor = 0;
          tui.requestRender();
          return;
        }
        if (data.length === 1 && data.charCodeAt(0) >= 32 && data !== " ") {
          filter += data;
          cursor = 0;
          tui.requestRender();
        }
      },
      invalidate() {},
    };
  });
}
