// セーブデータ管理（LocalStorage に自動保存）
import { DEFAULT_CONDITIONS } from './engine.js';

const KEY = 'chemlab.save';
export const SAVE_VERSION = 1;

function freshState(db) {
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
    // Phase 2 で使用予定（データ構造だけ先に確保）
    research: { xp: 0, level: 1, missions: {} },
  };
}

/** 古いセーブデータや欠損したフィールドを補う */
function migrate(state, db) {
  const base = freshState(db);
  const s = { ...base, ...state };
  s.stats = { ...base.stats, ...(state.stats || {}) };
  s.conditions = { ...base.conditions, ...(state.conditions || {}) };
  s.flags = { ...base.flags, ...(state.flags || {}) };
  s.research = { ...base.research, ...(state.research || {}) };
  // データ更新で初期物質が増えた場合に追加し、削除された物質は取り除く
  const valid = new Set(db.substances.map((x) => x.id));
  const owned = new Set((s.owned || []).filter((id) => valid.has(id)));
  for (const id of base.owned) owned.add(id);
  s.owned = [...owned];
  s.bench = (s.bench || []).filter((id) => owned.has(id));
  s.newSubstances = (s.newSubstances || []).filter((id) => owned.has(id));
  s.version = SAVE_VERSION;
  return s;
}

export function createStore(db) {
  let storageOK = true;
  let state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? migrate(JSON.parse(raw), db) : freshState(db);
  } catch {
    storageOK = false;
    state = freshState(db);
  }
  const listeners = new Set();

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
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
    update(fn) { fn(state); save(); },
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
