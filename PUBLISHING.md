# 发布到 DSH 插件市场

> 状态：**`0.4.0` 待发布（`npm publish` 需用户 2FA）；上一版 `0.3.1` 已发布。**
> 包名：`dsh-workflow-shortcuts`（npm 已发布版 `0.3.1`，本轮待发 `0.4.0`）
> 公开仓库：<https://github.com/person-clouds/dsh-workflow-shortcuts>
> 市场条目：`market/person-clouds__dsh-workflow-shortcuts.yml`

## 一、发布前验证

```bash
cd /home/zh/www/dsh-workflow-shortcuts
npm test
node -e "new (require('vm').Script)(require('fs').readFileSync('client.js','utf8'))"
npm_config_cache=/tmp/npm-cache npm pack --dry-run
```

预期：`npm test` 63/63 通过（含 `/VP`、技能注册与打包用例），`client.js` 可被普通脚本解析，打包清单包含 Host/Client 入口、`lib/bundled-skills.js`、`skills/change-verify`、`skills/plan-verify`、安装脚本、中英文 README 与 LICENSE。

## 二、创建公开 GitHub 仓库

```bash
cd /home/zh/www/dsh-workflow-shortcuts
git init
git add .
git commit -m "feat: DSH 工作流快捷命令 /D 与 /G"
git branch -M main
git remote add origin git@github.com:person-clouds/dsh-workflow-shortcuts.git
git push -u origin main
```

GitHub 仓库添加 topic：`dsh-plugin`。

## 三、发布 npm（已完成）

```bash
cd /home/zh/www/dsh-workflow-shortcuts
npm login --registry=https://registry.npmjs.org
npm publish --registry=https://registry.npmjs.org --access public
```

> 本机默认 registry 是华为云镜像（`https://repo.huaweicloud.com/repository/npm/`），发布必须显式 `--registry=https://registry.npmjs.org`；token 在 `~/.npmrc`；`npm view` 有 3–5 分钟传播延迟。完整流程与约束见 [doc/specs/npm-publishing.md](/home/zh/www/doc/specs/npm-publishing.md)，`package.json` 已设 `publishConfig.registry` 兜底。

安装验证：

```bash
dsh plugin --profile web add dsh-workflow-shortcuts
```

## 四、创建 GitHub Release

- tag：`v0.4.0`（发布时创建；历史：`v0.2.0`/`v0.3.0`/`v0.3.1` 已发布；`0.2.1` 曾因 npm 暂存未批准放弃）
- 上传 tarball 时把文件改名为无版本号的 `dsh-workflow-shortcuts.tgz`
- Release 资源名保持无版本号，避免 `releases/latest/download/` 链接在下一版后 404

本地打包示例：

```bash
npm_config_cache=/tmp/npm-cache npm pack --pack-destination release
mv release/dsh-workflow-shortcuts-0.4.0.tgz release/dsh-workflow-shortcuts.tgz
```

## 五、提交 DSH 插件市场（PR #15389 已合并）

市场收录要求：

1. 公开 GitHub 仓库，`package.json` 声明 `dsh.bundle`；
2. 仓库创建满 1 天；
3. 添加 GitHub topic `dsh-plugin`；
4. 向 `awesome-dsh-plugin` 提交 `data/plugins/person-clouds__dsh-workflow-shortcuts.yml`；
5. 推荐同时发布 npm 包或 GitHub Release tarball。

本地条目草稿已写入 `market/person-clouds__dsh-workflow-shortcuts.yml`。提交后由市场维护者审核，合并后由 `awesome-dsh-plugin` 目录生成市场索引。
