// 実験結果の表示
import { describeConditions } from '../core/engine.js';
import { formulaHTML, hillFormula } from '../core/formula.js';
import { esc, equationHTML, FIELD_LABEL, LEVEL_LABEL, REVIEW_LABEL, SAFETY_LABEL } from './util.js';
import { openSheet } from './modal.js';
import { renderStructure } from './structure.js';
import { dialogueHTML, showProgressEvents } from './research.js';

/** 反応の解説セクション（結果画面と反応図鑑で共通） */
export function reactionExplanationHTML(r, db, { open = false } = {}) {
  const sec = (title, body, isOpen = open) => `<details class="sec" ${isOpen ? 'open' : ''}><summary>${title}</summary><div class="sec-body">${body}</div></details>`;
  let html = '';
  html += `<p class="summary">${esc(r.summary)}</p>`;
  if (r.mechanism && r.mechanism.length) {
    html += sec('🔬 反応の仕組み（反応機構）', `<ol class="mech">${r.mechanism.map((m) => `<li><b>${esc(m.title)}</b><p>${esc(m.text)}</p></li>`).join('')}</ol>`, true);
  }
  if (r.why) html += sec('💡 なぜこの反応が進むのか', `<p>${esc(r.why)}</p>`, true);
  if (r.thermo) {
    const t = r.thermo;
    const dh = t.dH != null ? `<div class="thermo"><span>ΔH°</span><b class="${t.dH < 0 ? 'exo' : 'endo'}">${t.dH > 0 ? '+' : ''}${t.dH} kJ</b><small>${esc(t.unit || '')}</small><em>${t.dH < 0 ? '発熱反応' : '吸熱反応'}</em></div>` : '';
    html += sec('🔥 熱化学', `${dh}${t.note ? `<p>${esc(t.note)}</p>` : ''}${r.reversible ? '<p>⇌ は可逆反応（平衡反応）であることを示す。</p>' : ''}`);
  }
  if (r.knowledge && r.knowledge.length) html += sec('📚 関連する化学知識', `<ul class="know">${r.knowledge.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>`);
  if (r.safety) html += `<div class="safety ${esc(r.safety.level)}"><b>⚠ ${esc(SAFETY_LABEL[r.safety.level] || '安全')}</b><p>${esc(r.safety.text)}</p></div>`;
  if (r.verification) html += verificationHTML(r.verification);
  return html;
}

export function verificationHTML(v) {
  return `<details class="sec verify"><summary>✅ データの検証状況</summary><div class="sec-body">
    <p><span class="tag lvl-${esc(v.level)}">${esc(LEVEL_LABEL[v.level] || v.level)}</span> <span class="tag rev-${esc(v.review)}">${esc(REVIEW_LABEL[v.review] || v.review)}</span></p>
    ${v.simplifications ? `<p><b>ゲーム上の簡略化：</b>${esc(v.simplifications)}</p>` : ''}
    ${v.sources && v.sources.length ? `<p><b>参考文献：</b></p><ul class="sources">${v.sources.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    <p class="muted">反応式の原子数・電荷の保存は自動検査済み。</p>
  </div></details>`;
}

export function productCardHTML(s, db, isNew) {
  return `<div class="product">
    ${isNew ? '<span class="badge-new big">NEW!</span>' : ''}
    ${renderStructure(s.structure, db.elements)}
    <div class="p-name">${esc(s.name)}</div>
    <div class="p-formula">${formulaHTML(s.formula)}${hillFormula(s.formula) !== s.formula ? ` <small>（${formulaHTML(hillFormula(s.formula))}）</small>` : ''}</div>
    <div class="p-mw">分子量（式量） ${s.mw != null ? s.mw.toFixed(2) : '—'}</div>
  </div>`;
}

function progressHTML(record, db) {
  let html = '';
  if (record.xp > 0) {
    html += `<div class="xp-gain"><b>+${record.xp} XP</b><ul>${record.breakdown.map((b) => `<li><span>${esc(b.label)}</span><span>+${b.xp}</span></li>`).join('')}</ul></div>`;
  }
  for (const m of record.completedMissions) {
    html += `<div class="mission-clear"><div class="mc-head">🎉 研究課題「${esc(m.title)}」達成！</div>${dialogueHTML(db, m.debrief)}</div>`;
  }
  const unlockedByMission = record.unlocked.filter((id) => record.completedMissions.some((m) => (m.reward.unlock || []).includes(id)));
  if (unlockedByMission.length) {
    html += `<div class="unlock-list">${unlockedByMission.map((id) => `<div class="unlock"><span class="badge-new">NEW</span><b>${formulaHTML(db.substanceMap[id].formula)}</b><small>${esc(db.substanceMap[id].name)}</small></div>`).join('')}</div><p class="muted center">新しい試薬が試薬棚に追加されました</p>`;
  }
  return html;
}

export function showResult(result, ctx, record, onChange) {
  const { db } = ctx;
  let html = '';
  if (result.outcome === 'success') {
    const r = result.reaction;
    const condText = describeConditions(result.conditions, db);
    html += `<div class="result-head success">
      <div class="burst">✦</div>
      <h2>反応成功！</h2>
      ${record.newReaction ? '<div class="discovery">📖 新しい反応を発見しました</div>' : ''}
    </div>
    <h3 class="r-title">${esc(r.name)}</h3>
    <p class="r-field">${esc(FIELD_LABEL[r.field] || '')} ／ ${esc(r.topic || '')}</p>
    ${equationHTML(r, db)}
    <p class="cond-line">条件：${esc(condText)}</p>
    ${result.advisories.map((a) => `<div class="advisory">📝 ${esc(a)}</div>`).join('')}
    ${progressHTML(record, db)}
    <div class="products">${r.products.map((p) => productCardHTML(db.substanceMap[p.id], db, record.newSubstances.includes(p.id))).join('')}</div>
    ${reactionExplanationHTML(r, db)}
    <div class="result-actions">
      <button class="btn ghost" data-go="#/reactions/${r.id}">反応図鑑で見る</button>
      <button class="btn primary" data-close>生成物で次の実験へ</button>
    </div>`;
  } else if (result.outcome === 'failed') {
    const r = result.nearest;
    html += `<div class="result-head failed"><div class="burst">…</div><h2>反応は進行しませんでした</h2></div>
    <p>この組み合わせには<b>起こりうる反応</b>がありますが、条件が合っていないようです。</p>
    <div class="clue"><span>関連分野</span><b>${esc(FIELD_LABEL[r.field] || '')}</b><span>テーマ</span><b>${esc(r.topic || '')}</b></div>
    <h4>考えられる原因</h4>
    <ul class="fails">${result.fails.map((f) => `<li>${esc(f.message)}</li>`).join('')}</ul>
    ${result.otherCandidates.length ? `<p class="muted">※ 同じ物質の組み合わせで、条件によって別の反応が起こる可能性もあります。</p>` : ''}
    <div class="result-actions"><button class="btn primary" data-close>条件を見直す</button></div>`;
  } else if (result.outcome === 'no_reaction') {
    const n = result.nonReaction;
    html += `<div class="result-head neutral"><div class="burst">○</div><h2>${esc(n.title)}</h2>${record.newNonReaction ? '<div class="discovery">📝 研究ノートに記録しました</div>' : ''}</div>
    <p>${esc(n.explanation)}</p>
    <div class="advisory">💡 ${esc(n.hint)}</div>
    ${progressHTML(record, db)}
    ${n.verification ? verificationHTML(n.verification) : ''}
    <div class="result-actions"><button class="btn primary" data-close>OK</button></div>`;
  } else {
    html += `<div class="result-head neutral"><div class="burst">?</div><h2>変化は観察されませんでした</h2></div>
    <p>この組み合わせは、研究所の反応データベースにまだ登録されていません。</p>
    <p class="muted">※ 現実に反応が起こらないとは限りません。このゲームでは検証済みの反応だけを扱っています。</p>
    ${result.hints.map((h) => `<div class="advisory">💡 ${esc(h)}</div>`).join('')}
    <div class="result-actions"><button class="btn primary" data-close>OK</button></div>`;
  }

  let followed = false;
  const follow = () => {
    if (followed) return;
    followed = true;
    if (record.levelUps && record.levelUps.length) setTimeout(() => showProgressEvents(ctx, record, onChange), 300);
    if (ctx.refreshHeader) ctx.refreshHeader();
  };
  const sheet = openSheet(html, { className: `result ${result.outcome}`, onClose: follow });
  sheet.body.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.close !== undefined) { sheet.close(); onChange && onChange(); }
    if (b.dataset.go) { sheet.close(); location.hash = b.dataset.go; }
  });
}
