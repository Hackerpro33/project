#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
OFFLINE_DIR="$ROOT_DIR/deploy/offline"
PY_REQ_FILE="$ROOT_DIR/backend/app/requirements.txt"
PY_CACHE_DIR="$OFFLINE_DIR/python"
NPM_CACHE_DIR="$OFFLINE_DIR/npm/frontend"
IMAGES_LIST="$OFFLINE_DIR/docker-images.txt"
IMAGES_DIR="$OFFLINE_DIR/images"

mkdir -p "$PY_CACHE_DIR" "$NPM_CACHE_DIR" "$IMAGES_DIR"
find "$PY_CACHE_DIR" -mindepth 1 ! -name ".gitkeep" -delete
find "$IMAGES_DIR" -mindepth 1 ! -name ".gitkeep" -delete

log() {
  printf '\033[1;34m[offline]\033[0m %s\n' "$*"
}

log "Downloading Python wheels into $PY_CACHE_DIR"
pip download --requirement "$PY_REQ_FILE" --dest "$PY_CACHE_DIR"

log "Priming npm cache under $NPM_CACHE_DIR"
pushd "$ROOT_DIR/frontend" >/dev/null
npm --cache "$NPM_CACHE_DIR" --registry "${NPM_REGISTRY_URL:-https://registry.npmjs.org/}" ci
popd >/dev/null
rm -rf "$ROOT_DIR/frontend/node_modules"

if [[ -f "$ROOT_DIR/backend/package.json" ]]; then
  BACKEND_NPM_CACHE="$OFFLINE_DIR/npm/backend"
  mkdir -p "$BACKEND_NPM_CACHE"
  log "Priming backend npm cache under $BACKEND_NPM_CACHE"
  pushd "$ROOT_DIR/backend" >/dev/null
  if [[ -f package-lock.json ]]; then
    npm --cache "$BACKEND_NPM_CACHE" --registry "${NPM_REGISTRY_URL:-https://registry.npmjs.org/}" ci
  else
    npm --cache "$BACKEND_NPM_CACHE" --registry "${NPM_REGISTRY_URL:-https://registry.npmjs.org/}" install
  fi
  popd >/dev/null
  rm -rf "$ROOT_DIR/backend/node_modules"
fi

if [[ -f "$IMAGES_LIST" ]]; then
  while IFS= read -r image || [[ -n "$image" ]]; do
    [[ -z "$image" || "$image" =~ ^# ]] && continue
    full_image="$image"
    if [[ -n "${CONTAINER_REGISTRY_MIRROR:-}" ]]; then
      full_image="${CONTAINER_REGISTRY_MIRROR%/}/$image"
    fi
    log "Pulling $full_image"
    docker pull "$full_image"
    if [[ "$full_image" != "$image" ]]; then
      docker tag "$full_image" "$image"
    fi
    archive_name=$(echo "$image" | tr '/:' '__').tar
    log "Saving $image to $IMAGES_DIR/$archive_name"
    docker save "$image" --output "$IMAGES_DIR/$archive_name"
  done <"$IMAGES_LIST"
fi

log "Offline cache ready"
