---
audience: shared
status: current
---

# SPEC：dsh-workflow-shortcuts

## 目标

为 DSH Web 提供 `/D`、`/G`、`/V`、`/ok` 四个快捷命令，把「先讨论、再落计划、开新会话实施、再新建只读核验会话」固定成可重复的工作流，降低长上下文消耗；`/ok` 负责清除会话标题上的 `TODO` 标记。

## 用户

- 习惯先讨论方案再实施、需要把讨论与实施拆到不同会话的 DSH 用户；
- 用 `PLAN-*.md` 作为实施契约的仓库维护者。

## 范围

- `/D [任务]`：当前会话进入讨论阶段，不改文件；会话名改为 `D: <任务摘要>`；讨论收敛后写 `PLAN-*.md`；
- `/G <计划文档路径 | 任务描述>`：在当前工作区新建会话处理；留空时从最近消息自动查找计划文档；
- `/V [改动说明 | 快照 sha]`：在当前工作区新建只读核验会话，标题 `V：<摘要>`；提示词要求按 `change-verify` 步骤核验、最多两轮、只报告不改；含 `快照：<sha>` 供 `context-guard` 派单去重；
- Host 监听 `session/event`：助手消息命中「需要你执行」隐藏标记时，把当前会话标题改为 `TODO：<原标题>`（原标题以 `/D`、`/G` 等命令前缀开头时用 `TODO <原标题>`）；子代理消息不触发，已带前缀的标题保持幂等；
- `/ok`：只清除当前会话标题开头的一个 `TODO` 前缀，不修改会话内容、不归档会话；
- Client UI bundle 承载命令与交互，Host 侧只声明可选配置并注入浏览器全局。

## 非目标

- 不修改仓库文件、不自动提交或推送；
- 不自动归档会话；`/ok` 只改标题，不删除或恢复会话；
- 不实现完整任务编排、不替代 DSH 原生会话管理；
- 不做多工作区批处理。

## 接口

- `package.json`：`dsh.bundle.patch` → `cordis.patch.yml` 插入 `id: dsh-workflow-shortcuts`；`dsh.client.platform=web`，`immediately: true`；
- 入口：`index.js`（Host `Config` 与全局配置注入）、`client.js`（命令注册、配置读取与提示词）；
- 配置：
  - `workflowDoc`：工作流/授权规范文档路径，默认 `""`；
  - `planDoc`：计划文档规范路径，默认 `""`；
  - `planTemplate`：计划模板路径，默认 `""`；
  - `discussionPromptFile`：`/D` 附加要求文件，默认 `.dsh/workflow-shortcuts/discussion.md`；
  - `executionPromptFile`：`/G` 附加要求文件，默认 `.dsh/workflow-shortcuts/execution.md`；
  - `verifyPromptFile`：`/V` 附加要求文件，默认 `.dsh/workflow-shortcuts/verify.md`。
- Host 监听 `webserver/index-inject`，向页面注入 `kind: "global"`、`name: "__DSH_WORKFLOW_SHORTCUTS_CONFIG__"` 的对象，只含清洗后的上述六个字段；
- Client 在每次 `/D`、`/G`、`/V` 提交时读取该全局对象；空值、空白、非字符串按未配置处理；前三项均未配置时提示词只要求按当前工作区/仓库既有规范写 `PLAN-*.md`；
- 附加要求文件：相对路径基于当前会话工作目录，`none`/`off`/`-` 表示关闭；每次提交读取 `remote.workspaceFiles.read(sessionId, path, { offset: 1, limit: 200 })`，只接受 `ok === true` 的文本；缺失、不可读或空白时静默跳过；内容去首尾空白，超过 8000 字符截断并注明；非空时以「附加要求：」段落追加（`/D` 在 `任务：` 之前，`/G`、`/V` 在末尾）；
- Host 通过 `sessions` 服务读取会话标题投影并调用 `rename`，只改标题，不写会话内容；
- 命令：`/D`、`/G`、`/V`、`/ok`，行为与提示词见 `README.md`；`/V` 的只读与预算上限由 `dsh-context-guard` 的核验态按 `V：`/`TODO：V：` 标题强制，本插件只提供流程与提示词。

## 运行方式

```bash
dsh plugin --profile web add link:/home/zh/www/dsh-workflow-shortcuts
# 重启 dsh web 后，命令面板出现 /D、/G、/V 与 /ok
```

## 验收命令

```bash
npm test
```

## 约束

- 中文文档与注释；英文版同步维护 `README.en.md`；
- 发布流程见 `PUBLISHING.md`（npm 包名 `dsh-workflow-shortcuts`）。
