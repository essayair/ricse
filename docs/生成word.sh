#!/usr/bin/env bash
# 把 docs/ 下的 Markdown 文档导出为 Word（.docx）。
#
# 用法：
#   docs/生成word.sh                                   # 导出综合使用指南（默认）
#   docs/生成word.sh docs/产品/使用指南/合同模块.md      # 导出指定文档
#   docs/生成word.sh docs/产品/使用指南/*.md            # 批量导出
#
# 导出产物与源文件同目录、同名，已在 .gitignore 中排除，不纳入版本管理。
# 依赖：pandoc（macOS: brew install pandoc）

set -euo pipefail

command -v pandoc >/dev/null 2>&1 || {
  echo "错误：未找到 pandoc。macOS 可执行 brew install pandoc" >&2
  exit 1
}

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_DOC="$REPO_ROOT/docs/产品/使用指南/RICSE平台综合使用指南.md"

# pandoc 默认模板的西文字体不含中文字形，部分阅读器会回退成宋体。
# 这里从默认模板现场派生一份中文模板，因此仓库中无需保存任何二进制文件。
build_reference_doc() {
  local workdir="$1"
  pandoc --print-default-data-file reference.docx > "$workdir/reference.docx"
  ( cd "$workdir" && mkdir -p unpacked && cd unpacked && unzip -oq ../reference.docx )

  python3 - "$workdir/unpacked" <<'PY'
import sys, pathlib

base = pathlib.Path(sys.argv[1])

styles = base / "word/styles.xml"
s = styles.read_text(encoding="utf-8")
s = s.replace(
    '<w:rFonts w:asciiTheme="minorHAnsi" w:eastAsiaTheme="minorEastAsia" w:hAnsiTheme="minorHAnsi" w:cstheme="minorBidi" />',
    '<w:rFonts w:ascii="Calibri" w:eastAsia="Microsoft YaHei" w:hAnsi="Calibri" w:cs="Microsoft YaHei" />',
)
s = s.replace('w:eastAsiaTheme="majorEastAsia"', 'w:eastAsia="Microsoft YaHei"')
s = s.replace('w:eastAsiaTheme="minorEastAsia"', 'w:eastAsia="Microsoft YaHei"')
styles.write_text(s, encoding="utf-8")

theme = base / "word/theme/theme1.xml"
t = theme.read_text(encoding="utf-8")
t = t.replace('<a:ea typeface=""/>', '<a:ea typeface="Microsoft YaHei"/>')
t = t.replace('<a:ea typeface="" />', '<a:ea typeface="Microsoft YaHei" />')
theme.write_text(t, encoding="utf-8")
PY

  ( cd "$workdir/unpacked" && zip -qr ../reference-cjk.docx . -x '.*' )
  echo "$workdir/reference-cjk.docx"
}

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

REFERENCE="$(build_reference_doc "$WORKDIR")"

if [ "$#" -eq 0 ]; then
  set -- "$DEFAULT_DOC"
fi

for src in "$@"; do
  [ -f "$src" ] || { echo "跳过：$src 不存在" >&2; continue; }
  out="${src%.md}.docx"
  pandoc "$src" -o "$out" \
    --reference-doc="$REFERENCE" \
    --toc --toc-depth=2 \
    2>&1 | grep -v "has no translation\|Could not load translations\|^  translations/" || true
  echo "已生成：$out"
done
