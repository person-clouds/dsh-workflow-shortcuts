---
audience: shared
status: current
---

# SPEC：dsh-workflow-shortcuts

## 目标

为 DSH Web 提供 `/D`、`/G` 两个快捷命令，把「先讨论、再落计划、开新会话实施」固定成可重复的工作流，降低长上下文消耗。

## 用户

- 习惯先讨论方案再实施、需要把讨论与实施拆到不同会话的 DSH 用户；
- 用 `PLAN-*.md` 作为实施契约的仓库维护者。

## 范围

- `/D [任务]`：当前会话进入讨论阶段，不改文件；会话名改为 `D: <任务摘要>`；讨论收敛后写 `PLAN-*.md`；
- `/G <计划文档路径 | 任务描述>`：在当前工作区新建会话处理；留空时从最近消息自动查找计划文档；
- Client UI bundle 承载命令与交互，Host 侧只声明可选配置并注入浏览器全局。

## 非目标

- 不修改仓库文件、不自动提交或推送；
- 不实现完整任务编排、不替代 DSH 原生会话管理；
- 不做多工作区批处理。

## 接口

- `package.json`：`dsh.bundle.patch` → `cordis.patch.yml` 插入 `id: dsh-workflow-shortcuts`；`dsh.client.platform=web`，`immediately: true`；
- 入口：`index.js`（Host `Config` 与全局配置注入）、`client.js`（命令注册、配置读取与提示词）；
- 配置（均可选，默认 `""`）：
  - `workflowDoc`：工作流/授权规范文档路径；
  - `planDoc`：计划文档规范路径；
  - `planTemplate`：计划模板路径；
- Host 监听 `webserver/index-inject`，向页面注入 `kind: "global"`、`name: "__DSH_WORKFLOW_SHORTCUTS_CONFIG__"` 的对象，只含清洗后的上述三个字段；
- Client 在每次 `/D` 提交时读取该全局对象；空值、空白、非字符串按未配置处理；三项均未配置时提示词只要求按当前工作区/仓库既有规范写 `PLAN-*.md`；
- 命令：`/D`、`/G`，行为与提示词见 `README.md`；`/G` 行为不读取上述配置。

## 运行方式

```bash
dsh plugin --profile web add link:/home/zh/www/dsh-workflow-shortcuts
# 重启 dsh web 后，命令面板出现 /D 与 /G
```

## 验收命令

```bash
npm test
```

## 约束

- 中文文档与注释；英文版同步维护 `README.en.md`；
- 发布流程见 `PUBLISHING.md`（npm 包名 `dsh-workflow-shortcuts`）。
