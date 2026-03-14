#!/bin/bash
set -exo pipefail

npm config set registry https://registry.npmmirror.com
npm install
npx nest build
npx prisma generate

# 打印详细目录结构（关键！找 main.js 实际位置）
echo "=== 打印 topedu-api 根目录 ==="
ls -la ./
echo "=== 打印 dist 目录 ==="
ls -la ./dist/
echo "=== 打印 dist 下所有子目录 ==="
find ./dist -type f -name "main.js"  # 全局查找 main.js