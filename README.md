# @palmtom/pi-models

**English** · [中文](#中文)

[![npm](https://img.shields.io/npm/v/@palmtom/pi-models)](https://www.npmjs.com/package/@palmtom/pi-models)
[![pi.dev](https://img.shields.io/badge/pi.dev-packages-0ea5e9)](https://pi.dev/packages/@palmtom/pi-models)
[![license](https://img.shields.io/npm/l/@palmtom/pi-models)](./LICENSE)

An interactive TUI overlay wizard for [Pi](https://pi.dev) that adds relay / self-hosted
gateway providers to `models.json`: pick a protocol + URL, fetch the `/models` catalog,
multi-select models, and get official capability parameters — ready for `/model` immediately.

一个 [Pi](https://pi.dev) 交互式 TUI 向导：把中转站 / 自建网关登记进 `models.json`，
选协议 + URL、拉取模型目录、勾选模型、按 models.dev 官方参数写入，`/model` 即刻可用。

---

## English

### Highlights

- **70% theme-aware overlay** — every menu / select / confirm / input / secret /
  multi-select / loader renders in a centered overlay (`width`/`maxHeight` = 70%,
  `anchor: center`) that re-flows on terminal resize and uses Pi theme tokens
  (`accent`, `muted`, `border`, `selectedBg`).
- **One provider, multiple APIs** — OpenAI-compatible, native Claude
  (`anthropic-messages`) and native Gemini (`google-generative-ai`) can all live on
  the same provider and key. Every model is written with its **own** `api` and
  `baseUrl`, so Pi routes each request correctly.
- **Multiple keys → model groups** — same relay URL with several API keys (each key
  unlocking a different model set) is written as `NAME`, `NAME-2`, `NAME-3`, …
  because Pi stores `apiKey` at the provider level.
- **Capabilities from models.dev** — model parameters (context window, max output,
  reasoning, input modalities, thinking levels) follow the
  [models.dev](https://models.dev) configuration: a builtin offline table first,
  official models.dev buckets for anything else, heuristics as last resort.
  Everything is editable before writing, and the cache can be force-refreshed.
- **Relay id normalization** — catalog ids like `deepseek-ai/deepseek-v4-flash-0731`
  keep the exact upstream id (that's what Pi sends back) but copy the official
  `deepseek-v4-flash` capabilities.
- **Layered TUI** — Esc backs out one prompt at a time (name ← API ← URL ← key).
  Submenus return to the main menu; only Esc / **Exit** on the main menu closes
  `/pim`. Task order: browse/edit a provider, switch the default, create, extend.
- **Type to filter** — every list accepts typed text to narrow it (relay
  providers can return hundreds of models). Esc clears the filter first in
  single-selects and always cancels in multi-selects.
- **Providers hub** — one provider opens its own action menu: models (with the
  capability editor), set default, add API, refresh, hide/show, backup, delete
  models, delete provider. Destructive rows carry `⚠` and their confirm dialog
  defaults to **No**.
- **Safe writes** — lock-file guarded read-modify-write, atomic tmp+rename, mode `0600`, rotating backups,
  `modelRegistry.refresh()` with automatic rollback offer if Pi rejects the file.
- **Bilingual UI** — English ↔ 中文, switchable in the menu, persisted.

This package writes **your** `models.json`. It does not talk to CC-Switch — that is
[pi-ccs](https://github.com/palmtom316/pi-ccs).

### Requirements

- Pi **≥ 0.84.2** (verified on 0.84.2 and 1.3.0, including 1.x) and Node **≥ 22.19.0**
- Interactive TUI only — print / json / rpc modes refuse to write anything

### Install

```sh
pi install npm:@palmtom/pi-models
```

From git, or a one-off session without changing settings:

```sh
pi install git:github.com/palmtom316/pi-models
pi -e npm:@palmtom/pi-models
pi --extension /absolute/path/to/pi-models
```

### Quick start

1. Run `/pim` in Pi.
2. Pick **New provider** — name it, choose `openai-completions` for most relays,
   paste the base URL and one API key.
3. The wizard fetches `GET {baseUrl}/models`, checks the official matches, and
   opens a multi-select. Toggle with space; use **Select all / Invert / Deselect all**
   on the action bar (or `^A` / `^R` / `^U`); confirm with enter.
4. Confirm the write. `models.json` is backed up, written, and Pi's model registry
   is refreshed — optionally jump straight to the first new model via `/model`.

### Commands

| Command | Action |
| --- | --- |
| `/pim` | Open the overlay menu |
| `/pim-models` | Same |
| `/add-provider` | Jump straight to **New provider**, skipping the menu |

Main menu (Esc goes back one layer; Esc / **Exit** on this menu closes `/pim`).
Every row carries a one-line hint, and the window subtitle shows how many
providers/models are stored plus the current default model.

1. **Providers** — the hub: pick a provider, then act on it (see below).
2. **Switch default model** — pick a model from `models.json`, write it to
   `settings.json` (`defaultProvider` / `defaultModel`), and switch this session.
3. **New provider** — name + one `api`/`baseUrl`, then loop API keys (model groups).
4. **Add API / models** — attach another protocol/URL (or more models) to an
   existing provider.
5. **Token usage** — scan every session file and show tokens by provider → model (see below).
6. **Settings** — language, and refreshing the models.dev cache.
7. **Exit**

### Providers hub

Picking a provider opens its actions instead of a dead-end list. The provider
row already shows model count, API type, and whether it is hidden from `/model`.

| Action | What it does |
| --- | --- |
| **Models** | List the provider's models; Enter opens the capability editor for that model |
| **Set as default model** | Same flow as *Switch default model*, pre-scoped to this provider |
| **Add API / models** | Same flow as *Add API / models*, pre-scoped to this provider |
| **Refresh models** | Fetch the catalog and diff it; additions are pre-checked, **removals are opt-in** |
| **Hide / show in `/model`** | One toggle row that reflects the current state |
| **Backup** | Copy this provider's block to a timestamped file |
| **Delete models…** | Multi-select models to remove (defaults to nothing selected) |
| **Delete provider** | Marked `⚠`; the confirm dialog defaults to **No** |

All destructive dialogs are marked `⚠` and land on the safe answer, so a stray
Enter never deletes anything.

### New provider

1. **Name** — must match `^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$`. Builtin ids (`openai`,
   `anthropic`, `google`, `cc-switch-*`, …) require a second confirm, because that
   would override a builtin provider.
2. **API type** (default `openai-completions` is right for most relays):

   | `api` | Typical use | Catalog endpoint tried |
   | --- | --- | --- |
   | `openai-completions` | New API / One API / most relays | `GET {base}/models` |
   | `openai-responses` | OpenAI Responses / some Grok | `GET {base}/models` |
   | `openai-codex-responses` | Codex — don't pick as a default | `GET {base}/models` |
   | `anthropic-messages` | native Claude endpoint | `GET {base}/v1/models` → `{base}/models` |
   | `google-generative-ai` | native Gemini endpoint | `GET {base}/models` |

   Relays almost always serve Claude / Gemini over `openai-completions`; pick a
   native API only when the site actually exposes it.
3. **baseUrl** — HTTPS required (HTTP only for localhost / `127.0.0.1` / `::1`).
   Query strings, hash fragments, and URL userinfo are stripped / rejected.
4. **`User-Agent: node`** — optional, on by default (many WAFs block `OpenAI/JS`).
5. **API key** (masked input) → fetch catalog → multi-select. Official matches are
   pre-checked; embeddings / TTS / image / video / realtime models are folded
   under "hidden by default"; ids that already exist elsewhere are flagged.
   The list has **Select all / Invert / Deselect all** for currently visible rows
   (`^A` / `^R` / `^U`, or the action bar above the list).
   Auth per protocol: `Authorization: Bearer` by default, plus `x-api-key` +
   `anthropic-version: 2023-06-01` for Anthropic, `x-goog-api-key` (no Bearer)
   for Google.
6. Catalog failures show HTTP status + a redacted body; HTML responses suggest
   appending `/v1` (never rewritten silently). Empty or failed catalogs can be
   typed by hand (comma-separated ids).
7. **Another key?** Same URL, next key → next model group. Groups are written as
   `NAME`, `NAME-2`, `NAME-3`, …
8. **Confirm → backup → write → refresh()**. If Pi rejects the file you get the
   error + backup path and a one-key rollback. Optionally switch to the first
   new model.

### Multiple keys on one relay (model groups)

Some relays bind different model sets to different keys. The wizard collects one
shared `api` + `baseUrl`, then loops the key prompt: each key fetches its own
catalog and its own multi-select. Every group becomes its own provider entry
(`NAME`, `NAME-2`, …) sharing the same endpoint, because Pi's schema keeps
`apiKey` on the provider, not per model.

### Add API to an existing provider

Pick a provider that already has models, then loop `api` + `baseUrl` (the key is
reused from the provider, or you type one). After fetching and selecting:

- **Merge** — add new models by id; existing ids are never silently overwritten
  (keep / replace / skip prompt per conflict).
- **Replace these endpoints** — first delete the models living on exactly the
  `(api, baseUrl)` groups you just fetched, then write the new selection.

A same id on two APIs cannot both live on one provider (Pi sends `id` upstream
unchanged), so the wizard always asks. Before a non-OpenAI API is added,
provider-level `thinkingFormat` / `requiresReasoningContentOnAssistantMessages`
are copied onto the existing OpenAI models and removed from the provider —
otherwise a new Claude row would inherit `thinkingFormat: "deepseek"`.

### Manage & view

- **Backup provider** → `{agentDir}/backups/{name}-YYYYMMDD-HHMMSS-mmm.json`
  (mode `0600`, last 10 kept).
- **Hide from `/model`** — the provider stays in `models.json`, but a session-start
  filter drops all of its models from `/model`. The hide list lives in
  `pim-models.json` (`hiddenProviders`), because Pi rejects unknown fields in
  `models.json`. **Show a hidden provider** puts it back.
- **Refresh models** — refetch one stored `(api, baseUrl)` without renaming the
  provider or changing its API. New catalog ids can be added; stored ids missing
  from the catalog can be removed. The stored key is reused, otherwise Pi's key
  for that provider, otherwise you type one.
- **Delete provider** — backs up first, then removes it from `models.json`.
- **Delete models** — multi-select models inside one provider.
- **Edit capabilities** — multi-select models, then edit each one (same editor as
  during import; see below).
- **View** — browse every provider and its models (`id  api  window/output`),
  jump into deletion from there.

### Token usage

**Token usage** sums the `usage` block of every assistant message in every session
file pi has written, so it covers all projects and all models — not just this
session. It never writes anything.

1. Pick a range: **all time**, **last 7 days**, **last 30 days**.
2. A table of providers appears: `total / input / output / cache / calls`,
   sorted by total. `←` `→` re-sort by another column.
3. `enter` drills into that provider's models; `esc` goes back to providers.
4. `r` rescans the session files without losing the range; `esc` on the provider
   table closes the view.

Grouping follows Pi's own `getUsageCostBreakdown`:

- assistant messages → `provider/responseModel ?? model`, so a relay that
  silently swaps models (`gpt-5.6-luna` answering as `gpt-5.3`) is visible;
- cache-warm `usage` entries → `provider/model`;
- tool-result / branch-summary / compaction usage → the `Tools/summaries` bucket.

`total = input + output + cacheRead + cacheWrite`, matching the token count Pi
shows in `/session`. Cost is deliberately not shown: relays report `cost: 0`, so
a money column would be fiction. Session files are read from
`{agentDir}/sessions` (respecting `PI_CODING_AGENT_DIR`), or from the live
session directory when pi exposes one via `--session-dir` / `sessionDir`.

### Where capabilities come from

Priority order:

1. **Builtin offline table** (`src/builtin-catalog.ts`) — exact / alias matches
   only, no fuzzy. Claude entries are pinned to 1M context.

   | Lab | Ids |
   | --- | --- |
   | openai | `gpt-5.5` `gpt-5.6-sol` `gpt-5.6-terra` `gpt-5.6-luna` |
   | anthropic | `claude-opus-5` `claude-opus-4-8` `claude-fable-5` `claude-sonnet-5` |
   | xai | `grok-4.5` `grok-4.6` |
   | deepseek | `deepseek-v4-flash` `deepseek-flash` `deepseek-v4-flash-vision-exp` `deepseek-v4-pro` |
   | zhipuai | `glm-5.2` `glm-5.3` `glm-5.3-flash` `glm-5.3-flashx` |
   | google | `gemini-3.7-flash` |
   | moonshotai | `kimi-k3` |
   | meta | `muse-spark-1.3` `muse-spark-1.3-contributor` |

2. **models.dev official buckets** — fetched only for *selected* ids the builtin
   table doesn't know (`https://models.dev/api.json`). Only official lab buckets
   are used (openai, anthropic, google, moonshotai, deepseek, xai, zhipuai, zai,
   alibaba, minimax, xiaomi, meta). Reseller copies (openrouter, `*-plan`, `*-cn`, …)
   are never defaults; cost/prices are ignored. Cached at
   `{agentDir}/cache/models.dev.json` with ETag + 24h TTL; on failure the stale
   cache is used with a warning.
3. **Heuristic** — last resort for ids nothing knows; family-sized windows from
   id substrings (`claude`, `gpt-5`, `gemini`, `kimi`, `glm`, `grok`,
   `deepseek`…).

Matching normalizes the catalog id (lowercase, drop `vendor/` prefixes, keep the
last path segment, drop `-think` / `:thinking` / `-YYYY` suffixes, apply aliases)
but **writes the upstream id unchanged**. Dotted ids are also rewritten onto a
known builtin id when one exists (`deepseek-v4.1-flash` / `deepseek-v4-1-flash` /
`deepseek-ai/DeepSeek-V4.1-Flash` → builtin `deepseek-v4-flash`); ids nothing
knows keep their dots. DeepSeek V4.1 Flash is natively multimodal and the old
`deepseek-v4-flash` / `deepseek-v4-flash-vision-exp` names are routed to it, so
the deepseek heuristic falls back to text+image (only `deepseek-v4-pro` stays
text-only, and it is pinned in the builtin table). Fuzzy hits (score ≥ 55) must be
confirmed before their capabilities are used; `gpt-5` is never auto-upgraded to
`gpt-5.6-*`.

### Keeping model data fresh

- **Automatic** — any selected id the builtin table misses triggers a models.dev
   lookup (cache-first). The sidecar records the fetch time.
- **Manual** — *Settings → Refresh models.dev cache* force-fetches
   `https://models.dev/api.json` regardless of TTL and reports how many official
   buckets were cached.
- **Editable** — before writing (and afterwards via Providers → *provider* → Models)
   you can change `name`, `contextWindow`, `maxTokens`, `input` (text /
   text+image), `reasoning`, and the per-level `thinkingLevelMap`
   (`off/minimal/low/medium/high/xhigh/max` → hidden, level name, `none` /
   `disabled` / `enabled`, or a custom upstream value). *Reset to builtin /
   heuristic* re-derives everything from the id. `id`, `api`, `baseUrl`, and
   hand-written `cost` are never touched by the editor.
- **Self-healing** — every `session_start` repairs stale entries: an id the
   builtin table already knows is multimodal but whose record still says
   `input: ["text"]` is upgraded to `["text", "image"]` (file rewritten +
   backed up, then the running registry is patched, so images stop being
   dropped immediately). The upgrade is one-way, and ids the builtin table does
   not know, ids it marks text-only, and ids pinned via `modelOverrides` are
   left alone.

### Per-model compat the wizard may set

| When | `compat` |
| --- | --- |
| Claude 4.6+ on `anthropic-messages` | `forceAdaptiveThinking` |
| GLM / Z.AI models | `thinkingFormat: "zai"` |
| DeepSeek / `reasoning_content` | `thinkingFormat: "deepseek"` |
| Kimi K3 on OpenAI APIs | `thinkingFormat: "openai"` |

New models omit `cost` (Pi defaults to 0). Provider-level compat stays limited
to relay-safe flags: `supportsDeveloperRole: false`, `supportsReasoningEffort:
true`, `supportsLongCacheRetention: false`.

### What gets written

```json
{
  "providers": {
    "ELY": {
      "name": "ELY",
      "apiKey": "sk-...",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": true,
        "supportsLongCacheRetention": false
      },
      "models": [
        {
          "id": "deepseek-v4-flash-0731",
          "name": "DeepSeek V4 Flash",
          "api": "openai-completions",
          "baseUrl": "https://relay.example.com/v1",
          "reasoning": true,
          "input": ["text"],
          "contextWindow": 1000000,
          "maxTokens": 384000,
          "thinkingLevelMap": { "off": "disabled", "low": "low", "high": "high", "max": "max" },
          "compat": { "thinkingFormat": "deepseek", "requiresReasoningContentOnAssistantMessages": true },
          "headers": { "User-Agent": "node" }
        },
        {
          "id": "claude-opus-5",
          "name": "Claude Opus 5",
          "api": "anthropic-messages",
          "baseUrl": "https://relay.example.com",
          "reasoning": true,
          "input": ["text", "image"],
          "contextWindow": 1000000,
          "maxTokens": 128000,
          "compat": { "forceAdaptiveThinking": true }
        }
      ]
    }
  }
}
```

Each model carries its own `api` and `baseUrl`; provider-level defaults are only
written when every model agrees.

### Files

Respects `PI_CODING_AGENT_DIR` (default `~/.pi/agent`):

| Path | Role |
| --- | --- |
| `models.json` | Providers + models. Mode `0600`. |
| `models.json.bak-YYYYMMDD-HHMMSS-mmm` | Pre-write snapshot; last 10 kept. |
| `backups/{provider}-….json` | Per-provider snapshots from Manage. |
| `cache/models.dev.json` | Official-bucket cache (no keys, no prices). |
| `pim-models.json` | Sidecar: language, last provider/endpoints, cache time, and `hiddenProviders` (ids hidden from `/model`). No keys. |

### Safety

- Commands no-op outside `ctx.mode === "tui"` (print / json / rpc never write).
- HTTPS only; HTTP allowed solely for loopback. No URL userinfo; query and hash
  stripped; redirects rejected instead of followed.
- Catalog bodies capped (2 MB; models.dev 8 MB), 20 s / 30 s timeouts, loader
  Esc-cancellable.
- Notify / logs / errors redact `Authorization`, `apiKey`, and `sk-…` values.
- Writes are guarded by a lock file, atomic (tmp + rename), and rolled back if
  Pi's `modelRegistry.refresh()` reports an error. Mutations re-read `models.json`
  under the lock so concurrent `/pim` sessions keep each other's providers.
  Existing `$ENV` / `!command` apiKey references are left in place unless the
  provider has no key yet. Trailing-comma JSONC that Pi itself accepts is also parsed.
- Keys in `models.json` are as plaintext as Pi already stores them — treat
  backups as secret copies.

### Development

```sh
npm install
npm test          # Node ≥ 22.19.0, --experimental-strip-types
```

Load a checkout: `pi --extension /absolute/path/to/pi-models`.
Design notes: [docs/SPEC.md](docs/SPEC.md).

### Publishing

Skip npm entirely if you only need the extension locally:

```sh
pi install git:github.com/palmtom316/pi-models
```

For [pi.dev/packages](https://pi.dev/packages) the package must be on npm. Publishing happens
only in CI, via npm [trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC).
There is **no long-lived npm token and no local `npm login`** — `npm publish` on your machine will
fail with `ENEEDAUTH`, and that is expected. (npm also requires 2FA for interactive publishing, and
bypass-2FA granular tokens lose direct-publish rights in January 2027, so CI is the only durable path.)

> **Status: the trusted publisher is not configured yet.** Until it is, `publish.yml` falls back to
> the `NPM_TOKEN` repository secret, which still works today but is on the npm deprecation path.
> Finish the one-time setup below, then delete that secret (`gh secret delete NPM_TOKEN`) so the
> fallback can never mask an OIDC misconfiguration.

One-time setup:

1. Open [package settings](https://www.npmjs.com/package/@palmtom/pi-models) → **Trusted Publisher**.
2. GitHub Actions: user `palmtom316`, repo `pi-models`, workflow filename `publish.yml` (filename only, not a path).
3. Leave **Environment** empty unless the workflow uses one.
4. Allow **npm publish**.

A mismatch (wrong owner/repo/filename/environment) shows up as `E404` on publish, not as an auth error.

Then a release is one command:

```sh
npm run release patch     # or minor / major, or an explicit version like 0.5.0
npm run release 0.5.0 --dry   # preview without changing anything
```

It bumps `package.json` + `package-lock.json`, runs the tests, commits, tags `v<version>`, and pushes
both. GitHub Actions verifies the tag matches `package.json`, re-runs the tests, and publishes to npm.

---

## 中文

### 特性

- **70% 主题化 overlay** — 所有菜单 / 单选 / 确认 / 输入 / 密码 / 多选 / loader
  都渲染在居中 overlay（`width`/`maxHeight` = 70%，`anchor: center`）里，随终端
  resize 自适应，配色走 Pi 主题 token（`accent`、`muted`、`border`、`selectedBg`）。
- **一个 provider，多条 API** — OpenAI 兼容、Claude 原生（`anthropic-messages`）、
  Gemini 原生（`google-generative-ai`）可以挂在同一个 provider、同一把 key 下。
  每个模型都**自带** `api` 和 `baseUrl`，Pi 按模型正确路由请求。
- **多 key → 模型分组** — 同一中转 URL 配多把 key（每把解锁不同模型）时，
  写成 `NAME`、`NAME-2`、`NAME-3`……因为 Pi 的 `apiKey` 存在 provider 级。
- **能力参数按 models.dev 配置** — 上下文窗口、最大输出、推理、输入模态、
  思考档位优先取 [models.dev](https://models.dev) 数据：先查内置离线表，再拉
  models.dev 官方桶，最后启发式兜底。写入前可任意修改，缓存也可手动刷新。
- **中转 id 归一化** — `deepseek-ai/deepseek-v4-flash-0731` 这类目录 id 保持
  上游原样写入（Pi 请求时原样发回），但能力抄自官方 `deepseek-v4-flash`。
- **逐层返回** — Esc 只退一层（名称 ← API ← URL ← key）。子菜单结束后回到主菜单，
  只有在主菜单按 Esc / **退出** 才关闭 `/pim`。顺序是先在 provider 里浏览/修改，
  再切默认，再新建，最后追加。
- **输入即过滤** — 所有列表都支持直接打字缩小范围（中转 provider 动辄几百个模型）。
  单选列表里 Esc 先清空过滤再退出；多选列表里 Esc 直接取消。
- **Providers 总入口** — 选中一个 provider 就进入它自己的操作菜单：模型（含能力编辑）、
  设为默认、加 API、刷新、隐藏/显示、备份、删模型、删 provider。破坏性操作行带 `⚠`，
  确认框默认停在 **否**。
- **安全写入** — 锁内重读后再合并、原子 tmp+rename、权限 `0600`、滚动备份、写后
  `modelRegistry.refresh()`，Pi 拒绝时一键回滚。
- **中英双语界面** — 菜单一键切换，持久保存。

本包写的是**你自己的** `models.json`，与 CC-Switch 无关 —— 那是
[pi-ccs](https://github.com/palmtom316/pi-ccs) 的职责。

### 环境要求

- Pi **≥ 0.84.2**（已在 0.84.2 与 1.3.0 上验证，含 1.x），Node **≥ 22.19.0**
- 仅交互式 TUI 可用 —— print / json / rpc 模式一律拒绝写盘

### 安装

```sh
pi install npm:@palmtom/pi-models
```

从 git 安装，或临时加载不落配置：

```sh
pi install git:github.com/palmtom316/pi-models
pi -e npm:@palmtom/pi-models
pi --extension /absolute/path/to/pi-models
```

### 快速开始

1. 在 Pi 里执行 `/pim`。
2. 选 **新建 provider** —— 起名，中转站一般选 `openai-completions`，
   粘贴 baseUrl 和一把 API key。
3. 向导请求 `GET {baseUrl}/models`，预勾选官方匹配项，打开多选框：
   空格勾选；顶部可 **全选 / 反选 / 全不选**（或 `^A` / `^R` / `^U`）；回车确认。
4. 确认写入。`models.json` 先备份再写入并刷新模型注册表，可选直接切换到
   第一个新模型。

### 命令

| 命令 | 作用 |
| --- | --- |
| `/pim` | 打开 overlay 菜单 |
| `/pim-models` | 同上 |
| `/add-provider` | 直接进入「新建 provider」，跳过菜单 |

主菜单（Esc 逐层返回；在本层按 Esc / **退出** 才关闭 `/pim`）。
每行都带一行说明，窗口副标题显示已存 provider / 模型数量与当前默认模型。

1. **Providers** — 总入口：先选 provider，再对它操作（见下）。
2. **切换默认模型** — 从 `models.json` 选一个模型，写入 `settings.json`
   （`defaultProvider` / `defaultModel`），并切换当前会话。
3. **新建 provider** — 名称 + 一条 `api`/`baseUrl`，然后循环输入 API key（模型分组）。
4. **给已有 provider 加 API / 模型** — 在现有 provider 上追加协议/URL 或更多模型。
5. **Token 消耗** — 扫描全部 session 文件，按 provider → 模型统计 token（见下）。
6. **设置** — 语言，以及刷新 models.dev 缓存。
7. **退出**

### Providers 总入口

选中一个 provider 会直接打开它的操作菜单，而不是一个只能看的死列表。
列表行本身就显示模型数量、API 类型，以及是否已从 `/model` 隐藏。

| 操作 | 作用 |
| --- | --- |
| **模型** | 列出该 provider 的模型；回车进入该模型的能力编辑 |
| **设为默认模型** | 与「切换默认模型」相同，但已限定到该 provider |
| **加 API / 模型** | 与「加 API / 模型」相同，但已限定到该 provider |
| **刷新模型** | 拉取目录并做差集；新增项默认勾选，**删除项默认不勾** |
| **从 `/model` 隐藏 / 显示** | 同一行切换，直接反映当前状态 |
| **备份** | 把该 provider 的配置块复制到带时间戳的文件 |
| **删除模型…** | 多选要删的模型（默认一个都不选） |
| **删除 provider** | 带 `⚠` 标记；确认框默认停在 **否** |

所有破坏性对话框都带 `⚠`，且默认落在安全选项上，误按回车不会删数据。

### 新建 provider

1. **名称** — 须匹配 `^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$`。撞内置 id（`openai`、
   `anthropic`、`google`、`cc-switch-*` 等）会二次确认，因为那会覆盖内置 provider。
2. **API 类型**（多数中转选默认 `openai-completions` 即可）：

   | `api` | 典型用途 | 目录探测地址 |
   | --- | --- | --- |
   | `openai-completions` | New API / One API / 大多数中转 | `GET {base}/models` |
   | `openai-responses` | OpenAI Responses / 部分 Grok | `GET {base}/models` |
   | `openai-codex-responses` | Codex —— 不要当默认 | `GET {base}/models` |
   | `anthropic-messages` | Claude 原生端点 | `GET {base}/v1/models` → `{base}/models` |
   | `google-generative-ai` | Gemini 原生端点 | `GET {base}/models` |

   中转站的 Claude / Gemini 几乎都走 `openai-completions`；只有站点真的提供
   原生端点时才选原生 API。
3. **baseUrl** — 必须 HTTPS（HTTP 仅允许 localhost / `127.0.0.1` / `::1`）。
   query、hash、userinfo 会被去掉或拒绝。
4. **`User-Agent: node`** — 可选，默认开启（很多 WAF 拦 `OpenAI/JS`）。
5. **API key**（掩码输入）→ 拉目录 → 多选。官方匹配项预勾选；embedding /
   TTS / 图像 / 视频 / realtime 模型默认折叠；与已有 id 冲突的会打标。
   列表顶部有 **全选 / 反选 / 全不选**（作用于当前可见项，快捷键 `^A` / `^R` / `^U`）。
   鉴权按协议：默认 `Authorization: Bearer`；Anthropic 另加 `x-api-key` +
   `anthropic-version: 2023-06-01`；Google 改用 `x-goog-api-key`（不发 Bearer）。
6. 拉取失败会显示 HTTP 状态 + 脱敏后的 body；HTML 响应会建议补 `/v1`
   （绝不静默改写）。目录为空或失败时可手输模型 id（逗号分隔）。
7. **再来一把 key？** 同一 URL 换下一把 key → 下一组模型。每组写成一个
   provider 条目（`NAME`、`NAME-2`……）。
8. **确认 → 备份 → 写入 → refresh()**。Pi 拒绝时展示错误 + 备份路径并支持
   一键回滚。可选切换到第一个新模型。

### 一站多 key（模型分组）

有些中转把不同模型集绑定到不同 key。向导先收一次共享的 `api` + `baseUrl`，
然后循环要 key：每把 key 拉自己的目录、做自己的多选。每组落成独立的
provider 条目（`NAME`、`NAME-2`……），共用同一端点 —— 因为 Pi 的 schema 把
`apiKey` 放在 provider 级，不能按模型存。

### 给已有 provider 加 API

选一个已有模型的 provider，然后循环 `api` + `baseUrl`（key 复用 provider 的，
也可以现输一把）。拉取勾选之后：

- **合并模型** — 按 id 新增；已有 id 绝不静默覆盖（逐个提示保留 / 替换 / 跳过）。
- **替换这些 API 端点** — 先删掉恰好落在刚拉取的 `(api, baseUrl)` 分组上的
  模型，再写入本轮勾选。

同一个 id 不能同时挂在两条 API 上（Pi 发请求时 `id` 原样上传），所以向导
一定会问。在新增非 OpenAI API 之前，provider 级的 `thinkingFormat` /
`requiresReasoningContentOnAssistantMessages` 会先下沉到已有的 OpenAI 模型并从
provider 上移除 —— 否则新加的 Claude 行会继承 `thinkingFormat: "deepseek"`。

### 管理与查看

- **备份 provider** → `{agentDir}/backups/{name}-YYYYMMDD-HHMMSS-mmm.json`
  （权限 `0600`，保留最近 10 份）。
- **从 `/model` 隐藏** — provider 仍留在 `models.json`，但会话启动时的过滤器会把它的全部模型从 `/model` 去掉。隐藏名单写在 `pim-models.json` 的 `hiddenProviders`，因为 Pi 会拒绝 `models.json` 里的未知字段。**重新显示**会把它加回来。
- **刷新模型** — 重新拉取已保存的一条 `(api, baseUrl)`，不改 provider 名称，也不改 API。目录里多出来的 id 可以新增；目录里已经没有的已存 id 可以删除。优先复用已存的 key，否则用 Pi 里该 provider 的 key，再否则手动输入。
- **删除 provider** — 先备份，再从 `models.json` 移除。
- **删除模型** — 在一个 provider 内多选删除。
- **编辑能力** — 多选模型后逐个编辑（与导入时的编辑器相同，见下）。
- **查看** — 浏览每个 provider 及其模型（`id  api  窗口/输出`），可从那里
  直接进入删除。

### Token 消耗

**Token 消耗** 会把 pi 写过的所有 session 文件里 assistant 消息的 `usage` 累加起来，
因此覆盖全部项目、全部模型 —— 不只是当前会话。只读，不写任何文件。

1. 选范围：**全部** / **最近 7 天** / **最近 30 天**。
2. 出现 provider 表格：`总计 / 输入 / 输出 / 缓存 / 次数`，默认按总计排序；
   `←` `→` 切换排序列。
3. `enter` 下钻到该 provider 的模型，`esc` 回到 provider 层。
4. `r` 重扫 session 文件（保持当前范围）；在 provider 表格按 `esc` 关闭视图。

分组口径与 pi 自带的 `getUsageCostBreakdown` 一致：

- assistant 消息 → `provider/responseModel ?? model`，所以中转偷换模型
  （`gpt-5.6-luna` 实际回 `gpt-5.3`）也能看出来；
- cache-warm 的 `usage` 条目 → `provider/model`；
- tool result / branch summary / compaction 的用量 → `Tools/summaries` 桶。

`总计 = 输入 + 输出 + 缓存读 + 缓存写`，与 `/session` 显示的 token 数一致。
**不显示金额**：中转站基本都报 `cost: 0`，算了也是假的。session 文件取自
`{agentDir}/sessions`（尊重 `PI_CODING_AGENT_DIR`）；当 pi 通过 `--session-dir` /
`sessionDir` 指定了别的目录时，用运行时那个。

### 能力参数来源

优先级顺序：

1. **内置离线表**（`src/builtin-catalog.ts`）— 只做精确 / 别名匹配，不模糊。
   Claude 条目钉死 1M 上下文。

   | 实验室 | id |
   | --- | --- |
   | openai | `gpt-5.5` `gpt-5.6-sol` `gpt-5.6-terra` `gpt-5.6-luna` |
   | anthropic | `claude-opus-5` `claude-opus-4-8` `claude-fable-5` `claude-sonnet-5` |
   | xai | `grok-4.5` `grok-4.6` |
   | deepseek | `deepseek-v4-flash` `deepseek-flash` `deepseek-v4-flash-vision-exp` `deepseek-v4-pro` |
   | zhipuai | `glm-5.2` `glm-5.3` `glm-5.3-flash` `glm-5.3-flashx` |
   | google | `gemini-3.7-flash` |
   | moonshotai | `kimi-k3` |
   | meta | `muse-spark-1.3` `muse-spark-1.3-contributor` |

2. **models.dev 官方桶** — 只为内置表不认识且**被勾选**的 id 拉取
   `https://models.dev/api.json`。只用官方实验室桶（openai、anthropic、google、
   moonshotai、deepseek、xai、zhipuai、zai、alibaba、minimax、xiaomi、meta）；
   转售副本（openrouter、`*-plan`、`*-cn` 等）绝不当默认；价格一律忽略。
   缓存在 `{agentDir}/cache/models.dev.json`，带 ETag + 24 小时 TTL；失败时
   回退旧缓存并提示。
3. **启发式** — 最后兜底，按 id 子串（`claude`、`gpt-5`、`gemini`、`kimi`、
   `glm`、`grok`、`deepseek`、`muse`/`spark`……）给出同家族规模的窗口。

匹配时会把目录 id 归一化（小写、去 `vendor/` 前缀、取末段路径、去 `-think` /
`:thinking` / `-YYYY` 后缀、套别名表),但**写入的上游 id 一字不改**。带点的 id
若能在内置表里找到对应条目,会被改写成它(`deepseek-v4.1-flash` /
`deepseek-v4-1-flash` / `deepseek-ai/DeepSeek-V4.1-Flash` → 内置
`deepseek-v4-flash`);内置表不认识的 id 保留原点号。DeepSeek V4.1 Flash 原生多模态,
旧的 `deepseek-v4-flash` / `deepseek-v4-flash-vision-exp` 也已路由到它,所以
deepseek 启发式兜底改成 text+image(只有 `deepseek-v4-pro` 保持纯文本,但它被内置表钉住)。
模糊命中(分数 ≥ 55)必须确认后才抄用其能力;`gpt-5` 绝不会自动升级成 `gpt-5.6-*`。

### 保持模型数据最新

- **自动** — 勾选了内置表没有的 id 时自动查 models.dev（缓存优先），sidecar
  记录拉取时间。
- **手动** — 「设置 → 刷新 models.dev 缓存」无视 TTL 强制拉取
  `https://models.dev/api.json`，并汇报缓存到的官方桶数量。
- **可修改** — 写入前（以及之后在 管理 → 编辑能力 里）可以改 `name`、
  `contextWindow`、`maxTokens`、`input`（纯文本 / 文本+图片）、`reasoning`、
  以及逐档的 `thinkingLevelMap`（`off/minimal/low/medium/high/xhigh/max` →
  隐藏、用档位名、`none` / `disabled` / `enabled`、或自定义上游值）。
  「重置为内置 / 启发式」按 id 重新推导全部参数。编辑器永远不动 `id`、
  `api`、`baseUrl` 和已手写的 `cost`。
- **自愈** — 每次 `session_start` 修掉滞后条目：内置表已判定为多模态、但记录
  里仍写着 `input: ["text"]` 的 id 会被升为 `["text", "image"]`（改写文件并
  备份，同时修补运行中的 registry，图片当场不再被丢弃）。升级是单向的；内置表
  未收录的 id、内置表标注为纯文本的 id、以及被 `modelOverrides` 钉住的 id 不
  受影响。

### 向导可能写入的 per-model compat

| 场景 | `compat` |
| --- | --- |
| Claude 4.6+ 走 `anthropic-messages` | `forceAdaptiveThinking` |
| GLM / Z.AI 模型 | `thinkingFormat: "zai"` |
| DeepSeek / `reasoning_content` | `thinkingFormat: "deepseek"` |
| Kimi K3 走 OpenAI API | `thinkingFormat: "openai"` |

新模型不写 `cost`（Pi 默认 0）。provider 级 compat 只保留中转安全旗标：
`supportsDeveloperRole: false`、`supportsReasoningEffort: true`、
`supportsLongCacheRetention: false`。

### 写入形状

```json
{
  "providers": {
    "ELY": {
      "name": "ELY",
      "apiKey": "sk-...",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": true,
        "supportsLongCacheRetention": false
      },
      "models": [
        {
          "id": "deepseek-v4-flash-0731",
          "name": "DeepSeek V4 Flash",
          "api": "openai-completions",
          "baseUrl": "https://relay.example.com/v1",
          "reasoning": true,
          "input": ["text"],
          "contextWindow": 1000000,
          "maxTokens": 384000,
          "thinkingLevelMap": { "off": "disabled", "low": "low", "high": "high", "max": "max" },
          "compat": { "thinkingFormat": "deepseek", "requiresReasoningContentOnAssistantMessages": true },
          "headers": { "User-Agent": "node" }
        },
        {
          "id": "claude-opus-5",
          "name": "Claude Opus 5",
          "api": "anthropic-messages",
          "baseUrl": "https://relay.example.com",
          "reasoning": true,
          "input": ["text", "image"],
          "contextWindow": 1000000,
          "maxTokens": 128000,
          "compat": { "forceAdaptiveThinking": true }
        }
      ]
    }
  }
}
```

每个模型自带 `api` 和 `baseUrl`；只有全部模型一致时才写 provider 级默认值。

### 文件

尊重 `PI_CODING_AGENT_DIR`（默认 `~/.pi/agent`）：

| 路径 | 作用 |
| --- | --- |
| `models.json` | provider 与模型。权限 `0600`。 |
| `models.json.bak-YYYYMMDD-HHMMSS-mmm` | 写前快照，保留最近 10 份。 |
| `backups/{provider}-….json` | 管理里产生的单 provider 备份。 |
| `cache/models.dev.json` | 官方桶缓存（无 key、无价格）。 |
| `pim-models.json` | 旁路文件：语言、上次 provider/端点、缓存时间，以及 `hiddenProviders`（从 `/model` 隐藏的 id）。无 key。 |

### 安全

- 非 `ctx.mode === "tui"`（print / json / rpc）命令直接退出，绝不写盘。
- 仅 HTTPS；HTTP 只允许回环地址。URL 不带 userinfo；query/hash 去掉；
  重定向一律拒绝而不是跟随。
- 目录响应体限流（2 MB；models.dev 8 MB），20 秒 / 30 秒超时，loader 可 Esc 取消。
- 通知 / 日志 / 报错中的 `Authorization`、`apiKey`、`sk-…` 一律脱敏。
- 写盘有锁文件保护、原子替换（tmp + rename），`modelRegistry.refresh()`
  报错时支持回滚。锁内会重读 `models.json`，并发 `/pim` 会保留对方的 provider。
  已有 `$ENV` / `!command` 引用不会被目录请求的临时密钥覆盖。Pi 可以解析的尾逗号 JSONC 也能读。
- `models.json` 里的 key 与 Pi 本来的存储一样是明文 —— 请把备份当机密文件对待。

### 开发

```sh
npm install
npm test          # Node ≥ 22.19.0，--experimental-strip-types
```

加载本地 checkout：`pi --extension /absolute/path/to/pi-models`。
设计文档：[docs/SPEC.md](docs/SPEC.md)。

### 发布

只要自用可以完全不走 npm：

```sh
pi install git:github.com/palmtom316/pi-models
```

要上 [pi.dev/packages](https://pi.dev/packages) 必须发到 npm。发布**只在 CI 里做**，走 npm
[Trusted Publishing](https://docs.npmjs.com/trusted-publishers)（OIDC）：仓库里没有长期 token，
本地也不用 `npm login`。在本地跑 `npm publish` 会报 `ENEEDAUTH`，这是正常的。

（npm 现在对交互式发布强制 2FA，而 bypass-2FA 的 granular token 从 2027 年 1 月起失去直接发布能力，
所以走 CI 是唯一可持续的方式。）

> **当前状态：Trusted Publisher 还没配。** 在配好之前，`publish.yml` 会退回用仓库 secret
> `NPM_TOKEN` 发布 —— 现在还能用，但已经在 npm 的弃用路径上。按下面配完之后，把那个 secret 删掉
> （`gh secret delete NPM_TOKEN`），这样 OIDC 配错时不会再被 fallback 掩盖。

一次性配置：

1. 打开 [包设置](https://www.npmjs.com/package/@palmtom/pi-models) → **Trusted Publisher**。
2. GitHub Actions：用户 `palmtom316`，仓库 `pi-models`，workflow 文件名 `publish.yml`（只要文件名，不要路径）。
3. **Environment** 留空（workflow 没用 GitHub Environment）。
4. 勾选 **npm publish**。

配置对不上（用户名 / 仓库 / 文件名 / Environment）时，发布会报 `E404`，看起来像包不存在。

之后发布就一条命令：

```sh
npm run release patch     # 也可以 minor / major，或直接写版本号 0.5.0
npm run release 0.5.0 --dry   # 只看会做什么，不改任何东西
```

它会改 `package.json` 和 `package-lock.json` 的版本号、跑测试、提交、打 `v<版本>` tag，然后把
commit 和 tag 一起推上去。GitHub Actions 会校验 tag 与 `package.json` 一致、再跑一次测试，最后发布到 npm。

## License

[MIT](./LICENSE)

## Acknowledgments

Thanks to the [LINUX DO](https://linux.do/) community.
