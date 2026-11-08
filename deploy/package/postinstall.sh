#!/bin/sh
set -e

if ! getent group openbook >/dev/null; then
  groupadd --system openbook
fi
if ! getent passwd openbook >/dev/null; then
  useradd --system --gid openbook --home-dir /var/lib/openbook --no-create-home \
    --shell /usr/sbin/nologin --comment "OpenBook service" openbook
fi

# A fresh install gets its own token-signing secret.
if grep -q '^JWT_SECRET=@GENERATED@$' /etc/openbook/openbook.env; then
  secret=$(od -An -tx1 -N32 /dev/urandom | tr -d ' \n')
  sed -i "s|^JWT_SECRET=@GENERATED@$|JWT_SECRET=$secret|" /etc/openbook/openbook.env
fi
chown root:openbook /etc/openbook/openbook.env
chmod 0640 /etc/openbook/openbook.env

if [ -d /run/systemd/system ]; then
  systemctl daemon-reload
  # Upgrades restart a running service; fresh installs wait until the database is configured.
  systemctl try-restart openbook.service || true
fi

if ! systemctl is-enabled --quiet openbook.service 2>/dev/null; then
  cat <<'MSG'
OpenBook is installed. Next steps:
  1. Set DATABASE_URL in /etc/openbook/openbook.env
  2. systemctl enable --now openbook
  3. openbook-seed            (loads the bundled card packs and books)
MSG
fi
