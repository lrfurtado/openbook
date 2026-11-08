#!/usr/bin/env bash
# Build OpenBook .rpm / .deb packages: bundled Node runtime, API with production dependencies, the
# exported web app and a systemd service (openbook.service) running as the `openbook` user.
# Usage: scripts/package.sh [rpm|deb|all]    Packages land in dist/packages/. Needs docker (for nfpm).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NFPM_IMAGE=goreleaser/nfpm:v2.48.0
STAGE_REL=dist/package-stage
STAGE="$REPO/$STAGE_REL"
OUT="$REPO/dist/packages"

case "${1:-all}" in
  rpm) formats=(rpm) ;;
  deb) formats=(deb) ;;
  all) formats=(rpm deb) ;;
  *)   echo "usage: $0 [rpm|deb|all]" >&2; exit 2 ;;
esac

case "$(uname -m)" in
  x86_64)  arch=amd64 ;;
  aarch64) arch=arm64 ;;
  *)       echo "unsupported architecture $(uname -m)" >&2; exit 1 ;;
esac

cd "$REPO"
version="$(node -p "require('./apps/api/package.json').version")"
release="$(git rev-list --count HEAD 2>/dev/null || echo 1)"
rm -rf "$STAGE"
mkdir -p "$STAGE/lib/api" "$STAGE/content" "$OUT"

echo "==> Building shared package and API"
npm run build -w @openbook/shared
npm run build -w api

echo "==> Exporting the web app"
# The web build calls the API on its own origin; the service serves both.
(cd apps/mobile && EXPO_PUBLIC_API_URL=/v1 npx expo export --platform web --output-dir "$STAGE/lib/web" --clear)

echo "==> Installing API production dependencies"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp package.json package-lock.json "$tmp/"
for ws in apps/* packages/*; do
  [ -f "$ws/package.json" ] && mkdir -p "$tmp/$ws" && cp "$ws/package.json" "$tmp/$ws/"
done
# Third-party install scripts are skipped: argon2 ships prebuilt binaries and the Prisma engine is
# copied from this checkout below.
(cd "$tmp" && npm ci --omit=dev --ignore-scripts --workspace api --no-audit --no-fund)

echo "==> Staging files"
cp -r apps/api/dist apps/api/prisma apps/api/prisma.config.ts apps/api/package.json "$STAGE/lib/api/"
rm -rf "$STAGE/lib/api/dist/test"
cp -r "$tmp/node_modules" "$STAGE/lib/api/node_modules"
# The workspace link to @openbook/shared becomes a real copy of its build.
rm -rf "$STAGE/lib/api/node_modules/@openbook/shared"
mkdir -p "$STAGE/lib/api/node_modules/@openbook/shared"
cp -r packages/shared/package.json packages/shared/dist "$STAGE/lib/api/node_modules/@openbook/shared/"
engine="$(ls node_modules/@prisma/engines/schema-engine-* | head -1)"
cp "$engine" "$STAGE/lib/api/node_modules/@prisma/engines/schema-engine"
cp "$(command -v node)" "$STAGE/lib/node"
cp content/seed.json "$STAGE/content/"

echo "==> Packaging (${formats[*]})"
for format in "${formats[@]}"; do
  docker run --rm -u "$(id -u):$(id -g)" -v "$REPO:/src" -w /src \
    -e VERSION="$version" -e RELEASE="$release" -e ARCH="$arch" \
    "$NFPM_IMAGE" package --config deploy/package/nfpm.yaml --packager "$format" --target dist/packages/
done
ls -lh "$OUT"
