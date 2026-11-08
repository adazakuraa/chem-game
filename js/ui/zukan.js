// 物質図鑑
import { formulaHTML, hillFormula } from '../core/formula.js';
import { esc, STATE_LABEL, STATE_ICON, CATEGORY_LABEL, toast } from './util.js';
import { renderStructure } from './structure.js';
import { openSheet } from './modal.js';
import { acquireHint } from './research.js';

const BENCH_MAX = 3;
const PROP_LABEL = {
  appearance: '外観', mp: '融点', bp: '沸点', density: '密度', pKa: 'pKa', pKb: 'pKb', crystal: '結晶構造',
  decomposition: '分解', sublimation: '昇華点', solubility: '溶解性', E0: '標準電極電位',
};

function propValue(key, v) {
  if ((key === 'mp' || key === 'bp') && typeof v === 'number') return `${v} °C`;
  return String(v);
}

export function substanceDetailHTML(s, ctx) {
  const { db, store } = ctx;
  const props = Object.entries(s.properties || {})
    .map(([k, v]) => `<tr><th>${esc(PROP_LABEL[k] || k)}</th><td>${esc(propValue(k, v))}</td></tr>`).join('');
  const discovered = store.state.discoveredReactions;
  const relList = (ids, label) => {
    if (!ids || !ids.length) return '';
    const items = ids.map((rid) => {
      const r = db.reactionMap[rid];
      return discovered[rid]
        ? `<li><a href="#/reactions/${rid}">${esc(r.name)}</a></li>`
        : `<li class="locked">？？？（未発見の反応）</li>`;
    }).join('');
    return `<h4>${label}</h4><ul class="rel">${items}</ul>`;
  };
  const owned = store.state.owned.includes(s.id);
  return `
    <div class="sub-detail" style="--c:${s.color || '#9fd3ff'}">
      <div class="sub-hero">
        <div class="sub-formula">${formulaHTML(s.formula)}</div>
        <div class="sub-name">${esc(s.name)}<small>${esc(s.nameEn || '')}</small></div>
        <div class="sub-tags"><span class="tag">${esc(CATEGORY_LABEL[s.category] || '')}</span><span class="tag">${esc(s.kind || '')}</span><span class="tag">${STATE_ICON[s.state] || ''} ${esc(STATE_LABEL[s.state] || '')}</span>${(s.tags || []).map((t) => `<span class="tag accent">${t === 'catalyst' ? '触媒' : t === 'solvent' ? '溶媒' : esc(t)}</span>`).join('')}</div>
      </div>
      ${renderStructure(s.structure, db.elements, { className: 'big' })}
      <table class="props">
        <tr><th>分子式（ヒル方式）</th><td>${formulaHTML(hillFormula(s.formula))}</td></tr>
        <tr><th>分子量（式量）</th><td>${s.mw != null ? s.mw.toFixed(3) : '—'} g/mol</td></tr>
        ${props}
      </table>
      <p class="desc">${esc(s.description)}</p>
      ${s.uses && s.uses.length ? `<h4>用途</h4><ul class="uses">${s.uses.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>` : ''}
      ${s.hazards && s.hazards.length ? `<div class="safety danger"><b>⚠ 危険性</b>${s.hazards.map((h) => `<p>${esc(h)}</p>`).join('')}</div>` : ''}
      ${relList(db.asProduct[s.id], '生成する反応')}
      ${relList(db.asReactant[s.id], 'この物質を使う反応')}
      ${owned ? `<button class="btn primary wide" data-bench="${s.id}">実験台に置く</button>` : ''}
    </div>`;
}

function bindDetail(container, ctx, after) {
  container.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bench]');
    if (!b) return;
    const id = b.dataset.bench;
    let msg = '';
    ctx.store.update((s) => {
      if (s.bench.includes(id)) msg = 'すでに実験台にあります';
      else if (s.bench.length >= BENCH_MAX) msg = `実験台に置けるのは ${BENCH_MAX} 種までです`;
      else { s.bench.push(id); msg = '実験台に置きました'; }
    });
    toast(msg);
    if (after) after();
  });
}

/** 物質詳細をボトムシートで表示 */
export function showSubstanceSheet(id, ctx) {
  const s = ctx.db.substanceMap[id];
  if (!s) return;
  const sheet = openSheet(substanceDetailHTML(s, ctx));
  bindDetail(sheet.body, ctx, () => { sheet.close(); if (location.hash.startsWith('#/lab') || !location.hash) ctx.rerender(); });
  sheet.body.addEventListener('click', (e) => { if (e.target.closest('a[href]')) sheet.close(); });
}

export function renderZukan(root, ctx, id) {
  const { db, store } = ctx;
  if (id) {
    const s = db.substanceMap[id];
    if (!s || !store.state.owned.includes(id)) {
      root.innerHTML = `<section class="page"><a class="back" href="#/zukan">← 物質図鑑</a><p class="empty-msg">まだ発見していない物質です。</p></section>`;
      return;
    }
    store.update((st) => { st.newSubstances = st.newSubstances.filter((x) => x !== id); });
    root.innerHTML = `<section class="page"><a class="back" href="#/zukan">← 物質図鑑</a>${substanceDetailHTML(s, ctx)}</section>`;
    bindDetail(root.firstElementChild, ctx);
    return;
  }
  const all = db.substances;
  const owned = new Set(store.state.owned);
  const count = all.filter((s) => owned.has(s.id)).length;
  const pct = Math.round((count / all.length) * 100);
  const filters = [['all', 'すべて'], ['inorganic', '無機'], ['organic', '有機'], ['product', '生成物'], ['reward', '報酬']];
  const f = ctx.zukanFilter || 'all';
  const list = all.filter((s) => f === 'all' || (f === 'product' || f === 'reward' ? s.unlock === f : s.category === f));
  root.innerHTML = `
    <section class="page">
      <h1 class="page-title">📘 物質図鑑</h1>
      <div class="progress"><div class="bar"><i style="width:${pct}%"></i></div><span>${count} / ${all.length} 種を登録（${pct}%）</span></div>
      <div class="chips">${filters.map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-zf="${k}">${l}</button>`).join('')}</div>
      <div class="card-grid">
        ${list.map((s) => owned.has(s.id)
          ? `<a class="card" href="#/zukan/${s.id}" style="--c:${s.color || '#9fd3ff'}">${store.state.newSubstances.includes(s.id) ? '<span class="badge-new">NEW</span>' : ''}<span class="c-formula">${formulaHTML(s.formula)}</span><span class="c-name">${esc(s.name)}</span></a>`
          : `<div class="card locked"><span class="c-formula">？</span><span class="c-name">${s.unlock === 'reward' ? esc(acquireHint(db, s.id)) : '未発見'}</span></div>`).join('')}
      </div>
    </section>`;
  root.querySelectorAll('[data-zf]').forEach((b) => b.addEventListener('click', () => { ctx.zukanFilter = b.dataset.zf; renderZukan(root, ctx); }));
}
