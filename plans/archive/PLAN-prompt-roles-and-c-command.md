---
implementation_status: done
created_at: 2026-11-23 11:55:16
updated_at: 2026-11-23 12:56:00
---

# PLAN：短命令角色定位与新增 /C 问题处理命令

## 目标

一次完成两项改动，统一发布为 `0.5.0`：

1. `/D`、`/G`、`/V`、`/VP` 首条提示词开头各加一句英文角色定位：
   - `/D`：`You are a senior software architect.`
   - `/G`：`You are a senior software development expert.`
   - `/V`：`You are a senior software testing expert.`
   - `/VP`：`You are a senior technical plan reviewer.`
2. 新增 `/C`：在当前会话切到「软件问题处理专家」，查线上/生产异常、定位 bug、核对收到的信息并直接处理。
   - 首行：`You are a senior software troubleshooting expert.`
   - 标题 `C：<摘要>`，空参 `C：查问题`；支持图片与文件附件（当前会话转发）。
   - 附加要求文件 `.dsh/workflow-shortcuts/check.md`（`checkPromptFile`，`none`/`off`/`-` 关闭）。
   - 边界：生产/共享环境只读诊断；重启、删改数据、改权限、装依赖、发布需明确授权；不写 `PLAN-*.md`，需要先出方案时交回 `/D`。以上为提示词约束，不是硬拦；硬拦仍只对 `V：` 标题生效。
   - 安全：`V：`、`V：计划：` 标题的只读会话拒绝 `/C`，避免改名绕过 context-guard 只读硬拦。
3. `/D` 在编号规则前加分流说明：「说明：本命令只做内容探索与计划；bugfix、线上异常处理请改用 /C。」，编号行数仍为 4。

## 范围

- 改 `client.js`、`index.js`、`lib/todo.js`、`tests/client.test.mjs`、`tests/index.test.mjs`、`tests/todo.test.mjs`、`SPEC.md`、`README.md`、`README.en.md`、`STATUS.md`，以及 `/home/zh/www/PROJECT_INDEX.md`。
- 不改 `/G`、`/V`、`/VP` 除角色句外的行为；不改 context-guard。
- 版本保持 `0.5.0`：`package.json` 已是 `0.5.0`，不升版；STATUS 说明本版包含角色定位与 `/C`。0.4.0/0.5.0 均未发布，两项一起进 0.5.0。
- 用户要求两项合并为一个计划、一个版本；篇幅超过 80 行、文件数超过 3，均为需求所致，不拆分。

## 改动位置

- `client.js`：
  - `COMMANDS`（约 21 行）加 `C`：描述「问题：查 bug、核对信息并直接处理（当前会话）」，hint `[问题描述 | 收到的信息]`，图标沿用 `IconPlayOutlineRegular`；文件头注释同步为五个命令；
  - `keyOfToken`（约 820 行）接受 `C`；`submit`（约 621 行）加 `key === "C"` 分支；
  - `TODO_PREFIX`（约 60 行）扩为 `[DGC]`；
  - 文件附件判断由仅 `/D` 放宽到 `/D`、`/C`，`fileAttachmentNotice` 文案同步；
  - 四个既有提示词函数首行插入角色句和一个空行；`discussionPrompt` 在编号规则前加上述分流说明；
  - 新增 `checkPrompt(task, overlay)`、`checkTitle(task)`、`startCheck(sessionId, args, attachments)`；`startCheck` 先读当前标题，命中 `^(?:TODO[：:]\s*)?V[：:]` 返回错误且不改标题。
- `index.js`：新增 `DEFAULT_CHECK_PROMPT_FILE` 与 `Config.checkPromptFile`，`normalizeConfig` 增加字段，注释「六个」改「七个」。
- `lib/todo.js`：`PREFIX`、`COMMAND_PREFIX` 扩为 `[DGC]`，让 `TODO C：…` 可加可清。
- 测试：
  - 角色：`/D`、`/G`（计划/文字模式）、`/V`、`/VP` 首行分别精确匹配四个英文角色句；
  - `/C`：不新建会话、改名 `C：`、首行角色句与 4 条规则、空参兜底、附件转发、`附加要求：` 在 `任务：` 前、`V：` 标题下被拒且标题不变；
  - `/D`：分流行存在，编号行仍 4；Host 配置默认/清洗/注入；TODO 的 `C：` 前缀。
- 文档：SPEC 接口补 `/C` 与 `checkPromptFile`；双语 README 补角色定位、`/C` 功能与配置；STATUS 记一条 0.5.0；`PROJECT_INDEX.md` 插件行改为五个命令（含 `/C`），该文件属 personalCloud 仓，单独提交。

## 实施步骤

1. 四处角色句：在各 `lines` 数组最前插入角色句和一个空行；`discussionPrompt` 再插入分流行，其余编号、`附加要求`/`任务：` 位置不动。
2. `/C` 提示词：角色句、空行、4 条编号规则（先查证后修、直接修小问题、生产只读与授权、不写 PLAN 并报告），`附加要求：` 在 `任务：` 前；空参任务用「（我还没说清问题，请先通过提问帮我确认现象、环境与范围。）」。
3. `submit` 的 `C` 分支直接转发 `attachments`（含文件）并调用 `startCheck`；`/ok` 清除 `TODO C：`。
4. `index.js` 配置与注入；`lib/todo.js` 与 client `TODO_PREFIX` 加 `C`。
5. 补测试；更新 SPEC、双语 README、STATUS、`PROJECT_INDEX.md`。
6. 跑验收；提交前在 `/home/zh/www` 执行 `./scripts/check.sh --repo dsh-workflow-shortcuts`。

## 验收

- `npm test` 全部通过；新增用例覆盖上述角色、`/C`、配置与 TODO 行为。
- 四个既有命令首行为对应英文角色句；`/D` 含分流行且编号行仍 4。
- `/C` 提交后当前会话标题为 `C：<摘要>`，会话列表不新增；空参为 `C：查问题`；提示词首行为 C 角色句，含只读/授权与「不写 PLAN」边界。
- `/C` 可转发文件与图片；`/G`、`/V`、`/VP` 仍拒绝文件并提示可改用 `/D`、`/C`。
- 在 `V：…` 会话执行 `/C` 返回错误，标题与会话内容不变。
- `./scripts/check.sh --repo dsh-workflow-shortcuts` 通过。
- 待验证：重启 `dsh web` 后手测五个命令的首条提示词，并手测 `/C` 带文件、空参各一次。

## 回滚

删除五处角色句、`/C` 的 COMMANDS 项、submit 分支、`checkPrompt`/`startCheck`、配置字段与相关测试，恢复 D/G 的 TODO 正则与附件判断；无数据迁移。

## 改动记录

- 2026-11-23 11:55:16 合并原 `PLAN-prompt-role-prefix.md` 与 `PLAN-c-check-command.md`：角色定位 + `/C`，统一版本 0.5.0。
- 2026-11-23 11:55:41 自检补充：`/C` 的只读与授权是提示词约束，硬拦仍只对 `V：` 标题生效。
- 2026-11-23 12:56:00 实施完成：角色句、`/D` 分流说明、`/C` 命令与 `checkPromptFile`、附件白名单、TODO 前缀、测试与文档全部落地；`npm test` 78/78 通过。实施偏差：`/C` 的只读拒绝同时覆盖 `TODO：V：`、`TODO: V：`（`TODO V：` 不在 context-guard 的核验态内，不拦）；`/C` 提示词第 1 条把「核对收到的信息」并入「先查证」，编号仍为 4 条。
