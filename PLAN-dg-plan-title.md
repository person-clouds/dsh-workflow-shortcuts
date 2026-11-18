# PLAN：统一 /D 计划标题格式与 /G 标题清洗

## 目标

- `/D` 生成的计划文档首个 H1 固定为 `# PLAN：<简短标题>`（全角冒号）。
- `/G` 读取计划标题后，稳定去掉开头的 `PLAN` / `计划` 前缀及其后的分隔符。
- 修复 `# PLAN — 修复 DSH「工作区文件」软链打不开` 生成会话标题时未去除 `PLAN —` 的问题。
- `/D` 最终回复中的计划 Markdown 链接：显示名用相对当前目录的半路径，链接地址用绝对全路径，例如 `[personalCloud/task/foo/PLAN-foo.md](/home/zh/www/personalCloud/task/foo/PLAN-foo.md)`。

## 范围

- 只改 `/D` 提示词、`/G` 标题清洗规则、相关测试与文档。
- 不改命令入口、会话创建流程、计划路径解析、空 `/G` 搜索逻辑。
- 不改 Host API。

## 改动位置

1. `client.js`
   - `discussionPrompt()`：要求计划文档首个 H1 使用 `# PLAN：<简短标题>`（全角冒号）；最终回复链接的显示名用相对当前目录的半路径，URL 用绝对全路径。
   - `stripPlanPrefix()`：改为大小写不敏感地去除开头 `PLAN` / `计划`，并兼容其后连续分隔符：
     空白、`：`、`:`、`、`、`·`、`｜`、`|`、`—`、`–`、`-`、`_`。
   - 仅当前缀后存在上述分隔符时剥离；`Planning ...` 等普通单词不误伤。
   - 标题只有 `PLAN` / `计划` 时清洗为空，继续走文件名回退。
2. `tests/client.test.mjs`
   - 补充 `PLAN：`、`PLAN —`、`PLAN -`、`计划：`、多分隔符组合的清洗断言。
   - 补充 `Planning ...` 不剥离、纯 `PLAN` 回退文件名的断言。
   - 更新 `/D` 提示词断言，确认包含固定 H1 格式要求与「显示名半路径、链接全路径」。
3. `README.md`、`README.en.md`、`STATUS.md`
   - 同步 `/D` 计划标题格式和 `/G` 分隔符清洗规则；STATUS 记录本次验证结果。
   - `PROJECT_INDEX.md` 无标题规则描述，本项目状态不变，无需改动。

## 实施步骤

1. 修改 `discussionPrompt()` 的固定 H1 要求。
2. 重写 `stripPlanPrefix()`，保持 `planTitleFromText()` 和文件名回退逻辑不变。
3. 更新测试用例并运行 `npm test`。
4. 更新中英文 README 与 STATUS。
5. 用 `vm.Script` 做 `client.js` 语法检查，并执行 `npm pack --dry-run`。

## 验收

- `# PLAN：修复软链` → 会话标题 `实施：修复软链`
- `# PLAN — 修复软链` → `实施：修复软链`
- `# PLAN - 修复软链` → `实施：修复软链`
- `# PLAN、修复软链` / `# PLAN·修复软链` / `# PLAN｜修复软链` → `实施：修复软链`
- `# 计划：修复软链` → `实施：修复软链`
- `# Planning 修复软链` → `实施：Planning 修复软链`（不误伤）
- `# PLAN` → `实施：PLAN-xxx.md`（回退文件名）
- `/D` 最终输出形如 `[personalCloud/task/foo/PLAN-foo.md](/home/zh/www/personalCloud/task/foo/PLAN-foo.md)`。
- `npm test` 全部通过；`client.js` 语法检查通过；`npm pack --dry-run` 成功。

## 回滚

恢复 `client.js`、`tests/client.test.mjs`、`README.md`、`README.en.md`、`STATUS.md` 本次改动即可，无数据迁移和兼容性影响。
