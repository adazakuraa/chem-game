// 研究所画面（指導者・研究課題・ヒント・研究レベル）
import { levelInfo, missionStatus, lockReason, rewardSources } from '../core/progress.js';
import { formulaHTML } from '../core/formula.js';
import { esc, FIELD_LABEL, toast } from './util.js';
import { openSheet } from './modal.js';

const HINT_LABELS = ['ヒント 1：分野', 'ヒント 2：物質', 'ヒント 3：条件'];

function speaker(db, by) {
  return db.characters[by] || { name: '', role: '', icon: '🧑‍🔬' };
}

export function dialogueHTML(db, line) {
  if (!line) return '';
  const c = speaker(db, line.by);
  return `<div class="dialogue"><div class="avatar">${c.icon}</div><div class="bubble"><div class="who">${esc(c.name)}<small>${esc(c.role)}</small></div><p>${esc(line.text)}</p></div></div>`;
}

export function levelCardHTML(ctx) {
  const { db, store } = ctx;
  const r = store.state.research;
  const info = levelInfo(r.xp, db);
  return `<div class="level-card">
    <div class="lv-badge"><small>Lv.</small>${info.level}</div>
    <div class="lv-body">
      <div class="lv-title">${esc(info.title)}</div>
      <div class="xpbar"><i style="width:${Math.round(info.progress * 100)}%"></i></div>
      <div class="lv-sub">${r.xp} XP${info.next ? ` ・ 次のレベルまで ${info.toNext} XP` : ' ・ 最高レベル'}</div>
    </div>
  </div>`;
}

/** 実験室の上部に出す「取り組み中の課題」 */
export function missionBannerHTML(ctx) {
  const { db, store } = ctx;
  const id = store.state.research.active;
  const m = id && db.missionMap[id];
  if (!m || missionStatus(m, store.state) !== 'available') {
    return `<a class="banner idle" href="#/research"><span>📋</span><span>研究課題を選んで挑戦しよう</span><b>研究所へ →</b></a>`;
  }
  const used = store.state.research.hints[id] || 0;
  const noHint = store.state.settings.noHint;
  return `<div class="banner active">
    <span class="b-icon">🎯</span>
    <button class="b-main" data-goto="#/research/${m.id}"><small>取り組み中の課題</small><b>${esc(m.title)}</b></button>
    ${noHint ? '<span class="b-nohint">ヒントなし</span>' : `<button class="b-hint" data-hint="${m.id}">💡<small>${used}/3</small></button>`}
  </div>`;
}

/** 段階的ヒント（ボトムシート） */
export function openHintSheet(ctx, id, onChange) {
  const { db, store } = ctx;
  const m = db.missionMap[id];
  if (!m) return;
  if (store.state.settings.noHint) return toast('ヒントなしモード中です（設定で変更できます）');
  const sheet = openSheet('', { className: 'hint-sheet' });
  const draw = () => {
    const used = store.state.research.hints[id] || 0;
    const answer = !!store.state.research.answers[id];
    const done = missionStatus(m, store.state) === 'completed';
    let html = `<h2 class="sheet-title">💡 ヒント</h2><p class="sheet-sub">課題「${esc(m.title)}」 ・ ヒントを見るほど報酬の経験値が減ります（達成後は自由に閲覧可）</p>`;
    m.hints.forEach((h, i) => {
      html += i < used || done
        ? `<div class="hint open"><b>${HINT_LABELS[i]}</b><p>${esc(h.replace(/^[^：]+：/, ''))}</p></div>`
        : `<button class="hint locked" data-reveal="${i}" ${i !== used ? 'disabled' : ''}><b>${HINT_LABELS[i]}</b><span>${i === used ? 'タップして表示' : '前のヒントを先に'}</span></button>`;
    });
    html += answer || done
      ? `<div class="hint answer open"><b>📖 解答と解説</b><p>${esc(m.answer)}</p></div>`
      : `<button class="hint locked answer" data-answer ${used < m.hints.length ? 'disabled' : ''}><b>📖 解答と解説</b><span>${used < m.hints.length ? 'ヒント 3 の後に表示できます' : 'タップして表示（報酬が大きく減ります）'}</span></button>`;
    sheet.body.innerHTML = html;
  };
  draw();
  sheet.body.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.reveal !== undefined) store.update((s) => { s.research.hints[id] = Math.max(s.research.hints[id] || 0, +b.dataset.reveal + 1); });
    if (b.dataset.answer !== undefined) store.update((s) => { s.research.answers[id] = true; });
    draw();
    if (onChange) onChange();
  });
}

function missionCardHTML(m, ctx) {
  const { db, store } = ctx;
  const st = missionStatus(m, store.state);
  const active = store.state.research.active === m.id;
  const rec = store.state.research.missions[m.id];
  const reason = st === 'locked' ? lockReason(m, store.state, db) : '';
  const r = m.objective.type === 'reaction' ? db.reactionMap[m.objective.id] : null;
  return `<a class="mission ${st} ${active ? 'is-active' : ''}" href="#/research/${m.id}">
    <span class="m-state">${st === 'completed' ? '✓' : st === 'locked' ? '🔒' : active ? '🎯' : '●'}</span>
    <span class="m-body"><b>${esc(m.title)}</b>
      <small>${st === 'locked' ? esc(reason) : st === 'completed' ? `達成 +${rec.xp} XP${rec.hintsUsed ? `（ヒント ${rec.hintsUsed}）` : ''}` : `${r ? esc(FIELD_LABEL[r.field] || '') : '研究ノート'} ・ 報酬 ${m.reward.xp} XP${(m.reward.unlock || []).length ? ' ＋ 新しい試薬' : ''}`}</small></span>
  </a>`;
}

export function renderResearch(root, ctx, id) {
  const { db, store } = ctx;
  if (id && db.missionMap[id]) return renderMissionDetail(root, ctx, db.missionMap[id]);

  const state = store.state;
  const done = db.missions.filter((m) => missionStatus(m, state) === 'completed').length;
  const active = state.research.active && db.missionMap[state.research.active];
  const next = db.missions.find((m) => missionStatus(m, state) === 'available');
  const greeting = active
    ? { by: 'mizuki', text: `「${active.title}」の進み具合はどうですか？ 行き詰まったら、実験室の 💡 ボタンでヒントを出しますよ。` }
    : next
      ? { by: 'mizuki', text: `次の課題を選びましょう。おすすめは「${next.title}」です。課題を進めなくても、実験室での自由な実験はいつでも大歓迎ですよ。` }
      : { by: 'mizuki', text: '現在の課題はすべて片づきましたね。研究レベルを上げると新しい課題が解放されます。自由実験で未発見の反応を探してみましょう。' };

  root.innerHTML = `
    <section class="page">
      <h1 class="page-title">🏛 研究所</h1>
      ${levelCardHTML(ctx)}
      ${dialogueHTML(db, greeting)}
      <div class="progress"><div class="bar"><i style="width:${Math.round((done / db.missions.length) * 100)}%"></i></div><span>研究課題 ${done} / ${db.missions.length} 達成</span></div>
      <label class="toggle"><input type="checkbox" id="noHint" ${state.settings.noHint ? 'checked' : ''}><span>ヒントなしモード（自力で解くと報酬 ×${db.progression.xp.noHintBonus}）</span></label>
      ${db.chapters.map((ch) => {
        const list = db.missions.filter((m) => m.chapter === ch.id);
        const c = list.filter((m) => missionStatus(m, state) === 'completed').length;
        return `<h3 class="group">第${ch.id}章 ${esc(ch.title)} <small>${c}/${list.length}</small></h3><p class="muted chap-desc">${esc(ch.desc)}</p>
          <div class="mission-list">${list.map((m) => missionCardHTML(m, ctx)).join('')}</div>`;
      }).join('')}
      ${levelRoadmapHTML(ctx)}
    </section>`;
  root.querySelector('#noHint').addEventListener('change', (e) => {
    store.update((s) => { s.settings.noHint = e.target.checked; });
    toast(e.target.checked ? 'ヒントなしモード：ON' : 'ヒントなしモード：OFF');
  });
}

function levelRoadmapHTML(ctx) {
  const { db, store } = ctx;
  const lv = store.state.research.level;
  return `<h3 class="group">研究レベルと解放</h3><ol class="roadmap">${db.progression.levels.map((l) => `
    <li class="${l.level <= lv ? 'reached' : ''}"><b>Lv.${l.level} ${esc(l.title)}</b><small>${l.xp} XP</small>
    ${(l.unlock || []).length ? `<span>解放：${l.unlock.map((id) => (l.level <= lv ? `${formulaHTML(db.substanceMap[id].formula)} ${esc(db.substanceMap[id].name)}` : '？？？')).join('、')}</span>` : ''}</li>`).join('')}</ol>`;
}

function renderMissionDetail(root, ctx, m) {
  const { db, store } = ctx;
  const state = store.state;
  const st = missionStatus(m, state);
  const rec = state.research.missions[m.id];
  const active = state.research.active === m.id;
  const ch = db.chapters.find((c) => c.id === m.chapter);
  const unlockNames = (m.reward.unlock || []).map((id) => (st === 'completed' ? `${formulaHTML(db.substanceMap[id].formula)} ${esc(db.substanceMap[id].name)}` : '？？？')).join('、');
  let body = '';
  if (st === 'locked') {
    body = `<div class="advisory">🔒 ${esc(lockReason(m, state, db))}</div>`;
  } else {
    body += dialogueHTML(db, m.briefing);
    body += `<div class="reward-box"><span>報酬</span><b>${m.reward.xp} XP</b>${unlockNames ? `<span>新しい試薬</span><b>${unlockNames}</b>` : ''}</div>`;
    if (st === 'completed') {
      body += `<div class="advisory ok-box">✓ 達成済み（+${rec.xp} XP${rec.hintsUsed ? `・ヒント ${rec.hintsUsed} 回` : ''}${rec.answerShown ? '・解答閲覧' : ''}）</div>`;
      body += dialogueHTML(db, m.debrief);
      body += `<details class="sec"><summary>📖 解答と解説</summary><div class="sec-body"><p>${esc(m.answer)}</p>${m.objective.type === 'reaction' ? `<p><a href="#/reactions/${m.objective.id}">反応図鑑で詳しく見る →</a></p>` : ''}</div></details>`;
      body += `<button class="btn wide" data-hints>ヒントを見返す</button>`;
    } else {
      body += `<div class="result-actions">
        ${state.settings.noHint ? '<span class="muted center">ヒントなしモード</span>' : `<button class="btn ghost" data-hints>💡 ヒント（${state.research.hints[m.id] || 0}/3）</button>`}
        <button class="btn primary" data-start>${active ? '実験室へ' : 'この課題に挑戦'}</button></div>`;
    }
  }
  root.innerHTML = `<section class="page">
    <a class="back" href="#/research">← 研究所</a>
    <p class="r-field">第${m.chapter}章 ${esc(ch ? ch.title : '')}</p>
    <h1 class="page-title small">${esc(m.title)}</h1>
    ${body}
  </section>`;
  root.querySelector('section').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.start !== undefined) {
      store.update((s) => { s.research.active = m.id; });
      location.hash = '#/lab';
    }
    if (b.dataset.hints !== undefined) openHintSheet(ctx, m.id, () => renderMissionDetail(root, ctx, m));
  });
}

/** 課題達成・レベルアップ後の演出（結果シートを閉じた後に順に表示） */
export function showProgressEvents(ctx, record, done) {
  const { db } = ctx;
  const queue = [];
  for (const l of record.levelUps) {
    queue.push(`<div class="levelup"><div class="lv-burst">Lv.${l.level}</div><h2>研究レベルが上がった！</h2><p class="lv-new-title">「${esc(l.title)}」</p>
      ${l.message ? dialogueHTML(db, { by: 'mizuki', text: l.message }) : ''}
      ${(l.unlock || []).length ? `<div class="unlock-list">${l.unlock.map((id) => `<div class="unlock"><span class="badge-new">NEW</span><b>${formulaHTML(db.substanceMap[id].formula)}</b><small>${esc(db.substanceMap[id].name)}</small></div>`).join('')}</div>` : ''}
      <button class="btn primary wide" data-next>OK</button></div>`);
  }
  const step = () => {
    const html = queue.shift();
    if (!html) { if (done) done(); return; }
    const sheet = openSheet(html, { className: 'levelup-sheet', onClose: () => setTimeout(step, 150) });
    sheet.body.querySelector('[data-next]').addEventListener('click', () => sheet.close());
  };
  step();
}

/** 物質の入手方法（図鑑の未発見表示用） */
export function acquireHint(db, id) {
  const src = rewardSources(db)[id];
  if (src) return src.join(' / ') + ' で入手';
  return '実験で生成すると入手';
}
