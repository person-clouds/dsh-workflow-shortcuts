# dsh-workflow-shortcuts

[中文](README.md) | [English](README.en.md)

DSH Web 快捷命令，配合「先讨论、再落计划、开新会话实施」的工作流使用。

- `/D [任务]`：在当前会话进入讨论阶段，不修改文件；讨论收敛后把方案写成 `PLAN-*.md`。
- `/G <计划路径>`：按计划文档创建一个全新的实施会话，并把计划路径和验收要求发给它。

这样可以把需求讨论与代码实施拆到两个上下文中，避免实施会话反复携带讨论过程，降低长上下文消耗。

## 命令

| 命令 | 作用 |
| --- | --- |
| `/D [任务]` | 在当前会话进入讨论阶段；不修改文件，收敛后把方案写成 `PLAN-*.md`。 |
| `/G <计划路径>` | 在当前工作区创建一个全新会话，标题为「实施：<计划文件名>」，并把计划路径发给它开始实施。 |

`/G` 的计划路径可以是绝对路径，也可以相对当前会话工作目录。

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
bash task/dsh-workflow-shortcuts/scripts/apply-profile.sh web
```

脚本会：建立本地软链并登记 `package.json` 依赖、备份并插入 `cordis.patch.yml`、重启 `dsh-web.service`（若存在）。

## 使用

1. 在当前会话输入 `/D`，选择「讨论」后输入任务描述并回车。
2. Agent 进入讨论阶段，收敛后生成计划文档，并在回复末尾给出绝对路径。
3. 新开会话或直接输入 `/G <计划路径>`；插件会创建新会话、重命名并发送实施提示词。

`/G` 会把当前会话的工作目录作为新会话的工作区；工作区未登记时会自动登记。

## 安全边界

- 只注册 Client 侧 `/` 输入源，不新增公网端口、不新增 Host API。
- `/D` 只发送讨论提示词，不直接修改文件；是否写计划文档由 Agent 按提示执行。
- `/G` 只解析路径，不检查文件是否存在；路径不存在时由新会话的实施 Agent 报告。
- 不读取凭据、不访问网络资源、不注入 HTML。

## 限制

- `/D`、`/G` 仅对 DSH Web 客户端生效；终端/API 仍用普通提示词或 Host 命令。
- `/G` 复用当前会话所在工作区；当前目录未登记为工作区时会先自动登记。
- 插件依赖 DSH Client 的 `inputTriggers`、`sessions`、`workspaces`、`uiWorkspace` 服务；DSH 升级后若接口变化需要同步适配。

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
