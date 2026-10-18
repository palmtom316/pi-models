import { resetDraftCaps } from "../caps.ts";
import { THINKING_LEVELS, type ModelDraft, type ThinkingLevel, type ThinkingLevelMap } from "../types.ts";
import type { PimOption, PimUi } from "./pim-ui.ts";
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
    const options: PimOption[] = [
      ...THINKING_LEVELS.map((k) => ({
        value: `level:${k}`,
        label: k,
        description: next[k] == null ? tr.thinkingHidden : JSON.stringify(next[k]),
      })),
      { value: "done", label: tr.editDone },
    ];
    const choice = await ui.select(tr.editThinkingMap(mapSummary(next)), options);
    if (!choice) return undefined;
    if (choice === "done") return next;
    const level = choice.slice("level:".length) as ThinkingLevel;
    const action = await ui.select(level, [
      { value: "hide", label: tr.thinkingHide },
      { value: "levelName", label: tr.thinkingUseLevelName },
      { value: "none", label: tr.thinkingNone },
      { value: "disabled", label: tr.thinkingDisabled },
      { value: "enabled", label: tr.thinkingEnabled },
      { value: "custom", label: tr.thinkingCustom },
      { value: "back", label: tr.thinkingBack },
    ]);
    if (!action || action === "back") continue;
    if (action === "hide") next[level] = null;
    else if (action === "levelName") next[level] = level === "off" ? "none" : level;
    else if (action === "custom") {
      const typed = await ui.input(tr.thinkingCustomValue(level), level, {
        initial: next[level] == null ? "" : String(next[level]),
      });
      if (typed != null) next[level] = typed;
    } else next[level] = action;
  }
}

export async function editDraft(ui: PimUi, draft: ModelDraft): Promise<ModelDraft | undefined> {
  const tr = t();
  let current: ModelDraft = { ...draft, thinkingLevelMap: cloneMap(draft.thinkingLevelMap), input: [...draft.input] };
  while (true) {
    const matched = current.match.officialId ? ` → ${current.match.officialId}` : "";
    const options: PimOption[] = [
      { value: "name", label: tr.editName(current.name) },
      { value: "context", label: tr.editContextWindow(current.contextWindow), description: "tokens" },
      { value: "maxTokens", label: tr.editMaxTokens(current.maxTokens), description: "tokens" },
      { value: "input", label: tr.editInput(current.input.join("+")) },
      { value: "reasoning", label: tr.editReasoning(current.reasoning) },
      { value: "thinking", label: tr.editThinkingMap(mapSummary(current.thinkingLevelMap)) },
      { value: "reset", label: tr.editReset },
      { value: "done", label: tr.editDone },
    ];
    const choice = await ui.select(
      `${current.id}${matched}`,
      options,
      [
        `${current.name}  ${current.contextWindow}/${current.maxTokens}  ${current.reasoning ? tr.reasoningOn : tr.reasoningOff}  ${current.input.join("+")}`,
        mapSummary(current.thinkingLevelMap),
      ],
    );
    if (!choice) return undefined;
    if (choice === "done") return current;
    if (choice === "reset") {
      current = resetDraftCaps(current);
      ui.notify(tr.resetFromMsg(current.id, current.match.officialId ?? tr.sourceHeuristic), "info");
      continue;
    }
    if (choice === "name") {
      const name = await ui.input(tr.inputDisplayName, undefined, { initial: current.name });
      if (name) current.name = name;
      continue;
    }
    if (choice === "context") {
      const raw = await ui.input(tr.inputContextWindow, undefined, { initial: String(current.contextWindow) });
      current.contextWindow = parseIntOr(raw, current.contextWindow);
      continue;
    }
    if (choice === "maxTokens") {
      const raw = await ui.input(tr.inputMaxTokens, undefined, { initial: String(current.maxTokens) });
      current.maxTokens = parseIntOr(raw, current.maxTokens);
      continue;
    }
    if (choice === "input") {
      const input = await ui.select(tr.selectInput, [
        { value: "text", label: tr.inputText },
        { value: "text+image", label: tr.inputTextImage },
      ], undefined, undefined, { initialValue: current.input.includes("image") ? "text+image" : "text" });
      if (input === "text") current.input = ["text"];
      if (input === "text+image") current.input = ["text", "image"];
      continue;
    }
    if (choice === "reasoning") {
      const on = await ui.select(
        tr.selectReasoning,
        [
          { value: "yes", label: tr.reasoningYes },
          { value: "no", label: tr.reasoningNo },
        ],
        undefined,
        undefined,
        { initialValue: current.reasoning ? "yes" : "no" },
      );
      if (on === "yes") current.reasoning = true;
      if (on === "no") current.reasoning = false;
      continue;
    }
    if (choice === "thinking") {
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
    [
      { value: "skip", label: tr.editCapsSkip, description: "defaults from builtin / models.dev" },
      { value: "all", label: tr.editCapsAll },
      { value: "pick", label: tr.editCapsPick },
      { value: "cancel", label: tr.editCapsCancel },
    ],
    tr.editCapsSubtitle,
    undefined,
    { initialValue: "skip" },
  );
  if (!action || action === "cancel") return undefined;
  if (action === "skip") return drafts;

  const targets = action === "pick"
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
