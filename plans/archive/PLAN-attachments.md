---
implementation_status: done
created_at: 2026-11-22 21:00:42
updated_at: 2026-11-22 21:26:00
---

# PLAN：命令输入支持附件

## 目标

让输入框里的附件能随命令提交：

- `/D`：图片按字节、文件按当前会话回执转发，讨论时模型可直接看到附件；
- `/G`、`/V`、`/VP`：图片随新会话首条提示词发送，文件明确拒绝并说明原因；
- 不改变命令的会话标题、提示词正文、计划解析与工作区逻辑。

## 范围

- 只改本仓：`client.js`、`tests/client.test.mjs`、`SPEC.md`、`README.md`、`README.en.md`、`STATUS.md`、`package.json`、本计划。
- 不改 Host `index.js`，不加配置项，不改 DSH 源码。
- `/ok` 不声明附件支持，行为保持现状；附件不写入仓库、不参与标题。
- 非目标：跨会话转发文件回执；把附件内容拼进提示词文本；为 `/G` 等新建会话的命令暂存文件。
- 已知边界：`/G`、`/VP` 从最近消息里多选计划时，取消按现有逻辑返回 success，草稿与附件会被清空（与当前文字行为一致），本次不改。

## 改动位置

- `client.js`：
  - `claimFor()` 统一加 `attachments: true`，让 composer 序列化附件并传给 `submit`；`/ok` 的 `okClaim` 不动。
  - `matchEnter()` 删除「有附件就抛错」分支（附件类型交给 `submit` 判定）。
  - `submit()` 拆成两条路径：`/D` 原样转发全部附件；`/G`、`/V`、`/VP` 只保留 `type === "image"` 的附件，出现文件直接返回错误，且不创建会话、不发提示词。
  - 新增 `promptParts(text, attachments)`：`[...attachments, { type: "text", text }]`，与原生 composer 的「附件在前、文本在后」一致；`sendPrompt()` 与三个 `start*` 的新会话 `prompt` 调用改用它。
  - `/G`、`/V`、`/VP` 拒绝文件附件的文案统一为：`/<key> 暂不支持文件附件（文件回执只对当前会话有效），请把文件路径写入任务或计划，或改用 /D 在当前会话带文件；图片附件可以直接带。`
- 测试：新增 `/D` 图片+文件、仅附件、`matchEnter` 不抛错、`/G`/`/V`/`/VP` 各一条图片成功与一条文件拒绝、`claim.attachments` 声明；更新现有 `/V` 附件用例为合法 file part 并匹配新文案。
- 文档：`SPEC.md` 命令表补附件说明；`README.md` / `README.en.md` 各命令补一句；`STATUS.md` 记 0.5.0 并写清 0.4.0 仍未发布；`package.json` 升 `0.5.0`；`PROJECT_INDEX.md` 核对命令集未变，无改动则记录“已核对”。
- 事实基线（已核，@deepseek-ai/dsh 0.2.2-rc.1）：
  - composer 仅在 `claim.attachments === true` 时序列化附件并传入 `submit`；
  - `SubmitAttachment` 与 `PromptContentPart` 同形：image 为 `mediaType`/`data`/`name?`，file 为 `receiptId`；
  - Host 用 `admitPromptContent()` 持久化图片字节，与目标会话无关；file 回执按「接收 Agent 的 exact Session」解析，故不能跨会话。

## 实施步骤

1. `client.js` 加 `promptParts()`，改 `sendPrompt(sessionId, text, title, attachments = [])`；`discussionPrompt` 路径传全部附件。
2. `startExecution(sessionId, rawArgs, images = [])`、`startVerification(...)`、`startPlanVerification(...)` 接收图片数组，创建会话后 `prompt(promptParts(text, images), "queue")`。
3. `submit()` 调整附件策略与错误文案；`claimFor()` 加 `attachments: true`；`matchEnter()` 去除附件抛错。
4. 更新测试；跑 `npm test`。
5. 同步 `SPEC.md`、`README.md`、`README.en.md`、`STATUS.md`、`package.json`（0.5.0），核对 `PROJECT_INDEX.md`。
6. 在 `/home/zh/www` 跑 `./scripts/check.sh --repo dsh-workflow-shortcuts`；通过后按本仓规则分一次提交，计划移入 `plans/archive/`。

## 验收

- `npm test` 全部通过；新增用例至少覆盖：`claim.attachments === true`；`/D` image+file 的 content 顺序与形状；`/D` 仅附件且无文字时标题为 `D: 新讨论`；`matchEnter({attachments: 2})` 不抛错；`/G`、`/V`、`/VP` 图片成功、文件报错且 `creates.length === 0`。
- 旧用例全部保留：`/D`/`/G`/`/V`/`/VP` 无附件路径的提示词与标题不变，`/ok` 不受影响。
- `./scripts/check.sh --repo dsh-workflow-shortcuts` 通过。
- 手动（`./dsh-workflow-shortcuts/scripts/apply-profile.sh web` 后重启 `dsh web`）：
  1. `/D` 带一张图片和一个文件提交，消息中出现两类附件，讨论提示词仍在；
  2. `/D` 只带附件不写文字，标题为 `D: 新讨论`；
  3. `/G` 带图片，新建会话首条消息含图片、标题不变；`/G` 带文件只报错、不新建会话；
  4. `/V`、`/VP` 同第 3 条；
  5. 模型是否接受图片取决于当前模型能力，本计划只保证提交与消息呈现，此点单独记录。
- 待验证：更老 DSH 版本是否存在 `claim.attachments`；新会话首条消息含图片字节时的实际渲染与预算。

## 回滚

- 回滚本任务提交即可，版本退回 `0.4.0`；无配置、无数据迁移、无持久化格式变化。
- 失败路径不影响现有命令：附件不在成功前不会从草稿移除，报错后用户仍可删附件重试。

## 改动记录

- 2026-11-22 21:00 初稿，按选型 B（`/D` 图片+文件，`/G`/`/V`/`/VP` 仅图片）落计划。
- 2026-11-22 21:26 完成：`client.js` 加 `promptParts()` 与统一拒绝文案，`claimFor()` 声明 `attachments: true`，`matchEnter()` 去掉附件抛错，`submit()` 按命令分流；测试新增 9 条、改 1 条，`npm test` 72/72 通过；SPEC/README/README.en/STATUS 同步，`package.json` 升 `0.5.0`；`PROJECT_INDEX.md` 已核对命令集未变；`./scripts/check.sh --repo dsh-workflow-shortcuts` 通过。手动验证项与「待验证」保持未勾选，留待宿主机安装后确认。
