// セーブデータ管理（LocalStorage に自動保存）
import { DEFAULT_CONDITIONS } from './engine.js';
import { applyLevel } from './progress.js';

const KEY = 'chemlab.save';
export const SAVE_VERSION = 2;

export function freshState(db) {
  return {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    owned: db.substances.filter((s) => s.unlock === 'initial').map((s) => s.id),
    newSubstances: [],
    discoveredReactions: {},
    discoveredNonReactions: [],
    stats: { experiments: 0, successes: 0 },
    bench: [],
    conditions: { ...DEFAULT_CONDITIONS },
    log: [],
    flags: { introSeen: false },
    settings: { noHint: false },
    research: {
      xp: 0,
      level: 1,
      missions: {}, // id -> { completed, completedAt, hintsUsed, answerShown, xp }
      hints: {}, // id -> 表示したヒント数
      answers: {}, // id -> 解答を見たか
      active: null, // 取り組み中のミッション
    },
  };
}

/** 古いセーブデータや欠損したフィールドを補う */
export function migrate(state, db) {
  const base = freshState(db);
  const fromVersion = state.version || 1;
  const s = { ...base, ...state };
  s.stats = { ...base.stats, ...(state.stats || {}) };
  s.conditions = { ...base.conditions, ...(state.conditions || {}) };
  s.flags = { ...base.flags, ...(state.flags || {}) };
  s.settings = { ...base.settings, ...(state.settings || {}) };
  s.research = { ...base.research, ...(state.research || {}) };
  for (const k of ['missions', 'hints', 'answers']) s.research[k] = { ...(s.research[k] || {}) };
  s.discoveredReactions = { ...(state.discoveredReactions || {}) };
  s.discoveredNonReactions = [...(state.discoveredNonReactions || [])];

  // データ更新で初期物質が増えた場合に追加し、削除された物質は取り除く
  const valid = new Set(db.substances.map((x) => x.id));
  const owned = new Set((s.owned || []).filter((id) => valid.has(id)));
  for (const id of base.owned) owned.add(id);
  s.owned = [...owned];
  s.bench = (s.bench || []).filter((id) => owned.has(id));
  s.newSubstances = (s.newSubstances || []).filter((id) => owned.has(id));
  for (const id of Object.keys(s.discoveredReactions)) if (!db.reactionMap[id]) delete s.discoveredReactions[id];
  if (s.research.active && !db.missionMap[s.research.active]) s.research.active = null;

  // v1 → v2: Phase 1 の実績から経験値とミッション達成を遡って付与する
  if (fromVersion < 2) {
    const X = db.progression.xp;
    let xp = Object.keys(s.discoveredReactions).length * (X.newReaction || 0);
    xp += s.owned.filter((id) => db.substanceMap[id] && db.substanceMap[id].unlock === 'product').length * (X.newSubstance || 0);
    xp += s.discoveredNonReactions.length * (X.newNonReaction || 0);
    // 依存関係順に、達成済みの目的をもつミッションを完了扱いにする
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const m of db.missions) {
        if (s.research.missions[m.id]) continue;
        if ((m.requires || []).some((r) => !s.research.missions[r])) continue;
        const o = m.objective;
        const done = o.type === 'reaction' ? !!s.discoveredReactions[o.id] : s.discoveredNonReactions.includes(o.id);
        if (!done) continue;
        s.research.missions[m.id] = { completed: true, completedAt: Date.now(), hintsUsed: 0, answerShown: false, xp: m.reward.xp, retroactive: true };
        xp += m.reward.xp;
        for (const id of (m.reward && m.reward.unlock) || []) if (!s.owned.includes(id)) s.owned.push(id);
        progressed = true;
      }
    }
    s.research.xp = xp;
    s.research.level = 1;
  }
  applyLevel(s, db); // レベルに応じた解放物質を必ず所持させる（データ追加にも追従）
  for (const l of db.progression.levels) {
    if (l.level <= s.research.level) for (const id of l.unlock || []) if (!s.owned.includes(id)) s.owned.push(id);
  }
  for (const [mid, rec] of Object.entries(s.research.missions)) {
    const m = db.missionMap[mid];
    if (m && rec.completed) for (const id of (m.reward && m.reward.unlock) || []) if (!s.owned.includes(id)) s.owned.push(id);
  }
  s.version = SAVE_VERSION;
  return s;
}

export function createStore(db, storage = globalThis.localStorage) {
  let storageOK = true;
  let state;
  try {
    const raw = storage.getItem(KEY);
    state = raw ? migrate(JSON.parse(raw), db) : freshState(db);
  } catch {
    storageOK = false;
    state = freshState(db);
  }
  const listeners = new Set();

  function save() {
    try {
      storage.setItem(KEY, JSON.stringify(state));
      storageOK = true;
    } catch {
      storageOK = false;
    }
    listeners.forEach((fn) => fn(state));
  }

  return {
    get state() { return state; },
    get storageOK() { return storageOK; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    update(fn) { const r = fn(state); save(); return r; },
    exportText() { return JSON.stringify(state); },
    importText(text) {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.owned)) throw new Error('セーブデータの形式が正しくありません');
      state = migrate(parsed, db);
      save();
    },
    reset() { state = freshState(db); save(); },
  };
}
