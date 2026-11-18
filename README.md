---
audience: shared
status: current
---

# dsh-workflow-shortcuts

[中文](README.md) | [English](README.en.md)

DSH Web 快捷命令，配合「先讨论、再落计划、开新会话实施」的工作流使用。

- `/D [任务]`：在当前会话进入讨论阶段，不修改文件；会话名统一改为 `D: <任务摘要>`，讨论收敛后把方案写成 `PLAN-*.md`。
- `/G [计划文档路径 | 任务描述]`：按计划文档或直接输入的文字创建一个全新的处理会话；留空时从最近消息自动查找计划文档。

这样可以把需求讨论与代码实施拆到两个上下文中，避免实施会话反复携带讨论过程，降低长上下文消耗。

## 命令

| 命令 | 作用 |
| --- | --- |
| `/D [任务]` | 在当前会话进入讨论阶段；会话名改为 `D: <任务摘要>`，不修改文件，收敛后把方案写成 `PLAN-*.md`。 |
| `/G <计划路径>` | 在当前工作区创建一个全新会话，标题为「G：<计划文档标题>」，按计划文档开始实施。 |
| `/G <任务描述>` | 按输入文字在当前工作区创建一个全新会话，标题为「G：<任务摘要>」，并开始处理该任务。 |
| `/G` | 留空回车时从当前会话最近 N 条用户/助手消息中查找 `.md` 计划文档：命中 1 个直接执行，命中多个弹框选择，取消或未命中不创建会话。 |

`/G` 的计划路径可以是绝对路径，也可以相对当前会话工作目录；支持裸路径、引号/反引号路径和 Markdown 链接，计划文件只接受 `.md`，`http(s)` 链接会被拒绝。

`/D` 提示词固定为 3 条短要点：先讨论澄清且未明确要求前不改文件；收敛后写 `PLAN-*.md`，首个 H1 固定为 `# PLAN：<简短标题>`（全角冒号），回复末尾附显示相对路径、地址为绝对全路径的 Markdown 链接；计划短而可执行，简单且改动位置明确的点直接顺手完成并同步 README、STATUS、PROJECT_INDEX。

计划模式识别规则：输入中包含带目录的 `.md` 路径，或文件名以 `PLAN-`/`plan-` 开头时，按计划文档处理；其余非空输入按任务文字处理。计划路径后可以继续追加补充要求，例如 `/G task/foo/PLAN-foo.md 只改后端并补测试`。

空 `/G` 的搜索条数可通过浏览器 `localStorage` 配置：key 为 `dsh-workflow-shortcuts.recentMessages`，默认 `5`，合法范围 `1–50`，非法值回退 `5`。只读取 `user/message` 与 `assistant/message`，并从新到旧查找。

计划模式的会话标题读取计划文档开头 40 行：优先第一个 H1，没有 H1 时取第一个 H2，忽略代码围栏内的标题；开头 `PLAN` / `计划` 前缀（大小写不敏感）及其后的连续分隔符（空白、`：`、`:`、`、`、`·`、`｜`、`|`、`—`、`–`、`-`、`_`）会被去掉，`Planning` 等普通单词不受影响。读取失败、没有标题或清洗后为空时回退为计划文件名，不中断建会话。

## 安装

从 npm 安装：

```bash
dsh plugin --profile web add dsh-workflow-shortcuts
```

也可以从 GitHub Release 的预构建 tarball 安装：

```bash
dsh plugin --profile web add https://github.com/person-clouds/dsh-workflow-shortcuts/releases/latest/download/dsh-workflow-shortcuts.tgz
```

开发目录可用本地链接安装：

```bash
dsh plugin --profile web add link:/path/to/dsh-workflow-shortcuts
```

重启 `dsh-web.service` 后刷新页面。只有 Client 代码，通常刷新页面即可生效。

如果当前 AI 沙箱对 `~/.dsh` 只读，请在宿主机执行安装脚本：

```bash
bash dsh-workflow-shortcuts/scripts/apply-profile.sh web
```

脚本会：建立本地软链并登记 `package.json` 依赖、备份并插入 `cordis.patch.yml`、重启 `dsh-web.service`（若存在）。

## 使用

1. 在当前会话输入 `/D`，选择「讨论」后输入任务描述并回车。
2. Agent 先讨论澄清，收敛后生成计划文档，并在回复末尾输出 Markdown 链接：显示名用相对路径，地址用绝对全路径，例如 `[personalCloud/task/foo/PLAN-foo.md](/home/zh/www/personalCloud/task/foo/PLAN-foo.md)`。
3. 直接输入 `/G <计划路径>`、`/G <任务描述>`，或留空输入 `/G` 自动查找最近计划；插件会创建新会话、重命名并发送对应的执行提示词。

`/G` 会把当前会话的工作目录作为新会话的工作区；工作区未登记时会自动登记。执行提示词固定为 3 条短要点：先读工作区 `AGENTS.md`；计划模式直接按计划文档执行、文字模式按 `任务：` 实施；完成后按 `AGENTS.md` 验证并收尾。

## 安全边界

- 只注册 Client 侧 `/` 输入源，不新增公网端口、不新增 Host API。
- `/D` 发送讨论提示词；Agent 在讨论/调研中发现简单且改动位置明确的功能点时，可按提示直接顺手完成，但必须同步 README、STATUS、PROJECT_INDEX 等文档与状态；复杂改动仍先出计划并等待确认。
- `/G` 只解析输入并构造提示词；计划模式仅读取计划文档开头 40 行用于生成标题，读取失败时回退文件名；空 `/G` 会用 `remote.workspaceFiles.read` 校验候选是否可读，但不校验计划内容。
- 不读取凭据、不访问网络资源、不注入 HTML。

## 限制

- `/D`、`/G` 仅对 DSH Web 客户端生效；终端/API 仍用普通提示词或 Host 命令。
- `/G` 复用当前会话所在工作区；当前目录未登记为工作区时会先自动登记。
- 文字模式只依据 `/G` 后的输入创建任务上下文，不会自动携带当前会话的讨论历史。
- 插件依赖 DSH Client 的 `inputTriggers`、`sessions`、`workspaces`、`uiWorkspace`、`remote.workspaceFiles` 服务；DSH 升级后若接口变化需要同步适配。

## 开发与测试

```bash
npm test
node -e "new (require('vm').Script)(require('fs').readFileSync('client.js','utf8'))"
npm pack --dry-run
```

测试使用 Node 内置 `node:test` 和 `vm`，不依赖浏览器或外部服务。

## 发布

见 [PUBLISHING.md](PUBLISHING.md)。市场条目草稿见 [market/person-clouds__dsh-workflow-shortcuts.yml](market/person-clouds__dsh-workflow-shortcuts.yml)。

## 许可证

[MIT](LICENSE)
