// Node 用のデータ読み込みヘルパー
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDatabase, DATA_FILES } from '../js/core/db.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadNodeDatabase() {
  const raw = {};
  for (const [key, path] of Object.entries(DATA_FILES)) {
    raw[key] = JSON.parse(readFileSync(join(root, path), 'utf8'));
  }
  return buildDatabase(raw);
}
