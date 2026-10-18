#!/bin/sh
# 專屬小人自動生成：雙擊就開始。第一次會一步一步問設定（要先裝 Node.js 18 以上：https://nodejs.org）
cd "$(dirname "$0")" || exit 1
if command -v node >/dev/null 2>&1; then
  node worker.mjs "$@"
else
  echo "找不到 Node.js：到 https://nodejs.org 下載 LTS 版，裝好再雙擊一次。"
fi
printf '\n按 Enter 關閉視窗'
read -r _
