#!/usr/bin/env bash
# Manage the OpenBook systemd *user* services (openbook-api, openbook-web).
# Usage: scripts/services.sh install|uninstall|start|stop|restart|status|logs [api|web]
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_SRC="$REPO/deploy/systemd"
UNIT_DST="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
ALL=(openbook-api openbook-web)

cmd="${1:-}"
case "${2:-}" in
  api) units=(openbook-api) ;;
  web) units=(openbook-web) ;;
  "")  units=("${ALL[@]}") ;;
  *)   echo "unknown service '$2' (expected api or web)" >&2; exit 2 ;;
esac

case "$cmd" in
  install)
    node_bin="$(dirname "$(command -v node)")"
    # The web app talks to the API on whatever PORT apps/api/.env sets (default 3000).
    api_port="$(sed -n 's/^PORT=//p' "$REPO/apps/api/.env" 2>/dev/null | tail -1)"
    api_port="${api_port:-3000}"
    mkdir -p "$UNIT_DST"
    for u in "${units[@]}"; do
      sed -e "s|@REPO@|$REPO|g" -e "s|@NODE_BIN@|$node_bin|g" -e "s|@API_PORT@|$api_port|g" \
        "$UNIT_SRC/$u.service" > "$UNIT_DST/$u.service"
      echo "installed $UNIT_DST/$u.service"
    done
    systemctl --user daemon-reload
    systemctl --user enable "${units[@]/%/.service}"
    echo "Enabled. Start with: npm run services:start"
    echo "To keep them running after logout: loginctl enable-linger $USER"
    ;;
  uninstall)
    systemctl --user disable --now "${units[@]/%/.service}" || true
    for u in "${units[@]}"; do rm -f "$UNIT_DST/$u.service"; done
    systemctl --user daemon-reload
    ;;
  start|stop|restart|status)
    systemctl --user "$cmd" "${units[@]/%/.service}"
    ;;
  logs)
    args=(); for u in "${units[@]}"; do args+=(-u "$u.service"); done
    journalctl --user "${args[@]}" -f -n 100
    ;;
  *)
    echo "usage: $0 install|uninstall|start|stop|restart|status|logs [api|web]" >&2
    exit 2
    ;;
esac
