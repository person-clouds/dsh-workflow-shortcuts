# PLAN：修复 `/G` 消息读取，并让 `/D` 输出工作区相对路径

## 目标

1. `/G` 直接回车时，能从最近 N 条真实会话消息中找到 `PLAN-*.md` 链接并新建实施会话。
2. `/D` 要求计划文档输出为相对当前工作区的半路径，例如 `[PLAN-foo.md](personalCloud/task/foo/PLAN-foo.md)`；复制失败时用户可手动复制该半路径。

## 范围

只改 `personalCloud/task/dsh-workflow-shortcuts`：

- `client.js`
- `tests/client.test.mjs`
- `README.md`、`README.en.md`、`STATUS.md`

右键“复制文件路径”失败属于 DSH 核心 `dsh-client-ui-open-in-app` 的剪贴板问题，本次不处理。

## 根因

真实 `eventSource.getSnapshot().entries` 中消息是：

```js
{ type: "event", event: { type: "assistant/message", data: { message: ... } } }
```

当前 `messageTextFromEntry` 先取 `entry.type` 得到 `"event"`，直接判定不是 `user/message` 或 `assistant/message`，导致所有真实消息被跳过。现有测试使用未包装的扁平消息对象，所以未暴露。

## 实施步骤

1. 在 `messageTextFromEntry` 中兼容两种形态：
   - 包装形态：`entry.event.type` / `entry.event.data`；
   - 扁平形态：`entry.type` / `entry.data`，保持旧测试与兼容性。
2. 修改 `discussionPrompt`：要求计划文档使用相对当前工作区的路径，并在回复末尾输出以该半路径为目标的 Markdown 链接；不再要求绝对路径。
3. 测试 helpers 增加真实包装形态，新增/调整用例：
   - 最近一条 `assistant/message` 文本末尾包含 `[PLAN-doc-audience-all-repos.md](PLAN-doc-audience-all-repos.md)`；
   - 空 `/G` 能解析该相对路径、按当前 `cwd` 解析为绝对路径、校验可读、创建会话并写入“实施：…”提示词；
   - `/D` 提示词包含“相对当前工作区”和半路径 Markdown 链接示例，不再包含“绝对路径”要求。
4. 同步 README、README.en.md、STATUS 中 `/D` 路径格式说明。
5. 运行 `npm test`；确认现有用例和新回归用例全部通过，`vm.Script` 解析通过。

## 验收

- 空 `/G` 在真实事件快照形态下命中 `.md` 链接并新建会话。
- `/G` 同时兼容绝对路径、相对路径和旧的扁平事件形态。
- `/D` 提示词要求并示例输出工作区相对半路径 Markdown 链接。
- 不修改 DSH 核心剪贴板代码。
- `npm test` 退出码 0。

## 回滚

`git revert <commit>`；无数据迁移、无配置变更。
