#!/bin/bash
# Bump da versão do app (roda ANTES de commitar/pushar). Atualiza version.json + APP_VERSION no index.html.
cd "$(dirname "$0")"
V=$(date +%Y%m%d%H%M%S)
printf '{"v":"%s"}\n' "$V" > version.json
# atualiza a constante embutida no index.html (macOS sed)
sed -i '' "s/window.APP_VERSION='[^']*'/window.APP_VERSION='$V'/" index.html
echo "versão bumpada para $V (version.json + index.html)"
