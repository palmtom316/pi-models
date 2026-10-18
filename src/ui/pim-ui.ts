import type { OverlayCtx } from "./overlay.ts";
import { overlayLoader } from "./overlay.ts";
import {
  overlayConfirm,
  overlayInput,
  overlayMultiSelect,
  overlaySelect,
  type MultiSelectItem,
  type PimConfirmOptions,
  type PimInputOptions,
  type PimOption,
  type PimSelectOptions,
} from "./dialogs.ts";

export type PimUi = OverlayCtx & {
  select: (
    title: string,
    options: (string | PimOption)[],
    subtitle?: string | string[],
    footer?: string,
    opts?: PimSelectOptions,
  ) => Promise<string | undefined>;
  confirm: (title: string, message: string, opts?: PimConfirmOptions) => Promise<boolean | undefined>;
  input: (title: string, placeholder?: string, opts?: PimInputOptions) => Promise<string | undefined>;
  secret: (title: string, opts?: PimInputOptions) => Promise<string | undefined>;
  multiSelect: (title: string, items: MultiSelectItem[]) => Promise<string[] | undefined>;
  loader: <T>(title: string, work: (signal: AbortSignal) => Promise<T>, fallback: T) => Promise<T>;
  notify: (message: string, type?: "info" | "warning" | "error") => void;
};

export function createPimUi(ctx: OverlayCtx): PimUi {
  return {
    ...ctx,
    select: (title, options, subtitle, footer, opts) => overlaySelect(ctx, title, options, subtitle, footer, opts),
    confirm: (title, message, opts) => overlayConfirm(ctx, title, message, opts),
    input: (title, placeholder, opts) => overlayInput(ctx, title, placeholder, opts),
    secret: (title, opts) => overlayInput(ctx, title, undefined, { ...opts, secret: true }),
    multiSelect: (title, items) => overlayMultiSelect(ctx, title, items),
    loader: (title, work, fallback) => overlayLoader(ctx, title, work, fallback),
    notify: (message, type) => ctx.ui.notify(message, type),
  };
}

export type { MultiSelectItem, PimConfirmOptions, PimInputOptions, PimOption, PimSelectOptions };
