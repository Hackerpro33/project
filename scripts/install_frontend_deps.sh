#!/usr/bin/env bash
set -euo pipefail

# Определяем корень репозитория даже при запуске через символические ссылки
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FRONTEND_DIR="${REPO_ROOT}/frontend"
LOCKFILE="${FRONTEND_DIR}/package-lock.json"

if [[ ! -d "${FRONTEND_DIR}" ]]; then
  echo "[install_frontend_deps] Не удалось найти каталог фронтенда по пути: ${FRONTEND_DIR}" >&2
  echo "Убедитесь, что скрипт запускается внутри склонированного репозитория." >&2
  exit 1
fi

# По умолчанию используем npm ci для воспроизводимых установок, если есть lockfile
if [[ -f "${LOCKFILE}" ]]; then
  if ! npm ci --prefix "${FRONTEND_DIR}" "$@"; then
    echo "[install_frontend_deps] npm ci завершился с ошибкой." >&2
    echo "Если видите ERESOLVE или другие ошибки peerDependencies, попробуйте удалить node_modules и повторно запустить скрипт" >&2
    echo "или добавить флаг --legacy-peer-deps." >&2
    exit 1
  fi
else
  npm install --prefix "${FRONTEND_DIR}" "$@"
fi
