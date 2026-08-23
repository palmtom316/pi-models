import { Input, SelectList, truncateToWidth, type SelectItem } from "@earendil-works/pi-tui";
import { t } from "../i18n.ts";
import { pimCustom, termRows, type OverlayCtx } from "./overlay.ts";
import { listTheme, renderPimWindow, type ThemeLike } from "./window.ts";
import {
  createMultiSelectSession,
  handleMultiSelectInput,
  syncWindow,
  visibleItems,
  type MultiSelectItem,
} from "./multi-select.ts";

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

export const FOOTER_SELECT = "↑↓ navigate • enter select • esc back";
export const FOOTER_SELECT_EXIT = "↑↓ navigate • enter select • esc exit";
export const FOOTER_CONFIRM = "↑↓ navigate • enter confirm • esc back";
export const FOOTER_INPUT = "enter confirm • esc back";
export const FOOTER_SECRET = "hidden • enter confirm • esc back";

export async function overlaySelect(
  ctx: OverlayCtx,
  title: string,
  options: string[],
  subtitle?: string,
  footer: string = FOOTER_SELECT,
): Promise<string | undefined> {
  if (options.length === 0) return undefined;
  return pimCustom<string | undefined>(ctx, (tui, theme, _kb, done) => {
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
        return renderPimWindow({
          theme,
          termRows: next,
          width,
          title,
          subtitle,
          body: select.render(Math.max(1, width - 2)),
          footer,
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
): Promise<boolean | undefined> {
  return pimCustom<boolean | undefined>(ctx, (tui, theme, _kb, done) => {
    const items: SelectItem[] = [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ];
    let rows = termRows(tui);
    let select = makeSelect(items, rows, theme);
    const bind = () => {
      select.onSelect = (item) => done(item.value === "yes");
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
        const inner = Math.max(1, width - 2);
        const note = message.split("\n").map((line) => theme.fg("muted", truncateToWidth(line, inner)));
        return renderPimWindow({
          theme,
          termRows: next,
          width,
          title,
          body: [...note, "", ...select.render(inner)],
          footer: FOOTER_CONFIRM,
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
  return pimCustom<string | undefined>(ctx, (tui, theme, _kb, done) => {
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
        return renderPimWindow({
          theme,
          termRows: termRows(tui),
          width,
          title,
          subtitle: hint || undefined,
          body: painted,
          footer: opts.secret ? FOOTER_SECRET : FOOTER_INPUT,
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

export type { MultiSelectItem };

function paintBulkBar(theme: ThemeLike, labels: string[], activeIndex: number, focused: boolean, width: number): string {
  const parts = labels.map((label, i) => {
    const active = focused && i === activeIndex;
    const mark = active ? `[${label}]` : ` ${label} `;
    return active ? theme.bg("selectedBg", theme.fg("accent", mark)) : theme.fg("muted", mark);
  });
  return truncateToWidth(parts.join(" "), width);
}

export async function overlayMultiSelect(
  ctx: OverlayCtx,
  title: string,
  items: MultiSelectItem[],
): Promise<string[] | undefined> {
  return pimCustom<string[] | undefined>(ctx, (tui, theme, _kb, done) => {
    const session = createMultiSelectSession(items);

    return {
      render: (width: number) => {
        const tr = t();
        const inner = Math.max(1, width - 2);
        const maxVisible = Math.max(4, targetBody(termRows(tui)) - 3);
        const visCount = visibleItems(session).length;
        const slice = syncWindow(session, maxVisible);
        const bulkLabels = [tr.multiSelectAll, tr.multiSelectInvert, tr.multiSelectNone];
        const body: string[] = [
          theme.fg("dim", tr.multiSelectFilter(session.filter)),
          paintBulkBar(theme, bulkLabels, session.bulkIndex, session.focus === "bulk", inner),
        ];
        if (slice.length === 0) body.push(theme.fg("warning", "no matches"));
        for (let i = 0; i < slice.length; i++) {
          const item = slice[i]!;
          const abs = session.offset + i;
          const mark = session.checked.has(item.value) ? "[x]" : "[ ]";
          const listFocused = session.focus === "list" && abs === session.cursor;
          const prefix = listFocused ? "> " : "  ";
          const desc = item.description ? `  ${item.description}` : "";
          const line = truncateToWidth(`${prefix}${mark} ${item.label}${desc}`, inner);
          body.push(listFocused ? theme.bg("selectedBg", theme.fg("accent", line)) : line);
        }
        if (visCount > maxVisible) {
          body.push(
            theme.fg("dim", `${session.offset + 1}-${Math.min(session.offset + maxVisible, visCount)} / ${visCount}`),
          );
        }
        return renderPimWindow({
          theme,
          termRows: termRows(tui),
          width,
          title,
          body,
          footer: tr.multiSelectFooter(session.checked.size),
        });
      },
      handleInput: (data: string) => {
        const outcome = handleMultiSelectInput(session, data);
        if (outcome === "cancel") {
          done(undefined);
          return;
        }
        if (outcome === "confirm") {
          done([...session.checked]);
          return;
        }
        tui.requestRender();
      },
      invalidate() {},
    };
  });
}
