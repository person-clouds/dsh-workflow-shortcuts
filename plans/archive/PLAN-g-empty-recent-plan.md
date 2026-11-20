---
audience: human
status: current
implementation_status: done
---

# PLAN：/G 空参数自动查找最近计划文档

## 目标

`/G` 空回车时，从当前会话最近 N 条用户/助手消息中查找计划文档：

- 命中 1 个：校验通过后直接新建会话执行。
- 命中多个：弹框选择；取消则不新建会话。
- 未命中或文件不可读：返回明确错误，不新建会话。
- N 可配置，默认 5。
- 计划路径只接受 `.md`，支持裸路径、引号/反引号、Markdown 链接。

同时要求 `/D` 生成的计划在回复末尾用绝对路径 Markdown 链接输出，确保右侧文档预览可点击打开。

## 范围

- 只改 Client 与文档、测试；不改 Host。
- `/G` 原有显式参数行为保持不变；`/D` 只增加输出格式要求。
- 不做设置页，配置使用浏览器 `localStorage`。

## 改动位置

- `client.js`
- `tests/client.test.mjs`
- `README.md`
- `README.en.md`
- `STATUS.md`

## 实施步骤

1. 在 `client.js` 增加配置读取：
   - key：`dsh-workflow-shortcuts.recentMessages`
   - 默认 `5`，合法范围 `1–50`，非法值回退 5。
2. 扩展 `findPlanReference` / `looksLikePlanPath`：
   - 只接受 `.md`；
   - 支持裸路径、引号/反引号、Markdown 链接 `[标题](/abs/path/PLAN-x.md)`；
   - 拒绝 `http(s)` 链接。
3. 新增最近消息读取：
   - 通过 `sessions.using(sessionId, ...)` 读取 `reference.binding.eventSource.getSnapshot().entries`；
   - 只取 `user/message` 与 `assistant/message`，排除 system/developer/tool；
   - 从新到旧取 N 条，提取文本。
4. 新增计划候选收集：
   - 按消息从新到旧匹配计划路径；
   - 按规范化绝对路径去重；
   - 用 `remote.workspaceFiles.read(sessionId, path, { offset: 1, limit: 1 })` 严格校验可读；
   - 不可读的候选不进入选择列表。
5. 修改 `startExecution`：
   - 参数非空：走现有 `parseExecutionRequest`；
   - 参数为空：调用候选收集；0 个抛出「最近 N 条消息未找到可读的 .md 计划文档」；1 个直接执行；多个调用选择弹框。
6. 新增 `choosePlan(candidates)`：
   - 使用原生 `<dialog>` 展示计划名、绝对路径、来源消息序号；
   - 点击候选返回该路径，取消/关闭返回 `undefined`，不创建会话。
7. 更新 `discussionPrompt`：要求计划路径为 `.md` 绝对路径，并在末尾输出可点击 Markdown 链接。
8. 更新中英文 README 与 STATUS：说明空 `/G`、多选弹框、配置 key 和 `/D` 链接要求。
9. 更新测试 harness：
   - 为 session fake 增加 `binding.eventSource.getSnapshot()`；
   - 为沙箱增加 `localStorage` 和 `document` 的最小假实现；
   - 覆盖默认值/自定义值/非法值、命中 1 个、多个选择、取消、未命中、不可读、Markdown 链接、排除工具消息和数量上限。

## 验收

- `npm test` 全部通过。
- `client.js` 通过 `vm.Script` 解析。
- 单元测试确认：
  - 空 `/G` 能读取配置条数并从最近消息命中计划；
  - 多个候选只弹一次选择框，选中后执行对应路径；
  - 取消、未命中、文件不可读均不创建新会话；
  - `/D` 提示词包含 `.md` 绝对路径 Markdown 链接要求。
- 浏览器实测由用户完成：`/G` 空回车单选直达、多选弹框、无命中报错。

## 回滚

- Git 回滚该次提交：`git revert <commit>`。
- 无数据迁移；localStorage key 可保留，不影响旧版本。
