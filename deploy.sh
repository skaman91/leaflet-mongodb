#!/bin/bash

SERVER=vpn
USER=root
BASEDIR=$(dirname "$0")

ssh vpn -t "mkdir -p /var/www/point-map.ru"
rsync -rzv "$BASEDIR//" "$USER"@"$SERVER":/var/www/point-map.ru

