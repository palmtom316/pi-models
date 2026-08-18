# pi-models — Provider / 模型接入向导

## 1. 目标

在 Pi 交互会话里用 TUI 向导完成：

1. 登记一个 provider（名称、一把共享 API Key）。
2. **首版就必须支持**给这个 provider 挂多条 API（协议 + URL），每条各自拉模型。
3. 用户勾选模型后写入 `~/.pi/agent/models.json`。
4. `modelRegistry.refresh()` 后 `/model` 可切到刚加入的任意模型，并按该模型自己的 `api` + `baseUrl` 发请求。
5. 常用模型能力默认来自模块内置表；内置没有的新 id 才拉 [models.dev](https://models.dev) 官方桶。用户可改。
6. 不写入、不展示、不依赖价格。

一句话：一个站、一把 key、多条协议端点、模型级路由。不按协议拆成 `ELY-openai` / `ELY-claude`。

交付形态：可在 Pi 内执行的 extension / pi package，不改 Pi 本体。

## 2. 非目标

- 不实现自定义 streaming / OAuth / 非标准协议。只使用 Pi 已支持的 `api` 类型。
- 不保证目录里的模型一定能 chat。
- 不自动探测 thinking 格式（要真发请求）。
- 不替代 `pi-ccs`。`pi-ccs` 桥接 CC-Switch 热路由；本包管理用户自己的 `models.json`。
- 不把 models.dev 转售副本当权威。价格一律忽略。
- 首版不管理 `auth.json` / `/login`。Key 写入 provider 的 `apiKey`。
- 首版不做跨 provider 的模型市场，也不从 models.dev 反向安装官方 OpenAI。
- 首版不同 API 不能用不同 key；那种情况提示拆成两个 provider。
- 不把匹配元数据写进 `models.json`（schema 会拒未知字段）。

## 3. 结论摘要

| 问题 | 结论 |
| --- | --- |
| 1 provider × N API？ | 能。Pi `modelFromJson`：`model.api ?? provider.api ?? 已有同 id`。鉴权按 provider id。每个新模型必须自带 `api` 和 `baseUrl`，禁止依赖回退链。 |
| 主路径怎么生效？ | **只写盘** + `await ctx.modelRegistry.refresh()` + 检查 `getError()`。不要对用户 provider 再 `registerProvider({ models })`：extension 层会整表替换，和文件打架。 |
| 能力跟谁？ | 先模块内置常用表（精确匹配）。用户勾选了内置没有的 id 才拉 `https://models.dev/api.json` 官方桶。实验室扁平 `models.json` 没有 `reasoning_options`。转售副本禁止当默认。 |
| 同 id 两条 API？ | `id` 就是发给上游的模型名，**不能改 id 来消冲突**。同一 provider 内只能留一份：拒第二份，或让用户选保留哪条 API。 |
| 价格？ | 新模型省略 `cost`（Pi 默认全 0）。合并时不删用户已手写的 cost。 |
| 密码框？ | `ctx.ui.input` 没有 mask。自绘掩码输入。 |

## 4. 基线契约

- Pi：`@earendil-works/pi-coding-agent` **0.84.2** 或兼容。
- 官方接口：`registerCommand`、`setModel`、`ctx.modelRegistry.refresh()` / `getError()`、`ctx.ui.*`。`registerProvider` 不用于主路径。`ctx.reload()` 仅开发热加载。
- 路径用 `getAgentDir()`（尊重 `PI_CODING_AGENT_DIR`），不要写死 `~/.pi/agent`。
  - `models.json` → `{agentDir}/models.json`
  - 备份 → `{agentDir}/models.json.bak-YYYYMMDD-HHMMSS-mmm`
  - models.dev 缓存 → `{agentDir}/cache/models.dev.json`
  - sidecar（无密钥）→ `{agentDir}/pim-models.json`
- 支持的 `api`（首版）：

  | 值 | 典型用途 | 默认目录 |
  | --- | --- | --- |
  | `openai-completions` | 大多数 New API / One API | `GET {baseUrl}/models` |
  | `openai-responses` | OpenAI Responses / 部分 Grok | 同上 |
  | `openai-codex-responses` | Codex | 同上；不要当默认 |
  | `anthropic-messages` | Claude 原生 | `{baseUrl}/v1/models` 然后 `{baseUrl}/models` |
  | `google-generative-ai` | Gemini 原生 | 先试 OpenAI 兼容 `{baseUrl}/models` |

- 一个 provider 一把 `apiKey`。多条 API 共用。模型级不存 key。
- 非 TUI（`ctx.mode !== "tui"`，含 print / json / rpc）：命令失败、不写盘。不要用 `ctx.hasUI`（RPC 下为 true）。

## 5. 核心数据模型

### 5.1 向导输入

```text
Provider
  name          显示名兼 models.json 的 provider key，如 ELY
  apiKey        共享密钥（掩码输入）
  apis[]        至少一条
    api         Pi api 类型
    baseUrl     该协议端点（按 §7.2 规范化后写入）
    headers     模型级可选；默认 User-Agent: node，关闭 UA 时不写
    label       给人看的名字
```

流程：先 name + key，再循环「选 api + 填 url → 拉模型 → 多选」，直到用户说做完。

Provider 名：`^[A-Za-z][A-Za-z0-9_-]{0,31}$`。撞内置 id（`openai`、`anthropic`、`google`、`cc-switch-*` 等）必须二次确认：那是覆盖内置 provider。

### 5.2 写入形状

**每个模型必须自带 `api` 和 `baseUrl`。** 多 API 时 provider 级不写 `api` / `baseUrl`（单 API 时可以同时写 provider 级缺省，但仍要回填到每个模型）。

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
          "thinkingLevelMap": {
            "off": "disabled",
            "minimal": null,
            "low": "low",
            "medium": null,
            "high": "high",
            "xhigh": null,
            "max": "max"
          },
          "compat": {
            "thinkingFormat": "deepseek",
            "requiresReasoningContentOnAssistantMessages": true
          },
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
          "thinkingLevelMap": {
            "off": null,
            "minimal": null,
            "low": "low",
            "medium": "medium",
            "high": "high",
            "xhigh": "xhigh",
            "max": "max"
          },
          "compat": {
            "forceAdaptiveThinking": true
          }
        }
      ]
    }
  }
}
```

约束：

- 同一 provider 内 `id` 唯一。冲突见 §5.4。
- 只写 Pi schema 白名单字段。匹配质量、官方 id、缓存时间进 sidecar。
- 新模型不写 `cost`。已有 cost 保留。
- `thinkingFormat` / `requiresReasoningContentOnAssistantMessages` **不准**留在多协议 provider 的 provider 级（见 §9）。

### 5.3 已有 API 的还原

`models.json` 没有 `apis[]`。再次打开时按模型上的 `(api, canonicalizeUrl(baseUrl))` 分组。

- 「替换该 API」= 删掉该分组，再写入本轮勾选；其它分组不动。
- sidecar 可记住上次拉过的 URL，不当唯一真相。

### 5.4 同 id 冲突

`id` 会发给上游，禁止为消冲突而改 id。

向导必须：

1. 列出「已存在于 API X (`baseUrl`)」。
2. 默认不勾选冲突项。
3. 用户若坚持勾选：选「保留已有 / 用新 API 替换该 id / 取消该项」。
4. 不能静默覆盖。

两条 API 返回相同 id 时，一个 provider 里只能留一条。

### 5.5 为什么不拆 provider

鉴权按 provider id。拆成 `ELY-openai` / `ELY-claude` 会弄乱 `/model`，也和「1 个 provider」相反。

仅在不同 API 要不同 key、或用户明确要求按协议分列表时才建议拆。首版不做自动拆分。

## 6. TUI 流程

命令：`/pim`。别名 `/pim-models`、`/add-provider`。

窗口：所有对话框（菜单 / 单多选 / 输入 / 密码 / loader）都渲染在 **70% 的 pi-agent 窗口** overlay 内（`width`/`maxHeight` 均为 `"70%"`，`anchor: center`）。随终端 resize 动态重算高度（`floor(rows*0.7)`），配色全部走 pi-agent 的 theme token（`accent`/`muted`/`border`/`selectedBg` 等）。

安装：`pi install npm:pi-models`（发布后）或 `pi install git:github.com/palmtom316/pi-models`。

```text
/pim-models
  1. 选动作
       新建 provider
       给已有 provider 加 API / 加模型
       管理：备份 / 删除 provider / 删除模型 / 编辑已写入能力
       刷新 models.dev 缓存
  2. 新建
       掩码 input name / apiKey
       循环添加 API（至少一条才允许去拉模型）：
         select  api（默认 openai-completions）
         input   baseUrl
         可选：关 UA
         [再加一条] / [去拉模型]
  3. 对每条 API
       BorderedLoader + Esc 取消
       GET 目录（§7）
       先匹配内置常用表，未命中且用户勾选后再拉 models.dev（§8）
       标注：✓ builtin / ✓ official / ~ fuzzy / ? unmatched / ! conflict
       自绘多选（过滤、空格勾选、全选可见项、官方置顶）
       embedding / tts / image / video / realtime 默认折叠
       拉失败：展示 status + 截断 body；可手输 id（逗号分隔）再匹配
  4. 能力编辑默认 skip（写入 id 仍是上游原样）
       中转站 id 与内置 / 官方不一致时（`deepseek-v4-flash-0731`、`deepseek-ai/deepseek-v4-flash-0731`）仍抄内置 `deepseek-v4-flash` 的档位
       可改 name, contextWindow, maxTokens, input, reasoning, thinkingLevelMap
       不可改 id / api / baseUrl / cost
       reset = 再按写入 id 匹配内置（没有再启发式），不动 id / api / baseUrl / 已有 cost
  4b. 管理已有 provider
       备份该 provider → `{agentDir}/backups/{safe-name}-YYYYMMDD-HHMMSS-mmm.json`（0600，最近 10 份）
       删除整个 provider（先备份）
       多选删除该 provider 下的模型
       多选后逐个改能力
  5. 确认
       已有同名：合并模型 / 替换该 API 分组 / 取消
       写盘前备份
  6. refresh()
       getError() 非空：展示错误 + 备份路径，提供回滚，不 setModel
       否则通知：写入 N 个模型，分属哪些 api
       可选切到第一个新模型（setModel 失败要提示）
```

文案：中转站上 Claude / Gemini **更常走 `openai-completions`**。只有站点提供原生端点时才选 `anthropic-messages` / `google-generative-ai`。id 仍按官方桶匹配。

## 7. 模型发现

每条 API 单独拉。

### 7.1 请求

- 默认 `Authorization: Bearer <key>`；Anthropic 原生另加 `x-api-key` 与 `anthropic-version: 2023-06-01`；Google 原生改用 `x-goog-api-key`，不发 Bearer。
- 默认 `User-Agent: node`。
- 超时（建议 20s）+ `AbortSignal`。
- 仅允许 HTTPS；HTTP 只允许 localhost / `127.0.0.1` / `::1`。拒 URL userinfo；剥 query / hash。
- 不跟随跨 origin 3xx；同 origin 最多跟 1 次。
- body 边读边截：目录 2MB，models.dev 8MB。
- 非 2xx：status + body 截断到 200 字。HTML 首页提示补 `/v1`，**不自动改 URL 重试写盘**。

### 7.2 规范化

- trim，去末尾 `/`。
- `openai-*`：用户可带或不带 `/v1`。响应像 HTML 时提示补 `/v1`。
- `anthropic-messages` / `google-generative-ai`：不强行拼 `/v1`；失败给候选。

分组用的 canonicalize：小写 host、去尾 `/`、保留路径（`/v1` 与不带视为不同端点）。

### 7.3 目录 JSON 变体

按顺序认：

1. `{ data: [{ id }] }`（OpenAI / 多数 New API；Anthropic 官方也是 `data`，可能有 `display_name`）
2. `{ models: ["a","b"] }` 或 `{ models: [{ id }] }`
3. Gemini：`{ models: [{ name: "models/gemini-..." }] }` → 剥 `models/`
4. 顶层数组 `[{ id }]` / `["id"]`

空目录不是异常：允许手输 id。

## 8. models.dev 映射

### 8.1 能力源优先级

1. **模块内置常用表** `src/builtin-catalog.ts`。精确匹配（含短名 / 点号别名，如 `opus-5`、`claude-opus-4.8`）。**不做模糊匹配**，避免小表把 `gpt-5` 糊成 `gpt-5.6-*`。
2. 向导启动和多选预览**不**拉 models.dev。
3. 用户勾选了内置没有的 id 时，才 GET `https://models.dev/api.json` 官方桶（条件 GET + 本地缓存）。
4. 仍失败：§8.5 启发式，列表标黄。

内置表（2026-08-17 钉死，Claude 一律 1M 上下文）：

| 实验室 | id |
| --- | --- |
| openai | `gpt-5.5` `gpt-5.6-sol` `gpt-5.6-terra` `gpt-5.6-luna` |
| anthropic | `claude-opus-5` `claude-opus-4-8` `claude-fable-5` `claude-sonnet-5`（全部 `contextWindow=1000000`） |
| xai | `grok-4.5` `grok-4.6` |
| deepseek | `deepseek-v4-flash` `deepseek-v4-pro` |
| zhipuai / zai | `glm-5.2` `glm-5.3`（`glm-5.3` 当时不在实验室桶，按 GLM-5 家族钉死） |
| google | `gemini-3.7-flash` |
| moonshotai | `kimi-k3` |

models.dev 缓存：

- 源：`https://models.dev/api.json`（约 3.8MB，188+ provider）。
- 条件 GET（`ETag` / `If-None-Match`）。
- 本地只持久化官方桶的能力字段（id / name / family / reasoning / reasoning_options / interleaved / modalities / limit / status / 日期）。不存 cost。
- TTL 24h；命令可强制刷新。
- 失败：用过期缓存并警告；无缓存则内置 + 启发式。
- 显示缓存时间。

### 8.2 官方桶（按顺序）

```text
openai
anthropic
google
moonshotai
deepseek
xai
zhipuai
zai
alibaba
minimax
xiaomi
```

禁止当默认：`openrouter`、`ai-router`、`nano-gpt`、`hpc-ai`、`qiniu-ai`、`*-token-plan`、`*-coding-plan`、`alibaba-cn` 及一切转售 / 套餐副本。

同 id 两桶都有（如 `glm-5.2` 在 `zhipuai` 与 `zai`）取名单更靠前的，不要用 `last_updated` 决胜。

图像 / TTS / embedding / realtime / video 默认不进推荐聊天列表。

### 8.3 id 匹配

写入 id **始终**用上游原样。下列变换只用于匹配：

1. 小写。
2. 去 vendor 前缀：`deepseek-ai/`、`openai/`、`anthropic/`、`google/`、`moonshotai/`、`zai/`、`zhipuai/`、`z-ai/`、`qwen/`、`alibaba/`。
3. 去站内后缀：`-think`、`-thinking`、`-reasoner`、`:thinking`、`:reasoning`。
4. 去构建后缀：`-\d{4}$`（`-0731`、`-0813`）。  
   官方 `deepseek` **没有** `deepseek-v4-flash-0731`；那是转售 id。`deepseek-ai/deepseek-v4-flash-0731` 应命中官方 `deepseek-v4-flash`，标 `✓ official`。
5. 官方桶精确匹配规范化 id。
6. 模糊：打分。官方 id 是规范化 id 的前缀/后缀且长度差小，优于 contains。分差不够标 `~ fuzzy`，**不要自动定**。禁止 `contains + last_updated 最新`（`gpt-5` 会误配成最新的 `gpt-5.6-*`）。
7. 禁止 contains 命中 embedding / tts / realtime / image / video / `gpt-image` / `whisper`。
8. 仍失败：`unmatched` + §8.5，列表标黄。

### 8.4 字段映射（忽略价格）

| models.dev | 写入 Pi |
| --- | --- |
| `name` | `name` |
| `limit.context` | `contextWindow` |
| `limit.output` | `maxTokens` |
| `modalities.input` 含 `image` | `input: ["text","image"]`，否则 `["text"]` |
| `reasoning` | `reasoning` |
| `reasoning_options` | `thinkingLevelMap` |
| `interleaved` | 只影响 `compat.thinkingFormat`（§9），不单独落盘 |
| `cost.*` / `status` | 丢弃；`deprecated` 仅在列表里标一下 |

`reasoning_options` → `thinkingLevelMap`：

Pi 键：`off | minimal | low | medium | high | xhigh | max`。  
`xhigh` / `max` 必须显式非 null 才出现在 Pi UI。未出现的标准档写 `null`。不要虚构 `minimal/low`。

1. **effort**  
   `values` 里的档写成同名字符串。`none` → **键** `off`，**值** `"none"`（发给站的是 `none`，不是把键写成 `none`）。
2. **toggle**  
   `off` 可见（值 `"disabled"` 或省略），`high` → `"enabled"`，其余 `null`。
3. **effort + toggle**  
   有 `off`（toggle）以及 listed efforts。
4. **空数组 + reasoning:true**  
   只开 `high`，其余 `null`。
5. **budget_tokens**  
   只确认「有思考」；档位仍按同时出现的 effort 走。

夹具（2026-08-17 官方对象，单测锁住）：

| 官方 id | map 要点 |
| --- | --- |
| `gpt-5.6-sol` | `off:"none"` + low/medium/high/xhigh/max |
| `claude-opus-5` | **无 off**（`off:null`）+ low…max |
| `claude-sonnet-5` | toggle + low…max |
| `gemini-3.7-flash` | 仅 low/medium/high |
| `kimi-k3` | **无 off**（官网始终思考）+ low/high/max；interleaved `reasoning_content` |
| `deepseek-v4-flash` / `deepseek-v4-pro` | toggle + low/high/max（官网两模型同一张 effort 表）；interleaved |
| `glm-5.2` | `off:"none"` + high+max（`none`/`minimal` 关思考；low/medium→high） |
| `glm-5.3` | **无 off** + low/high/max（官网不能 `disabled`） |
| `grok-4.6` | low/medium/high/xhigh（无 max；不能关） |

用户可改每档：隐藏 (`null`) / 原样 / 映射成别的字符串（`max → high`）。

### 8.5 启发式（仅 unmatched）

UI 必须标明不是 models.dev。数字抄最近官方家族，不是权威。

| id 子串 | 默认 |
| --- | --- |
| `deepseek` / `v4-flash` | 1M / 384K / reasoning / deepseek thinking / toggle+low+high+max |
| `glm-5.3` | 1M / 128K / reasoning / zai thinking / low+high+max（无 off） |
| `glm-5.2` / `glm-5` | 1M / 128K / reasoning / zai thinking / off=none + high+max |
| `grok-4.6` | 500K / 500K / text+image / low…xhigh |
| `grok-4` | 500K / 500K / text+image / low+medium+high |
| `kimi` / `k3` | 1M / 128K / reasoning / **无 off** + low+high+max |
| `kimi` / `k2` | 256K / reasoning / toggle |
| `claude` / `opus` / `sonnet` | 1M / 128K / text+image / low…max；anthropic-messages 时 adaptive |
| `gpt-5` / `o3` / `o4` | 1.05M / 128K / reasoning / off=none + 常见 effort |
| `gemini` | 1M / 64K / text+image / low+medium+high |
| 其它 | 128K / 16K / 纯文本 / 非 reasoning |

## 9. Provider / 模型级 compat

中转站协议坑不进能力表。

| 预设 | 放哪 | 原因 |
| --- | --- | --- |
| `supportsLongCacheRetention: false` | provider | New API 拒 `prompt_cache_key` |
| `supportsDeveloperRole: false` | provider | 常不认 `developer` |
| `supportsReasoningEffort: true` | provider | 模型 map 再裁档 |
| `headers["User-Agent"]="node"` | **模型** | WAF 拦 `OpenAI/JS`；用户关闭时 provider 和模型均不新增 UA，已有 provider header 保留 |
| DeepSeek + `interleaved.field==="reasoning_content"` | **模型** | `thinkingFormat:"deepseek"` + `requiresReasoningContentOnAssistantMessages` |
| `zhipuai` / `zai` / glm 家族 + interleaved | **模型** | `thinkingFormat:"zai"`，不要一律 deepseek |
| `moonshotai` / Kimi + OpenAI 协议 | **模型** | `thinkingFormat:"openai"` + `requiresReasoningContentOnAssistantMessages` |
| `anthropic-messages` 且命中 Claude 5 家族 | **模型** | `forceAdaptiveThinking: true` |
| `anthropic-messages` / `google-generative-ai` | **模型** | 禁止套 deepseek/zai thinkingFormat |

`deferredToolsMode: "kimi"` 首版默认关（中转站常拒），放高级项。

### 9.1 加非 openai API 前必须下沉

用户现有 ELY/QQ 的 provider 级常带 `thinkingFormat: "deepseek"`。`mergeCompat(provider, model)` 会让新 Claude 继承它。

给已有 provider 写入任何非 `openai-*` 模型之前：

1. 把 provider 级的 `thinkingFormat`、`requiresReasoningContentOnAssistantMessages` 复制到**还没有这两项**的现有模型（至少所有 `openai-*` 模型）。
2. 从 provider 级删掉这两项。
3. 新模型按自己的 `api` + 匹配结果写 compat。

单测必须锁：ELY 已有 DeepSeek + 新加 `claude-opus-5` 后，Claude 无 `thinkingFormat`，DeepSeek 模型上有。

## 10. 运行时生效

1. 在目标文件同目录备份 `models.json` → `models.json.bak-YYYYMMDD-HHMMSS-mmm`（`0o600`）。只留最近 10 份。
2. 同目录 tmp + `rename` 原子写，文件 `0o600`。
3. `await ctx.modelRegistry.refresh()`。
4. `ctx.modelRegistry.getError()` 非空：展示 + 备份路径，提供回滚；确认后恢复旧文件（首次创建则删除）并再次 `refresh()`，不 `setModel`。
5. 新模型出现在 `/model`；选中后走该模型 `api` + `baseUrl`。
6. 重启仍在（因为写了文件）。

不要 `registerProvider` 用户刚写的 provider。

日志 / notify / 错误不得含 key、`Authorization`、完整 `apiKey` 字段。

## 11. 包结构

```text
pi-models/
  README.md
  docs/SPEC.md
  docs/REVIEW.md
  package.json          # keywords: ["pi-package"]
                        # pi.extensions: ["./src/index.ts"]
                        # peer: @earendil-works/pi-coding-agent, @earendil-works/pi-tui
  src/
    index.ts
    wizard.ts
    models-json.ts
    catalog.ts
    models-dev.ts
    match.ts
    defaults.ts
    fetch.ts
    url.ts
    sidecar.ts
    paths.ts
    types.ts
    ui/
      multi-select.ts
      secret-input.ts
  tests/
    models-dev-map.test.ts
    match.test.ts
    merge-models-json.test.ts
    url-normalize.test.ts
    catalog-parse.test.ts
    fixtures/
      official-snippet.json
```

开发：`pi --extension /path/to/pi-models` 或拷到 `~/.pi/agent/extensions/pi-models/`。  
发布名注意 npm 占用（`pi-ccs` 已被占过）。

## 12. 与现有用户配置

本机已有 QQ / BH / ELY / WONG / Mustore，全是单 API `openai-completions`，部分 provider 级带 deepseek thinking。

- 同名默认 **按 id 合并**，不整段覆盖。
- 「给已有 provider 加 API」是一等功能，且是首版验收项。
- 不改用户已手写的 `thinkingLevelMap`，除非 reset 或显式保存。
- 加第二条协议前走 §9.1 下沉。

## 13. 风险与边界

1. 同 id 不同 API：显式处理，不改 id，不静默覆盖。
2. 官方目录滞后：显示缓存时间，给刷新入口。
3. 漏写模型 `api`：向导拒保存。单测锁住。
4. schema 未知字段：整文件 refresh 失败。只写白名单。
5. WAF / 拒参：UA `node`；关 long cache。
6. Gemini / Anthropic 目录不统一：失败则手输。
7. 一把 key 多协议：不同 key 就拆 provider。
8. 明文 key：与现状一致；写盘 `0600`；备份也是密钥副本，要轮转。
9. `$ENV` / `!command`：确认屏可改写成 `$FOO`，默认仍字面量。

## 14. 验收（首版，含多 API）

1. 新建 provider，一条 `openai-completions`，拉目录、多选、skip 编辑、写入后 `/model` 可见，能发一轮（站点可用的前提下）。
2. **同一 provider 再加一条 `anthropic-messages` URL**，勾选 Claude；`/model` 里原模型与 Claude 并存；切到 Claude 时走 anthropic transport 和该条 baseUrl。
3. 加第二条 API 后，原 DeepSeek 模型仍带 `thinkingFormat: "deepseek"`，Claude **没有**；provider 级不再带 `thinkingFormat`。
4. `deepseek-ai/deepseek-v4-flash-0731` 标 `✓ official`，能力抄官方 `deepseek-v4-flash`，写入 id 仍是上游原样。
5. 命中 openai / anthropic / google / moonshotai 官方条目的窗口和 `thinkingLevelMap` 与缓存官方对象一致（价格除外）。Claude 5 + `anthropic-messages` 带 `forceAdaptiveThinking`。
6. 用户改 `max → high` 并保存后文件是用户值；reset 后回到当前缓存官方值。
7. 新模型无 `cost`；用户旧 cost 仍在。
8. 覆盖前有确认和 `models.json.bak-*`（`0600`）。
9. 同 id 冲突不静默覆盖。
10. 非 TUI 失败且无写盘。
11. models.dev 刷新失败用缓存，不阻断向导。
12. 写入文件能通过 Pi `ModelConfig` schema（无未知字段）。

## 15. 实现顺序

1. `url.ts` / `fetch.ts` / `models-dev.ts` / `match.ts` + 官方夹具单测。
2. `models-json.ts` + 单测：备份、0600、原子写、按 id 合并、替换 API 分组、冲突、compat 下沉、白名单。
3. `catalog.ts`：多形状解析、规范化、UA、限长。
4. `/pim-models` TUI：新建 + **同一向导里循环多 API**。
5. 给已有 provider 加 API（含下沉）。
6. 能力编辑 + reset + sidecar。
7. 打成可 `pi --extension` 的包。
