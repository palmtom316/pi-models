import { resetDraftCaps } from "../caps.ts";
import { THINKING_LEVELS, type ModelDraft, type ThinkingLevel, type ThinkingLevelMap } from "../types.ts";
import type { PimUi } from "./pim-ui.ts";
import { t } from "../i18n.ts";

export { recordToDraft, resetDraftCaps } from "../caps.ts";

function cloneMap(map?: ThinkingLevelMap): ThinkingLevelMap {
  return { ...(map ?? {}) };
}

function mapSummary(map?: ThinkingLevelMap): string {
  const tr = t();
  const parts = THINKING_LEVELS.filter((k) => map?.[k] != null).map((k) => `${k}=${map?.[k]}`);
  return parts.length ? parts.join(" ") : tr.thinkingMapAllHidden;
}

function parseIntOr(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw.replace(/[_ ,]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

async function editThinkingMap(ui: PimUi, map: ThinkingLevelMap): Promise<ThinkingLevelMap | undefined> {
  const tr = t();
  const next = cloneMap(map);
  while (true) {
    const choice = await ui.select(
      tr.editThinkingMap(mapSummary(next)),
      [
        ...THINKING_LEVELS.map((k) => `${k}: ${next[k] == null ? "hidden" : JSON.stringify(next[k])}`),
        tr.editDone,
      ],
    );
    if (!choice) return undefined;
    if (choice === tr.editDone) return next;
    const level = choice.split(":")[0] as ThinkingLevel;
    const action = await ui.select(`${level}`, tr.thinkingLevelActions);
    if (!action || action === tr.thinkingBack) continue;
    if (action === tr.thinkingHide) next[level] = null;
    else if (action === tr.thinkingUseLevelName) next[level] = level === "off" ? "none" : level;
    else if (action === tr.thinkingCustom) {
      const typed = await ui.input(tr.thinkingCustomValue(level), String(next[level] ?? level));
      if (typed != null) next[level] = typed;
    } else next[level] = action;
  }
}

export async function editDraft(ui: PimUi, draft: ModelDraft): Promise<ModelDraft | undefined> {
  const tr = t();
  let current = { ...draft, thinkingLevelMap: cloneMap(draft.thinkingLevelMap), input: [...draft.input] };
  while (true) {
    const matched = current.match.officialId ? ` → ${current.match.officialId}` : "";
    const choice = await ui.select(
      `${current.id}${matched}`,
      [
        tr.editName(current.name),
        tr.editContextWindow(current.contextWindow),
        tr.editMaxTokens(current.maxTokens),
        tr.editInput(current.input.join("+")),
        tr.editReasoning(current.reasoning),
        tr.editThinkingMap(mapSummary(current.thinkingLevelMap)),
        tr.editReset,
        tr.editDone,
      ],
      `${current.name}  ${current.contextWindow}/${current.maxTokens}  ${current.reasoning ? "reasoning" : "no-think"}  ${current.input.join("+")}\n${mapSummary(current.thinkingLevelMap)}`,
    );
    if (!choice) return undefined;
    if (choice === tr.editDone) return current;
    if (choice === tr.editReset) {
      current = resetDraftCaps(current);
      ui.notify(tr.resetFromMsg(current.id, current.match.officialId ?? "heuristic"), "info");
      continue;
    }
    if (choice.startsWith(tr.editName("").split(":")[0])) {
      const name = await ui.input(tr.inputDisplayName, current.name);
      if (name) current.name = name;
      continue;
    }
    if (choice.startsWith(tr.editContextWindow(0).split(":")[0])) {
      const raw = await ui.input(tr.inputContextWindow, String(current.contextWindow));
      current.contextWindow = parseIntOr(raw, current.contextWindow);
      continue;
    }
    if (choice.startsWith(tr.editMaxTokens(0).split(":")[0])) {
      const raw = await ui.input(tr.inputMaxTokens, String(current.maxTokens));
      current.maxTokens = parseIntOr(raw, current.maxTokens);
      continue;
    }
    if (choice.startsWith(tr.editInput("").split(":")[0])) {
      const input = await ui.select(tr.selectInput, [tr.inputText, tr.inputTextImage]);
      if (input === tr.inputText) current.input = ["text"];
      if (input === tr.inputTextImage) current.input = ["text", "image"];
      continue;
    }
    if (choice.startsWith(tr.editReasoning(true).split(":")[0])) {
      const on = await ui.select(tr.selectReasoning, [tr.reasoningYes, tr.reasoningNo]);
      if (on === tr.reasoningYes) current.reasoning = true;
      if (on === tr.reasoningNo) current.reasoning = false;
      continue;
    }
    if (choice.startsWith(tr.editThinkingMap("").split("  ")[0])) {
      const map = await editThinkingMap(ui, current.thinkingLevelMap ?? {});
      if (map) current.thinkingLevelMap = map;
    }
  }
}

export async function maybeEditDrafts(ui: PimUi, drafts: ModelDraft[]): Promise<ModelDraft[] | undefined> {
  const tr = t();
  if (drafts.length === 0) return drafts;
  const action = await ui.select(
    tr.editCapsTitle(drafts.length),
    [tr.editCapsSkip, tr.editCapsAll, tr.editCapsPick, tr.editCapsCancel],
    tr.editCapsSubtitle,
  );
  if (!action || action === tr.editCapsCancel) return undefined;
  if (action === tr.editCapsSkip) return drafts;

  const targets = action === tr.editCapsPick
    ? await ui.multiSelect(
        tr.editCapsPick,
        drafts.map((d) => ({
          value: d.id,
          label: d.id,
          description: d.match.officialId ? `→ ${d.match.officialId}` : d.match.kind,
        })),
      )
    : drafts.map((d) => d.id);
  if (!targets) return undefined;

  const out = [...drafts];
  for (let i = 0; i < out.length; i++) {
    if (!targets.includes(out[i]!.id)) continue;
    const edited = await editDraft(ui, out[i]!);
    if (!edited) return undefined;
    out[i] = edited;
  }
  return out;
}
