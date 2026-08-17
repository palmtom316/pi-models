import { Input, Key, matchesKey, SelectList, truncateToWidth, type SelectItem } from "@earendil-works/pi-tui";
import { hubCustom, termRows, type OverlayCtx } from "./overlay.ts";
import { listTheme, renderHubWindow, type ThemeLike } from "./window.ts";

function visibleCount(termRowsCount: number): number {
  return Math.max(4, targetBody(termRowsCount));
}

function targetBody(termRowsCount: number): number {
  return Math.max(4, Math.floor(termRowsCount * 0.7) - 5);
}

function makeSelect(items: SelectItem[], rows: number, theme: ThemeLike): SelectList {
  const select = new SelectList(items, visibleCount(rows), listTheme(theme));
  return select;
}

export async function overlaySelect(
  ctx: OverlayCtx,
  title: string,
  options: string[],
  subtitle?: string,
): Promise<string | undefined> {
  if (options.length === 0) return undefined;
  return hubCustom<string | undefined>(ctx, (tui, theme, _kb, done) => {
    const items: SelectItem[] = options.map((value) => ({ value, label: value }));
    let rows = termRows(tui);
    let select = makeSelect(items, rows, theme);
    const bind = () => {
      select.onSelect = (item) => done(item.value);
      select.onCancel = () => done(undefined);
    };
    bind();
    return {
      render: (width: number) => {
        const next = termRows(tui);
        if (next !== rows) {
          const current = select.getSelectedItem();
          rows = next;
          select = makeSelect(items, rows, theme);
          if (current) {
            const idx = items.findIndex((item) => item.value === current.value);
            if (idx >= 0) select.setSelectedIndex(idx);
          }
          bind();
        }
        return renderHubWindow({
          theme,
          termRows: next,
          width,
          title,
          subtitle,
          body: select.render(Math.max(1, width - 2)),
          footer: "↑↓ navigate • enter select • esc cancel",
        });
      },
      handleInput: (data: string) => {
        select.handleInput(data);
        tui.requestRender();
      },
      invalidate: () => select.invalidate(),
    };
  });
}

export async function overlayConfirm(
  ctx: OverlayCtx,
  title: string,
  message: string,
): Promise<boolean> {
  return hubCustom<boolean>(ctx, (tui, theme, _kb, done) => {
    const items: SelectItem[] = [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ];
    let rows = termRows(tui);
    let select = makeSelect(items, rows, theme);
    const bind = () => {
      select.onSelect = (item) => done(item.value === "yes");
      select.onCancel = () => done(false);
    };
    bind();
    return {
      render: (width: number) => {
        const next = termRows(tui);
        if (next !== rows) {
          const current = select.getSelectedItem();
          rows = next;
          select = makeSelect(items, rows, theme);
          if (current) {
            const idx = items.findIndex((item) => item.value === current.value);
            if (idx >= 0) select.setSelectedIndex(idx);
          }
          bind();
        }
        const inner = Math.max(1, width - 2);
        const note = message.split("\n").map((line) => theme.fg("muted", truncateToWidth(line, inner)));
        return renderHubWindow({
          theme,
          termRows: next,
          width,
          title,
          body: [...note, "", ...select.render(inner)],
          footer: "↑↓ navigate • enter confirm • esc cancel",
        });
      },
      handleInput: (data: string) => {
        select.handleInput(data);
        tui.requestRender();
      },
      invalidate: () => select.invalidate(),
    };
  });
}

export async function overlayInput(
  ctx: OverlayCtx,
  title: string,
  placeholder?: string,
  opts: { secret?: boolean } = {},
): Promise<string | undefined> {
  return hubCustom<string | undefined>(ctx, (tui, theme, _kb, done) => {
    const input = new Input();
    input.onSubmit = (value) => done(value);
    input.onEscape = () => done(undefined);
    input.focused = true;
    return {
      get focused() {
        return input.focused;
      },
      set focused(value: boolean) {
        input.focused = value;
      },
      render: (width: number) => {
        const inner = Math.max(1, width - 2);
        const raw = input.render(inner);
        const painted = opts.secret
          ? [maskLine(theme, input.getValue(), raw[0] ?? "", inner)]
          : raw.map((line) => theme.fg("text", line));
        const hint = placeholder ? theme.fg("dim", placeholder) : "";
        return renderHubWindow({
          theme,
          termRows: termRows(tui),
          width,
          title,
          subtitle: hint || undefined,
          body: painted,
          footer: opts.secret ? "hidden • enter confirm • esc cancel" : "enter confirm • esc cancel",
        });
      },
      handleInput: (data: string) => {
        input.handleInput(data);
        tui.requestRender();
      },
      invalidate: () => input.invalidate(),
    };
  });
}

function maskLine(theme: ThemeLike, value: string, rendered: string, width: number): string {
  const prefix = rendered.startsWith("> ") ? "> " : "";
  const bullets = value.length ? "•".repeat(value.length) : "";
  return truncateToWidth(`${prefix}${theme.fg(value ? "text" : "dim", bullets || "(hidden)")}`, width);
}

export interface MultiSelectItem {
  value: string;
  label: string;
  description?: string;
  checked?: boolean;
  hiddenByDefault?: boolean;
}

export async function overlayMultiSelect(
  ctx: OverlayCtx,
  title: string,
  items: MultiSelectItem[],
): Promise<string[] | undefined> {
  return hubCustom<string[] | undefined>(ctx, (tui, theme, _kb, done) => {
    const checked = new Set(items.filter((i) => i.checked).map((i) => i.value));
    let filter = "";
    let cursor = 0;
    let showHidden = false;
    let offset = 0;

    const visible = () => {
      const base = items.filter((i) => showHidden || !i.hiddenByDefault);
      if (!filter) return base;
      const q = filter.toLowerCase();
      return base.filter((i) => i.label.toLowerCase().includes(q) || i.value.toLowerCase().includes(q));
    };

    return {
      render: (width: number) => {
        const list = visible();
        const inner = Math.max(1, width - 2);
        const maxVisible = Math.max(4, targetBody(termRows(tui)) - 2);
        if (cursor >= list.length) cursor = Math.max(0, list.length - 1);
        if (cursor < offset) offset = cursor;
        if (cursor >= offset + maxVisible) offset = cursor - maxVisible + 1;
        const slice = list.slice(offset, offset + maxVisible);
        const body: string[] = [theme.fg("dim", filter ? `filter: ${filter}` : "type to filter")];
        if (slice.length === 0) body.push(theme.fg("warning", "no matches"));
        for (let i = 0; i < slice.length; i++) {
          const item = slice[i]!;
          const abs = offset + i;
          const mark = checked.has(item.value) ? "[x]" : "[ ]";
          const prefix = abs === cursor ? "> " : "  ";
          const desc = item.description ? `  ${item.description}` : "";
          const line = truncateToWidth(`${prefix}${mark} ${item.label}${desc}`, inner);
          body.push(abs === cursor ? theme.bg("selectedBg", theme.fg("accent", line)) : line);
        }
        if (list.length > maxVisible) {
          body.push(theme.fg("dim", `${offset + 1}-${Math.min(offset + maxVisible, list.length)} / ${list.length}`));
        }
        return renderHubWindow({
          theme,
          termRows: termRows(tui),
          width,
          title,
          body,
          footer: `space toggle • a visible • h hidden • enter ${checked.size} • esc cancel`,
        });
      },
      handleInput: (data: string) => {
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
