---
implementation_status: done
created_at: 2026-11-21 05:40:00
updated_at: 2026-11-21 06:10:00
---

# PLAN：/D、/G 提示词支持工作区文件附加要求

## 目标

让 `/D`、`/G` 的内置提示词可以追加用户自己的要求，而不必改 `client.js` 再刷新插件：

- 两个文件分别承载讨论阶段、执行阶段的附加要求：
  - `<工作区>/.dsh/workflow-shortcuts/discussion.md`；
  - `<工作区>/.dsh/workflow-shortcuts/execution.md`；
- 每次提交 `/D`、`/G` 时读取，改文件即时生效，不用重启 DSH、不用刷新页面；
- 文件缺失、不可读或为空时静默跳过，内置提示词保持不变；
- Host 可通过 `discussionPromptFile`、`executionPromptFile` 改路径或关闭。

## 范围

- 只改 `dsh-workflow-shortcuts`：`index.js`、`client.js`、测试、SPEC、中英文 README、STATUS、本计划。
- 不改 `/D`、`/G` 的命令行为、会话标题、计划解析与工作区逻辑。
- 不新增设置界面，不新增 Host API，不写仓库文件。
- 不支持用附加要求整体替换内置提示词；内置三条要点保持不变。

## 改动位置

- `index.js`：`Config` 新增两个路径字段（默认指向上面的文件），`normalizeConfig` 同步清洗。
- `client.js`：
  - 配置读取增加两个字段并给出同样的默认值；
  - 新增按会话 cwd 解析、读取、截断附加要求的函数；
  - `discussionPrompt`、`executionPrompt` 改为异步，在末尾追加「附加要求」段落；
  - 读取失败静默返回空串。
- 测试：Host 默认值与清洗；Client 默认文件、缺失文件、自定义相对路径、`none` 关闭、/D 与 /G 互不影响、超长截断。
- 文档：`SPEC.md` 接口、`README.md` / `README.en.md` 配置说明、`STATUS.md` 记录。

## 实施步骤

1. `index.js` 导出默认路径常量，`Config` 增加：
   - `discussionPromptFile`：默认 `.dsh/workflow-shortcuts/discussion.md`；
   - `executionPromptFile`：默认 `.dsh/workflow-shortcuts/execution.md`。
2. `normalizeConfig` 对两个新字段做与既有字段相同的清洗（非字符串按空串）。
3. `client.js` 增加配置解析：
   - 空值回退内置默认路径；`none`、`off`、`-`（大小写不敏感）表示关闭；
   - 相对路径基于当前会话 cwd 解析，绝对路径原样使用。
4. 增加 `promptOverlay(sessionId, cwd, file)`：
   - 用 `remote.workspaceFiles.read(sessionId, path, { offset: 1, limit: 200 })` 读取；
   - 只接受 `ok === true` 且 `value.text` 为字符串；异常、不可读、空白内容返回空串；
   - 内容去掉首尾空白，超过 8000 字符截断并注明。
5. 改提示词构造：
   - `/D`：三条编号要点后、`任务：` 之前，追加 `附加要求：` 与文件内容；
   - `/G`：编号要点结束后追加同样段落；
   - 无附加内容时不出现该段落；标题生成不受影响。
6. 更新测试与文档，运行验收命令。

## 验收

- `npm test` 全部通过（新增用例覆盖上述行为）。
- `node -e "new (require('vm').Script)(require('fs').readFileSync('client.js','utf8'))"` 通过。
- `npm pack --dry-run` 通过。
- `./scripts/check.sh --repo dsh-workflow-shortcuts` 通过。
- 单元测试断言：
  - 默认文件存在时 `/D`、`/G` 提示词出现对应内容；
  - 文件缺失或不可读时提示词与旧版一致；
  - 自定义相对路径解析到 `<cwd>/...`；
  - `none` 时不读取文件；
  - `/D` 文件不影响 `/G`，反之亦然。
- 浏览器真实交互由用户验证：在工作区创建两个文件后执行 `/D`、`/G`，确认提示词包含文件内容。

## 回滚

- `git revert <commit>`；
- 删除工作区 `.dsh/workflow-shortcuts/` 或把配置设为 `none` 即恢复内置提示词行为。

## 改动记录

- 2026-11-21 05:40:00：创建计划，确定文件型附加要求、默认路径、读取时机与关闭方式。
- 2026-11-21 06:10:00：完成 Host 配置、Client 读取与追加、关闭开关、截断和测试；文档同步后归档。
