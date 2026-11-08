// 反応判定エンジンのテスト: node tools/engine.test.mjs
import assert from 'node:assert/strict';
import { loadNodeDatabase } from './node-db.mjs';
import { runExperiment } from '../js/core/engine.js';
import { parseFormula, molarMass, hillFormula } from '../js/core/formula.js';
import { validateDatabase } from '../js/core/validate.js';

const db = loadNodeDatabase();
let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`✅ ${name}`); } catch (e) { console.log(`❌ ${name}\n   ${e.message}`); process.exitCode = 1; }
};
const run = (reagents, conditions = {}) => runExperiment(db, { reagents, conditions });

// --- 化学式 ---
test('化学式の解析（括弧）', () => assert.deepEqual(parseFormula('Ca(OH)2'), { Ca: 1, O: 2, H: 2 }));
test('化学式の解析（入れ子・示性式）', () => assert.deepEqual(parseFormula('(C2H5)2O'), { C: 4, H: 10, O: 1 }));
test('不正な化学式はエラー', () => assert.throws(() => parseFormula('H2O)')));
test('分子量 H2O ≈ 18.015', () => assert.ok(Math.abs(molarMass('H2O', db.elements) - 18.015) < 0.001));
test('分子量 CH3COOC2H5 ≈ 88.106', () => assert.ok(Math.abs(molarMass('CH3COOC2H5', db.elements) - 88.106) < 0.01));
test('ヒル方式', () => assert.equal(hillFormula('C2H5OH'), 'C2H6O'));

// --- 反応判定 ---
test('中和: HCl + NaOH → NaCl + H2O', () => {
  const r = run(['hcl', 'naoh']);
  assert.equal(r.outcome, 'success');
  assert.equal(r.reaction.id, 'r_neutralization');
});
test('温度で生成物が変わる: エタノール 140 °C → ジエチルエーテル', () => {
  const r = run(['c2h5oh'], { catalyst: 'h2so4', temperature: 140 });
  assert.equal(r.reaction.id, 'r_ethanol_to_ether');
});
test('温度で生成物が変わる: エタノール 170 °C → エチレン', () => {
  const r = run(['c2h5oh'], { catalyst: 'h2so4', temperature: 170 });
  assert.equal(r.reaction.id, 'r_ethanol_to_ethylene');
});
test('触媒なしのエタノール加熱は失敗し、触媒のヒントが出る', () => {
  const r = run(['c2h5oh'], { temperature: 170 });
  assert.equal(r.outcome, 'failed');
  assert.ok(r.fails.some((f) => f.key === 'catalyst'));
});
test('暗所のメタン + 塩素は失敗（光が必要）', () => {
  const r = run(['ch4', 'cl2']);
  assert.equal(r.outcome, 'failed');
  assert.ok(r.fails.some((f) => f.key === 'activation'));
});
test('光照射でメタンの塩素化', () => {
  assert.equal(run(['ch4', 'cl2'], { activation: 'light' }).reaction.id, 'r_ch4_cl2');
});
test('溶媒で生成物が変わる: CCl4 中 → 1,2-ジブロモエタン', () => {
  const r = run(['c2h4', 'br2'], { solvent: 'ccl4' });
  assert.equal(r.reaction.id, 'r_c2h4_br2');
});
test('溶媒で生成物が変わる: 水中 → ブロモヒドリン', () => {
  const r = run(['c2h4', 'br2'], { solvent: 'h2o' });
  assert.equal(r.reaction.id, 'r_c2h4_br2_water');
  assert.deepEqual(r.products.sort(), ['bromoethanol', 'hbr']);
});
test('水を試薬として加えても溶媒扱いで AgCl 沈殿', () => {
  const r = run(['agno3', 'nacl', 'h2o']);
  assert.equal(r.outcome, 'success');
  assert.equal(r.reaction.id, 'r_agno3_nacl');
});
test('溶媒なしの固体同士では AgCl 沈殿しない', () => {
  assert.equal(run(['agno3', 'nacl']).outcome, 'failed');
});
test('ハーバー法: 鉄触媒・450 °C・200 atm で成功', () => {
  const r = run(['n2', 'h2'], { catalyst: 'fe', temperature: 450, pressure: 200 });
  assert.equal(r.reaction.id, 'r_haber');
  assert.equal(r.advisories.length, 0);
});
test('ハーバー法: 高温すぎると平衡に関する注意が出る', () => {
  const r = run(['n2', 'h2'], { catalyst: 'fe', temperature: 700, pressure: 200 });
  assert.equal(r.outcome, 'success');
  assert.equal(r.advisories.length, 1);
});
test('ハーバー法: 1 atm では失敗（圧力）', () => {
  const r = run(['n2', 'h2'], { catalyst: 'fe', temperature: 450, pressure: 1 });
  assert.ok(r.fails.some((f) => f.code === 'pressure_low'));
});
test('水素化: Pt は常温、Ni は加熱が必要', () => {
  assert.equal(run(['c2h4', 'h2'], { catalyst: 'pt' }).outcome, 'success');
  assert.equal(run(['c2h4', 'h2'], { catalyst: 'ni' }).outcome, 'failed');
  assert.equal(run(['c2h4', 'h2'], { catalyst: 'ni', temperature: 150 }).outcome, 'success');
});
test('銅 + 塩酸は「反応しない」（理由付き）', () => {
  const r = run(['cu', 'hcl']);
  assert.equal(r.outcome, 'no_reaction');
  assert.equal(r.nonReaction.id, 'nr_cu_hcl');
});
test('未登録の組み合わせは「未登録」（反応しないとは断定しない）', () => {
  assert.equal(run(['cu', 'br2']).outcome, 'unknown');
});
test('余分な物質があると部分一致のヒント', () => {
  const r = run(['hcl', 'naoh', 'cu']);
  assert.equal(r.outcome, 'unknown');
  assert.ok(r.hints.length > 0);
});
test('多段階合成: 酢酸エチル → けん化でエタノールに戻る', () => {
  const r = run(['etoac', 'naoh'], { solvent: 'h2o' });
  assert.ok(r.products.includes('c2h5oh'));
});
test('石灰石は 900 °C で分解、800 °C では分解しない', () => {
  assert.equal(run(['caco3'], { temperature: 900 }).outcome, 'success');
  assert.equal(run(['caco3'], { temperature: 800 }).outcome, 'failed');
});

// --- 検証器が誤りを検出できること ---
test('検証器: 原子数の誤りを検出する', () => {
  const broken = { ...db, reactions: db.reactions.map((r) => (r.id === 'r_neutralization' ? { ...r, products: [{ id: 'nacl', n: 1 }] } : r)) };
  const { errors } = validateDatabase(broken);
  assert.ok(errors.some((e) => e.includes('r_neutralization') && e.includes('原子数')));
});
test('検証器: 構造式と化学式の不一致を検出する', () => {
  const bad = { ...db.substanceMap.h2o, structure: { type: 'molecule', atoms: [['O', 0, 0], ['H', 1, 0]], bonds: [[0, 1, 1]] } };
  const broken = { ...db, substances: db.substances.map((s) => (s.id === 'h2o' ? bad : s)) };
  const { errors } = validateDatabase(broken);
  assert.ok(errors.some((e) => e.includes('h2o') && e.includes('構造式')));
});
test('現在のデータに検証エラーがない', () => {
  const { errors } = validateDatabase(db);
  assert.deepEqual(errors, []);
});

console.log(`\n${passed} 件のテストに合格`);
