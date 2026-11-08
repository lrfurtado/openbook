#!/bin/sh
set -e
if [ -d /run/systemd/system ]; then
  systemctl daemon-reload || true
fi
# deb "purge" also drops the service state. The openbook user is kept so file ownership stays stable.
if [ "$1" = purge ]; then
  rm -rf /var/lib/openbook
fi
