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
  `/pim`. Browse first, then create / extend / manage.
- **Manage & view** — backup / delete a provider, delete selected models, edit
  already-written capabilities (or reset to builtin / heuristic), browse what is
  in `models.json` today.
- **Safe writes** — lock-file guarded read-modify-write, atomic tmp+rename, mode `0600`, rotating backups,
  `modelRegistry.refresh()` with automatic rollback offer if Pi rejects the file.
- **Bilingual UI** — English ↔ 中文, switchable in the menu, persisted.

This package writes **your** `models.json`. It does not talk to CC-Switch — that is
[pi-ccs](https://github.com/palmtom316/pi-ccs).

### Requirements

- Pi **≥ 0.84.2** and Node **≥ 22.19.0**
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
   opens a multi-select. Toggle with space, confirm with enter.
4. Confirm the write. `models.json` is backed up, written, and Pi's model registry
   is refreshed — optionally jump straight to the first new model via `/model`.

### Commands

| Command | Action |
| --- | --- |
| `/pim` | Open the overlay menu |
| `/pim-models` | Same |
| `/add-provider` | Same |

Main menu (Esc goes back one layer; Esc / **Exit** on this menu closes `/pim`):

1. **View** — browse existing providers and models; delete inline.
2. **New provider** — name + one `api`/`baseUrl`, then loop API keys (model groups).
3. **Add API / models** — attach another protocol/URL (or more models) to an
   existing provider.
4. **Manage** — backup / delete provider / delete models / edit capabilities.
5. **Refresh models.dev cache** — force-fetch the latest official data.
6. **Language** — English ↔ 中文.
7. **Exit**

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
- **Delete provider** — backs up first, then removes it from `models.json`.
- **Delete models** — multi-select models inside one provider.
- **Edit capabilities** — multi-select models, then edit each one (same editor as
  during import; see below).
- **View** — browse every provider and its models (`id  api  window/output`),
  jump into deletion from there.

### Where capabilities come from

Priority order:

1. **Builtin offline table** (`src/builtin-catalog.ts`) — exact / alias matches
   only, no fuzzy. Claude entries are pinned to 1M context.

   | Lab | Ids |
   | --- | --- |
   | openai | `gpt-5.5` `gpt-5.6-sol` `gpt-5.6-terra` `gpt-5.6-luna` |
   | anthropic | `claude-opus-5` `claude-opus-4-8` `claude-fable-5` `claude-sonnet-5` |
   | xai | `grok-4.5` `grok-4.6` |
   | deepseek | `deepseek-v4-flash` `deepseek-v4-pro` |
   | zhipuai | `glm-5.2` `glm-5.3` |
   | google | `gemini-3.7-flash` |
   | moonshotai | `kimi-k3` |

2. **models.dev official buckets** — fetched only for *selected* ids the builtin
   table doesn't know (`https://models.dev/api.json`). Only official lab buckets
   are used (openai, anthropic, google, moonshotai, deepseek, xai, zhipuai, zai,
   alibaba, minimax, xiaomi). Reseller copies (openrouter, `*-plan`, `*-cn`, …)
   are never defaults; cost/prices are ignored. Cached at
   `{agentDir}/cache/models.dev.json` with ETag + 24h TTL; on failure the stale
   cache is used with a warning.
3. **Heuristic** — last resort for ids nothing knows; family-sized windows from
   id substrings (`claude`, `gpt-5`, `gemini`, `kimi`, `glm`, `grok`,
   `deepseek`…).

Matching normalizes the catalog id (lowercase, drop `vendor/` prefixes, keep the
last path segment, drop `-think` / `:thinking` / `-YYYY` suffixes, apply aliases)
but **writes the upstream id unchanged**. Fuzzy hits (score ≥ 55) must be
confirmed before their capabilities are used; `gpt-5` is never auto-upgraded to
`gpt-5.6-*`.

### Keeping model data fresh

- **Automatic** — any selected id the builtin table misses triggers a models.dev
   lookup (cache-first). The sidecar records the fetch time.
- **Manual** — menu item *Refresh models.dev cache* force-fetches
   `https://models.dev/api.json` regardless of TTL and reports how many official
   buckets were cached.
- **Editable** — before writing (and afterwards via Manage → Edit capabilities)
   you can change `name`, `contextWindow`, `maxTokens`, `input` (text /
   text+image), `reasoning`, and the per-level `thinkingLevelMap`
   (`off/minimal/low/medium/high/xhigh/max` → hidden, level name, `none` /
   `disabled` / `enabled`, or a custom upstream value). *Reset to builtin /
   heuristic* re-derives everything from the id. `id`, `api`, `baseUrl`, and
   hand-written `cost` are never touched by the editor.

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
| `pim-models.json` | Sidecar: language, last endpoints, cache time. No keys. |

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

For [pi.dev/packages](https://pi.dev/packages) the package must be on npm. This repo uses
[trusted publishing](https://docs.npmjs.com/trusted-publishers) — no local `npm login`,
OTP, or long-lived token. One-time setup:

1. Open [package settings](https://www.npmjs.com/package/@palmtom/pi-models) → **Trusted Publisher**.
2. GitHub Actions: user `palmtom316`, repo `pi-models`, workflow filename `publish.yml` (filename only, not a path).
3. Leave **Environment** empty unless the workflow uses one.
4. Allow **npm publish**.

A mismatch (wrong owner/repo/filename/environment) shows up as `E404` on publish, not as an auth error.

After that, a release is just a version bump + tag:

```sh
# edit package.json version, then:
git add package.json && git commit -m "Bump version to x.y.z"
git tag vx.y.z
git push && git push origin vx.y.z
```

GitHub Actions runs tests and `npm publish`. The tag must be `v` plus the `package.json` version.

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
  只有在主菜单按 Esc / **退出** 才关闭 `/pim`。顺序是先查看，再新建 / 追加 / 管理。
- **管理与查看** — 备份 / 删除 provider、多选删模型、编辑已写入的能力
  （或重置为内置 / 启发式）、浏览当前 `models.json` 内容。
- **安全写入** — 锁内重读后再合并、原子 tmp+rename、权限 `0600`、滚动备份、写后
  `modelRegistry.refresh()`，Pi 拒绝时一键回滚。
- **中英双语界面** — 菜单一键切换，持久保存。

本包写的是**你自己的** `models.json`，与 CC-Switch 无关 —— 那是
[pi-ccs](https://github.com/palmtom316/pi-ccs) 的职责。

### 环境要求

- Pi **≥ 0.84.2**，Node **≥ 22.19.0**
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
   空格勾选，回车确认。
4. 确认写入。`models.json` 先备份再写入并刷新模型注册表，可选直接切换到
   第一个新模型。

### 命令

| 命令 | 作用 |
| --- | --- |
| `/pim` | 打开 overlay 菜单 |
| `/pim-models` | 同上 |
| `/add-provider` | 同上 |

主菜单（Esc 逐层返回；在本层按 Esc / **退出** 才关闭 `/pim`）：

1. **查看** — 浏览已有 provider 与模型，可直接删除。
2. **新建 provider** — 名称 + 一条 `api`/`baseUrl`，然后循环输入 API key（模型分组）。
3. **给已有 provider 加 API / 模型** — 在现有 provider 上追加协议/URL 或更多模型。
4. **管理** — 备份 / 删除 provider / 删除模型 / 编辑能力。
5. **刷新 models.dev 缓存** — 强制拉取最新官方数据。
6. **语言** — English ↔ 中文。
7. **退出**

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
- **删除 provider** — 先备份，再从 `models.json` 移除。
- **删除模型** — 在一个 provider 内多选删除。
- **编辑能力** — 多选模型后逐个编辑（与导入时的编辑器相同，见下）。
- **查看** — 浏览每个 provider 及其模型（`id  api  窗口/输出`），可从那里
  直接进入删除。

### 能力参数来源

优先级顺序：

1. **内置离线表**（`src/builtin-catalog.ts`）— 只做精确 / 别名匹配，不模糊。
   Claude 条目钉死 1M 上下文。

   | 实验室 | id |
   | --- | --- |
   | openai | `gpt-5.5` `gpt-5.6-sol` `gpt-5.6-terra` `gpt-5.6-luna` |
   | anthropic | `claude-opus-5` `claude-opus-4-8` `claude-fable-5` `claude-sonnet-5` |
   | xai | `grok-4.5` `grok-4.6` |
   | deepseek | `deepseek-v4-flash` `deepseek-v4-pro` |
   | zhipuai | `glm-5.2` `glm-5.3` |
   | google | `gemini-3.7-flash` |
   | moonshotai | `kimi-k3` |

2. **models.dev 官方桶** — 只为内置表不认识且**被勾选**的 id 拉取
   `https://models.dev/api.json`。只用官方实验室桶（openai、anthropic、google、
   moonshotai、deepseek、xai、zhipuai、zai、alibaba、minimax、xiaomi）；
   转售副本（openrouter、`*-plan`、`*-cn` 等）绝不当默认；价格一律忽略。
   缓存在 `{agentDir}/cache/models.dev.json`，带 ETag + 24 小时 TTL；失败时
   回退旧缓存并提示。
3. **启发式** — 最后兜底，按 id 子串（`claude`、`gpt-5`、`gemini`、`kimi`、
   `glm`、`grok`、`deepseek`……）给出同家族规模的窗口。

匹配时会把目录 id 归一化（小写、去 `vendor/` 前缀、取末段路径、去 `-think` /
`:thinking` / `-YYYY` 后缀、套别名表），但**写入的上游 id 一字不改**。模糊命中
（分数 ≥ 55）必须确认后才抄用其能力；`gpt-5` 绝不会自动升级成 `gpt-5.6-*`。

### 保持模型数据最新

- **自动** — 勾选了内置表没有的 id 时自动查 models.dev（缓存优先），sidecar
  记录拉取时间。
- **手动** — 菜单「刷新 models.dev 缓存」无视 TTL 强制拉取
  `https://models.dev/api.json`，并汇报缓存到的官方桶数量。
- **可修改** — 写入前（以及之后在 管理 → 编辑能力 里）可以改 `name`、
  `contextWindow`、`maxTokens`、`input`（纯文本 / 文本+图片）、`reasoning`、
  以及逐档的 `thinkingLevelMap`（`off/minimal/low/medium/high/xhigh/max` →
  隐藏、用档位名、`none` / `disabled` / `enabled`、或自定义上游值）。
  「重置为内置 / 启发式」按 id 重新推导全部参数。编辑器永远不动 `id`、
  `api`、`baseUrl` 和已手写的 `cost`。

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
| `pim-models.json` | sidecar：语言、最近端点、缓存时间。无 key。 |

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

要上 [pi.dev/packages](https://pi.dev/packages) 必须发到 npm。本仓库用
[Trusted Publishing](https://docs.npmjs.com/trusted-publishers)，本地不再 `npm login` / OTP / token。一次性配置：

1. 打开 [包设置](https://www.npmjs.com/package/@palmtom/pi-models) → **Trusted Publisher**。
2. GitHub Actions：用户 `palmtom316`，仓库 `pi-models`，workflow 文件名 `publish.yml`（只要文件名，不要路径）。
3. **Environment** 留空（workflow 没用 GitHub Environment）。
4. 勾选 **npm publish**。

配置对不上（用户名 / 仓库 / 文件名 / Environment）时，发布会报 `E404`，看起来像包不存在。

之后发布只要改版本号 + 打 tag：

```sh
# 改 package.json version 后：
git add package.json && git commit -m "Bump version to x.y.z"
git tag vx.y.z
git push && git push origin vx.y.z
```

GitHub Actions 会跑测试并 `npm publish`。tag 必须是 `v` 加上 `package.json` 的版本号。

## License

[MIT](./LICENSE)

## Acknowledgments

Thanks to the [LINUX DO](https://linux.do/) community.
