// sw.js の PRECACHE に全アプリファイルが含まれているか確認（オフライン動作の保証）
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
const root = new URL('..', import.meta.url).pathname;
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const listed = new Set([...sw.matchAll(/'([^']+\.(?:js|json|css|html|svg|webmanifest))'/g)].map((m) => m[1]));
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = ['js', 'data', 'css', 'icons'].flatMap((d) => walk(join(root, d))).map((p) => relative(root, p));
const missing = files.filter((f) => !listed.has(f));
const extra = [...listed].filter((f) => { try { statSync(join(root, f)); return false; } catch { return true; } });
if (missing.length || extra.length) {
  console.log('❌ sw.js の PRECACHE が実ファイルと一致しません');
  missing.forEach((f) => console.log('  未登録: ' + f));
  extra.forEach((f) => console.log('  存在しない: ' + f));
  process.exit(1);
}
console.log(`✅ PRECACHE はすべてのアプリファイル (${files.length}) を含んでいます`);
