import { Input, SelectList, truncateToWidth, type SelectItem } from "@earendil-works/pi-tui";
import { t } from "../i18n.ts";
import { pimCustom, termRows, type OverlayCtx } from "./overlay.ts";
import { listTheme, renderPimWindow, windowBodyRows, type ThemeLike } from "./window.ts";
import {
  createMultiSelectSession,
  handleMultiSelectInput,
  syncWindow,
  visibleItems,
  type MultiSelectItem,
} from "./multi-select.ts";

/** A menu row. `value` is what the caller gets back; `label` is what is drawn. */
export type PimOption = {
  value: string;
  label: string;
  description?: string;
  /** Destructive action: drawn with a warning mark and skipped by default. */
  danger?: boolean;
};

export type PimSelectOptions = {
  /** Pre-select this value instead of the first row. */
  initialValue?: string;
  /** Allow typing to filter. Defaults to true. */
  filterable?: boolean;
};

export type PimConfirmOptions = {
  /** Destructive: default the cursor to "no" and mark the title. */
  danger?: boolean;
  yesLabel?: string;
  noLabel?: string;
};

export type PimInputOptions = {
  secret?: boolean;
  /** Pre-fill the editable value (cursor lands at the end). */
  initial?: string;
  /** Extra context line(s) shown above the field (e.g. the wizard step). */
  subtitle?: string | string[];
};

function makeSelect(items: SelectItem[], rows: number, theme: ThemeLike): SelectList {
  return new SelectList(items, Math.max(4, rows), listTheme(theme));
}

function normalize(options: (string | PimOption)[]): PimOption[] {
  return options.map((option) => (typeof option === "string" ? { value: option, label: option } : option));
}

function paintOption(option: PimOption): SelectItem {
  return {
    value: option.value,
    label: option.danger ? `⚠ ${option.label}` : option.label,
    description: option.description,
  };
}

/** Footers are localized; these helpers keep call sites readable. */
export const FOOTER_SELECT = (): string => t().footerSelect;
export const FOOTER_SELECT_EXIT = (): string => t().footerSelectExit;
export const FOOTER_CONFIRM = (): string => t().footerConfirm;
export const FOOTER_INPUT = (): string => t().footerInput;
export const FOOTER_SECRET = (): string => t().footerSecret;

export async function overlaySelect(
  ctx: OverlayCtx,
  title: string,
  options: (string | PimOption)[],
  subtitle?: string | string[],
  footer?: string,
  opts: PimSelectOptions = {},
): Promise<string | undefined> {
  const entries = normalize(options);
  if (entries.length === 0) {
    // Silence here looks identical to pressing Esc; say why nothing happened.
    ctx.ui.notify(t().emptyList, "warning");
    return undefined;
  }
  const filterable = opts.filterable ?? true;
  return pimCustom<string | undefined>(ctx, (tui, theme, _kb, done) => {
    const items: SelectItem[] = entries.map(paintOption);
    let rows = termRows(tui);
    let select = makeSelect(items, rows, theme);
    let filter = "";
    const initialIndex = opts.initialValue ? entries.findIndex((e) => e.value === opts.initialValue) : -1;
    const applyInitial = () => {
      if (initialIndex >= 0) select.setSelectedIndex(initialIndex);
    };
    applyInitial();
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
          if (filter) select.setFilter(filter);
          if (current) {
            const idx = items.findIndex((item) => item.value === current.value);
            if (idx >= 0) select.setSelectedIndex(idx);
          }
          bind();
        }
        const inner = Math.max(1, width - 2);
        const body = select.render(inner);
        if (filterable && filter) {
          body.unshift(theme.fg("dim", truncateToWidth(t().footerFilter(filter), inner)));
        }
        return renderPimWindow({
          theme,
          termRows: next,
          width,
          title,
          subtitle,
          body,
          footer: filterable ? `${footer ?? FOOTER_SELECT()} • ${t().footerFilter("")}` : footer ?? FOOTER_SELECT(),
        });
      },
      handleInput: (data: string) => {
        if (filterable && data === "\u001b") {
          if (filter) {
            filter = "";
            select.setFilter("");
            applyInitial();
            tui.requestRender();
            return;
          }
          done(undefined);
          return;
        }
        if (filterable && (data === "\u007f" || data === "\b")) {
          if (filter) {
            filter = filter.slice(0, -1);
            select.setFilter(filter);
            tui.requestRender();
            return;
          }
        }
        if (filterable && data.length === 1 && data.charCodeAt(0) >= 32) {
          filter += data;
          select.setFilter(filter);
          tui.requestRender();
          return;
        }
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
  opts: PimConfirmOptions = {},
): Promise<boolean | undefined> {
  return pimCustom<boolean | undefined>(ctx, (tui, theme, _kb, done) => {
    const tr = t();
    const items: SelectItem[] = [
      { value: "yes", label: opts.yesLabel ?? tr.answerYes },
      { value: "no", label: opts.noLabel ?? tr.answerNo },
    ];
    let rows = termRows(tui);
    let select = makeSelect(items, rows, theme);
    if (opts.danger) select.setSelectedIndex(1);
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
          title: opts.danger ? `⚠ ${title}` : title,
          body: [...note, "", ...select.render(inner)],
          footer: FOOTER_CONFIRM(),
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
  opts: PimInputOptions = {},
): Promise<string | undefined> {
  return pimCustom<string | undefined>(ctx, (tui, theme, _kb, done) => {
    const input = new Input();
    if (opts.initial) {
      input.setValue(opts.initial);
      // Input.setValue keeps the cursor at 0; move it to the end so the value
      // can be edited with backspace right away.
      input.handleInput("\u0005");
    }
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
        const extra = opts.subtitle === undefined ? [] : Array.isArray(opts.subtitle) ? opts.subtitle : [opts.subtitle];
        const subtitle = [...extra, ...(hint ? [hint] : [])];
        return renderPimWindow({
          theme,
          termRows: termRows(tui),
          width,
          title,
          subtitle: subtitle.length ? subtitle : undefined,
          body: painted,
          footer: opts.secret ? FOOTER_SECRET() : FOOTER_INPUT(),
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
  return truncateToWidth(`${prefix}${theme.fg(value ? "text" : "dim", bullets || t().secretHidden)}`, width);
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
        const maxVisible = Math.max(4, windowBodyRows(termRows(tui)) - 4);
        const visCount = visibleItems(session).length;
        const slice = syncWindow(session, maxVisible);
        const bulkLabels = [tr.multiSelectAll, tr.multiSelectInvert, tr.multiSelectNone];
        const body: string[] = [
          theme.fg("dim", tr.multiSelectFilter(session.filter)),
          paintBulkBar(theme, bulkLabels, session.bulkIndex, session.focus === "bulk", inner),
          theme.fg("dim", tr.multiSelectHidden(session.showHidden)),
        ];
        if (session.notice) body.push(theme.fg("warning", session.notice));
        if (slice.length === 0) body.push(theme.fg("warning", tr.multiSelectNoMatch));
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
