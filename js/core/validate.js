// データ検証（DOM 非依存）。ブラウザの設定画面と Node の CI の両方から使う。
//  - 反応式の原子数保存・電荷保存
//  - 参照 ID の存在確認
//  - 構造データと化学式の整合
//  - 出典・検証状況の記載確認
import { parseFormula, addCounts } from './formula.js';
import { conditionSets, NONE } from './engine.js';

const LEVELS = ['standard', 'simplified', 'uncertain'];
const REVIEWS = ['ai-draft', 'human-reviewed'];
const COND_KEYS = ['temperature', 'pressure', 'catalyst', 'solvent', 'activation'];

function sameCounts(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if ((a[k] || 0) !== (b[k] || 0)) return false;
  return true;
}

const fmt = (c) => Object.entries(c).sort().map(([k, v]) => `${k}${v}`).join(' ');

/** 構造式ラベル（例: "H3C", "O⁻", "Na⁺"）から元素の数を数える */
function labelCounts(label) {
  const clean = String(label).replace(/[⁺⁻+\-−0-9]+$/u, (m) => m.replace(/[⁺⁻+\-−]/gu, '')).replace(/[⁺⁻]/gu, '');
  return parseFormula(clean);
}

function chargeValue(ch) {
  if (!ch) return 0;
  const s = String(ch).replace('−', '-');
  const m = s.match(/^(\d*)([+-])$/);
  if (!m) return NaN;
  return (m[1] ? parseInt(m[1], 10) : 1) * (m[2] === '+' ? 1 : -1);
}

export function structureCounts(structure) {
  const counts = {};
  if (!structure) return null;
  switch (structure.type) {
    case 'molecule':
      for (const [label] of structure.atoms) addCounts(counts, labelCounts(label));
      return counts;
    case 'ionic':
      for (const [label, , n] of structure.ions) addCounts(counts, parseFormula(label), n || 1);
      return counts;
    case 'metal':
    case 'atom':
      counts[structure.element] = 1;
      return counts;
    default:
      return null;
  }
}

/**
 * データベース全体を検証する。
 * @returns {{errors:string[], warnings:string[], stats:object}}
 */
export function validateDatabase(db) {
  const errors = [];
  const warnings = [];
  const E = (m) => errors.push(m);
  const W = (m) => warnings.push(m);

  // --- 物質 ---
  const seen = new Set();
  for (const s of db.substances) {
    if (seen.has(s.id)) E(`物質 ID が重複: ${s.id}`);
    seen.add(s.id);
    let counts;
    try {
      counts = parseFormula(s.formula);
    } catch (e) {
      E(`物質 ${s.id}: ${e.message}`);
      continue;
    }
    for (const el of Object.keys(counts)) if (!db.elements[el]) E(`物質 ${s.id}: 未登録の元素 ${el}`);
    if (!s.name) E(`物質 ${s.id}: name がありません`);
    if (!['initial', 'product'].includes(s.unlock)) E(`物質 ${s.id}: unlock が不正 (${s.unlock})`);
    if (!s.structure) {
      W(`物質 ${s.id}: 構造データがありません`);
    } else {
      try {
        const sc = structureCounts(s.structure);
        if (sc && !sameCounts(sc, counts))
          E(`物質 ${s.id}: 構造式の原子数 (${fmt(sc)}) が化学式 ${s.formula} (${fmt(counts)}) と一致しません`);
        if (s.structure.type === 'ionic') {
          const total = s.structure.ions.reduce((t, [, ch, n]) => t + chargeValue(ch) * (n || 1), 0);
          if (total !== 0) E(`物質 ${s.id}: イオンの電荷の総和が 0 ではありません (${total})`);
        }
        if (s.structure.type === 'molecule') {
          const n = s.structure.atoms.length;
          for (const b of s.structure.bonds) if (b[0] >= n || b[1] >= n) E(`物質 ${s.id}: 結合が存在しない原子を参照しています`);
        }
      } catch (e) {
        E(`物質 ${s.id}: 構造データの解析エラー: ${e.message}`);
      }
    }
  }

  // --- 反応 ---
  const rseen = new Set();
  for (const r of db.reactions) {
    if (rseen.has(r.id)) E(`反応 ID が重複: ${r.id}`);
    rseen.add(r.id);
    const left = {};
    const right = {};
    let lq = 0;
    let rq = 0;
    let ok = true;
    for (const [side, list, acc] of [['反応物', r.reactants, left], ['生成物', r.products, right]]) {
      if (!list || !list.length) { E(`反応 ${r.id}: ${side}がありません`); ok = false; continue; }
      for (const x of list) {
        const s = db.substanceMap[x.id];
        if (!s) { E(`反応 ${r.id}: ${side}の物質 ${x.id} が未登録`); ok = false; continue; }
        if (!Number.isInteger(x.n) || x.n < 1) E(`反応 ${r.id}: 係数が不正 (${x.id}: ${x.n})`);
        addCounts(acc, parseFormula(s.formula), x.n);
        const q = (s.charge || 0) * x.n;
        if (acc === left) lq += q; else rq += q;
      }
    }
    if (ok && !sameCounts(left, right)) E(`反応 ${r.id}: 原子数が保存されていません 左[${fmt(left)}] 右[${fmt(right)}]`);
    if (lq !== rq) E(`反応 ${r.id}: 電荷が保存されていません (${lq} → ${rq})`);

    for (const set of conditionSets(r)) {
      for (const k of Object.keys(set)) if (!COND_KEYS.includes(k)) E(`反応 ${r.id}: 未知の条件キー ${k}`);
      for (const id of set.catalyst || []) {
        const s = db.substanceMap[id];
        if (!s) E(`反応 ${r.id}: 触媒 ${id} が未登録`);
        else if (!(s.tags || []).includes('catalyst')) E(`反応 ${r.id}: ${id} に catalyst タグがありません`);
      }
      for (const id of set.solvent || []) {
        if (id === NONE) continue;
        const s = db.substanceMap[id];
        if (!s) E(`反応 ${r.id}: 溶媒 ${id} が未登録`);
        else if (!(s.tags || []).includes('solvent')) E(`反応 ${r.id}: ${id} に solvent タグがありません`);
      }
      for (const k of ['temperature', 'pressure']) {
        const v = set[k];
        if (v && v.min != null && v.max != null && v.min > v.max) E(`反応 ${r.id}: ${k} の min > max`);
      }
      if (set.activation && !['light', 'spark'].includes(set.activation)) E(`反応 ${r.id}: activation が不正`);
    }
    for (const rel of r.related || []) if (!db.reactionMap[rel]) E(`反応 ${r.id}: 関連反応 ${rel} が未登録`);

    const v = r.verification;
    if (!v) E(`反応 ${r.id}: verification（検証状況）がありません`);
    else {
      if (!LEVELS.includes(v.level)) E(`反応 ${r.id}: verification.level が不正 (${v.level})`);
      if (!REVIEWS.includes(v.review)) E(`反応 ${r.id}: verification.review が不正 (${v.review})`);
      if (!v.sources || !v.sources.length) W(`反応 ${r.id}: 出典がありません`);
      if (v.review === 'ai-draft') { /* 人による査読待ち: 集計のみ */ }
    }
    if (!r.summary) W(`反応 ${r.id}: summary がありません`);
    if (!r.mechanism || !r.mechanism.length) W(`反応 ${r.id}: 反応機構の説明がありません`);
  }

  // 生成物として作れない product 物質（入手不可能）の検出
  const producible = new Set(db.reactions.flatMap((r) => r.products.map((p) => p.id)));
  for (const s of db.substances) {
    if (s.unlock === 'product' && !producible.has(s.id)) W(`物質 ${s.id}: unlock=product だが、生成する反応がありません`);
  }

  // 反応しない組み合わせ
  for (const n of db.nonReactions || []) {
    for (const id of n.reagents) if (!db.substanceMap[id]) E(`非反応 ${n.id}: 物質 ${id} が未登録`);
    const key = [...n.reagents].sort().join('+');
    for (const r of db.reactions) {
      const rk = [...new Set(r.reactants.map((x) => x.id))].sort().join('+');
      if (rk === key) W(`非反応 ${n.id}: 反応 ${r.id} と反応物が同じです（矛盾の可能性）`);
    }
  }

  const stats = {
    substances: db.substances.length,
    reactions: db.reactions.length,
    nonReactions: (db.nonReactions || []).length,
    awaitingReview: db.reactions.filter((r) => r.verification && r.verification.review !== 'human-reviewed').length,
    simplified: db.reactions.filter((r) => r.verification && r.verification.level !== 'standard').length,
  };
  return { errors, warnings, stats };
}
