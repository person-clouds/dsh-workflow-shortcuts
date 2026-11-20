# STATUS — dsh-workflow-shortcuts

- 更新时间：2026-11-20（发布 v0.2.0）
- 版本：`0.2.0`（GitHub Release `v0.2.0` 已发布；npm `0.2.0` 已提交但被暂存（staged）待批准，`latest` 仍为 `0.1.0`）
- 一句话：DSH Web 工作流快捷命令 `/D` 讨论并落成计划文档，`/G` 按计划文档或输入文字新建会话处理。
- 公开仓库：<https://github.com/person-clouds/dsh-workflow-shortcuts>
- 发布入口：[PUBLISHING.md](PUBLISHING.md)、[market 条目](market/person-clouds__dsh-workflow-shortcuts.yml)

## 2026-11-19 最新：/D 规范文档改为 Host 配置

- [x] Host `index.js` 新增 `Config`：`workflowDoc`、`planDoc`、`planTemplate`，默认均为空字符串；
- [x] Host 监听 `webserver/index-inject`，向页面注入 `__DSH_WORKFLOW_SHORTCUTS_CONFIG__`，值只含清洗后的三个字段；
- [x] Client 每次 `/D` 提交时读取当前全局配置；空值/空白/非字符串视为未配置；
- [x] `/D` 第 2 条只引用已配置规范；三项均未配置时改为「按当前工作区/仓库既有规范写 PLAN-*.md。」；
- [x] 移除 `/D` 代码中硬编码的计划落点、frontmatter、H1 与 `## 改动记录` 约束；`/G` 提示词与行为不变；
- [x] 新增 Host 测试，覆盖默认值、字段清洗与全局注入；Client 测试覆盖空/单项/三项/空白/非字符串与热更新；
- [x] `npm test` 23/23 通过，`scripts/check.sh --repo dsh-workflow-shortcuts` 通过。

## 2026-11-19：/D 提示词进一步精简

- [x] 3 条要点压缩为短句，仍保留授权与只读、计划落点、frontmatter、H1、`## 改动记录`、Markdown 链接、顺手完成与收尾同步；
- [x] 测试断言同步更新，仍检查 3 条编号要点。

## 2026-11-19 最新：/D 提示词补齐计划规范与授权前置

- [x] `/D` 第 1 条补「只调查不改文件、先读工作区根 AGENTS/PROJECT_INDEX 与目标仓规范、确认目标仓和写权限、方案等确认」；
- [x] `/D` 第 2 条补计划落点（单仓放目标仓、跨仓放工作区 `doc/plans/`）、frontmatter 三字段、`## 改动记录`，链接显示名改为相对工作区根；
- [x] `/D` 第 3 条改为简单已定位改动可直接完成，收尾按仓库 AGENTS 验证，文档同步限「存在时」；
- [x] 测试改为断言上述关键约束，仍保持 3 条要点；
- [x] 对齐 `/home/zh/www/doc/specs/task-workflow.md` 的计划规范；`/G` 行为与提示词未变。

## 2026-11-18 最新：/D、/G 提示词精简为 3 条

- [x] `/D` 提示词缩为 3 条：先讨论澄清、写计划并给绝对路径链接、计划短而可执行且简单已定位改动顺手完成并同步文档；
- [x] `/G` 执行提示词缩为 3 条：工作区与 AGENTS.md、计划/文字模式执行、完成后验证收尾；
- [x] `/G` 选计划、创建并打开会话、计划/文字标题生成等行为不变；
- [x] 测试改为断言 3 条核心要点，不再依赖长句逐字匹配。

## 已完成

- [x] `/G` 计划/文字模式新会话标题统一为 `G：<标题>`，与 `/D` 的 `D: <摘要>` 对应；

- [x] Client 侧 `/` 输入源：候选、空格、回车与命令 chip 恢复；
- [x] `/D` 发送讨论提示词，要求不修改文件并落成 `PLAN-*.md`；
- [x] `/D` 将会话名统一改为 `D: <任务摘要>`，空任务使用 `D: 新讨论`，便于识别讨论阶段；
- [x] `/D` 提示词要求计划短而可执行；计划文档首个 H1 固定为 `# PLAN：<简短标题>`（全角冒号），最终回复链接显示名用相对路径、URL 用绝对全路径；
- [x] `/D` 允许讨论/调研中顺手完成简单且已定位的改动，但要求同步 README、STATUS、PROJECT_INDEX 等文档与状态；复杂改动仍先出计划并等待确认；
- [x] `/G` 空参数从最近 N 条用户/助手消息查找可读 `.md` 计划：兼容真实事件快照包装形态与旧扁平形态，单选直达、多选弹框、取消/未命中不建会话；
- [x] `/G` 最近消息条数支持 `localStorage` 配置 `dsh-workflow-shortcuts.recentMessages`（默认 5，范围 1–50）；
- [x] `/G` 计划引用支持裸路径、引号/反引号、Markdown 链接，只接受 `.md` 并拒绝 `http(s)`；
- [x] `/G` 支持计划模式：解析绝对/相对计划路径，自动登记工作区、创建并打开新会话；
- [x] `/G` 支持文字模式：无计划路径时把输入作为独立任务，创建并打开新会话；
- [x] `/G` 新会话按输入生成「G：<计划文档标题>」或「G：<摘要>」标题并发送对应提示词；
- [x] `/G` 计划模式读取计划开头取 H1/H2 作为标题，大小写不敏感地去掉 `PLAN` / `计划` 前缀及其后连续分隔符（空白、`：`、`:`、`、`、`·`、`｜`、`|`、`—`、`–`、`-`、`_`），`Planning` 不误伤；读取失败或清洗为空时回退文件名；
- [x] `/G` 提示词精简为 3 条：先读 `AGENTS.md`、按计划/文字执行、完成后验证收尾；
- [x] `/G` 计划模式提示词要求不再讨论方案或逐项复核路径，直接按已验证路径的计划文档执行；
- [x] 中文 README 优先展示，补充英文 `README.en.md`；
- [x] MIT LICENSE、PUBLISHING.md 与市场条目草稿；
- [x] `scripts/apply-profile.sh` 支持从脚本位置推导插件目录，不再写死本机路径；
- [x] 单元测试 23/23 通过，`client.js` 可通过普通脚本解析，`npm pack` 通过；
- [x] `/D` 计划规范文档路径改为 DSH profile 可配置，代码不再硬编码具体规范；
- [x] npm `dsh-workflow-shortcuts@0.1.0` 已发布；
- [x] GitHub Release `v0.1.0` 已发布，资产名 `dsh-workflow-shortcuts.tgz`；
- [x] GitHub Release `v0.2.0` 已发布，资产名 `dsh-workflow-shortcuts.tgz`（20925 字节）；
- [x] awesome-dsh-plugin PR #15389 已合并。

## 待办

| # | 事项 | 说明 |
|---|---|---|
| 1 | 宿主机安装验收 | 执行 `bash dsh-workflow-shortcuts/scripts/apply-profile.sh web`，浏览器验证 `/D` 与 `/G` 的真实交互 |
| 2 | ~~市场 PR 合并~~ | #15389 已合并；市场按 `releases/latest` 自动取到 `v0.2.0` |
| 3 | npm 补发 `0.2.0` | 已被 npm 暂存（staged），待批准后生效；重发报 E409 |
| 4 | npm 占位版本清理 | `0.0.0-stage` 是 npm 首次发布时的临时占位，不影响 `latest`；后续按 npm 支持情况清理 |

## 验证记录

| 时间 | 项 | 结果 |
|---|---|---|
| 2026-11-14 | `npm test` | 3/3 通过 |
| 2026-11-15 | `npm test` | 5/5 通过（新增 /G 模式与 /D 精简计划断言） |
| 2026-11-17 | `npm test` | 9/9 通过（新增 H1、H2、计划前缀、读取失败回退断言） |
| 2026-11-17 | `npm test` | 13/13 通过（新增空 /G、配置、多选、取消、未命中、不可读、Markdown 链接、消息过滤断言） |
| 2026-11-17 | `npm test` | 14/14 通过（新增 `/D` 会话名 `D:` 前缀断言） |
| 2026-11-17 | `client.js` `vm.Script` 解析 | 通过 |
| 2026-11-17 | `npm pack --dry-run` | `dsh-workflow-shortcuts@0.2.0`，9 文件 |
| 2026-11-17 | 浏览器 `/G` 计划路径 | 新会话标题为「G：优化 /G 计划会话标题：读取计划文档标题」 |
| 2026-11-15 | `client.js` `vm.Script` 解析 | 通过 |
| 2026-11-15 | `npm pack --dry-run` | `dsh-workflow-shortcuts@0.1.0`，9 文件 |
| 2026-11-15 | npm Registry | `dsh-workflow-shortcuts@0.1.0` 可查询，`latest=0.1.0` |
| 2026-11-15 | GitHub Release `v0.1.0` | `latest/download/dsh-workflow-shortcuts.tgz` 返回 200，10128 字节 |
| 2026-11-15 | awesome-dsh-plugin PR | 已创建 #15389，等待仓库年龄门槛后的自动重跑 |
| 2026-11-17 | `npm test`（/D 顺手改规则） | 通过；断言提示词包含简单改动直接完成与文档/状态同步要求 |
| 2026-11-18 | `npm test`（真实事件包装形态） | 通过；覆盖 `/G` 从包装事件解析工作区相对路径与 `/D` 半路径 Markdown 链接 |
| 2026-11-18 | `npm test`（计划标题清理） | 17/17 通过；覆盖 `PLAN：`、`PLAN —`、`PLAN -`、`计划：`、连续分隔符、`Planning` 不误伤、纯 `PLAN` 回退文件名与 `/D` 新链接格式断言 |
| 2026-11-18 | `client.js` `vm.Script` 解析 | 通过 |
| 2026-11-18 | `npm pack --dry-run` | `dsh-workflow-shortcuts@0.2.0`，9 文件 |
| 2026-11-18 | `npm test`（/D /G 3 条提示词） | 17/17 通过；断言两条提示词均只有 3 条要点 |
| 2026-11-19 | `npm test`（/D 计划规范与授权前置） | 17/17 通过；断言 3 条要点含 AGENTS/写权限、PLAN 落点与 frontmatter、文档同步条件 |
| 2026-11-19 | `npm test`（/D 提示词进一步精简） | 17/17 通过；断言精简后的 3 条要点 |
| 2026-11-19 | `npm test`（/D 规范文档可配置） | 23/23 通过；覆盖 Host 默认值/清洗/注入与 Client 空/单项/三项配置 |
| 2026-11-19 | `./scripts/check.sh --repo dsh-workflow-shortcuts` | 通过 |
| 2026-11-20 | `npm test` | 23/23 通过（0.2.0 发布前回归） |
| 2026-11-20 | npm publish `0.2.0` | 已提交但被 npm 暂存（staged）；重发报 E409，`latest` 仍为 `0.1.0` |
| 2026-11-20 | GitHub Release `v0.2.0` | 资产 `dsh-workflow-shortcuts.tgz` 20925 字节，`latest/download` 返回 200 |
