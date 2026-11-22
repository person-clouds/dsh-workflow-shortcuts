---
audience: shared
status: current
---

[中文](README.md) | [English](README.en.md)

# dsh-workflow-shortcuts

DSH Web 工作流快捷命令：`/D` 讨论并落计划，`/G` 按计划或文字新建会话，`/V` 新建只读核验会话，`/ok` 清除会话标题的 TODO 标记。

## 先说最要紧的

- `/D [任务]`：当前会话只讨论、不改文件，会话名改为 `D: <任务摘要>`，方案收敛后写 `PLAN-*.md`。
- `/G [计划路径 | 任务]`：新建独立会话去实施；留空时从最近消息里找计划文档，命中多个让你选。
- `/V [改动说明 | 快照 sha]`：新建只读核验会话（标题 `V：…`），只核行为是否生效、最多两轮、只报告不改；核验不过时以「需要你执行」收尾，主会话据此处理。
- `/ok`：只清掉当前会话标题的 `TODO` 前缀，不改内容、不归档；用于收尾。
- 助手回复带「需要你执行」小节时，Host 自动把会话标题标成 `TODO：<原标题>`，方便回头找没处理完的会话。
- 只对 DSH Web 客户端生效；终端/API 仍用普通提示词。

## 最短上手

```bash
dsh plugin --profile web add dsh-workflow-shortcuts
```

重启 `dsh web` 或刷新页面，在输入框依次使用：

```text
/D 把需求先讨论清楚
/G /home/zh/www/doc/plans/PLAN-foo.md
/V 核验 guard 改动 快照：abc1234
/ok
```

安装脚本、GitHub Release tarball、本地 link 三种方式见 [`PUBLISHING.md`](/home/zh/www/dsh-workflow-shortcuts/PUBLISHING.md)。

## 功能

1. **`/D` 讨论**：发送固定的 3 条提示词，要求先读 `PROJECT_INDEX`、只讨论不改文件、方案确认后写计划；会话名改为 `D: <任务摘要>`，空任务用 `D: 新讨论`。
2. **`/G` 计划模式**：输入带目录的 `.md` 路径，或文件名以 `PLAN-`/`plan-` 开头，按计划文档处理；仍可追加补充要求，例如 `/G task/foo/PLAN-foo.md 只改后端并补测试`。
3. **`/G` 文字模式**：其余非空输入当作独立任务，新建会话并发送执行提示词。
4. **`/G` 空参**：从当前会话最近 N 条用户/助手消息中查找可读 `.md` 计划；命中 1 个直接执行，多个弹框选择，取消或未命中不建会话。N 可用浏览器 `localStorage` 的 `dsh-workflow-shortcuts.recentMessages` 调整（默认 5，范围 1–50）。
5. **会话标题**：计划模式新会话标题取计划文档开头 40 行的 H1（无 H1 取 H2，忽略代码围栏），去掉 `PLAN`/`计划` 前缀与连续分隔符后拼成「G：<标题>」；读取失败回退文件名。
6. **TODO 标题与 `/ok`**：助手消息命中「需要你执行」隐藏标记时，Host 监听 `session/event` 把当前会话标题改为 `TODO：<原标题>`（原标题以 `/D`、`/G` 等命令前缀开头时用 `TODO <原标题>`）；已带前缀幂等，子代理消息不触发。`/ok` 只去掉开头一个前缀，不归档；没有标记时提示「当前没有 TODO 标记」。
7. **`/V` 核验**：新建会话并改名为 `V：<摘要>`，发送只读核验提示词：按 `change-verify` 步骤核验、最多两轮、只报告不改、结论与问题清单分开写；输入里带 `快照：<sha>` 时原样写进提示词，供 `context-guard` 做派单去重。核验预算（提醒/硬拒/单轮输出）与只读限制由 `dsh-context-guard` 按标题 `V：`/`TODO：V：` 强制，本插件不重复数字。
8. **提示词附加要求**：默认读取当前会话工作目录下 `.dsh/workflow-shortcuts/discussion.md`（追加到 `/D`）、`execution.md`（追加到 `/G`）和 `verify.md`（追加到 `/V`）；只改文件，下次输入即生效。

## 配置

三项规范文档路径与三个附加要求文件都可省略；空值按未配置处理：

```yaml
- id: dsh-workflow-shortcuts
  name: dsh-workflow-shortcuts
  config:
    workflowDoc: /home/zh/www/doc/specs/task-workflow.md
    planDoc: /home/zh/www/doc/specs/documentation-rules.md
    planTemplate: ""
    discussionPromptFile: .dsh/workflow-shortcuts/discussion.md
    executionPromptFile: .dsh/workflow-shortcuts/execution.md
    verifyPromptFile: .dsh/workflow-shortcuts/verify.md
```

- `workflowDoc` / `planDoc` / `planTemplate`：只把已配置项写进 `/D` 第 2 条；三项全空时只要求「按当前工作区/仓库既有规范写 PLAN-*.md」。
- `discussionPromptFile` / `executionPromptFile` / `verifyPromptFile`：相对路径基于当前会话工作目录，`none`/`off`/`-` 关闭；每次提交读取前 200 行，超过 8000 字符截断并注明。
- 改配置需重新加载 Host 配置并刷新页面；改附加要求文件内容不需要重启。

## 边界与限制

- 只注册 Client 侧 `/` 输入源，不新增公网端口、不新增 Host API（0.3.0 起 Host 只监听 `session/event` 改标题）。
- `/D` 只发讨论提示词，不改文件；`/G`、`/V` 只解析输入并构造提示词，计划模式仅读计划文档开头 40 行做标题，空 `/G` 校验候选可读性；`/V` 的只读实际由 `dsh-context-guard` 兜底，不能只依赖提示词。
- 不读取凭据、不访问网络资源、不注入 HTML。
- 会话依赖 DSH Client 的 `inputTriggers`、`sessions`、`workspaces`、`uiWorkspace`、`remote.workspaceFiles` 服务；DSH 升级后接口变化需要同步适配。

## 去哪看

- 状态与验收命令：[STATUS.md](/home/zh/www/dsh-workflow-shortcuts/STATUS.md)
- 目标、范围与接口：[SPEC.md](/home/zh/www/dsh-workflow-shortcuts/SPEC.md)
- 发布与市场 PR：[PUBLISHING.md](/home/zh/www/dsh-workflow-shortcuts/PUBLISHING.md)
- 市场条目：[market/person-clouds__dsh-workflow-shortcuts.yml](/home/zh/www/dsh-workflow-shortcuts/market/person-clouds__dsh-workflow-shortcuts.yml)
- 许可证：[MIT](LICENSE)
