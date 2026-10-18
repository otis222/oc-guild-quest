#!/bin/sh
# 專屬小人自動生成：一步一步改設定，設好就開始（要先裝 Node.js 18 以上：https://nodejs.org）
cd "$(dirname "$0")" || exit 1
if command -v node >/dev/null 2>&1; then
  node worker.mjs --setup "$@"
else
  echo "找不到 Node.js：到 https://nodejs.org 下載 LTS 版，裝好再雙擊一次。"
fi
printf '\n按 Enter 關閉視窗'
read -r _
