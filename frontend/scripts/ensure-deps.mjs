#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendDir = join(__dirname, '..');
const viteBinary = join(
  frontendDir,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite'
);

if (existsSync(viteBinary)) {
  process.exit(0);
}

console.log('[frontend] Локальные зависимости не найдены. Выполняем npm install...');
const installResult = spawnSync('npm', ['install'], {
  cwd: frontendDir,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (installResult.status !== 0) {
  console.error(
    '\n[frontend] Установка зависимостей завершилась с ошибкой. Повторите команду вручную: npm install'
  );
  process.exit(installResult.status ?? 1);
}
