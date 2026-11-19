---
implementation_status: done
created_at: 2026-11-19 08:26:16
updated_at: 2026-11-19 08:31:59
---

# PLAN：/D 规范文档路径改为可配置

## 目标

把 `/D` 提示词里的计划规范路径与格式要求移出插件代码，改为 DSH Host 可选配置：

- 新增三个配置项：`workflowDoc`、`planDoc`、`planTemplate`；
- 配了哪个，`/D` 提示词就引用哪个规范文档；
- 三个都为空时，不输出具体路径和格式，只要求写 `PLAN-*.md`，由 AI 按当前工作区/仓库既有规范发挥；
- 规范文档位置变化时只改 DSH profile 配置，不再改 `dsh-workflow-shortcuts`。

## 范围

- 改 `dsh-workflow-shortcuts` 的 Host 配置注入、Client 提示词、测试和文档。
- 不新增设置页，不读取 `localStorage`。
- 不改 `/G` 行为，不改工作区文档和检查器。
- 配置只影响 `/D` 提示词，不修改已有会话。

## 改动位置

- `index.js`：声明 `Config`，通过 `webserver/index-inject` 注入浏览器全局配置。
- `package.json`：增加 `@deepseek-ai/schemastery` peer 依赖；测试文件纳入。
- `client.js`：读取注入配置；`discussionPrompt` 按配置拼接第 2 条提示词。
- `tests/client.test.mjs`：覆盖未配置、单项配置、多项配置、空值/空白值。
- `tests/index.test.mjs`：覆盖 Host 配置默认值、字段清洗和全局注入。
- `SPEC.md`、`README.md`、`README.en.md`、`STATUS.md`：记录配置项、默认行为和 profile 示例。

## 实施步骤

1. 在 `index.js` 增加 `Config`：
   - `workflowDoc`：工作流/授权规范文档路径，默认 `""`；
   - `planDoc`：计划文档规范路径，默认 `""`；
   - `planTemplate`：计划模板路径，默认 `""`；
   - 三项均允许空字符串，配置值按绝对路径使用。
2. 在 `index.js` 的 `apply(ctx, config)` 中监听 `webserver/index-inject`，写入：
   - 全局名：`__DSH_WORKFLOW_SHORTCUTS_CONFIG__`；
   - 值：清洗后的 `{ workflowDoc, planDoc, planTemplate }`。
3. 在 `client.js` 增加配置读取：
   - 从 `window.__DSH_WORKFLOW_SHORTCUTS_CONFIG__` 读取；
   - 只接受非空字符串，去掉首尾空白；缺失或非法值按未配置处理；
   - `/D` 提交时读取当前值，允许热更新配置后无需重新加载代码。
4. 改写 `discussionPrompt` 的第 2 条：
   - 有配置时逐项列出已配置文档：
     - `工作流规范：<workflowDoc>`
     - `计划规范：<planDoc>`
     - `计划模板：<planTemplate>`
   - 无配置时只写：`按当前工作区/仓库既有规范写 PLAN-*.md。`
   - 保持提示词恰好 3 条编号，不恢复 frontmatter、H1、`## 改动记录` 等硬编码细则。
5. 更新测试：
   - 未配置时第 2 条不包含 `_meta/doc/task-workflow.md` 等具体路径；
   - 只配置 `planDoc` 时只出现计划规范；
   - 三项都配置时按顺序出现三项；
   - 空字符串、空白字符串、非字符串不产生路径；
   - 提示词始终为 3 条编号；
   - Host 测试确认 `Config` 默认值、注入事件和清洗结果。
6. 更新 `SPEC.md` 接口、中英文 README 配置说明和 STATUS：
   - 给出 profile `cordis.patch.yml` 示例：
     ```yaml
     - id: dsh-workflow-shortcuts
       name: dsh-workflow-shortcuts
       config:
         workflowDoc: /home/zh/www/_meta/doc/task-workflow.md
         planDoc: /home/zh/www/doc/specs/documentation-rules.md
         planTemplate: /home/zh/www/_meta/doc/plan-template.md
     ```
   - 说明三项均可省略；全空时由 AI 自行遵循当前规范。

## 验收

- `npm test` 全部通过（新增 Host 配置用例后统计实际通过数）。
- `./scripts/check.sh --repo dsh-workflow-shortcuts` 通过。
- 单元测试确认：
  - 配置为空时 `/D` 第 2 条不含具体文档路径；
  - 配置单项/多项时对应路径原样进入提示词；
  - `/D`、`/G` 提示词仍各为 3 条编号；
  - Host 注入的全局对象只含清洗后的三个字段。
- 浏览器实测由用户完成：配置三项后 `/D` 提示词包含路径；清空配置后 `/D` 提示词不包含路径。

## 回滚

- `git revert <commit>`。
- 删除 profile 中 `dsh-workflow-shortcuts` 的 `config` 段即可恢复“未配置”行为；不影响已有会话。

## 改动记录

- 2026-11-19 08:26:16：创建计划，确定三项可选配置与未配置时的自由发挥行为。
- 2026-11-19：完成 Host `Config` 与 `webserver/index-inject` 全局注入；Client 在每次 `/D` 提交时读取并清洗配置，第 2 条只引用已配置规范；未配置时改为按工作区/仓库既有规范写 `PLAN-*.md`；新增 Host 测试并补齐 Client 空/单项/三项/空白/非字符串与热更新用例；中英文 README、SPEC、STATUS 已同步。`npm test` 23/23 通过，`./scripts/check.sh --repo dsh-workflow-shortcuts` 通过。浏览器实测待用户完成。
