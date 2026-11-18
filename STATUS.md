# STATUS — dsh-workflow-shortcuts

- 更新时间：2026-11-18
- 版本：`0.2.0`（本地开发中，尚未发布）
- 一句话：DSH Web 工作流快捷命令 `/D` 讨论并落成计划文档，`/G` 按计划文档或输入文字新建会话处理。
- 公开仓库：<https://github.com/person-clouds/dsh-workflow-shortcuts>
- 发布入口：[PUBLISHING.md](PUBLISHING.md)、[market 条目](market/person-clouds__dsh-workflow-shortcuts.yml)

## 已完成

- [x] Client 侧 `/` 输入源：候选、空格、回车与命令 chip 恢复；
- [x] `/D` 发送讨论提示词，要求不修改文件并落成 `PLAN-*.md`；
- [x] `/D` 将会话名统一改为 `D: <任务摘要>`，空任务使用 `D: 新讨论`，便于识别讨论阶段；
- [x] `/D` 提示词要求计划短而可执行，覆盖“短而可执行”“不要写成多层方案”；计划文档首个 H1 固定为 `# PLAN：<简短标题>`（全角冒号），最终回复链接显示名用相对当前目录半路径、URL 用绝对全路径；
- [x] `/D` 允许讨论/调研中顺手完成简单且已定位的改动，但要求同步 README、STATUS、PROJECT_INDEX 等文档与状态；复杂改动仍先出计划并等待确认；
- [x] `/G` 空参数从最近 N 条用户/助手消息查找可读 `.md` 计划：兼容真实事件快照包装形态与旧扁平形态，单选直达、多选弹框、取消/未命中不建会话；
- [x] `/G` 最近消息条数支持 `localStorage` 配置 `dsh-workflow-shortcuts.recentMessages`（默认 5，范围 1–50）；
- [x] `/G` 计划引用支持裸路径、引号/反引号、Markdown 链接，只接受 `.md` 并拒绝 `http(s)`；
- [x] `/G` 支持计划模式：解析绝对/相对计划路径，自动登记工作区、创建并打开新会话；
- [x] `/G` 支持文字模式：无计划路径时把输入作为独立任务，创建并打开新会话；
- [x] `/G` 新会话按输入生成「实施：<计划文档标题>」或「任务：<摘要>」标题并发送对应提示词；
- [x] `/G` 计划模式读取计划开头取 H1/H2 作为标题，大小写不敏感地去掉 `PLAN` / `计划` 前缀及其后连续分隔符（空白、`：`、`:`、`、`、`·`、`｜`、`|`、`—`、`–`、`-`、`_`），`Planning` 不误伤；读取失败或清洗为空时回退文件名；
- [x] `/G` 提示词精简为只要求先读 `AGENTS.md`，文档与代码按需查阅；
- [x] `/G` 计划模式提示词要求不再讨论方案或逐项复核路径，直接按已验证路径的计划文档执行；
- [x] 中文 README 优先展示，补充英文 `README.en.md`；
- [x] MIT LICENSE、PUBLISHING.md 与市场条目草稿；
- [x] `scripts/apply-profile.sh` 支持从脚本位置推导插件目录，不再写死本机路径；
- [x] 单元测试 17/17 通过，`client.js` 可通过普通脚本解析，`npm pack` 通过；
- [x] npm `dsh-workflow-shortcuts@0.1.0` 已发布；
- [x] GitHub Release `v0.1.0` 已发布，资产名 `dsh-workflow-shortcuts.tgz`；
- [x] awesome-dsh-plugin PR #15389 已提交。

## 待办

| # | 事项 | 说明 |
|---|---|---|
| 1 | 宿主机安装验收 | 执行 `bash dsh-workflow-shortcuts/scripts/apply-profile.sh web`，浏览器验证 `/D` 与 `/G` 的真实交互 |
| 2 | 市场 PR 合并 | 仓库创建满 1 天后由 awesome-dsh-plugin CI 重跑并通过审核 |
| 3 | npm 占位版本清理 | `0.0.0-stage` 是 npm 首次发布时的临时占位，不影响 `latest`；后续按 npm 支持情况清理 |

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
| 2026-11-17 | 浏览器 `/G` 计划路径 | 新会话标题为「实施：优化 /G 计划会话标题：读取计划文档标题」 |
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
