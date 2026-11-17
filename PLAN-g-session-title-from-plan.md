# 优化 /G 计划会话标题：读取计划文档标题

- 状态：已完成（2026-11-17）
- 日期：2026-11-17
- 决策：计划文件有 H1 用 H1，否则用第一个 H2，否则回退文件名；去掉 `计划：` / `PLAN：` / `PLAN:` 前缀
- 范围：仅 `task/dsh-workflow-shortcuts/`，不改 `/D`、不改任务文字模式、不改 Host API

## 目标

`/G <计划路径>` 新建会话时，标题从 `实施：<计划文件名>` 改为 `实施：<计划文档标题>`。

示例：`# 计划：归档会话标题缓存` → 会话名 `实施：归档会话标题缓存`。

## 改动位置

1. `client.js`
   - `inject` 增加 `remote`、`remote.workspaceFiles`。
   - 新增 `readPlanTitle(sessionId, planPath)`：用 `ctx.remote.workspaceFiles.read(sessionId, planPath, { offset: 1, limit: 40 })` 读取计划开头。
   - 按行匹配第一个 H1（`^#\s+...`），没有则匹配第一个 H2（`^##\s+...`）；忽略代码围栏内的标题行。
   - 去掉标题中的 `计划：`、`计划:`、`PLAN：`、`PLAN:` 前缀（大小写不敏感）。
   - 读取失败、无标题或清洗后为空时回退 `basename(planPath)`。
   - `executionTitle` 改为异步接收读取结果；仅计划模式使用，文字模式保持 `任务：<摘要>`。
2. `tests/client.test.mjs`
   - 测试 harness 增加 `remote.workspaceFiles.read` mock。
   - 新增用例：H1、无 H1 取 H2、去 `计划：` 前缀、读取失败回退文件名。
3. `README.md`、`README.en.md`、`STATUS.md`
   - 将「实施：<计划文件名>」更新为「实施：<计划文档标题>」，并说明降级规则。

## 实施步骤

1. 修改 `client.js` 的注入、标题读取与 `executionTitle` 调用链。
2. 更新 `tests/client.test.mjs`，覆盖 H1 / H2 / 前缀 / 读取失败四条路径。
3. 更新中文 README、英文 README、STATUS 的标题说明与验证记录。
4. 运行验证命令。

## 验收

```bash
cd task/dsh-workflow-shortcuts
npm test
node -e "new (require('vm').Script)(require('fs').readFileSync('client.js','utf8'))"
npm pack --dry-run
```

- 全部用例通过；H1 计划标题生成 `实施：归档会话标题缓存`。
- 无 H1 时取第一个 H2；无标题或读取失败时仍生成 `实施：<文件名>`，不中断建会话。
- 浏览器 `/G task/dsh-workflow-shortcuts/PLAN-g-session-title-from-plan.md` 验证新会话标题。

## 回滚

`git revert <实施提交>`；或恢复 `client.js`、测试与文档到实施前版本，刷新 DSH Web 客户端。
