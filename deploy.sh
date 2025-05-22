#!/bin/bash

SERVER=vpn
USER=root
BASEDIR=$(dirname "$0")
VERSION=$(date +%s)  # или: VERSION=$(git rev-parse --short HEAD)

cp index.html index.html.tmp

sed -i '' "s/svg-icon.js?v=[0-9a-zA-Z]*/svg-icon.js?v=$VERSION/g" index.html.tmp
sed -i '' "s/main.js?v=[0-9a-zA-Z]*/main.js?v=$VERSION/g" index.html.tmp

# Отправим файлы на сервер
ssh "$SERVER" -t "mkdir -p /var/www/point-map.ru"
rsync -rzv "$BASEDIR/" "$USER@$SERVER":/var/www/point-map.ru \
  --exclude node_modules --exclude .git --exclude index.html \
  && rsync -zv "$BASEDIR/index.html.tmp" "$USER@$SERVER":/var/www/point-map.ru/index.html

# Удалим временный файл
rm "$BASEDIR/index.html.tmp"




##!/bin/bash
#
#SERVER=vpn
#USER=root
#BASEDIR=$(dirname "$0")
#
#ssh vpn -t "mkdir -p /var/www/point-map.ru"
#rsync -rzv "$BASEDIR//" "$USER"@"$SERVER":/var/www/point-map.ru

