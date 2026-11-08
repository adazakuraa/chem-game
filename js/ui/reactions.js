// 反応図鑑
import { conditionSets, describeConditionSet } from '../core/engine.js';
import { formulaHTML } from '../core/formula.js';
import { esc, equationHTML, FIELD_LABEL } from './util.js';
import { reactionExplanationHTML } from './result.js';

export function renderReactions(root, ctx, id) {
  const { db, store } = ctx;
  const disc = store.state.discoveredReactions;

  if (id) {
    const r = db.reactionMap[id];
    if (!r || !disc[id]) {
      root.innerHTML = `<section class="page"><a class="back" href="#/reactions">← 反応図鑑</a><p class="empty-msg">まだ発見していない反応です。</p></section>`;
      return;
    }
    const sub = (x) => db.substanceMap[x.id];
    const link = (x) => `<a class="pill" href="#/zukan/${x.id}">${formulaHTML(sub(x).formula)} ${esc(sub(x).name)}</a>`;
    const related = (r.related || []).map((rid) => (disc[rid]
      ? `<li><a href="#/reactions/${rid}">${esc(db.reactionMap[rid].name)}</a></li>`
      : '<li class="locked">？？？（未発見の反応）</li>')).join('');
    root.innerHTML = `
      <section class="page">
        <a class="back" href="#/reactions">← 反応図鑑</a>
        <h1 class="page-title small">${esc(r.name)}</h1>
        <p class="r-field">${esc(FIELD_LABEL[r.field] || '')} ／ ${esc(r.topic || '')} ・ 実験回数 ${disc[id].count}</p>
        ${equationHTML(r, db)}
        <h4>反応物</h4><div class="pills">${r.reactants.map(link).join('')}</div>
        <h4>生成物</h4><div class="pills">${r.products.map(link).join('')}</div>
        <h4>反応条件</h4>
        <ul class="conds">${conditionSets(r).map((s, i, a) => `<li>${a.length > 1 ? `<b>条件${i + 1}：</b>` : ''}${esc(describeConditionSet(s, db))}</li>`).join('')}</ul>
        ${reactionExplanationHTML(r, db, { open: true })}
        ${related ? `<h4>関連する反応</h4><ul class="rel">${related}</ul>` : ''}
      </section>`;
    return;
  }

  const fields = ['inorganic', 'organic', 'physical', 'analytical', 'biochem'];
  const total = db.reactions.length;
  const count = db.reactions.filter((r) => disc[r.id]).length;
  const pct = Math.round((count / total) * 100);
  const noteCount = store.state.discoveredNonReactions.length;
  root.innerHTML = `
    <section class="page">
      <h1 class="page-title">📗 反応図鑑</h1>
      <div class="progress"><div class="bar"><i style="width:${pct}%"></i></div><span>${count} / ${total} 反応を発見（${pct}%）</span></div>
      ${fields.map((f) => {
        const list = db.reactions.filter((r) => r.field === f);
        if (!list.length) return '';
        return `<h3 class="group">${esc(FIELD_LABEL[f])} <small>${list.filter((r) => disc[r.id]).length}/${list.length}</small></h3>
          <div class="rx-list">${list.map((r) => disc[r.id]
            ? `<a class="rx" href="#/reactions/${r.id}"><span class="rx-name">${esc(r.name)}</span>${equationHTML(r, db)}</a>`
            : `<div class="rx locked"><span class="rx-name">？？？</span><span class="rx-topic">ヒント：${esc(r.topic || '')}</span></div>`).join('')}</div>`;
      }).join('')}
      ${noteCount ? `<h3 class="group">研究ノート（反応しない組み合わせ）</h3><ul class="notes">${store.state.discoveredNonReactions.map((nid) => {
        const n = db.nonReactions.find((x) => x.id === nid);
        return n ? `<li><b>${esc(n.title)}</b><p>${esc(n.explanation)}</p></li>` : '';
      }).join('')}</ul>` : ''}
    </section>`;
}
