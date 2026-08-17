import type { OverlayCtx } from "./overlay.ts";
import { overlayLoader } from "./overlay.ts";
import { overlayConfirm, overlayInput, overlayMultiSelect, overlaySelect, type MultiSelectItem } from "./dialogs.ts";
import type { Lang, Strings } from "../i18n.ts";
import { getLang, t } from "../i18n.ts";

export type PimUi = OverlayCtx & {
  select: (title: string, options: string[], subtitle?: string) => Promise<string | undefined>;
  confirm: (title: string, message: string) => Promise<boolean>;
  input: (title: string, placeholder?: string) => Promise<string | undefined>;
  secret: (title: string) => Promise<string | undefined>;
  multiSelect: (title: string, items: MultiSelectItem[]) => Promise<string[] | undefined>;
  loader: <T>(title: string, work: (signal: AbortSignal) => Promise<T>, fallback: T) => Promise<T>;
  notify: (message: string, type?: "info" | "warning" | "error") => void;
};

export function createPimUi(ctx: OverlayCtx): PimUi {
  return {
    ...ctx,
    select: (title, options, subtitle) => overlaySelect(ctx, title, options, subtitle),
    confirm: (title, message) => overlayConfirm(ctx, title, message),
    input: (title, placeholder) => overlayInput(ctx, title, placeholder),
    secret: (title) => overlayInput(ctx, title, undefined, { secret: true }),
    multiSelect: (title, items) => overlayMultiSelect(ctx, title, items),
    loader: (title, work, fallback) => overlayLoader(ctx, title, work, fallback),
    notify: (message, type) => ctx.ui.notify(message, type),
  };
}

export type { MultiSelectItem };
