// エントリーポイント: データ読み込み・ルーティング・共通 UI
import { loadDatabase } from './core/db.js';
import { createStore } from './core/store.js';
import { renderLab } from './ui/lab.js';
import { renderZukan } from './ui/zukan.js';
import { renderReactions } from './ui/reactions.js';
import { renderSettings } from './ui/settings.js';
import { renderResearch } from './ui/research.js';
import { levelInfo, missionStatus } from './core/progress.js';
import { closeAllSheets, openSheet, topSheet } from './ui/modal.js';
import { esc } from './ui/util.js';

// スマートフォンでは開発者ツールが使えないため、エラーを画面に表示する
function showFatal(err) {
  const el = document.getElementById('fatal');
  el.hidden = false;
  el.innerHTML = `<b>エラーが発生しました</b><pre>${esc(err && (err.stack || err.message || err))}</pre><button onclick="location.reload()">再読み込み</button>`;
}
window.addEventListener('error', (e) => showFatal(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showFatal(e.reason));

const TABS = [
  { route: 'lab', icon: '⚗️', label: '実験室' },
  { route: 'research', icon: '🏛️', label: '研究所' },
  { route: 'zukan', icon: '📘', label: '物質図鑑' },
  { route: 'reactions', icon: '📗', label: '反応図鑑' },
  { route: 'settings', icon: '⚙️', label: '設定' },
];

async function main() {
  const db = await loadDatabase('./');
  const store = createStore(db);
  const view = document.getElementById('view');

  const ctx = {
    db,
    store,
    zukanFilter: 'all',
    refreshHeader,
    rerender: () => route(),
  };

  document.getElementById('tabs').innerHTML = TABS.map((t) => `<a href="#/${t.route}" data-tab="${t.route}"><span class="ti">${t.icon}</span><span class="tl">${t.label}</span></a>`).join('');

  function refreshHeader() {
    const s = store.state;
    const info = levelInfo(s.research.xp, db);
    document.getElementById('hdrStats').innerHTML = `
      <a class="hdr-level" href="#/research" title="研究レベル"><b>Lv.${info.level}</b><span class="mini-xp"><i style="width:${Math.round(info.progress * 100)}%"></i></span></a>
      <span title="発見した反応">📗 ${Object.keys(s.discoveredReactions).length}/${db.reactions.length}</span>`;
    document.querySelector('.brand small').textContent = info.title;
    const r = document.querySelector('[data-tab="research"]');
    if (r) r.classList.toggle('dot', !s.research.active && db.missions.some((m) => missionStatus(m, s) === 'available'));
    const newCount = s.newSubstances.length;
    const z = document.querySelector('[data-tab="zukan"]');
    if (z) z.classList.toggle('dot', newCount > 0);
  }

  function route() {
    closeAllSheets();
    const [, name = 'lab', id] = (location.hash || '#/lab').split('/');
    document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === name));
    view.scrollTop = 0;
    window.scrollTo(0, 0);
    // 画面ごとに新しい要素へ描画する（古い画面のイベントリスナーが残って二重に反応するのを防ぐ）
    const host = document.createElement('div');
    host.className = 'screen';
    view.replaceChildren(host);
    switch (name) {
      case 'zukan': renderZukan(host, ctx, id && decodeURIComponent(id)); break;
      case 'reactions': renderReactions(host, ctx, id && decodeURIComponent(id)); break;
      case 'settings': renderSettings(host, ctx); break;
      case 'research': renderResearch(host, ctx, id && decodeURIComponent(id)); break;
      default: renderLab(host, ctx);
    }
    refreshHeader();
  }

  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && topSheet()) topSheet().close(); });
  route();
  document.getElementById('splash').classList.add('gone');

  if (!store.state.flags.introSeen) showIntro(store);
}

function showIntro(store) {
  const sheet = openSheet(`
    <div class="intro">
      <div class="mentor">👩‍🔬</div>
      <h2>ようこそ、化学研究所へ</h2>
      <p class="speech">はじめまして。私は指導教員の<b>水城（みずき）</b>です。<br>今日からあなたはこの研究所の見習い研究者。まずは実験室で自由に物質を組み合わせてみましょう。</p>
      <ul class="howto">
        <li>① <b>試薬を追加</b>で物質を実験台に置く（最大 3 種）</li>
        <li>② 温度・圧力・触媒・溶媒・操作を設定</li>
        <li>③ <b>反応開始</b>！ 結果と解説を読んで理解を深めよう</li>
        <li>④ 生成物は次の実験の原料として使えます（多段階合成）</li>
        <li>⑤ <b>研究所</b>で研究課題に挑戦すると、経験値と新しい試薬がもらえます</li>
      </ul>
      <p class="speech small">同じ物質でも、<b>条件</b>しだいで生成物が変わることがあります。なぜそうなるのか、考えながら実験してください。<br>なお、ここで扱う実験には現実では危険なものも含まれます。実際には試さないこと！</p>
      <button class="btn primary wide" data-start>研究を始める</button>
      <button class="btn ghost wide" data-mission>最初の課題を見る</button>
    </div>`, { className: 'intro-sheet', onClose: () => store.update((s) => { s.flags.introSeen = true; }) });
  sheet.body.querySelector('[data-start]').addEventListener('click', () => sheet.close());
  sheet.body.querySelector('[data-mission]').addEventListener('click', () => { sheet.close(); location.hash = '#/research/m_neutral'; });
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* オフライン非対応でも動作は継続 */ });
}

main().catch(showFatal);
