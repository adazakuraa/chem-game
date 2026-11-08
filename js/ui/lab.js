// 実験室画面
import { runExperiment, NONE, ACTIVATION_LABEL } from '../core/engine.js';
import { formulaHTML } from '../core/formula.js';
import { esc, $, $$, mixColors, STATE_ICON, STATE_LABEL, CATEGORY_LABEL, toast } from './util.js';
import { openSheet } from './modal.js';
import { showResult } from './result.js';
import { showSubstanceSheet } from './zukan.js';

export const MAX_REAGENTS = 3;
const TEMP_PRESETS = [-78, 0, 25, 80, 100, 140, 170, 300, 450, 900];
const PRESSURES = [1, 5, 10, 70, 200, 300];
const TEMP_MIN = -100;
const TEMP_MAX = 1000;

const flaskSVG = `
<svg class="flask" viewBox="0 0 200 220" aria-hidden="true">
  <defs>
    <clipPath id="flaskClip"><path d="M84 20 L84 82 L31 186 Q27 197 40 197 L160 197 Q173 197 169 186 L116 82 L116 20 Z"/></clipPath>
    <linearGradient id="glass" x1="0" x2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".22"/><stop offset=".5" stop-color="#ffffff" stop-opacity=".04"/><stop offset="1" stop-color="#ffffff" stop-opacity=".16"/></linearGradient>
  </defs>
  <g clip-path="url(#flaskClip)">
    <rect class="liquid" x="0" y="220" width="200" height="220"/>
    <rect class="liquid-shine" x="0" y="220" width="200" height="6"/>
    <g class="precip-layer"></g>
  </g>
  <path class="glass" d="M80 14 L80 80 L26 186 Q20 202 40 202 L160 202 Q180 202 174 186 L120 80 L120 14" fill="url(#glass)"/>
  <rect class="rim" x="74" y="8" width="52" height="9" rx="4"/>
  <g class="graduation"><line x1="60" y1="150" x2="72" y2="150"/><line x1="54" y1="165" x2="70" y2="165"/><line x1="48" y1="180" x2="68" y2="180"/></g>
</svg>`;

export function renderLab(root, ctx) {
  const { db, store } = ctx;
  const st = () => store.state;

  root.innerHTML = `
    <section class="lab">
      <div class="stage" id="stage">
        <div class="stage-bg"></div>
        <div class="env env-light" aria-hidden="true"></div>
        <div class="env env-frost" aria-hidden="true"></div>
        <div class="flask-wrap">${flaskSVG}<div class="fx" id="fx"></div><div class="flask-label" id="flaskLabel"></div></div>
        <div class="burner" aria-hidden="true"><div class="flame"></div><div class="burner-body"></div></div>
        <div class="gauges">
          <div class="gauge"><span>温度</span><b id="gTemp"></b></div>
          <div class="gauge"><span>圧力</span><b id="gPres"></b></div>
        </div>
      </div>

      <div class="slots" id="slots"></div>

      <div class="panel">
        <div class="cond">
          <div class="cond-head"><span class="cond-title">🌡 温度</span><span class="cond-value" id="tempValue"></span></div>
          <div class="temp-row">
            <button class="step" data-dt="-10" aria-label="10度下げる">−</button>
            <input type="range" id="tempRange" min="${TEMP_MIN}" max="${TEMP_MAX}" step="5" aria-label="温度">
            <button class="step" data-dt="10" aria-label="10度上げる">＋</button>
          </div>
          <div class="chips scroll" id="tempChips">${TEMP_PRESETS.map((t) => `<button class="chip" data-temp="${t}">${t}°</button>`).join('')}</div>
        </div>
        <div class="cond">
          <div class="cond-head"><span class="cond-title">⏲ 圧力</span><span class="cond-value" id="presValue"></span></div>
          <div class="chips" id="presChips">${PRESSURES.map((p) => `<button class="chip" data-pres="${p}">${p} atm</button>`).join('')}</div>
        </div>
        <div class="cond">
          <div class="cond-head"><span class="cond-title">⚗ 触媒</span></div>
          <div class="chips scroll" id="catChips"></div>
        </div>
        <div class="cond">
          <div class="cond-head"><span class="cond-title">🧪 溶媒</span></div>
          <div class="chips scroll" id="solChips"></div>
        </div>
        <div class="cond">
          <div class="cond-head"><span class="cond-title">⚡ 操作</span></div>
          <div class="chips" id="actChips">
            <button class="chip" data-act="${NONE}">なし（撹拌のみ）</button>
            <button class="chip" data-act="light">💡 光照射</button>
            <button class="chip" data-act="spark">🔥 点火</button>
          </div>
        </div>
      </div>

      <div class="react-bar">
        <button class="btn ghost" id="btnClear">クリア</button>
        <button class="btn primary big" id="btnReact">反応開始</button>
      </div>
    </section>`;

  const stage = $('#stage', root);

  // ---------- 描画 ----------
  function drawSlots() {
    const bench = st().bench;
    let html = '';
    for (let i = 0; i < MAX_REAGENTS; i++) {
      const id = bench[i];
      if (id) {
        const s = db.substanceMap[id];
        html += `<div class="slot filled" style="--c:${s.color || '#9fd3ff'}">
          <button class="slot-main" data-info="${esc(id)}"><span class="slot-f">${formulaHTML(s.formula)}</span><span class="slot-n">${esc(s.name)}</span></button>
          <button class="slot-x" data-remove="${i}" aria-label="${esc(s.name)}を取り除く">✕</button></div>`;
      } else {
        html += `<button class="slot empty" data-add>＋<span>試薬を追加</span></button>`;
      }
    }
    $('#slots', root).innerHTML = html;
  }

  function drawFlask() {
    const bench = st().bench;
    const colors = bench.map((id) => db.substanceMap[id].color || '#9fd3ff');
    const solvent = st().conditions.solvent;
    if (solvent !== NONE && db.substanceMap[solvent]) colors.push(db.substanceMap[solvent].color || '#9fd3ff');
    const n = bench.length + (solvent !== NONE ? 1 : 0);
    const top = n === 0 ? 220 : 182 - n * 14;
    const liquid = $('.liquid', root);
    const shine = $('.liquid-shine', root);
    liquid.setAttribute('y', top);
    shine.setAttribute('y', top);
    liquid.style.fill = mixColors(colors) || 'transparent';
    $('#flaskLabel', root).innerHTML = bench.map((id) => `<span>${formulaHTML(db.substanceMap[id].formula)}</span>`).join('<i>+</i>');
  }

  function drawConditions() {
    const c = st().conditions;
    $('#tempValue', root).textContent = `${c.temperature} °C`;
    $('#gTemp', root).textContent = `${c.temperature}°C`;
    $('#presValue', root).textContent = `${c.pressure} atm`;
    $('#gPres', root).textContent = `${c.pressure} atm`;
    $('#tempRange', root).value = c.temperature;
    $$('#tempChips .chip', root).forEach((b) => b.classList.toggle('on', +b.dataset.temp === c.temperature));
    $$('#presChips .chip', root).forEach((b) => b.classList.toggle('on', +b.dataset.pres === c.pressure));
    $$('#actChips .chip', root).forEach((b) => b.classList.toggle('on', b.dataset.act === c.activation));

    const owned = st().owned.map((id) => db.substanceMap[id]).filter(Boolean);
    const chipList = (tag, key, current) =>
      [`<button class="chip ${current === NONE ? 'on' : ''}" data-${key}="${NONE}">なし</button>`]
        .concat(owned.filter((s) => (s.tags || []).includes(tag)).map((s) => `<button class="chip ${current === s.id ? 'on' : ''}" data-${key}="${s.id}">${formulaHTML(s.formula)} <small>${esc(s.name)}</small></button>`))
        .join('');
    $('#catChips', root).innerHTML = chipList('catalyst', 'cat', c.catalyst);
    $('#solChips', root).innerHTML = chipList('solvent', 'sol', c.solvent);

    // 環境演出
    const t = c.temperature;
    const heat = t <= 25 ? 0 : Math.min(1, Math.log10(t - 24) / 3);
    stage.style.setProperty('--heat', heat.toFixed(2));
    stage.classList.toggle('heating', t > 30);
    stage.classList.toggle('cold', t < 0);
    stage.classList.toggle('light-on', c.activation === 'light');
    stage.classList.toggle('pressurized', c.pressure >= 10);
  }

  function drawAll() { drawSlots(); drawFlask(); drawConditions(); }
  drawAll();

  // ---------- 操作 ----------
  const setCond = (patch) => { store.update((s) => Object.assign(s.conditions, patch)); drawConditions(); drawFlask(); };
  const clampT = (t) => Math.max(TEMP_MIN, Math.min(TEMP_MAX, Math.round(t)));

  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || !root.contains(t)) return;
    if (t.dataset.add !== undefined) return openReagentPicker(ctx, drawAll);
    if (t.dataset.remove !== undefined) {
      store.update((s) => s.bench.splice(+t.dataset.remove, 1));
      return drawAll();
    }
    if (t.dataset.info) return showSubstanceSheet(t.dataset.info, ctx);
    if (t.dataset.temp !== undefined) return setCond({ temperature: +t.dataset.temp });
    if (t.dataset.dt !== undefined) return setCond({ temperature: clampT(st().conditions.temperature + +t.dataset.dt) });
    if (t.dataset.pres !== undefined) return setCond({ pressure: +t.dataset.pres });
    if (t.dataset.cat !== undefined) return setCond({ catalyst: t.dataset.cat });
    if (t.dataset.sol !== undefined) return setCond({ solvent: t.dataset.sol });
    if (t.dataset.act !== undefined) return setCond({ activation: t.dataset.act });
    if (t.id === 'btnClear') {
      store.update((s) => { s.bench = []; });
      return drawAll();
    }
    if (t.id === 'btnReact') return react();
  });
  $('#tempRange', root).addEventListener('input', (e) => {
    const v = clampT(+e.target.value);
    store.state.conditions.temperature = v; // ドラッグ中は描画のみ
    drawConditions();
  });
  $('#tempRange', root).addEventListener('change', (e) => setCond({ temperature: clampT(+e.target.value) }));

  let busy = false;
  function react() {
    if (busy) return;
    const bench = [...st().bench];
    if (!bench.length) {
      toast('まず試薬を実験台に置きましょう');
      return openReagentPicker(ctx, drawAll);
    }
    const result = runExperiment(db, { reagents: bench, conditions: st().conditions });
    const record = recordResult(store, db, result);
    busy = true;
    $('#btnReact', root).disabled = true;
    playEffect(stage, result, db).then(() => {
      busy = false;
      $('#btnReact', root).disabled = false;
      if (result.outcome === 'success') {
        // 反応後のフラスコは生成物で満たされる
        store.update((s) => { s.bench = result.products.filter((id) => s.owned.includes(id)).slice(0, MAX_REAGENTS); });
        drawAll();
      }
      showResult(result, ctx, record, drawAll);
      ctx.refreshHeader();
    });
  }
}

/** 結果をセーブデータに反映し、新発見情報を返す */
export function recordResult(store, db, result) {
  const rec = { newSubstances: [], newReaction: false, newNonReaction: false };
  store.update((s) => {
    s.stats.experiments++;
    if (result.outcome === 'success') {
      s.stats.successes++;
      const rid = result.reaction.id;
      const prev = s.discoveredReactions[rid];
      if (!prev) rec.newReaction = true;
      s.discoveredReactions[rid] = { count: (prev ? prev.count : 0) + 1, firstAt: prev ? prev.firstAt : Date.now() };
      for (const pid of result.products) {
        if (!s.owned.includes(pid)) {
          s.owned.push(pid);
          s.newSubstances.push(pid);
          rec.newSubstances.push(pid);
        }
      }
    } else if (result.outcome === 'no_reaction') {
      if (!s.discoveredNonReactions.includes(result.nonReaction.id)) {
        s.discoveredNonReactions.push(result.nonReaction.id);
        rec.newNonReaction = true;
      }
    }
    s.log.unshift({ t: Date.now(), reagents: result.reagents, outcome: result.outcome, reaction: result.reaction ? result.reaction.id : null });
    s.log = s.log.slice(0, 50);
  });
  return rec;
}

/** 反応の演出（Promise で完了を通知） */
function playEffect(stage, result, db) {
  const fx = stage.querySelector('#fx');
  fx.innerHTML = '';
  stage.classList.remove('shake', 'fx-flash', 'fx-heat', 'fx-fail');
  void stage.offsetWidth;
  stage.classList.add('reacting');
  const liquid = stage.querySelector('.liquid');
  const spawn = (cls, n, styleFn) => {
    for (let i = 0; i < n; i++) {
      const d = document.createElement('i');
      d.className = cls;
      Object.assign(d.style, styleFn(i));
      fx.appendChild(d);
    }
  };
  const rand = (a, b) => a + Math.random() * (b - a);
  const duration = 1700;

  if (result.outcome === 'success') {
    const v = result.reaction.visual || {};
    const effect = v.effect || 'colorChange';
    const productColor = mixColors(result.products.map((id) => db.substanceMap[id].color || '#ffffff'));
    if (effect === 'bubbles' || effect === 'gas') {
      spawn('bubble', effect === 'bubbles' ? 26 : 12, () => ({ left: `${rand(30, 70)}%`, animationDelay: `${rand(0, 1.2)}s`, width: `${rand(5, 12)}px`, height: '' }));
    }
    if (effect === 'gas' || effect === 'smoke') {
      spawn('wisp', effect === 'smoke' ? 10 : 6, () => ({ left: `${rand(42, 58)}%`, animationDelay: `${rand(0, 1)}s`, background: v.color || '#fff' }));
    }
    if (effect === 'precipitate') {
      spawn('particle', 34, () => ({ left: `${rand(28, 72)}%`, animationDelay: `${rand(0, 1.1)}s`, background: v.precipitate || '#fff' }));
    }
    if (effect === 'flash') stage.classList.add('fx-flash', 'shake');
    if (effect === 'heat') stage.classList.add('fx-heat');
    spawn('spark-star', 8, (i) => ({ left: `${rand(20, 80)}%`, top: `${rand(10, 60)}%`, animationDelay: `${0.9 + i * 0.06}s` }));
    if (liquid) {
      if (v.color && effect === 'colorChange') liquid.style.fill = v.color;
      setTimeout(() => { liquid.style.fill = v.to || productColor; }, 700);
    }
  } else {
    stage.classList.add('fx-fail');
    spawn('fizzle', 5, () => ({ left: `${rand(40, 60)}%`, animationDelay: `${rand(0, 0.8)}s` }));
  }
  return new Promise((resolve) => setTimeout(() => {
    stage.classList.remove('reacting', 'shake', 'fx-flash', 'fx-heat', 'fx-fail');
    resolve();
  }, duration));
}

/** 試薬棚（ボトムシート） */
export function openReagentPicker(ctx, onChange) {
  const { db, store } = ctx;
  let filter = 'all';
  let query = '';
  const sheet = openSheet(`
    <h2 class="sheet-title">🧴 試薬棚</h2>
    <p class="sheet-sub">タップで実験台に追加（最大 ${MAX_REAGENTS} 種）。<b>ⓘ</b> で詳細。</p>
    <input class="search" type="search" placeholder="名前・化学式で検索" aria-label="検索">
    <div class="chips" id="pickFilter">
      <button class="chip on" data-f="all">すべて</button>
      <button class="chip" data-f="inorganic">無機</button>
      <button class="chip" data-f="organic">有機</button>
      <button class="chip" data-f="product">生成物</button>
    </div>
    <div class="reagent-grid" id="pickGrid"></div>`, { className: 'picker' });

  const grid = sheet.body.querySelector('#pickGrid');
  function draw() {
    const bench = store.state.bench;
    const q = query.trim().toLowerCase();
    const list = store.state.owned
      .map((id) => db.substanceMap[id])
      .filter(Boolean)
      .filter((s) => filter === 'all' || (filter === 'product' ? s.unlock === 'product' : s.category === filter))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.formula.toLowerCase().includes(q) || (s.nameEn || '').toLowerCase().includes(q));
    grid.innerHTML = list.length ? list.map((s) => {
      const on = bench.includes(s.id);
      const isNew = store.state.newSubstances.includes(s.id);
      return `<div class="reagent ${on ? 'on' : ''}" style="--c:${s.color || '#9fd3ff'}">
        <button class="reagent-main" data-pick="${s.id}">
          <span class="r-state" title="${esc(STATE_LABEL[s.state] || '')}">${STATE_ICON[s.state] || ''}</span>
          ${isNew ? '<span class="badge-new">NEW</span>' : ''}
          <span class="r-formula">${formulaHTML(s.formula)}</span>
          <span class="r-name">${esc(s.name)}</span>
          <span class="r-cat">${esc(CATEGORY_LABEL[s.category] || '')}${(s.tags || []).includes('catalyst') ? '・触媒' : ''}${(s.tags || []).includes('solvent') ? '・溶媒' : ''}</span>
        </button>
        <button class="reagent-info" data-info="${s.id}" aria-label="${esc(s.name)}の詳細">ⓘ</button>
      </div>`;
    }).join('') : '<p class="empty-msg">該当する物質がありません</p>';
  }
  draw();

  sheet.body.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.f) {
      filter = b.dataset.f;
      sheet.body.querySelectorAll('#pickFilter .chip').forEach((c) => c.classList.toggle('on', c === b));
      return draw();
    }
    if (b.dataset.info) return showSubstanceSheet(b.dataset.info, ctx);
    if (b.dataset.pick) {
      const id = b.dataset.pick;
      let msg = '';
      store.update((s) => {
        const i = s.bench.indexOf(id);
        if (i >= 0) s.bench.splice(i, 1);
        else if (s.bench.length >= MAX_REAGENTS) msg = `実験台に置けるのは ${MAX_REAGENTS} 種までです`;
        else s.bench.push(id);
        s.newSubstances = s.newSubstances.filter((x) => x !== id);
      });
      if (msg) toast(msg);
      draw();
      onChange();
      if (store.state.bench.length >= MAX_REAGENTS) setTimeout(() => sheet.close(), 250);
    }
  });
  sheet.body.querySelector('.search').addEventListener('input', (e) => { query = e.target.value; draw(); });
}

export { ACTIVATION_LABEL };
