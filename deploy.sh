#!/bin/bash

SERVER=map
USER=skaman
BASEDIR=$(dirname "$0")
VERSION=$(date +%s)

# ---------- INDEX ----------
cp index.html index.html.tmp

sed -i '' "s|nosleep.min.js?v=[0-9a-zA-Z]*|nosleep.min.js?v=$VERSION|g" index.html.tmp
sed -i '' "s|svg-icon.js?v=[0-9a-zA-Z]*|svg-icon.js?v=$VERSION|g" index.html.tmp
sed -i '' "s|main.js?v=[0-9a-zA-Z]*|main.js?v=$VERSION|g" index.html.tmp
sed -i '' "s|routes.js?v=[0-9a-zA-Z]*|routes.js?v=$VERSION|g" index.html.tmp
sed -i '' "s|routes.css?v=[0-9a-zA-Z]*|routes.css?v=$VERSION|g" index.html.tmp
sed -i '' "s|style.css?v=[0-9a-zA-Z]*|style.css?v=$VERSION|g" index.html.tmp


# ---------- ROUTES.HTML ----------
cp routes.html routes.html.tmp

sed -i '' "s|routes.js?v=[0-9a-zA-Z]*|routes.js?v=$VERSION|g" routes.html.tmp
sed -i '' "s|routes.css?v=[0-9a-zA-Z]*|routes.css?v=$VERSION|g" routes.html.tmp


# ---------- SW.JS ----------
cp sw.js sw.js.tmp

sed -i '' "s|const VERSION      = '[^']*'|const VERSION      = '$VERSION'|g" sw.js.tmp


# ---------- DEPLOY ----------
ssh "$SERVER" -t "mkdir -p /var/www/point-map.ru"

rsync -rzv "$BASEDIR/" "$USER@$SERVER":/var/www/point-map.ru \
  --exclude node_modules --exclude .git \
  --exclude index.html --exclude routes.html --exclude sw.js \
  && rsync -zv "$BASEDIR/index.html.tmp" "$USER@$SERVER":/var/www/point-map.ru/index.html \
  && rsync -zv "$BASEDIR/routes.html.tmp" "$USER@$SERVER":/var/www/point-map.ru/routes.html \
  && rsync -zv "$BASEDIR/sw.js.tmp" "$USER@$SERVER":/var/www/point-map.ru/sw.js


# ---------- CLEANUP ----------
rm "$BASEDIR/index.html.tmp"
rm "$BASEDIR/routes.html.tmp"
rm "$BASEDIR/sw.js.tmp"
