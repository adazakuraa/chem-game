// UI 共通ユーティリティ
import { formulaHTML } from '../core/formula.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const FIELD_LABEL = {
  organic: '有機化学',
  inorganic: '無機化学',
  physical: '物理化学',
  analytical: '分析化学',
  biochem: '生化学',
};
export const CATEGORY_LABEL = { organic: '有機', inorganic: '無機' };
export const STATE_LABEL = { gas: '気体', liquid: '液体', solid: '固体', aq: '水溶液' };
export const STATE_ICON = { gas: '☁', liquid: '💧', solid: '◆', aq: '≋' };
export const LEVEL_LABEL = { standard: '教科書標準の反応', simplified: 'ゲーム用の簡略化を含む', uncertain: '不確実な点あり' };
export const REVIEW_LABEL = { 'ai-draft': 'AI 作成・専門家による査読待ち', 'human-reviewed': '専門家が査読済み' };
export const SAFETY_LABEL = { danger: '危険', caution: '注意', info: '安全メモ' };

/** 反応式の HTML */
export function equationHTML(reaction, db, { arrowLabel = '' } = {}) {
  const side = (list) =>
    list
      .map((x) => {
        const s = db.substanceMap[x.id];
        const coef = x.n > 1 ? `<span class="coef">${x.n}</span>` : '';
        return `<span class="term">${coef}<span class="f">${formulaHTML(s ? s.formula : x.id)}</span></span>`;
      })
      .join('<span class="plus">+</span>');
  const arrow = reaction.reversible ? '⇌' : '→';
  return `<div class="equation">${side(reaction.reactants)}<span class="arrow"><small>${esc(arrowLabel)}</small>${arrow}</span>${side(reaction.products)}</div>`;
}

export function toast(message, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }, 2600);
}

/** 色の平均（フラスコの液色用） */
export function mixColors(colors) {
  if (!colors.length) return null;
  let r = 0, g = 0, b = 0;
  for (const c of colors) {
    const n = parseInt(c.slice(1), 16);
    r += (n >> 16) & 255; g += (n >> 8) & 255; b += n & 255;
  }
  const k = colors.length;
  const hex = (v) => Math.round(v / k).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function fmtTemp(t) {
  return `${t} °C`;
}

export function fmtNumber(v, digits = 2) {
  return Number(v).toFixed(digits);
}
