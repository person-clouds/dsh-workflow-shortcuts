# STATUS — dsh-workflow-shortcuts

- 更新时间：2026-11-15
- 版本：`0.1.0`
- 一句话：DSH Web 工作流快捷命令 `/D` 讨论并落成计划文档，`/G` 按计划新建实施会话。
- 位置：`task/dsh-workflow-shortcuts/`
- 发布入口：[PUBLISHING.md](PUBLISHING.md)、[market 条目](market/person-clouds__dsh-workflow-shortcuts.yml)

## 已完成

- [x] Client 侧 `/` 输入源：候选、空格、回车与命令 chip 恢复；
- [x] `/D` 发送讨论提示词，要求不修改文件并落成 `PLAN-*.md`；
- [x] `/G` 解析绝对/相对计划路径，自动登记工作区、创建并打开新会话；
- [x] `/G` 新会话重命名并发送实施提示词；
- [x] 中文 README 优先展示，补充英文 `README.en.md`；
- [x] MIT LICENSE、PUBLISHING.md 与市场条目草稿；
- [x] `scripts/apply-profile.sh` 支持从脚本位置推导插件目录，不再写死本机路径；
- [x] 单元测试 3/3 通过，`client.js` 可通过普通脚本解析，`npm pack` 通过。

## 待办

| # | 事项 | 说明 |
|---|---|---|
| 1 | 宿主机安装验收 | 执行 `bash task/dsh-workflow-shortcuts/scripts/apply-profile.sh web`，浏览器验证 `/D` 与 `/G` 的真实交互 |
| 2 | 市场 PR 合并 | 仓库创建满 1 天后由 awesome-dsh-plugin CI 重跑并通过审核 |

## 验证记录

| 时间 | 项 | 结果 |
|---|---|---|
| 2026-11-14 | `npm test` | 3/3 通过 |
| 2026-11-15 | `npm test` | 3/3 通过 |
| 2026-11-15 | `client.js` `vm.Script` 解析 | 通过 |
| 2026-11-15 | `npm pack --dry-run` | `dsh-workflow-shortcuts@0.1.0`，9 文件 |
