import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

export async function secretInput(
  ctx: { ui: { custom: Function } },
  title: string,
): Promise<string | undefined> {
  return ctx.ui.custom((tui: { requestRender: () => void }, theme: { fg: Function; bold: Function }, _kb: unknown, done: (v: string | undefined) => void) => {
    let value = "";
    let cancelled = false;
    return {
      render(width: number) {
        const mask = value.length ? "•".repeat(Math.min(value.length, Math.max(8, width - 8))) : "";
        const prompt = value.length ? mask : theme.fg("dim", "(hidden)");
        return [
          theme.fg("accent", theme.bold(title)),
          truncateToWidth(`> ${prompt}`, width),
          theme.fg("dim", "enter confirm • esc cancel"),
        ];
      },
      handleInput(data: string) {
        if (cancelled) return;
        if (matchesKey(data, Key.escape)) {
          cancelled = true;
          done(undefined);
          return;
        }
        if (matchesKey(data, Key.enter)) {
          done(value);
          return;
        }
        if (matchesKey(data, Key.backspace)) {
          value = value.slice(0, -1);
          tui.requestRender();
          return;
        }
        if (data === "\x17") {
          value = "";
          tui.requestRender();
          return;
        }
        if (data.length === 1 && data.charCodeAt(0) >= 32) {
          value += data;
          tui.requestRender();
        } else if (data.length > 1 && !data.startsWith("\x1b")) {
          value += data;
          tui.requestRender();
        }
      },
      invalidate() {},
    };
  });
}
