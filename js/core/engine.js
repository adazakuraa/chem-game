// 化学反応判定エンジン（DOM 非依存）
//
// 判定の流れ:
//  1. 候補探索: 選択した試薬すべてを反応物に含み、反応物が「試薬 ∪ 溶媒」で賄える反応を候補とする
//  2. 条件評価: 各候補の条件セット（OR）ごとに温度・圧力・触媒・溶媒・活性化を評価（セット内 AND）
//  3. 成功した候補があれば priority の高いものを採用。なければ失敗理由の少ない候補を「惜しい反応」として返す
//  4. 候補がなければ「反応しないことが既知の組み合わせ」を照合し、それも無ければ「未登録」
//
// 未登録の組み合わせを「反応しない」と断定しないことが重要（化学的誠実さ）。

export const NONE = 'none';

export const DEFAULT_CONDITIONS = Object.freeze({
  temperature: 25,
  pressure: 1,
  catalyst: NONE,
  solvent: NONE,
  activation: NONE,
});

/** 反応データの条件を常に配列（条件セットの OR）として扱う */
export function conditionSets(reaction) {
  const c = reaction.conditions;
  if (!c) return [{}];
  return Array.isArray(c) ? (c.length ? c : [{}]) : [c];
}

const ACTIVATION_LABEL = { light: '光照射（hν）', spark: '点火' };

/**
 * 1 つの条件セットを評価し、満たされない条件のリストを返す。
 * @returns {Array<{key:string, code:string, message:string}>}
 */
export function evaluateConditionSet(set, cond, reaction, db) {
  const fails = [];
  const hints = reaction.failHints || {};
  const name = (id) => (db.substanceMap[id] ? db.substanceMap[id].name : id);
  const pick = (code, fallback) => hints[code] || hints[code.split('_')[0]] || fallback;

  if (set.temperature) {
    const { min, max } = set.temperature;
    if (min != null && cond.temperature < min)
      fails.push({ key: 'temperature', code: 'temperature_low', message: pick('temperature_low', '温度が低すぎるようです。') });
    if (max != null && cond.temperature > max)
      fails.push({ key: 'temperature', code: 'temperature_high', message: pick('temperature_high', '温度が高すぎるようです。') });
  }
  if (set.pressure) {
    const { min, max } = set.pressure;
    if (min != null && cond.pressure < min)
      fails.push({ key: 'pressure', code: 'pressure_low', message: pick('pressure_low', '圧力が足りないようです。') });
    if (max != null && cond.pressure > max)
      fails.push({ key: 'pressure', code: 'pressure_high', message: pick('pressure_high', '圧力が高すぎるようです。') });
  }
  if (set.catalyst && set.catalyst.length) {
    if (!set.catalyst.includes(cond.catalyst)) {
      const fallback = cond.catalyst === NONE
        ? '反応がきわめて遅く、進みませんでした。何かが足りないようです。'
        : `${name(cond.catalyst)} はこの反応の触媒として働かないようです。`;
      fails.push({ key: 'catalyst', code: 'catalyst', message: cond.catalyst === NONE ? pick('catalyst', fallback) : fallback });
    }
  }
  if (set.solvent && set.solvent.length) {
    if (!set.solvent.includes(cond.solvent)) {
      const fallback = cond.solvent === NONE ? 'この反応には適切な溶媒が必要です。' : `溶媒 ${name(cond.solvent)} はこの反応に適していません。`;
      fails.push({ key: 'solvent', code: 'solvent', message: pick('solvent', fallback) });
    }
  }
  if (set.activation && cond.activation !== set.activation) {
    fails.push({ key: 'activation', code: 'activation', message: pick('activation', '反応のきっかけ（エネルギーの与え方）が足りないようです。') });
  }
  return fails;
}

/** 反応の全条件セットを評価し、最も満たされているセットの結果を返す */
export function evaluateReaction(reaction, cond, db) {
  let best = null;
  for (const set of conditionSets(reaction)) {
    const fails = evaluateConditionSet(set, cond, reaction, db);
    if (!best || fails.length < best.fails.length) best = { set, fails };
    if (fails.length === 0) break;
  }
  return best;
}

/**
 * 試薬の組み合わせに対する候補反応を探す。
 * - 選択した試薬はすべて反応物であること（ただし solvent タグを持つ試薬は溶媒として余ってよい）
 * - 反応物はすべて「選択試薬 ∪ 溶媒」に含まれること
 */
export function findCandidates(reagentIds, cond, db) {
  const selected = new Set(reagentIds);
  const out = [];
  for (const r of db.reactions) {
    const reactantIds = new Set(r.reactants.map((x) => x.id));
    const available = new Set(selected);
    if (cond.solvent && cond.solvent !== NONE) available.add(cond.solvent);
    if (![...reactantIds].every((id) => available.has(id))) continue;
    const leftovers = [...selected].filter((id) => !reactantIds.has(id));
    // 余った試薬は溶媒として振る舞える場合のみ許容（溶媒欄が空の場合に限る）
    let effectiveSolvent = cond.solvent;
    if (leftovers.length) {
      if (leftovers.length > 1) continue;
      const s = db.substanceMap[leftovers[0]];
      if (!s || !(s.tags || []).includes('solvent') || cond.solvent !== NONE) continue;
      effectiveSolvent = leftovers[0];
    }
    out.push({ reaction: r, effectiveSolvent });
  }
  return out;
}

/** 部分一致によるヒント（未登録の組み合わせ用）。答えそのものは明かさない */
function partialHints(reagentIds, db) {
  const selected = new Set(reagentIds);
  const hints = [];
  let subset = 0;
  let superset = 0;
  for (const r of db.reactions) {
    const ids = new Set(r.reactants.map((x) => x.id));
    const allSelInR = [...selected].every((id) => ids.has(id));
    const allRInSel = [...ids].every((id) => selected.has(id));
    if (allSelInR && !allRInSel) superset++;
    if (allRInSel && !allSelInR) subset++;
  }
  if (subset) hints.push('選んだ物質の一部だけで起こる反応が知られています。余分な物質を減らしてみましょう。');
  if (superset) hints.push('これらの物質に、さらに別の物質を加えると起こる反応が知られています。');
  return hints;
}

/**
 * 実験を実行する。
 * @param {object} db  loadDatabase() の戻り値
 * @param {{reagents:string[], conditions:object}} input
 * @returns {object} 結果。outcome: 'success' | 'failed' | 'no_reaction' | 'unknown' | 'empty'
 */
export function runExperiment(db, input) {
  const reagents = [...new Set(input.reagents || [])];
  const cond = { ...DEFAULT_CONDITIONS, ...(input.conditions || {}) };
  if (!reagents.length) return { outcome: 'empty', reagents, conditions: cond };

  const candidates = findCandidates(reagents, cond, db).map((c) => {
    const ev = evaluateReaction(c.reaction, { ...cond, solvent: c.effectiveSolvent }, db);
    return { ...c, fails: ev.fails, set: ev.set };
  });

  const successes = candidates.filter((c) => c.fails.length === 0);
  if (successes.length) {
    successes.sort((a, b) => (b.reaction.priority || 0) - (a.reaction.priority || 0));
    const chosen = successes[0];
    const advisories = (chosen.reaction.advisories || [])
      .filter((a) => matchesWhen(a.when, cond))
      .map((a) => a.text);
    const alternatives = candidates
      .filter((c) => c !== chosen)
      .map((c) => c.reaction.id);
    return {
      outcome: 'success',
      reagents,
      conditions: { ...cond, solvent: chosen.effectiveSolvent },
      reaction: chosen.reaction,
      products: chosen.reaction.products.map((p) => p.id),
      advisories,
      alternatives,
    };
  }

  if (candidates.length) {
    candidates.sort((a, b) => a.fails.length - b.fails.length);
    const best = candidates[0];
    // 同じ反応物を持つ他の候補（例：温度で生成物が変わる）も失敗理由とともに返す
    return {
      outcome: 'failed',
      reagents,
      conditions: cond,
      nearest: best.reaction,
      fails: best.fails,
      otherCandidates: candidates.slice(1).map((c) => ({ id: c.reaction.id, fails: c.fails })),
    };
  }

  const selectedKey = [...reagents].sort().join('+');
  const nr = (db.nonReactions || []).find((n) => {
    if ([...n.reagents].sort().join('+') !== selectedKey) return false;
    if (n.maxTemperature != null && cond.temperature > n.maxTemperature) return false;
    return true;
  });
  if (nr) return { outcome: 'no_reaction', reagents, conditions: cond, nonReaction: nr };

  return { outcome: 'unknown', reagents, conditions: cond, hints: partialHints(reagents, db) };
}

function matchesWhen(when, cond) {
  if (!when) return true;
  for (const key of ['temperature', 'pressure']) {
    if (!when[key]) continue;
    const { min, max } = when[key];
    if (min != null && cond[key] < min) return false;
    if (max != null && cond[key] > max) return false;
  }
  return true;
}

/** 条件の人間向け表記 */
export function describeConditions(cond, db) {
  const name = (id) => (db.substanceMap[id] ? db.substanceMap[id].name : id);
  const parts = [`${cond.temperature} °C`, `${cond.pressure} atm`];
  if (cond.catalyst && cond.catalyst !== NONE) parts.push(`触媒: ${name(cond.catalyst)}`);
  if (cond.solvent && cond.solvent !== NONE) parts.push(`溶媒: ${name(cond.solvent)}`);
  if (cond.activation && cond.activation !== NONE) parts.push(ACTIVATION_LABEL[cond.activation] || cond.activation);
  return parts.join(' / ');
}

/** 反応データの条件セットを人間向けに表記（図鑑用） */
export function describeConditionSet(set, db) {
  const name = (id) => (id === NONE ? 'なし' : db.substanceMap[id] ? db.substanceMap[id].name : id);
  const parts = [];
  const range = (r, unit) => {
    if (r.min != null && r.max != null) return `${r.min}〜${r.max} ${unit}`;
    if (r.min != null) return `${r.min} ${unit} 以上`;
    return `${r.max} ${unit} 以下`;
  };
  if (set.temperature) parts.push(`温度 ${range(set.temperature, '°C')}`);
  if (set.pressure) parts.push(`圧力 ${range(set.pressure, 'atm')}`);
  if (set.catalyst) parts.push(`触媒 ${set.catalyst.map(name).join(' または ')}`);
  if (set.solvent) parts.push(`溶媒 ${set.solvent.map(name).join(' または ')}`);
  if (set.activation) parts.push(ACTIVATION_LABEL[set.activation]);
  return parts.length ? parts.join('、') : '特別な条件なし（常温で混合）';
}

export { ACTIVATION_LABEL };
