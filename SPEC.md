---
audience: shared
status: current
---

# SPEC：dsh-workflow-shortcuts

## 目标

为 DSH Web 提供 `/D`、`/G`、`/V`、`/VP`、`/ok` 五个快捷命令，把「先讨论、再落计划、开新会话实施、再新建只读核验会话」固定成可重复的工作流，降低长上下文消耗；`/V` 核实施结果，`/VP` 审计划文档，`/ok` 清除会话标题上的 `TODO` 标记。

## 用户

- 习惯先讨论方案再实施、需要把讨论与实施拆到不同会话的 DSH 用户；
- 用 `PLAN-*.md` 作为实施契约的仓库维护者。

## 范围

- `/D [任务]`：当前会话进入讨论阶段，不改文件；会话名改为 `D: <任务摘要>`；讨论收敛后写 `PLAN-*.md`；输入框里的附件随讨论提示词一起发送，图片按字节、文件按当前会话上传回执转发；
- `/G <计划文档路径 | 任务描述>`：在当前工作区新建会话处理；留空时从最近消息自动查找计划文档；附件只接受图片并随新会话首条提示词发送，出现文件附件时报错且不创建会话；
- `/V [改动说明 | 快照 sha]`：在当前工作区新建只读核验会话，标题 `V：<摘要>`；提示词要求按 `change-verify` 步骤核验、默认 1 轮（派单 prompt 写 `verify-again` 才加 1 轮）、只报告不改；含 `快照：<sha>` 供 `context-guard` 派单去重；附件只接受图片并随首条提示词发送，出现文件附件时报错且不创建会话；
- `/VP [计划文档路径 | 核验重点]`：在当前工作区新建只读计划核验会话，标题 `V：计划：<计划标题>`；显式参数必须命中计划路径，否则报用法错误；空参从当前会话最近 5 条用户/助手消息里找可读 `.md` 计划——1 个直接用、多个弹「选择要核验的计划文档」、取消不建会话、0 个报错；提示词只带计划文件路径与核验重点，不粘贴计划正文或原消息摘录；按 `plan-verify` 技能审查，不写可参与去重的 `快照：<sha>` 键（输入里的快照文本替换为 `快照：<已省略>`），同一计划可反复审，不参与派单去重；附件只接受图片并随首条提示词发送，出现文件附件时报错且不创建会话；
- 内置技能：随包提供 `skills/change-verify/SKILL.md`（从 agent-skills 迁入，唯一源）与 `skills/plan-verify/SKILL.md`，Host 启动时注册为 `source: 'bundled'`、`provider: 'dsh-workflow-shortcuts'`；
- Host 监听 `session/event`：助手消息命中「需要你执行」隐藏标记时，把当前会话标题改为 `TODO：<原标题>`（原标题以 `/D`、`/G` 等命令前缀开头时用 `TODO <原标题>`）；子代理消息不触发，已带前缀的标题保持幂等；
- `/ok`：只清除当前会话标题开头的一个 `TODO` 前缀，不修改会话内容、不归档会话；
- Client UI bundle 承载命令与交互，Host 侧只声明可选配置并注入浏览器全局。

## 非目标

- 不修改仓库文件、不自动提交或推送；
- 不自动归档会话；`/ok` 只改标题，不删除或恢复会话；
- 不实现完整任务编排、不替代 DSH 原生会话管理；
- 不跨会话转发文件回执，不把附件内容拼进提示词文本，也不为新会话命令暂存文件；
- 不做多工作区批处理。

## 接口

- `package.json`：`dsh.bundle.patch` → `cordis.patch.yml` 插入 `id: dsh-workflow-shortcuts`；`dsh.client.platform=web`，`immediately: true`；
- 入口：`index.js`（Host `Config`、全局配置注入与技能注册）、`lib/bundled-skills.js`（读取并解析随包技能）、`client.js`（命令注册、配置读取与提示词）；
- 配置：
  - `workflowDoc`：工作流/授权规范文档路径，默认 `""`；
  - `planDoc`：计划文档规范路径，默认 `""`；
  - `planTemplate`：计划模板路径，默认 `""`；
  - `discussionPromptFile`：`/D` 附加要求文件，默认 `.dsh/workflow-shortcuts/discussion.md`；
  - `executionPromptFile`：`/G` 附加要求文件，默认 `.dsh/workflow-shortcuts/execution.md`；
  - `verifyPromptFile`：`/V`、`/VP` 附加要求文件，默认 `.dsh/workflow-shortcuts/verify.md`。
- Host 监听 `webserver/index-inject`，向页面注入 `kind: "global"`、`name: "__DSH_WORKFLOW_SHORTCUTS_CONFIG__"` 的对象，只含清洗后的上述六个字段；
- Client 在每次 `/D`、`/G`、`/V`、`/VP` 提交时读取该全局对象；空值、空白、非字符串按未配置处理；前三项均未配置时提示词只要求按当前工作区/仓库既有规范写 `PLAN-*.md`；
- 附加要求文件：相对路径基于当前会话工作目录，`none`/`off`/`-` 表示关闭；每次提交读取 `remote.workspaceFiles.read(sessionId, path, { offset: 1, limit: 200 })`，只接受 `ok === true` 的文本；缺失、不可读或空白时静默跳过；内容去首尾空白，超过 8000 字符截断并注明；非空时以「附加要求：」段落追加（`/D` 在 `任务：` 之前，`/G`、`/V`、`/VP` 在末尾）；
- Host 通过 `sessions` 服务读取会话标题投影并调用 `rename`，只改标题，不写会话内容；
- 命令：`/D`、`/G`、`/V`、`/VP`、`/ok`，行为与提示词见 `README.md`；四个命令的 claim 声明 `attachments: true`，`/D` 转发全部附件，`/G`、`/V`、`/VP` 只保留图片并拒绝文件，拒绝文案统一说明「文件回执只对当前会话有效」；附件与文本按 composer 原生顺序（附件在前、文本在后）组成提示词内容；`/ok` 不声明附件支持，行为不变；`/V` 标题 `V：<摘要>`、`/VP` 标题 `V：计划：<计划标题>`，两者的只读与预算上限都由 `dsh-context-guard` 的核验态按 `V：`/`TODO：V：` 标题强制，本插件只提供流程与提示词；
- 最低配套版本：`@fenghoer/dsh-context-guard` ≥ `0.5.0`；只装本插件时只有提示词约束，没有真正的只读与预算硬拦。

## 技能

- 随包文件：`skills/change-verify/SKILL.md`（实施核验，从 agent-skills 迁入，唯一源）、`skills/plan-verify/SKILL.md`（计划核验）；`package.json` 的 `files` 含 `skills`；
- `lib/bundled-skills.js` 读取带 YAML frontmatter 的 `SKILL.md`，解析出 `name`、`description`、`whenToUse`、`content`、`path`；单个文件缺失、格式错误或 `name` 与目录名不一致时跳过，不抛错；
- `index.js` 在 `ctx.inject(['skills'])` 就绪后逐个 `skills.register({ ...skill, source: 'bundled', provider: 'dsh-workflow-shortcuts' })`；无 skills 服务时静默跳过，单个技能注册抛错只告警，不阻塞插件启动与其它技能；
- 同名优先级：项目 `.dsh/skills`（rank 100）> 插件运行时注册（250）> 用户 `~/.dsh/skills`（400）；插件版会覆盖用户目录旧副本；
- 运行时注册是启动快照：改 `SKILL.md` 后需重启 `dsh web` 才生效，与文件系统技能热更新不同。

## 运行方式

```bash
dsh plugin --profile web add link:/home/zh/www/dsh-workflow-shortcuts
# 重启 dsh web 后，命令面板出现 /D、/G、/V、/VP 与 /ok
```

## 验收命令

```bash
npm test
```

## 约束

- 中文文档与注释；英文版同步维护 `README.en.md`；
- 当前版本 `0.5.0`（命令集 `/D`、`/G`、`/V`、`/VP`、`/ok`；`0.4.0` 与 `0.5.0` 均未发布，发布状态见 `STATUS.md`）；
- 发布流程见 `PUBLISHING.md`（npm 包名 `dsh-workflow-shortcuts`）。
