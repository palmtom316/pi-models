import { readSidecar, writeSidecar, type Sidecar } from "./sidecar.ts";

export type Lang = "en" | "zh";

/**
 * All user-visible strings. String members are plain text; function members
 * take runtime arguments and return the final string.
 */
export interface Strings {
  // main menu
  menuTitle: string;
  menuNew: string;
  menuAdd: string;
  menuManage: string;
  menuView: string;
  menuRefresh: string;
  menuLang: (current: Lang) => string;
  menuExit: string;

  // manage menu
  manageTitle: string;
  manageBackup: string;
  manageDeleteProvider: string;
  manageDeleteModels: string;
  manageEditCaps: string;
  manageBack: string;

  // view existing
  viewTitle: string;
  viewNoProviders: string;
  viewNoModels: (name: string) => string;
  viewDeleteModels: string;
  viewBack: string;

  // provider creation
  inputProviderName: string;
  errNameFormat: string;
  builtinName: string;
  builtinNameConfirm: (name: string) => string;
  existsMerge: string;
  existsMergeMsg: (name: string) => string;
  secretApiKey: string;

  // API / endpoint collection
  selectApiType: string;
  inputBaseUrl: string;
  confirmUserAgent: string;
  confirmUserAgentMsg: string;
  addAnotherApi: string;
  addAnotherApiMsg: (count: number) => string;

  // per-group key loop
  groupTitle: (index: number) => string;
  groupAnotherKey: string;
  groupAnotherKeyMsg: string;
  groupSameUrl: string;
  groupSkipped: (providerId: string) => string;

  // catalog fetch
  fetchingModels: (api: string, baseUrl: string) => string;
  noModelsReturned: string;
  inputManualIds: string;
  catalogFailed: string;
  htmlSuggestV1: (url: string) => string;

  // multi-select
  conflictLabel: string;

  // models.dev
  lookingUp: (count: number) => string;
  modelsDevCatalog: (at: string) => string;

  // fuzzy
  confirmFuzzyTitle: string;
  confirmFuzzyMsg: (id: string, bucket: string, officialId: string) => string;

  // id conflict
  idExistsTitle: (id: string) => string;
  idExistsKeep: string;
  idExistsReplace: string;
  idExistsSkip: string;

  // edit caps
  editCapsTitle: (count: number) => string;
  editCapsSkip: string;
  editCapsAll: string;
  editCapsPick: string;
  editCapsCancel: string;
  editCapsSubtitle: string;

  // persist
  nothingToWrite: string;
  errDraftMissingEndpoint: string;
  confirmWriteTitle: string;
  confirmWriteMsg: (count: number, provider: string) => string;
  refreshFailed: (err: string, backup?: string) => string;
  confirmRollback: string;
  confirmRollbackRestore: (path: string) => string;
  confirmRollbackRemove: string;
  rollbackRefreshFailed: (err: string) => string;
  rolledBack: string;
  addedModels: (added: number, replaced: number, provider: string, apis: string, conflicts: number) => string;
  sunkThinkingMsg: string;
  confirmSwitchModel: string;
  confirmSwitchModelMsg: (provider: string, id: string) => string;
  setModelFailed: string;

  // add api
  noProvidersCreateFirst: string;
  selectProvider: string;
  secretApiKeyFor: (name: string) => string;
  applyHowTitle: string;
  applyHowMerge: string;
  applyHowReplace: string;
  applyHowCancel: string;

  // refresh cache
  refreshingCache: string;
  refreshingCacheResult: (count: number, at: string) => string;
  cacheCancelled: string;

  // manage wizards
  noProvidersInFile: string;
  confirmDeleteProvider: string;
  confirmDeleteProviderMsg: (name: string, count: number) => string;
  deletedProvider: (name: string, backup: string) => string;
  deleteModelsTitle: (name: string) => string;
  noModels: (name: string) => string;
  confirmDeleteModels: string;
  confirmDeleteModelsMsg: (count: number, name: string, ids: string[]) => string;
  deletedModels: (count: number, name: string) => string;
  editModelsTitle: (name: string) => string;
  backedUpProvider: (name: string, path: string) => string;

  // edit caps detail
  editName: (name: string) => string;
  editContextWindow: (n: number) => string;
  editMaxTokens: (n: number) => string;
  editInput: (input: string) => string;
  editReasoning: (on: boolean) => string;
  editThinkingMap: (summary: string) => string;
  editReset: string;
  editDone: string;
  resetFromMsg: (id: string, source: string) => string;
  inputDisplayName: string;
  inputContextWindow: string;
  inputMaxTokens: string;
  selectInput: string;
  inputText: string;
  inputTextImage: string;
  selectReasoning: string;
  reasoningYes: string;
  reasoningNo: string;
  thinkingMapAllHidden: string;
  thinkingLevelActions: string[];
  thinkingHide: string;
  thinkingUseLevelName: string;
  thinkingNone: string;
  thinkingDisabled: string;
  thinkingEnabled: string;
  thinkingCustom: string;
  thinkingBack: string;
  thinkingCustomValue: (level: string) => string;

  // non-tui
  errInteractiveOnly: string;
}

const en: Strings = {
  menuTitle: "pim",
  menuNew: "New provider",
  menuAdd: "Add API / models to existing provider",
  menuManage: "Manage: backup / delete / edit",
  menuView: "View existing providers & models",
  menuRefresh: "Refresh models.dev cache",
  menuLang: () => "Language: English",
  menuExit: "Exit",

  manageTitle: "Manage models.json",
  manageBackup: "Backup a provider",
  manageDeleteProvider: "Delete a provider",
  manageDeleteModels: "Delete models from a provider",
  manageEditCaps: "Edit model capabilities",
  manageBack: "Back",

  viewTitle: "Existing providers & models",
  viewNoProviders: "No providers in models.json",
  viewNoModels: (name) => `${name} has no models`,
  viewDeleteModels: "Delete models…",
  viewBack: "Back",

  inputProviderName: "Provider name",
  errNameFormat: "Name must match [A-Za-z0-9][A-Za-z0-9_-]{0,31}",
  builtinName: "Built-in name",
  builtinNameConfirm: (s) => `${s} is a built-in / reserved provider id. Override it?`,
  existsMerge: "Exists",
  existsMergeMsg: (name) => `${name} already exists. Merge new models into it?`,
  secretApiKey: "API key",

  selectApiType: "API type",
  inputBaseUrl: "baseUrl",
  confirmUserAgent: "User-Agent",
  confirmUserAgentMsg: "Send User-Agent: node ?",
  addAnotherApi: "Add another API?",
  addAnotherApiMsg: (count) => `${count} API(s) so far. Add another protocol/URL?`,

  groupTitle: (index) => `Model group ${index}`,
  groupAnotherKey: "Add another key/group?",
  groupAnotherKeyMsg: "Same URL, different API key for different model group?",
  groupSameUrl: "Using same URL as previous group",
  groupSkipped: (providerId) => `Skipped ${providerId}: provider already exists and merge was declined`,

  fetchingModels: (api, baseUrl) => `Fetching ${api} models…`,
  noModelsReturned: "No models returned by this API",
  inputManualIds: "Model ids (comma-separated), or empty to skip",
  catalogFailed: "catalog failed",
  htmlSuggestV1: (url) => `Response looked like HTML. Try ${url}`,

  conflictLabel: "! conflict",

  lookingUp: (count) => `Looking up ${count} new model(s) on models.dev…`,
  modelsDevCatalog: (at) => `models.dev catalog: ${at}`,

  confirmFuzzyTitle: "Confirm fuzzy model match",
  confirmFuzzyMsg: (id, bucket, officialId) =>
    `${id}\n→ ${bucket}/${officialId}\nUse this model's capabilities?`,

  idExistsTitle: (id) => `id "${id}" already exists`,
  idExistsKeep: "keep existing",
  idExistsReplace: "replace with this API",
  idExistsSkip: "skip",

  editCapsTitle: (n) => `Edit capabilities for ${n} model(s)?`,
  editCapsSkip: "skip (keep defaults)",
  editCapsAll: "edit all",
  editCapsPick: "pick which to edit",
  editCapsCancel: "cancel",
  editCapsSubtitle: "Defaults already follow builtin / models.dev. Aliased relay ids keep those caps.",

  nothingToWrite: "Nothing to write",
  errDraftMissingEndpoint: "internal: draft missing api/baseUrl",
  confirmWriteTitle: "Write models.json?",
  confirmWriteMsg: (n, provider) => `${n} model(s) → ${provider}`,
  refreshFailed: (err, backup) => `refresh failed: ${err}${backup ? `\nbackup: ${backup}` : ""}`,
  confirmRollback: "Rollback models.json?",
  confirmRollbackRestore: (p) => `Restore ${p}?`,
  confirmRollbackRemove: "Remove the newly created models.json?",
  rollbackRefreshFailed: (err) => `Rollback refresh failed: ${err}`,
  rolledBack: "models.json rolled back",
  addedModels: (added, replaced, provider, apis, conflicts) =>
    `Added ${added} model(s), replaced ${replaced} on ${provider} (${apis})${conflicts ? `; skipped ${conflicts} conflict(s)` : ""}`,
  sunkThinkingMsg: "Moved provider thinkingFormat onto existing OpenAI models before adding native API",
  confirmSwitchModel: "Switch model?",
  confirmSwitchModelMsg: (provider, id) => `Switch to ${provider}/${id}?`,
  setModelFailed: "setModel failed (missing key?)",

  noProvidersCreateFirst: "No providers in models.json. Create one first.",
  selectProvider: "Provider",
  secretApiKeyFor: (name) => `API key for ${name}`,
  applyHowTitle: "How to apply?",
  applyHowMerge: "merge models",
  applyHowReplace: "replace these API endpoints",
  applyHowCancel: "cancel",

  refreshingCache: "Refreshing models.dev…",
  refreshingCacheResult: (n, at) => `cached ${n} official buckets at ${at}`,
  cacheCancelled: "cancelled",

  noProvidersInFile: "No providers in models.json",
  confirmDeleteProvider: "Delete provider?",
  confirmDeleteProviderMsg: (name, count) => `Remove ${name} and its ${count} model(s) from models.json?`,
  deletedProvider: (name, backup) => `Deleted ${name} (copy at ${backup})`,
  deleteModelsTitle: (name) => `Delete models from ${name}`,
  noModels: (name) => `${name} has no models`,
  confirmDeleteModels: "Delete models?",
  confirmDeleteModelsMsg: (n, name, ids) => `${n} model(s) from ${name}:\n${ids.slice(0, 12).join("\n")}`,
  deletedModels: (n, name) => `Deleted ${n} model(s) from ${name}`,
  editModelsTitle: (name) => `Edit models on ${name}`,
  backedUpProvider: (name, path) => `Backed up ${name} → ${path}`,

  editName: (name) => `name: ${name}`,
  editContextWindow: (n) => `contextWindow: ${n}`,
  editMaxTokens: (n) => `maxTokens: ${n}`,
  editInput: (input) => `input: ${input}`,
  editReasoning: (on) => `reasoning: ${on ? "yes" : "no"}`,
  editThinkingMap: (summary) => `thinkingLevelMap  ${summary}`,
  editReset: "reset to builtin / heuristic",
  editDone: "done",
  resetFromMsg: (id, source) => `Reset ${id} from ${source}`,
  inputDisplayName: "Display name",
  inputContextWindow: "contextWindow",
  inputMaxTokens: "maxTokens",
  selectInput: "input",
  inputText: "text",
  inputTextImage: "text+image",
  selectReasoning: "reasoning",
  reasoningYes: "yes",
  reasoningNo: "no",
  thinkingMapAllHidden: "(all hidden)",
  thinkingLevelActions: ["hide (null)", "use level name", "none", "disabled", "enabled", "custom", "back"],
  thinkingHide: "hide (null)",
  thinkingUseLevelName: "use level name",
  thinkingNone: "none",
  thinkingDisabled: "disabled",
  thinkingEnabled: "enabled",
  thinkingCustom: "custom",
  thinkingBack: "back",
  thinkingCustomValue: (level) => `${level} value`,

  errInteractiveOnly: "pim is interactive-only (TUI)",
};

const zh: Strings = {
  menuTitle: "pim",
  menuNew: "新建 provider",
  menuAdd: "给已有 provider 加 API / 模型",
  menuManage: "管理：备份 / 删除 / 编辑",
  menuView: "查看已有 provider 及模型",
  menuRefresh: "刷新 models.dev 缓存",
  menuLang: (current) => current === "zh" ? "语言：中文" : "Language: English",
  menuExit: "退出",

  manageTitle: "管理 models.json",
  manageBackup: "备份 provider",
  manageDeleteProvider: "删除 provider",
  manageDeleteModels: "删除 provider 下的模型",
  manageEditCaps: "编辑模型能力",
  manageBack: "返回",

  viewTitle: "已有 provider 及模型",
  viewNoProviders: "models.json 中没有 provider",
  viewNoModels: (name) => `${name} 没有模型`,
  viewDeleteModels: "删除模型…",
  viewBack: "返回",

  inputProviderName: "Provider 名称",
  errNameFormat: "名称须匹配 [A-Za-z0-9][A-Za-z0-9_-]{0,31}",
  builtinName: "内置名称",
  builtinNameConfirm: (s) => `${s} 是内置 / 保留 provider id。要覆盖吗？`,
  existsMerge: "已存在",
  existsMergeMsg: (name) => `${name} 已存在。合并新模型？`,
  secretApiKey: "API key",

  selectApiType: "API 类型",
  inputBaseUrl: "baseUrl",
  confirmUserAgent: "User-Agent",
  confirmUserAgentMsg: "发送 User-Agent: node ？",
  addAnotherApi: "再添加一条 API？",
  addAnotherApiMsg: (count) => `已有 ${count} 条 API。再添加一个协议/URL？`,

  groupTitle: (index) => `模型分组 ${index}`,
  groupAnotherKey: "添加另一个 key/分组？",
  groupAnotherKeyMsg: "同一 URL，不同 API key 对应不同模型分组？",
  groupSameUrl: "使用与上一分组相同的 URL",
  groupSkipped: (providerId) => `已跳过 ${providerId}：provider 已存在且未选择合并`,

  fetchingModels: (api) => `正在拉取 ${api} 模型…`,
  noModelsReturned: "此 API 未返回模型",
  inputManualIds: "模型 id（逗号分隔），留空跳过",
  catalogFailed: "拉取失败",
  htmlSuggestV1: (url) => `响应看起来是 HTML。试试 ${url}`,

  conflictLabel: "! 冲突",

  lookingUp: (count) => `正在 models.dev 查询 ${count} 个新模型…`,
  modelsDevCatalog: (at) => `models.dev 目录：${at}`,

  confirmFuzzyTitle: "确认模糊匹配",
  confirmFuzzyMsg: (id, bucket, officialId) =>
    `${id}\n→ ${bucket}/${officialId}\n使用此模型的能力？`,

  idExistsTitle: (id) => `id "${id}" 已存在`,
  idExistsKeep: "保留已有",
  idExistsReplace: "用此 API 替换",
  idExistsSkip: "跳过",

  editCapsTitle: (n) => `编辑 ${n} 个模型的能力？`,
  editCapsSkip: "跳过（保留默认）",
  editCapsAll: "全部编辑",
  editCapsPick: "选择要编辑的",
  editCapsCancel: "取消",
  editCapsSubtitle: "默认值已按内置 / models.dev 设定。中转 id 保留其能力。",

  nothingToWrite: "无可写入内容",
  errDraftMissingEndpoint: "内部错误：draft 缺少 api/baseUrl",
  confirmWriteTitle: "写入 models.json？",
  confirmWriteMsg: (n, provider) => `${n} 个模型 → ${provider}`,
  refreshFailed: (err, backup) => `刷新失败：${err}${backup ? `\n备份：${backup}` : ""}`,
  confirmRollback: "回滚 models.json？",
  confirmRollbackRestore: (p) => `恢复 ${p}？`,
  confirmRollbackRemove: "删除刚创建的 models.json？",
  rollbackRefreshFailed: (err) => `回滚刷新失败：${err}`,
  rolledBack: "models.json 已回滚",
  addedModels: (added, replaced, provider, apis, conflicts) =>
    `已添加 ${added} 个模型，替换 ${replaced} 个，目标 ${provider}（${apis}）${conflicts ? `；跳过 ${conflicts} 个冲突` : ""}`,
  sunkThinkingMsg: "添加原生 API 前，已将 provider thinkingFormat 下沉到已有 OpenAI 模型",
  confirmSwitchModel: "切换模型？",
  confirmSwitchModelMsg: (provider, id) => `切换到 ${provider}/${id}？`,
  setModelFailed: "setModel 失败（缺少 key？）",

  noProvidersCreateFirst: "models.json 中没有 provider。请先创建。",
  selectProvider: "Provider",
  secretApiKeyFor: (name) => `${name} 的 API key`,
  applyHowTitle: "如何应用？",
  applyHowMerge: "合并模型",
  applyHowReplace: "替换这些 API 端点",
  applyHowCancel: "取消",

  refreshingCache: "正在刷新 models.dev…",
  refreshingCacheResult: (n, at) => `已缓存 ${n} 个官方桶，时间 ${at}`,
  cacheCancelled: "已取消",

  noProvidersInFile: "models.json 中没有 provider",
  confirmDeleteProvider: "删除 provider？",
  confirmDeleteProviderMsg: (name, count) => `从 models.json 中删除 ${name} 及其 ${count} 个模型？`,
  deletedProvider: (name, backup) => `已删除 ${name}（备份在 ${backup}）`,
  deleteModelsTitle: (name) => `从 ${name} 删除模型`,
  noModels: (name) => `${name} 没有模型`,
  confirmDeleteModels: "删除模型？",
  confirmDeleteModelsMsg: (n, name, ids) => `从 ${name} 删除 ${n} 个模型：\n${ids.slice(0, 12).join("\n")}`,
  deletedModels: (n, name) => `从 ${name} 删除了 ${n} 个模型`,
  editModelsTitle: (name) => `编辑 ${name} 上的模型`,
  backedUpProvider: (name, path) => `已备份 ${name} → ${path}`,

  editName: (name) => `名称：${name}`,
  editContextWindow: (n) => `上下文窗口：${n}`,
  editMaxTokens: (n) => `最大输出：${n}`,
  editInput: (input) => `输入：${input}`,
  editReasoning: (on) => `推理：${on ? "是" : "否"}`,
  editThinkingMap: (summary) => `思考档位  ${summary}`,
  editReset: "重置为内置 / 启发式",
  editDone: "完成",
  resetFromMsg: (id, source) => `已从 ${source} 重置 ${id}`,
  inputDisplayName: "显示名称",
  inputContextWindow: "上下文窗口",
  inputMaxTokens: "最大输出",
  selectInput: "输入",
  inputText: "纯文本",
  inputTextImage: "文本+图片",
  selectReasoning: "推理",
  reasoningYes: "是",
  reasoningNo: "否",
  thinkingMapAllHidden: "（全部隐藏）",
  thinkingLevelActions: ["隐藏 (null)", "用档位名", "none", "disabled", "enabled", "自定义", "返回"],
  thinkingHide: "隐藏 (null)",
  thinkingUseLevelName: "用档位名",
  thinkingNone: "none",
  thinkingDisabled: "disabled",
  thinkingEnabled: "enabled",
  thinkingCustom: "自定义",
  thinkingBack: "返回",
  thinkingCustomValue: (level) => `${level} 的值`,

  errInteractiveOnly: "pim 仅在 TUI 交互模式下可用",
};

const TABLES: Record<Lang, Strings> = { en, zh };

let currentLang: Lang = "en";

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  currentLang = lang;
}

export function t(): Strings {
  return TABLES[currentLang];
}

export function otherLang(lang: Lang): Lang {
  return lang === "en" ? "zh" : "en";
}

export async function loadLang(): Promise<Lang> {
  const sidecar = await readSidecar();
  const stored = (sidecar as Sidecar & { lang?: string }).lang;
  if (stored === "zh" || stored === "en") {
    currentLang = stored;
  }
  return currentLang;
}

export async function saveLang(lang: Lang): Promise<void> {
  currentLang = lang;
  const sidecar = await readSidecar();
  (sidecar as Sidecar & { lang?: string }).lang = lang;
  await writeSidecar(sidecar).catch(() => {});
}
