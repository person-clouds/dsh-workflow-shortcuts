---
audience: shared
status: current
---

[中文](README.md) | [English](README.en.md)

# dsh-workflow-shortcuts

DSH Web 工作流快捷命令：`/D` 讨论并落计划，`/G` 按计划或文字新建会话，`/C` 在当前会话查问题并直接处理，`/V` 新建只读核验会话，`/VP` 新建只读计划核验会话，`/ok` 清除会话标题的 TODO 标记。`/V`、`/VP` 的只读与预算硬拦必须配套安装 `@fenghoer/dsh-context-guard` ≥ `0.5.0`；只装 shortcuts 只有提示词约束、没有真正硬拦。

## 先说最要紧的

- `/D [任务]`：当前会话只讨论、不改文件，会话名改为 `D: <任务摘要>`，方案收敛后写 `PLAN-*.md`；提示词会分流说明：bugfix、线上异常处理改用 `/C`；输入框里的图片和文件可一起提交，随讨论提示词发送。
- `/G [计划路径 | 任务]`：新建独立会话去实施；留空时从最近消息里找计划文档，命中多个让你选；可带图片，文件附件会报错（文件回执只对当前会话有效），请改用文件路径或 `/D`。
- `/C [问题描述 | 收到的信息]`：在当前会话查线上/生产异常、定位 bug、核对收到的信息并直接处理，标题改为 `C：<摘要>`，不新建会话；生产/共享环境只读诊断，重启、删改数据、改权限、装依赖、发布需明确授权，不写计划文档；可带图片和文件。只读核验会话（`V：…`）会拒绝 `/C`，避免改名绕过只读硬拦。
- `/V [改动说明 | 快照 sha]`：新建只读核验会话（标题 `V：…`），默认 1 个核验会话/1 轮、报告 ≤15 行、只核 diff + 验收命令 + 计划条目，只报告不改；高风险改动在派单 prompt 显式写 `verify-again` 才加 1 个会话/1 轮并须注明理由；核验不过时以「需要你执行」收尾，主会话据此处理；可带图片，文件附件同样报错。
- `/VP [计划路径 | 核验重点]`：新建只读计划核验会话（标题 `V：计划：…`），审计划的目标、事实、可执行性、验收、反例与安全；留空时从最近消息里找计划让你选；可带图片，文件附件同样报错。
- 两个核验技能都不自动触发：只有 `/V`、`/VP` 或你明确要求核验时才进入；提交前自检（测试、门禁、入口回放）由实施会话自己做。
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
/C 线上 502，帮我查一下
/V 核验 guard 改动 快照：abc1234
/VP /home/zh/www/doc/plans/PLAN-foo.md
/ok
```

安装脚本、GitHub Release tarball、本地 link 三种方式见 [`PUBLISHING.md`](/home/zh/www/dsh-workflow-shortcuts/PUBLISHING.md)。

## 功能

每个命令的首条提示词开头都有一句英文角色定位：`/D` 架构师、`/G` 开发专家、`/C` 问题处理专家、`/V` 测试专家、`/VP` 计划审查者，让模型先进入对应角色。

1. **`/D` 讨论**：发送固定的 4 条提示词（编号前有一条「只做内容探索与计划，bugfix/线上异常改用 `/C`」的分流说明），要求先读 `PROJECT_INDEX`、只讨论不改文件、方案确认后写计划，并在交付计划前按 `plan-verify` 自检事实、反例、安全与验收可判定（未核实标「待验证」）；会话名改为 `D: <任务摘要>`，空任务用 `D: 新讨论`。
2. **`/G` 计划模式**：输入带目录的 `.md` 路径，或文件名以 `PLAN-`/`plan-` 开头，按计划文档处理；仍可追加补充要求，例如 `/G task/foo/PLAN-foo.md 只改后端并补测试`。
3. **`/G` 文字模式**：其余非空输入当作独立任务，新建会话并发送执行提示词。
4. **`/G` 空参**：从当前会话最近 N 条用户/助手消息中查找可读 `.md` 计划；命中 1 个直接执行，多个弹框选择，取消或未命中不建会话。N 可用浏览器 `localStorage` 的 `dsh-workflow-shortcuts.recentMessages` 调整（默认 5，范围 1–50）。
5. **会话标题**：计划模式新会话标题取计划文档开头 40 行的 H1（无 H1 取 H2，忽略代码围栏），去掉 `PLAN`/`计划` 前缀与连续分隔符后拼成「G：<标题>」；读取失败回退文件名。
6. **TODO 标题与 `/ok`**：助手消息命中「需要你执行」隐藏标记时，Host 监听 `session/event` 把当前会话标题改为 `TODO：<原标题>`（原标题以 `/D`、`/G` 等命令前缀开头时用 `TODO <原标题>`）；已带前缀幂等，子代理消息不触发。`/ok` 只去掉开头一个前缀，不归档；没有标记时提示「当前没有 TODO 标记」。
7. **`/V` 实施核验**：新建会话并改名为 `V：<摘要>`，发送只读核验提示词：按 `change-verify` 步骤核验（默认 1 个会话/1 轮、报告 ≤15 行、只核 diff + 验收命令 + 计划条目、禁全仓翻查）、只报告不改、结论与问题清单分开写；高风险改动在派单 prompt 写 `verify-again` 才加 1 个会话/1 轮并须在提交说明写理由；输入里带 `快照：<sha>` 时原样写进提示词，供 `context-guard` 做派单去重。核验预算（提醒/硬拒/单轮输出）与只读限制由 `dsh-context-guard` 按标题 `V：`/`TODO：V：` 强制，本插件不重复数字。
8. **`/VP` 计划核验**：新建会话并改名为 `V：计划：<计划标题>`，发送只读计划核验提示词，引用内置 `plan-verify` 技能审查目标对齐、事实、可执行性、验收可判定、反例与安全；提示词**只带计划文件路径与核验重点**，不粘贴计划正文或原消息摘录（计划通常很长，粘贴既费 token 又和核验重点重复）。`/VP [计划文档路径 | 核验重点]` 的显式参数必须命中计划路径，否则报用法错误；空参数从当前会话最近 5 条用户/助手消息里找可读 `.md` 计划（可用 `localStorage` 的 `dsh-workflow-shortcuts.recentMessages` 调整），1 个直接使用、多个弹「选择要核验的计划文档」选择框、取消不建会话、0 个报错。提示词**不写可参与派单去重的 `快照：<sha>` 键**；输入里出现的快照文本会被替换为 `快照：<已省略>`，因此同一计划可反复审、不被派单去重拦截。
9. **提示词附加要求**：默认读取当前会话工作目录下 `.dsh/workflow-shortcuts/discussion.md`（追加到 `/D`）、`execution.md`（追加到 `/G`）和 `verify.md`（追加到 `/V`、`/VP`）；只改文件，下次输入即生效。
10. **内置技能**：随包携带 `skills/change-verify/SKILL.md`（从 agent-skills 迁入，唯一源）与 `skills/plan-verify/SKILL.md`；Host 启动时由 `lib/bundled-skills.js` 解析 frontmatter，经 `ctx.inject(['skills'])` 以 `source: 'bundled'`、`provider: 'dsh-workflow-shortcuts'` 注册。无 skills 服务或单个技能缺失时静默跳过，不阻塞插件启动；`package.json` 的 `files` 已含 `skills`。
11. **附件**：`/D`、`/C` 原样转发输入框里的全部附件（图片按字节、文件按当前会话上传回执）；`/G`、`/V`、`/VP` 只保留图片并随新会话首条提示词发送，出现文件附件时统一报错且不创建会话——DSH 的文件回执按接收会话解析，跨会话无效，报错会提示改用 `/D`、`/C`。附件与文本按原生 composer 顺序组成消息（附件在前、文本在后），不改会话标题、提示词正文、计划解析与工作区逻辑；`/ok` 不支持附件。
12. **`/C` 问题处理**：当前会话改名 `C：<摘要>`（空参 `C：查问题`）并发送 4 条提示词：先查证再下结论并核对收到的信息、小问题直接修、生产/共享环境只读诊断且高影响操作需授权、不写 `PLAN-*.md` 并报告验证方式；需要先出方案时交回 `/D`。只读与授权是提示词约束，不是硬拦；`V：`、`TODO：V：` 标题的只读核验会话会直接拒绝 `/C`，避免改名绕过 `context-guard` 只读硬拦。

## 配置

三项规范文档路径与四个附加要求文件都可省略；空值按未配置处理：

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
    checkPromptFile: .dsh/workflow-shortcuts/check.md
```

- `workflowDoc` / `planDoc` / `planTemplate`：只把已配置项写进 `/D` 第 2 条；三项全空时只要求「按当前工作区/仓库既有规范写 PLAN-*.md」。
- `discussionPromptFile` / `executionPromptFile` / `checkPromptFile` / `verifyPromptFile`：依次追加到 `/D`、`/G`、`/C`、`/V`、`/VP`；相对路径基于当前会话工作目录，`none`/`off`/`-` 关闭；每次提交读取前 200 行，超过 8000 字符截断并注明。
- 改配置需重新加载 Host 配置并刷新页面；改附加要求文件内容不需要重启。

## 边界与限制

- 只注册 Client 侧 `/` 输入源，不新增公网端口、不新增 Host API（Host 只监听 `session/event` 改标题，并向 skills 服务注册随包技能）。
- `/D` 只发讨论提示词，不改文件；`/C` 只在当前会话改名并发提示词，不改文件；`/G`、`/V`、`/VP` 只解析输入并构造提示词，计划模式仅读计划文档开头 40 行做标题，空 `/G`、`/VP` 校验候选可读性；`/V`、`/VP` 的只读实际由 `dsh-context-guard` 兜底，不能只依赖提示词。
- `V：` 会话的只读与预算硬拦依赖 `dsh-context-guard`；`/C` 自身不做硬拦，但会拒绝在 `V：` 标题下执行，避免改名绕过只读态。
- **必须配套安装**：`/V`、`/VP` 的只读与预算硬拦依赖 `@fenghoer/dsh-context-guard` ≥ `0.5.0`，按标题 `V：`/`TODO：V：` 生效。只装 shortcuts 时只有提示词约束，没有真正的只读与预算硬拦；只装 guard 时没有 `/V`、`/VP` 入口（手动把会话标题改成 `V：` 同样启用）。
- `/VP` 只审计划文本与它引用的事实，不执行计划里的验收命令，发现不了实现期才暴露的运行时缺陷；同一计划可反复审，重复审查会消耗核验预算。
- 技能同名优先级：项目 `.dsh/skills`（rank 100）> 插件运行时注册（250）> 用户 `~/.dsh/skills`（400），插件版会覆盖用户目录旧副本。运行时注册是启动快照，改 `SKILL.md` 后需重启 `dsh web` 才生效（与文件系统技能热更新不同）。
- 不读取凭据、不访问网络资源、不注入 HTML。
- 会话依赖 DSH Client 的 `inputTriggers`、`sessions`、`workspaces`、`uiWorkspace`、`remote.workspaceFiles` 服务；DSH 升级后接口变化需要同步适配。

## 去哪看

- 状态与验收命令：[STATUS.md](/home/zh/www/dsh-workflow-shortcuts/STATUS.md)
- 目标、范围与接口：[SPEC.md](/home/zh/www/dsh-workflow-shortcuts/SPEC.md)
- 发布与市场 PR：[PUBLISHING.md](/home/zh/www/dsh-workflow-shortcuts/PUBLISHING.md)
- 市场条目：[market/person-clouds__dsh-workflow-shortcuts.yml](/home/zh/www/dsh-workflow-shortcuts/market/person-clouds__dsh-workflow-shortcuts.yml)
- 许可证：[MIT](LICENSE)
