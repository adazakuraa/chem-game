// 設定・セーブ管理・データ検証
import { validateDatabase } from '../core/validate.js';
import { esc, toast } from './util.js';
import { APP_VERSION } from '../version.js';

export function renderSettings(root, ctx) {
  const { db, store } = ctx;
  const s = store.state;
  root.innerHTML = `
    <section class="page">
      <h1 class="page-title">⚙ 研究所の設定</h1>

      <div class="panel-card">
        <h3>研究記録</h3>
        <table class="props">
          <tr><th>実験回数</th><td>${s.stats.experiments}</td></tr>
          <tr><th>成功した実験</th><td>${s.stats.successes}</td></tr>
          <tr><th>所持物質</th><td>${s.owned.length} / ${db.substances.length}</td></tr>
          <tr><th>発見した反応</th><td>${Object.keys(s.discoveredReactions).length} / ${db.reactions.length}</td></tr>
        </table>
      </div>

      <div class="panel-card">
        <h3>セーブデータ</h3>
        <p class="muted">進行状況はこの端末のブラウザに自動保存されます。${store.storageOK ? '' : '<b class="warn">⚠ 現在このブラウザでは保存できません（プライベートモード等）。</b>'}</p>
        <p class="muted">iPhone の Safari では、長期間サイトを開かないと保存データが消去される場合があります。ホーム画面に追加するか、定期的に書き出してください。</p>
        <div class="btn-row">
          <button class="btn" id="exp">書き出し（コピー）</button>
          <button class="btn" id="imp">読み込み</button>
        </div>
        <textarea id="saveText" class="save-text" rows="4" placeholder="ここにセーブデータを貼り付けて「読み込み」"></textarea>
        <button class="btn danger wide" id="reset">最初からやり直す</button>
      </div>

      <div class="panel-card">
        <h3>化学データの検証</h3>
        <p class="muted">反応式の原子数・電荷の保存、参照の整合、構造式と化学式の一致を検査します。</p>
        <button class="btn wide" id="validate">検証を実行</button>
        <div id="valOut"></div>
      </div>

      <div class="panel-card">
        <h3>このゲームについて</h3>
        <p>化学反応の判定は、教科書等に基づいて登録した反応データにより行います。データベースにない組み合わせは「未登録」と表示され、現実に反応しないことを意味しません。各反応には「検証状況」と「参考文献」を記載しています。</p>
        <p class="safety danger"><b>⚠ 安全上の注意</b><br>ゲーム内の実験には、現実では危険なものが含まれます。ゲームの内容を参考に実際の実験を行わないでください。</p>
        <p class="muted">バージョン ${esc(APP_VERSION)}</p>
      </div>
    </section>`;

  const ta = root.querySelector('#saveText');
  root.querySelector('#exp').addEventListener('click', async () => {
    const text = store.exportText();
    ta.value = text;
    try {
      await navigator.clipboard.writeText(text);
      toast('セーブデータをコピーしました');
    } catch {
      ta.select();
      toast('テキストを選択しました。手動でコピーしてください');
    }
  });
  root.querySelector('#imp').addEventListener('click', () => {
    if (!ta.value.trim()) return toast('セーブデータを貼り付けてください');
    try {
      store.importText(ta.value.trim());
      toast('読み込みました', 'ok');
      ctx.refreshHeader();
      renderSettings(root, ctx);
    } catch (e) {
      toast(`読み込みに失敗：${e.message}`, 'err');
    }
  });
  root.querySelector('#reset').addEventListener('click', () => {
    if (!confirm('すべての研究記録を消去して最初からやり直します。よろしいですか？')) return;
    store.reset();
    ctx.refreshHeader();
    toast('リセットしました');
    renderSettings(root, ctx);
  });
  root.querySelector('#validate').addEventListener('click', () => {
    const { errors, warnings, stats } = validateDatabase(db);
    root.querySelector('#valOut').innerHTML = `
      <p class="${errors.length ? 'warn' : 'ok'}">${errors.length ? `❌ エラー ${errors.length} 件` : '✅ エラーはありません'}（警告 ${warnings.length} 件）</p>
      <p class="muted">物質 ${stats.substances}・反応 ${stats.reactions}・査読待ち ${stats.awaitingReview}・簡略化あり ${stats.simplified}</p>
      ${errors.concat(warnings).length ? `<ul class="val-list">${errors.map((e) => `<li class="err">${esc(e)}</li>`).join('')}${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
  });
}
