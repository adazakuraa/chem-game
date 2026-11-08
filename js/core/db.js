// データベースの構築（DOM 非依存）。JSON データを索引付きの構造に変換する。
import { molarMass } from './formula.js';

export const DATA_FILES = {
  elements: 'data/elements.json',
  substances: 'data/substances.json',
  reactions: 'data/reactions.json',
  nonReactions: 'data/non_reactions.json',
};

/** 生の JSON 群からデータベースを作る */
export function buildDatabase(raw) {
  const elements = raw.elements.elements;
  const substances = raw.substances.substances;
  const reactions = raw.reactions.reactions;
  const nonReactions = raw.nonReactions ? raw.nonReactions.nonReactions : [];

  const substanceMap = {};
  for (const s of substances) {
    let mw = null;
    try { mw = molarMass(s.formula, elements); } catch { mw = null; }
    substanceMap[s.id] = { ...s, mw };
  }
  const reactionMap = {};
  for (const r of reactions) reactionMap[r.id] = r;

  // 物質 → 関連反応 の逆引き索引
  const asReactant = {};
  const asProduct = {};
  for (const r of reactions) {
    for (const x of r.reactants) (asReactant[x.id] ||= []).push(r.id);
    for (const x of r.products) (asProduct[x.id] ||= []).push(r.id);
  }

  return {
    elements,
    substances: substances.map((s) => substanceMap[s.id]),
    substanceMap,
    reactions,
    reactionMap,
    nonReactions,
    asReactant,
    asProduct,
  };
}

/** ブラウザ用: fetch で読み込む */
export async function loadDatabase(base = './') {
  const entries = await Promise.all(
    Object.entries(DATA_FILES).map(async ([key, path]) => {
      const res = await fetch(base + path);
      if (!res.ok) throw new Error(`${path} の読み込みに失敗しました (${res.status})`);
      return [key, await res.json()];
    }),
  );
  return buildDatabase(Object.fromEntries(entries));
}
