#!/bin/sh
set -e
# rpm passes the number of versions left (0 = removal); deb passes "remove" or "upgrade".
case "$1" in
  0|remove)
    if [ -d /run/systemd/system ]; then
      systemctl disable --now openbook.service || true
    fi
    ;;
esac
