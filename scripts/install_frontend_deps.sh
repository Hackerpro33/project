#!/usr/bin/env bash
set -euo pipefail

# Resolve repository root even when invoked via symlinked locations
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FRONTEND_DIR="${REPO_ROOT}/frontend"

if [[ ! -d "${FRONTEND_DIR}" ]]; then
  echo "[install_frontend_deps] Unable to locate frontend directory at: ${FRONTEND_DIR}" >&2
  echo "Make sure you are running this script from inside the cloned repository." >&2
  exit 1
fi

# Allow callers to pass additional npm arguments transparently
npm install --prefix "${FRONTEND_DIR}" "$@"
