// 研究の進行（経験値・研究レベル・ミッション・物質の解放）。DOM 非依存。

/** 累計経験値からレベル情報を求める */
export function levelInfo(xp, db) {
  const levels = db.progression.levels;
  let cur = levels[0];
  for (const l of levels) if (xp >= l.xp) cur = l;
  const next = levels.find((l) => l.level === cur.level + 1) || null;
  const span = next ? next.xp - cur.xp : 1;
  const into = next ? xp - cur.xp : 1;
  return { level: cur.level, title: cur.title, current: cur, next, progress: Math.max(0, Math.min(1, into / span)), toNext: next ? next.xp - xp : 0 };
}

/** ミッションの状態: completed / available / locked */
export function missionStatus(mission, state) {
  const rec = state.research.missions[mission.id];
  if (rec && rec.completed) return 'completed';
  if (lockReason(mission, state)) return 'locked';
  return 'available';
}

/** ロック理由（なければ null） */
export function lockReason(mission, state, db) {
  const lv = state.research.level;
  const missing = (mission.requires || []).filter((id) => !(state.research.missions[id] && state.research.missions[id].completed));
  if (missing.length) {
    const names = db ? missing.map((id) => (db.missionMap[id] ? `「${db.missionMap[id].title}」` : id)).join('・') : missing.join(', ');
    return `${names} の完了が必要`;
  }
  if ((mission.minLevel || 1) > lv) return `研究レベル ${mission.minLevel} で解放`;
  return null;
}

/** ミッションの目的が実験結果で達成されたか */
export function objectiveMet(objective, result) {
  if (objective.type === 'reaction') return result.outcome === 'success' && result.reaction.id === objective.id;
  if (objective.type === 'nonReaction') return result.outcome === 'no_reaction' && result.nonReaction.id === objective.id;
  return false;
}

/** ヒント使用数に応じた報酬倍率 */
export function rewardMultiplier(hintsUsed, answerShown, noHintMode, db) {
  const x = db.progression.xp;
  if (noHintMode && !hintsUsed && !answerShown) return x.noHintBonus;
  if (answerShown) return x.answerMultiplier;
  return x.hintMultipliers[Math.min(hintsUsed, x.hintMultipliers.length - 1)];
}

/**
 * 実験結果をセーブデータに反映する（state を直接変更）。
 * @returns {{xp:number, breakdown:Array<{label:string,xp:number}>, newSubstances:string[], newReaction:boolean,
 *            newNonReaction:boolean, completedMissions:object[], levelUps:object[], unlocked:string[]}}
 */
export function applyResult(state, result, db) {
  const X = db.progression.xp;
  const out = { xp: 0, breakdown: [], newSubstances: [], newReaction: false, newNonReaction: false, completedMissions: [], levelUps: [], unlocked: [] };
  const gain = (label, xp) => { if (xp > 0) { out.xp += xp; out.breakdown.push({ label, xp }); } };

  state.stats.experiments++;
  if (result.outcome === 'success') {
    state.stats.successes++;
    const rid = result.reaction.id;
    const prev = state.discoveredReactions[rid];
    out.newReaction = !prev;
    state.discoveredReactions[rid] = { count: (prev ? prev.count : 0) + 1, firstAt: prev ? prev.firstAt : Date.now() };
    gain(prev ? '反応の再現' : '新しい反応の発見', prev ? X.repeatReaction : X.newReaction);
    for (const pid of result.products) {
      if (!state.owned.includes(pid)) {
        state.owned.push(pid);
        state.newSubstances.push(pid);
        out.newSubstances.push(pid);
        gain(`新物質：${db.substanceMap[pid].name}`, X.newSubstance);
      }
    }
  } else if (result.outcome === 'no_reaction') {
    if (!state.discoveredNonReactions.includes(result.nonReaction.id)) {
      state.discoveredNonReactions.push(result.nonReaction.id);
      out.newNonReaction = true;
      gain('研究ノートへの記録', X.newNonReaction);
    }
  }

  // ミッション判定（解放済みのミッションはアクティブでなくても達成扱い）
  for (const m of db.missions) {
    if (missionStatus(m, state) !== 'available') continue;
    if (!objectiveMet(m.objective, result)) continue;
    const used = state.research.hints[m.id] || 0;
    const answer = !!(state.research.answers[m.id]);
    const mult = rewardMultiplier(used, answer, state.settings.noHint, db);
    const xp = Math.round(m.reward.xp * mult);
    state.research.missions[m.id] = { completed: true, completedAt: Date.now(), hintsUsed: used, answerShown: answer, xp };
    if (state.research.active === m.id) state.research.active = null;
    gain(`課題達成：${m.title}${mult !== 1 ? `（×${mult}）` : ''}`, xp);
    out.completedMissions.push(m);
    grant(state, m.reward.unlock || [], out);
  }

  state.research.xp += out.xp;
  applyLevel(state, db, out);
  state.log.unshift({ t: Date.now(), reagents: result.reagents, outcome: result.outcome, reaction: result.reaction ? result.reaction.id : null, xp: out.xp });
  state.log = state.log.slice(0, 50);
  return out;
}

function grant(state, ids, out) {
  for (const id of ids) {
    if (!state.owned.includes(id)) {
      state.owned.push(id);
      state.newSubstances.push(id);
      out.unlocked.push(id);
    }
  }
}

/** 経験値に応じてレベルを上げ、報酬を付与する */
export function applyLevel(state, db, out = { levelUps: [], unlocked: [] }) {
  const info = levelInfo(state.research.xp, db);
  while (state.research.level < info.level) {
    state.research.level++;
    const l = db.progression.levels.find((x) => x.level === state.research.level);
    if (!l) continue;
    out.levelUps.push(l);
    grant(state, l.unlock || [], out);
  }
  return out;
}

/** すべての報酬（レベル・ミッション）で入手できる物質 */
export function rewardSources(db) {
  const src = {};
  for (const l of db.progression.levels) for (const id of l.unlock || []) (src[id] ||= []).push(`研究レベル ${l.level}`);
  for (const m of db.missions) for (const id of (m.reward && m.reward.unlock) || []) (src[id] ||= []).push(`課題「${m.title}」`);
  return src;
}

/**
 * 到達可能性の解析: 初期物質と全報酬から、反応を繰り返して入手できる物質の集合を求める。
 * 反応物・触媒・溶媒（指定がある場合はいずれか 1 つ）が入手可能なら、その反応は実行可能とみなす。
 */
export function reachableSubstances(db) {
  const have = new Set(db.substances.filter((s) => s.unlock === 'initial').map((s) => s.id));
  for (const id of Object.keys(rewardSources(db))) have.add(id);
  const usableReactions = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of db.reactions) {
      if (usableReactions.has(r.id)) continue;
      if (!r.reactants.every((x) => have.has(x.id))) continue;
      const sets = Array.isArray(r.conditions) ? r.conditions : [r.conditions || {}];
      const ok = sets.some((s) => (!s.catalyst || s.catalyst.some((c) => have.has(c))) && (!s.solvent || s.solvent.some((c) => c === 'none' || have.has(c))));
      if (!ok) continue;
      usableReactions.add(r.id);
      for (const p of r.products) if (!have.has(p.id)) { have.add(p.id); changed = true; }
      changed = true;
    }
  }
  return { substances: have, reactions: usableReactions };
}
