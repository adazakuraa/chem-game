// 研究進行（経験値・レベル・ミッション・解放）のテスト: node tools/progress.test.mjs
import assert from 'node:assert/strict';
import { loadNodeDatabase } from './node-db.mjs';
import { runExperiment, conditionSets, NONE } from '../js/core/engine.js';
import { applyResult, levelInfo, missionStatus, rewardMultiplier } from '../js/core/progress.js';
import { freshState, migrate, createStore } from '../js/core/store.js';

const db = loadNodeDatabase();
let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`✅ ${name}`); } catch (e) { console.log(`❌ ${name}\n   ${e.stack}`); process.exitCode = 1; }
};
const clone = (o) => JSON.parse(JSON.stringify(o));

/** 反応の条件セットを満たす実験条件を組み立てる（テスト用） */
function conditionsFor(set) {
  const mid = (r, def) => (!r ? def : r.min != null && r.max != null ? Math.round((r.min + r.max) / 2) : r.min != null ? r.min : r.max);
  return {
    temperature: mid(set.temperature, 25),
    pressure: mid(set.pressure, 1),
    catalyst: set.catalyst ? set.catalyst[0] : NONE,
    solvent: set.solvent ? set.solvent[0] : NONE,
    activation: set.activation || NONE,
  };
}

/** 所持物質で反応を起こせるなら実行して結果を返す */
function tryReaction(state, rid) {
  const r = db.reactionMap[rid];
  for (const set of conditionSets(r)) {
    const cond = conditionsFor(set);
    const reagents = r.reactants.map((x) => x.id).filter((id) => id !== cond.solvent);
    const needs = [...reagents, cond.catalyst, cond.solvent].filter((id) => id !== NONE);
    if (!needs.every((id) => state.owned.includes(id))) continue;
    const result = runExperiment(db, { reagents, conditions: cond });
    if (result.outcome === 'success' && result.reaction.id === rid) return result;
  }
  return null;
}

test('XP 倍率: ヒントなし < ヒント使用 < 解答閲覧 の順に減る', () => {
  assert.equal(rewardMultiplier(0, false, false, db), 1);
  assert.equal(rewardMultiplier(0, false, true, db), db.progression.xp.noHintBonus);
  assert.ok(rewardMultiplier(1, false, false, db) < 1);
  assert.ok(rewardMultiplier(3, true, false, db) < rewardMultiplier(3, false, false, db));
});

test('レベル計算', () => {
  assert.equal(levelInfo(0, db).level, 1);
  assert.equal(levelInfo(150, db).level, 2);
  assert.ok(levelInfo(149, db).progress < 1);
});

test('初期状態では報酬物質を所持していない', () => {
  const s = freshState(db);
  for (const id of ['cl2', 'na', 'br2', 'agno3']) assert.ok(!s.owned.includes(id), id);
  assert.equal(missionStatus(db.missionMap.m_neutral, s), 'available');
  assert.equal(missionStatus(db.missionMap.m_hydrogen, s), 'locked');
});

test('中和でミッション達成 → 経験値と硝酸銀を入手', () => {
  const s = freshState(db);
  const res = runExperiment(db, { reagents: ['hcl', 'naoh'], conditions: {} });
  const out = applyResult(s, res, db);
  assert.equal(out.completedMissions[0].id, 'm_neutral');
  assert.ok(s.owned.includes('agno3'));
  assert.equal(s.research.xp, db.progression.xp.newReaction + db.missionMap.m_neutral.reward.xp);
  assert.equal(missionStatus(db.missionMap.m_hydrogen, s), 'available');
});

test('ヒント使用で報酬が減る', () => {
  const s = freshState(db);
  s.research.hints.m_neutral = 2;
  applyResult(s, runExperiment(db, { reagents: ['hcl', 'naoh'], conditions: {} }), db);
  assert.equal(s.research.missions.m_neutral.xp, Math.round(db.missionMap.m_neutral.reward.xp * db.progression.xp.hintMultipliers[2]));
});

test('レベルアップで塩素が解放される', () => {
  const s = freshState(db);
  s.research.xp = 149;
  applyResult(s, runExperiment(db, { reagents: ['caco3'], conditions: { temperature: 950 } }), db);
  assert.ok(s.research.level >= 2);
  assert.ok(s.owned.includes('cl2'));
});

test('同じ反応の繰り返しは経験値が少ない', () => {
  const s = freshState(db);
  const res = () => runExperiment(db, { reagents: ['nahco3', 'hcl'], conditions: {} });
  const a = applyResult(s, res(), db).xp;
  const b = applyResult(s, res(), db).xp;
  assert.ok(b < a);
  assert.equal(b, db.progression.xp.repeatReaction);
});

test('Phase 1 のセーブデータを移行すると経験値・課題・解放が遡って付与される', () => {
  const v1 = {
    version: 1,
    owned: [...freshState(db).owned, 'cl2', 'br2', 'c2h4', 'h2o'],
    discoveredReactions: { r_neutralization: { count: 1, firstAt: 1 }, r_ethanol_to_ethylene: { count: 2, firstAt: 2 } },
    discoveredNonReactions: [],
    stats: { experiments: 5, successes: 3 },
    research: { xp: 0, level: 1, missions: {} },
  };
  const s = migrate(clone(v1), db);
  assert.equal(s.version, 2);
  assert.ok(s.research.missions.m_neutral.completed);
  assert.ok(s.research.missions.m_elimination.completed);
  assert.ok(s.research.xp > 0);
  assert.ok(s.owned.includes('cl2'), 'Phase 1 で所持していた物質は失われない');
  assert.ok(s.owned.includes('agno3'), '遡って達成した課題の報酬を受け取る');
});

test('ストアは壊れたセーブデータでも起動できる', () => {
  const mem = { getItem: () => '{broken', setItem: () => {} };
  const store = createStore(db, mem);
  assert.equal(store.state.research.level, 1);
});

test('通しプレイ: 新規データから全研究課題を達成できる（詰みがない）', () => {
  const s = freshState(db);
  let guard = 0;
  while (guard++ < 300) {
    const pending = db.missions.filter((m) => missionStatus(m, s) === 'available');
    let progressed = false;
    for (const m of pending) {
      if (m.objective.type === 'reaction') {
        const res = tryReaction(s, m.objective.id);
        if (res) { applyResult(s, res, db); progressed = true; }
      } else {
        const n = db.nonReactions.find((x) => x.id === m.objective.id);
        if (n.reagents.every((id) => s.owned.includes(id))) {
          applyResult(s, runExperiment(db, { reagents: n.reagents, conditions: {} }), db);
          progressed = true;
        }
      }
    }
    if (progressed) continue;
    // 課題が進まないときは自由実験で未発見の反応を探す（経験値稼ぎ）
    const fresh = db.reactions.find((r) => !s.discoveredReactions[r.id] && tryReaction(s, r.id));
    if (fresh) { applyResult(s, tryReaction(s, fresh.id), db); continue; }
    break;
  }
  const left = db.missions.filter((m) => missionStatus(m, s) !== 'completed').map((m) => `${m.id}(${missionStatus(m, s)})`);
  assert.deepEqual(left, [], `未達成の課題: ${left.join(', ')} / Lv.${s.research.level} ${s.research.xp}XP`);
  console.log(`   → 全 ${db.missions.length} 課題達成時点: Lv.${s.research.level}, ${s.research.xp} XP, 反応 ${Object.keys(s.discoveredReactions).length}/${db.reactions.length}, 物質 ${s.owned.length}/${db.substances.length}`);
});

console.log(`\n${passed} 件のテストに合格`);
