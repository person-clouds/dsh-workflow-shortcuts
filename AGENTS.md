# AGENTS.md

> 本仓是独立的 DSH Web 插件仓库「dsh-workflow-shortcuts」。跨仓规则以 [`/home/zh/www/AGENTS.md`](../AGENTS.md) 为准；本文件只补充本仓规则。

## 0. 阅读顺序

1. 本文件；
2. [`SPEC.md`](SPEC.md)：`/D`、`/G` 的目标、接口、非目标与验收命令；
3. [`README.md`](README.md) / [`README.en.md`](README.en.md)：命令行为与提示词；
4. [`STATUS.md`](STATUS.md)、[`PUBLISHING.md`](PUBLISHING.md)；
5. 进行中的 `PLAN-*.md`。

## 1. 硬约束

- 中文；英文版 `README.en.md` 同步维护。
- 最小变更：只改被要求的内容，不顺手重构。
- 命令只创建会话/写计划文档，不修改仓库文件、不自动提交或推送。
- Client bundle 只用 DSH 公开接口注册命令，不引入私有 API。
- 提交信息用 `type(scope): 摘要`；每个提交只含本任务文件。

## 2. 改代码后必须验证

```bash
npm test
```

宿主机安装：`dsh-workflow-shortcuts/scripts/apply-profile.sh web`（在 `/home/zh/www` 下执行），重启 `dsh web` 后在命令面板验证 `/D`、`/G`。

## 3. 文档与提交门禁

- 本仓受检 Markdown 必须有 `audience`/`status` frontmatter（见 `docs-policy.json`）。
- 提交前在 `/home/zh/www` 执行 `./scripts/check.sh --repo dsh-workflow-shortcuts`，失败不得提交。
- 改动同步 `README.md`、`README.en.md`、`STATUS.md`。

## 4. 发布

npm 包名 `dsh-workflow-shortcuts`；流程见 [`PUBLISHING.md`](PUBLISHING.md)。
