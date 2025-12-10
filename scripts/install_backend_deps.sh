#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${REPO_ROOT}/backend"
REQUIREMENTS_FILE="${BACKEND_DIR}/app/requirements.txt"

if [[ ! -d "${BACKEND_DIR}" ]]; then
  echo "[install_backend_deps] Не удалось найти каталог backend по пути: ${BACKEND_DIR}" >&2
  echo "Убедитесь, что скрипт запускается внутри склонированного репозитория." >&2
  exit 1
fi

if [[ ! -f "${REQUIREMENTS_FILE}" ]]; then
  echo "[install_backend_deps] Не найден файл зависимостей: ${REQUIREMENTS_FILE}" >&2
  echo "Проверьте, что репозиторий синхронизирован и структура каталогов не изменена." >&2
  exit 1
fi

python -m pip install --requirement "${REQUIREMENTS_FILE}" "$@"
