# pi-models 全面代码审查报告

- 日期：2026-08-19
- 审查范围：仓库全部源码、测试、文档、包配置和 GitHub Actions
- 版本：`@palmtom/pi-models@0.2.2`
- 基线：`@earendil-works/pi-coding-agent@0.84.2`、`@earendil-works/pi-tui@0.84.2`
- 审查方式：静态审查、针对性最小复现、依赖实现对照、测试与发布产物检查
- 结论：发现 3 项高风险、8 项中风险和 3 项低风险问题。现有测试全部通过，但未覆盖数个会造成配置丢失、认证配置变更或请求不兼容的真实路径。
- 状态：本报告记录的主要问题已在同一次修复中落盘（锁内 mutation、保留 `$ENV`/`!command`、去掉 npm OIDC 探针、JSONC 尾逗号、同批 `replaceExisting`、官方 text-only 模态、`__proto__` provider id、loader abort 静默、sidecar 锁、Claude 4 日期后缀不误判为 4.6+）。

## 1. 高风险问题

### H1. 并发写入会丢失其他会话的修改

**位置**

- `src/wizard.ts:268-269`
- `src/models-json.ts:348-352`
- `src/models-json.ts:379-403`
- `src/models-json.ts:405-425`

**问题**

向导先在锁外基于较早读取的 `ModelsFile` 快照调用 `applyDrafts()`，随后 `writeModelsFile()` 才获取锁。锁仅串行化最终备份和覆盖，没有覆盖“重新读取、合并、写入”整个事务。

**触发条件**

- 两个 Pi 会话同时打开向导并修改 `models.json`。
- 用户在向导确认期间手工修改文件。
- 其他扩展或进程在向导读盘后、写盘前更新文件。

**影响**

后写者会完整覆盖先写者的合法修改。refresh 失败后的回滚也可能用旧备份覆盖另一个进程刚写入的新配置。

**复现结果**

两个并发写入分别只包含 provider `A` 和 `B` 时，最终文件只保留后完成的一方。现有并发测试只验证盲写被串行化，没有验证双方修改能够合并保留。

**建议**

提供锁内 mutation API，在获取锁后重新读取文件、应用变更、备份并原子写入。也可增加内容 hash 或 mtime 的乐观并发检查，在源文件变化时拒绝覆盖并要求用户重新确认。回滚前同样必须验证当前文件仍是本次写出的版本。

### H2. 动态密钥引用可能被临时明文密钥覆盖

**位置**

- `src/wizard.ts:394-399`
- `src/wizard.ts:412-447`
- `src/models-json.ts:257`

**问题**

`storedApiKey()` 将以 `$` 或 `!` 开头的 `apiKey` 视为不可复用，向导因此要求用户输入一把临时密钥用于目录请求。持久化时，这把临时密钥又经 `applyDrafts()` 写回 provider，覆盖原有 `$ENV_VAR` 或 `!command` 引用。

新建流程使用已存在的同名 provider 并选择合并时，也会把新输入的 key 直接写入已有 provider。

**影响**

- 原本不会落盘的动态认证方式被替换为明文密钥。
- 密钥轮换和外部密钥管理失效。
- 用户只确认“合并模型”，却同时发生未明确展示的认证配置变更。

**建议**

把“本次目录请求使用的临时密钥”和“需要持久化的 provider `apiKey`”拆成不同字段。已有 provider 默认保留原认证配置；只有用户在单独的明确确认步骤中选择替换认证时才写入新值。

### H3. npm OIDC 探针可能把发布令牌写入公开 Actions 日志

**位置**

- `.github/workflows/publish.yml:29-70`

**问题**

工作流自行请求 GitHub OIDC JWT，再向 npm token exchange 端点发请求，并打印响应正文前 800 个字符。若 exchange 成功，响应正文会包含短期 npm publishing token。该 token 是运行时动态生成的，GitHub Actions 通常无法预先识别并自动遮蔽。

**历史状态**

已检查 v0.2.2 发布任务日志：三个自定义 exchange 请求均返回 404，没有发现 JWT 或 npm token 形态的日志行，因此未确认历史令牌已经泄漏。该漏洞仍会在 exchange 接口成功时触发。

**建议**

删除自定义 OIDC exchange 探针，让 `npm publish` 自行执行 trusted publishing。若确需诊断，仅输出 HTTP 状态和非敏感 claims，绝不读取或打印 exchange 响应正文。

## 2. 中风险问题

### M1. 同一批多 API 的 ID 冲突选择不会按用户选择生效

**位置**

- `src/wizard.ts:432-440`
- `src/wizard.ts:219-233`
- `src/models-json.ts:278-295`

**问题**

第一条 API 的 draft 被加入后，其 ID 立即进入 `existing`。第二条 API 返回同 ID 时，UI 会询问保留或替换。即使用户选择“用此 API 替换”，两个同 ID draft 最终仍会依次传给 `applyDrafts()`；合并层发现第二个 ID 已存在于本批 `incomingIds` 后直接跳过，不检查第二个 draft 的 `replaceExisting`。

**影响**

第一条 API 总是胜出，用户明确选择的第二条 API 不会生效。

**建议**

在 UI 收集阶段按 ID 归并 drafts，让明确的 replace 选择替换前一个 draft；或者让合并层对本批重复 ID 执行同样的冲突语义，而不是无条件跳过后项。

### M2. 官方纯文本模型可能被错误标记为支持图片

**位置**

- `src/drafts.ts:18`

**问题**

当前逻辑只在官方 `modalities.input` 包含 `image` 时采用官方能力，否则回退到名称启发式。官方已经明确给出 `input: ["text"]` 时，也可能被启发式改成 `["text", "image"]`。

**实际样本**

审查期间从 models.dev 官方目录确认至少包括：

- `openai/o3-mini`
- 多个 `moonshotai/kimi-k2-*` 模型

这些条目官方输入为纯文本，但当前启发式会给出图片输入。

**影响**

Pi 会允许用户向不支持图片的上游模型发送图片，导致请求失败。

**建议**

只要官方对象存在 `modalities.input`，就严格根据官方数组映射：包含 `image` 才写 `text+image`，否则写 `text`。只有官方字段缺失时才使用启发式。

### M3. 日期后缀 Claude 4 被误判为 adaptive-thinking 模型

**位置**

- `src/defaults.ts:81-86`

**问题**

版本正则会将 `claude-sonnet-4-20250514` 中的日期 `20250514` 解析为 minor version，随后因为 `minor >= 6` 写入 `forceAdaptiveThinking: true`。

该日期式 ID 是当前 Pi 文档中的真实模型 ID，不是理论输入。

**影响**

旧 Claude 4 模型可能收到其不支持的 adaptive thinking payload，从而返回 400 或行为异常。

**建议**

区分语义版本与日期后缀。仅明确的 `claude-*-4-6` 及更新语义版本启用 adaptive thinking；8 位日期不应作为 minor version。

### M4. “替换这些端点”无法清空没有勾选模型的端点

**位置**

- `src/wizard.ts:253-256`
- `src/wizard.ts:421-447`
- `src/models-json.ts:267-273`

**问题**

replace 模式的目标默认从最终 drafts 推导。某个已拉取 endpoint 没有选中任何模型时，它不会出现在 drafts 中；如果所有 endpoint 都为空，`persist()` 会直接以“Nothing to write”返回。

**影响**

用户无法用“替换端点”清空旧分组。多 endpoint 操作中，只有产生 draft 的 endpoint 会被替换，与 README 描述不一致。

**建议**

把本轮实际拉取的 `specs.map(({ api, baseUrl }) => ...)` 显式传给 `MergeOptions.replace`，并允许 replace 模式在 drafts 为空时执行删除。

### M5. 无法读取 Pi 接受的 trailing-comma JSONC

**位置**

- `src/models-json.ts:47-55`

**问题**

本项目只删除注释，随后直接调用 `JSON.parse()`。当前 Pi 的 `stripJsonComments()` 同时支持 `//` 注释和对象/数组尾逗号。

**复现结果**

provider、model 对象或 models 数组带尾逗号时，本项目抛出 JSON 解析错误，而 Pi 自身能够加载同一文件。

**影响**

一个对 Pi 完全合法的 `models.json` 会使本扩展的 View、New、Add 和 Manage 主流程全部不可用。

**建议**

复用 Pi 导出的 JSONC 解析工具，或实现与当前 Pi 等价且有测试覆盖的字符串安全解析。

### M6. provider ID `__proto__` 会在写入时静默丢失

**位置**

- `src/models-json.ts:128-133`

**问题**

`sanitizeFile()` 用普通 `{}` 构建 provider record，再执行 `providers[id] = value`。当合法 key 为 `__proto__` 时，该赋值触发对象原型 setter，不会创建可序列化的自有属性。

**复现结果**

包含 `"__proto__"` provider 的输入经过 `sanitizeFile()` 后，`Object.keys(providers)` 为空，序列化结果为 `{"providers":{}}`，且 providers 对象原型被替换成 provider 数据。

**影响**

任意新增、删除或编辑操作都会静默删除该 provider。

**建议**

使用 `Object.create(null)`、`Object.fromEntries()` 或 `Map` 构造不受原型特殊键影响的 record。增加 `__proto__`、`constructor`、`prototype` 回归测试。

### M7. Node 最低版本声明低于锁定依赖要求

**位置**

- `package.json:40-42`
- `README.md` Requirements / 环境要求
- `package-lock.json:56-57` 及多个 Pi 子包

**问题**

项目声明 Node `>=22`，但锁定的 Pi 0.84.2 及相关运行时包要求 `>=22.19.0`。测试脚本还依赖 Node 的 TypeScript stripping，早期 Node 22 不满足完整运行要求。

**影响**

npm 会允许用户在项目声称支持、实际依赖不支持的 Node 版本安装，产生 engine warning 或运行失败。

**建议**

把 `engines.node` 和 README 改为 `>=22.19.0`，CI 至少增加 Node 22.19.0 最低版本任务。

### M8. 发布任务没有强制 tag 与包版本一致，并保留长期 token fallback

**位置**

- `.github/workflows/publish.yml:3-7`
- `.github/workflows/publish.yml:72-83`

**问题**

- 任意 `v*` tag 都会发布 tag 所指提交中的 package version，没有校验 tag 等于 `v${package.json.version}`。
- `workflow_dispatch` 可以从选定分支无 tag 发布。
- 若存在 `NPM_TOKEN` secret，工作流优先使用长期 token，而不是 OIDC。

v0.2.2 发布日志确认实际走的是 `NPM_TOKEN` fallback。

**影响**

可能因错误 tag 或手动 dispatch 发布非预期版本；长期 token 扩大凭据泄漏和维护面，也与项目 OIDC-only 发布约定不一致。

**建议**

- tag 事件必须校验 `GITHUB_REF_NAME === "v" + package.json.version`。
- 删除或严格约束无 tag 的 `workflow_dispatch`。
- 删除 `NPM_TOKEN` fallback，只保留 npm trusted publishing。

## 3. 低风险问题

### L1. sidecar 部分更新存在丢失更新竞态

**位置**

- `src/sidecar.ts:20-30`

`writeSidecar()` 是无锁 read-modify-write。models.dev 刷新与向导持久化并发时，`cacheFetchedAt`、`lastProvider` 或 `lastEndpoints` 可能互相覆盖。建议使用同路径锁和临时文件原子替换。

### L2. 发布门禁缺少静态和产物级检查

**位置**

- `package.json:37-39`
- `.github/workflows/publish.yml:27-28`

当前发布前仅执行 `npm test`。缺少：

- TypeScript typecheck
- `npm pack --dry-run` 或 tarball 文件清单断言
- 从打包产物加载 `src/index.ts` 并验证命令注册的 smoke test
- Node 最低版本测试
- peer dependency 最低版本与支持上限矩阵

此外 peer range 声明为 `>=0.84.2 <1`，实际只验证锁定的 0.84.2；对于 pre-1.0 依赖，这个兼容范围偏宽。

### L3. 发布包中的规格文档已经漂移

**位置**

- `docs/SPEC.md:27`
- `docs/SPEC.md:60`
- `docs/SPEC.md:189`
- `docs/SPEC.md:245-249`

问题包括：

- 仍称不同 key 需要手工拆 provider，与已实现的 `NAME`、`NAME-2` 分组不一致。
- 安装命令使用错误的 `npm:pi-models`，实际包名是 `npm:@palmtom/pi-models`。
- 规格承诺同源重定向最多一次，实现和 README 则拒绝全部重定向。

该文件由 npm 包发布，容易误导安装者和后续维护者。

## 4. 已确认正确的关键路径

以下实现经代码审查和现有测试确认总体正确：

- 非 TUI 模式拒绝进入写盘流程。
- URL 拒绝 userinfo、非回环 HTTP、query 和 hash，并保留 `/v1` 路径语义。
- catalog 按协议设置 Bearer、Anthropic 和 Google 鉴权头。
- catalog 和 models.dev 响应体按字节限长，并配置超时和取消信号。
- catalog 错误中的精确 API key 会被替换为 `[redacted]`。
- 写入使用同目录临时文件和 rename，目标文件及备份模式为 `0600`。
- refresh 失败提供回滚，并再次 refresh 检查回滚结果。
- 现有模型的 `cost` 在替换和能力编辑时得到保留。
- 添加非 OpenAI API 前会下沉 provider 级 thinking compat，避免 Claude 继承 DeepSeek 格式。
- `createPimUi()` 已显式转发顶层 `notify`，与 wizard/manage 的调用方式一致。
- 多 key 分组写入不同 provider 的基本路径已覆盖并通过测试。

## 5. 测试和验证结果

### 已执行

- `npm test`
  - 104 tests
  - 104 passed
  - 0 failed
- `npm audit --omit=dev --json`
  - 0 vulnerabilities
- `npm pack --dry-run --json`
  - 成功
  - 27 个发布文件
  - tarball unpacked size 约 188 KB
- `git diff --check`
  - 通过
- 工作区状态
  - 审查期间无代码修改
- 发布版本一致性
  - tag `v0.2.2` 指向的 `package.json` version 为 `0.2.2`
- GitHub Actions 日志检查
  - v0.2.2 自定义 OIDC exchange 均为 404
  - 未发现 JWT 或 npm token 形态日志行
  - 发布实际使用 `NPM_TOKEN` secret fallback
- models.dev 实时目录检查
  - 确认存在官方 text-only 模型被当前启发式扩展为 image 输入的实际样本

### 主要测试缺口

建议新增以下回归测试：

1. 两个并发 mutation 从同一初始文件分别新增 provider，最终双方都保留。
2. 外部文件变化后拒绝使用旧快照覆盖。
3. `$ENV` 和 `!command` apiKey 在使用临时目录 key 后仍保持原值。
4. 同一批多 API 同 ID，选择第二条 replace 后第二条实际胜出。
5. `o3-mini` 和 Kimi K2 text-only modality 不产生 image 输入。
6. `claude-sonnet-4-20250514` 不启用 adaptive，`claude-opus-4-6` 启用。
7. replace-endpoint 可清空零选择 endpoint，并正确处理多 endpoint 部分为空。
8. JSONC 尾逗号覆盖 provider、model、数组和字符串边界。
9. `__proto__` provider 可完整往返。
10. `boundedFetch` 的超时、调用方 abort、超限流式响应、重定向和 UTF-8 截断。
11. 备份保留上限与轮转顺序。
12. Node 22.19.0 最低版本 CI。
13. packed tarball 中 extension entry 的命令注册 smoke test。

## 6. 建议修复顺序

1. 修复 H1 并发事务与回滚保护。
2. 修复 H2 动态密钥保留。
3. 删除 H3 OIDC 响应正文日志和 `NPM_TOKEN` fallback。
4. 修复 M1 同批冲突选择与 M4 endpoint 清空语义。
5. 修复 M2 modality 和 M3 Claude adaptive 判断。
6. 对齐 JSONC 解析并修复危险 provider key。
7. 收紧 Node/peer/发布版本门禁。
8. 补充上述回归测试并同步 SPEC/README。
