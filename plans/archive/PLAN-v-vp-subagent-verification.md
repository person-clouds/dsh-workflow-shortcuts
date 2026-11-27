---
implementation_status: done
created_at: 2026-11-23 13:00:00
updated_at: 2026-11-23 13:20:19
---

# PLAN：V/VP 子会话核验

## 目标

- `/V`、`/VP` 不再主动创建顶层会话。
- 已有内容的会话：由当前会话主 Agent 调用 `subagent` 工具开只读核验子会话，子会话只报告，结果汇总回主会话展示。
- 用户主动新开的空白会话：直接在该会话内处理，不再二次新建。

## 行为矩阵

| 当前会话 | 动作 |
| --- | --- |
| 非空、无 `V：` 标题、无附件 | 不改名、不 `sessions.create`、不 `openSession`；向当前会话发子会话核验提示词 |
| 空白（`summary.blank === true`） | 不新建；当前会话 `rename` 为 `V：…` / `V：计划：…` 并 `prompt` |
| 标题匹配 `^(?:TODO[：:]\s*)?V[：:]` | 直接报错，避免嵌套核验 |
| 非空且带图片/文件附件 | 报错，提示新开空白会话再带图核验 |

## 提示词设计

外层提示词要求主 Agent：

1. 调用 `subagent` 工具开一个子会话，`description` 用 `V：核验改动` 或 `V：计划核验`。
2. 子会话 `prompt` 使用原 `/V`、`/VP` 核验提示词全文。
3. 子会话只读：不改代码、不提交、不装依赖、不重启服务，只输出结论与问题清单。
4. 拿到子会话结果后，把结论与问题清单汇总在本会话展示，不继续实施。
5. 若当前 Agent 没有 `subagent` 工具，明确告知无法开子会话，不得自行在主会话核验。

## 改动清单

- `client.js`：`startVerification`、`startPlanVerification` 按行为矩阵分支；新增子会话提示词包装函数与空白会话判定辅助函数。
- `tests/client.test.mjs`：harness 增加 `blank` 选项（默认 `true`）；改写现有 V/VP 用例；新增非空会话不发 `create`、不改名、只发提示词的断言。
- `SPEC.md`、`README.md`、`README.en.md`、`STATUS.md`：同步 V/VP 不再主动开顶层会话的说明，英文版对齐。
- `package.json`：如 0.5.0 尚未发布，并入 0.5.0；已发布则升 0.6.0。

## 验收

- `npm test` 全绿，覆盖：非空会话、空白会话、V 标题拦截、非空带附件报错、`/VP` 计划路径与空参数选择。
- `/home/zh/www` 下 `./scripts/check.sh --repo dsh-workflow-shortcuts` 通过。
- GUI 手工验证：非空会话发 `/V` → 出现子会话卡片，报告回到主会话；新开空白会话发 `/V` → 标题变 `V：…` 且只读生效。

## 风险与边界

- 子会话没有 `V：` 标题，context-guard 的硬只读不生效，只读靠提示词约束；要硬保证需另改 guard 支持父会话继承。
- 主 Agent 是否调用 `subagent` 工具依赖模型执行，属提示词级约束。
- 非空会话不支持图片/文件核验，需用户新开空白会话。

## 回滚

- 直接 revert 本次提交即可；无数据迁移、无配置变更。


## 改动记录

- 2026-11-23：按计划完成。空白会话就地改名并发核验提示词；非空会话改为向主 Agent 发 `subagent` 派单提示词，不再 `sessions.create`、不再 `openSession`；新增 `V：`/`TODO：V：` 标题拦截与非空会话图片报错；文件附件沿用既有拒绝逻辑。
- `npm test` 82/82 通过；`SPEC.md`、`README.md`、`README.en.md`、`STATUS.md` 已同步；版本仍为 `0.5.0`（0.4.0 与 0.5.0 均未发布）。
