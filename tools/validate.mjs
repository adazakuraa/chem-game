// データ検証スクリプト: node tools/validate.mjs
// GitHub Actions でも push ごとに実行される（スマートフォンからでも結果を確認できる）。
import { loadNodeDatabase } from './node-db.mjs';
import { validateDatabase } from '../js/core/validate.js';

const db = loadNodeDatabase();
const { errors, warnings, stats } = validateDatabase(db);

console.log(`物質 ${stats.substances} / 反応 ${stats.reactions} / 非反応 ${stats.nonReactions} / 研究課題 ${stats.missions}`);
console.log(`査読待ちの反応 ${stats.awaitingReview} / 簡略化を含む反応 ${stats.simplified}`);
for (const w of warnings) console.log(`⚠️  ${w}`);
for (const e of errors) console.log(`❌ ${e}`);
if (errors.length) {
  console.log(`\n${errors.length} 件のエラーがあります。`);
  process.exit(1);
}
console.log('\n✅ データ検証に合格しました（原子数・電荷・参照・構造式の整合）。');
