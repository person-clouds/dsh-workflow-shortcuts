#!/usr/bin/env bash
# 在宿主机用户环境执行：把 dsh-workflow-shortcuts 以本地链接装进指定 DSH profile，
# 并确保 cordis.patch.yml 插入插件行。工作区 AI 沙箱对 ~/.dsh 只读，因此本脚本由用户执行。
#
# 使用直接软链 + 修改 package.json 依赖，避免因 profile 中其他损坏依赖导致 pnpm 安装失败。
set -euo pipefail

PROFILE="${1:-web}"
PLUGIN_DIR="${PLUGIN_DIR:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)}"
HOME_DIR="${HOME:-/home/zh}"
DSH_HOME="${DSH_HOME:-$HOME_DIR/.dsh}"
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
PATCH_FILE="$PROFILE_DIR/cordis.patch.yml"
STAMP="$(date +%Y%m%d-%H%M%S)"

[[ -d "$PLUGIN_DIR" ]] || { echo "插件目录不存在: $PLUGIN_DIR" >&2; exit 1; }
[[ -f "$PATCH_FILE" ]] || { echo "profile patch 不存在: $PATCH_FILE" >&2; exit 1; }

mkdir -p "$PROFILE_DIR/node_modules"
ln -sfn "$PLUGIN_DIR" "$PROFILE_DIR/node_modules/dsh-workflow-shortcuts"

cp -a "$PROFILE_DIR/package.json" "$PROFILE_DIR/package.json.bak.workflow-shortcuts-$STAMP"
python3 - "$PROFILE_DIR/package.json" "$PLUGIN_DIR" <<'PY'
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
plugin_dir = sys.argv[2]
data = json.loads(path.read_text())
deps = data.setdefault("dependencies", {})
deps["dsh-workflow-shortcuts"] = f"link:{plugin_dir}"
path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
print("已登记 package.json 依赖 dsh-workflow-shortcuts")
PY

cp -a "$PATCH_FILE" "$PATCH_FILE.bak.workflow-shortcuts-$STAMP"
python3 - "$PATCH_FILE" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1])
text = p.read_text()
block = """# dsh-workflow-shortcuts：/D 讨论、/G 按计划新建实施会话。
- insert:
    - id: dsh-workflow-shortcuts
      name: dsh-workflow-shortcuts
"""
if '- id: dsh-workflow-shortcuts' not in text:
    text = text.rstrip() + '\n\n' + block
    p.write_text(text)
    print('已插入 dsh-workflow-shortcuts')
else:
    print('dsh-workflow-shortcuts 已存在，跳过')
PY

if systemctl --user list-unit-files dsh-web.service >/dev/null 2>&1; then
  systemctl --user restart dsh-web.service
  echo '已重启 dsh-web.service'
fi

echo
echo '验证：'
echo "  dsh --profile $PROFILE --dump-config | grep -A2 dsh-workflow-shortcuts"
echo '  浏览器刷新后输入 /D 或 /G 验证'
