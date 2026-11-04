/* =========================================================
   管理ページ
   - 編集内容はまずこのブラウザに保存（公開ページでプレビュー可）
   - 「data.js を書き出す」→ js/data.js を差し替えて再デプロイすると全員に公開
   - ログイン（パスワード）は Cloudflare Pages Functions（functions/_middleware.js）が担当
   ========================================================= */
(function () {
  var U = LabUtil, esc = U.esc;
  var D = LabStore.load();
  var root = document.getElementById('root');

  /* ---------- 項目定義 ---------- */
  var SCHEMA = {
    news: {
      label: 'お知らせ', icon: '📢', sort: 'date',
      fields: [
        { k: 'date', label: '日付', type: 'date', req: true },
        { k: 'text', label: '内容', type: 'text', req: true },
        { k: 'link', label: 'リンク先（任意）', type: 'text', hint: '例: report.html?id=20260507-akiba / https://〜' }
      ],
      title: function (x) { return x.text || '（無題）'; }, sub: function (x) { return U.fmtDate(x.date); },
      blank: function () { return { id: U.uid('n'), date: today(), text: '', link: '' }; }
    },
    events: {
      label: 'イベントレポート', icon: '📷', sort: 'date',
      fields: [
        { k: 'date', label: '日付', type: 'date', req: true },
        { k: 'title', label: 'イベント名', type: 'text', req: true },
        { k: 'place', label: '場所', type: 'text' },
        { k: 'participants', label: '参加者', type: 'text', hint: '例: 三研究室合同' },
        { k: 'summary', label: '一覧に表示する概要（1〜2行）', type: 'textarea' },
        { k: 'body', label: 'レポート本文', type: 'textarea', tall: true, hint: '空行で段落が分かれます' },
        { k: 'images', label: '写真のURL（1行に1つ）', type: 'lines', hint: '例: images/akiba01.jpg（サーバーに置いた画像のパス）' }
      ],
      title: function (x) { return x.title || '（無題）'; }, sub: function (x) { return U.fmtDate(x.date); },
      blank: function () { return { id: today().replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6), date: today(), title: '', place: '', participants: '', summary: '', body: '', images: [] }; },
      extra: function (x) { return '<p class="hint">このレポートのURL: <code>report.html?id=' + esc(x.id) + '</code> ／ <a href="report.html?id=' + encodeURIComponent(x.id) + '" target="_blank" rel="noopener">プレビュー ↗</a></p>'; }
    },
    research: {
      label: '研究紹介', icon: '🔬', sort: 'manual',
      fields: [
        { k: 'icon', label: 'アイコン（絵文字1文字）', type: 'text' },
        { k: 'title', label: 'テーマ名', type: 'text', req: true },
        { k: 'summary', label: '概要（1行）', type: 'text' },
        { k: 'detail', label: '詳しい説明', type: 'textarea', tall: true, hint: '空行で段落が分かれます' }
      ],
      title: function (x) { return (x.icon || '') + ' ' + (x.title || '（無題）'); }, sub: function () { return ''; },
      blank: function () { return { id: U.uid('r'), icon: '⚙', title: '', summary: '', detail: '' }; }
    },
    links: {
      label: '関連リンク', icon: '🔗', sort: 'manual',
      fields: [
        { k: 'title', label: 'リンク名', type: 'text', req: true },
        { k: 'url', label: 'URL', type: 'url', req: true },
        { k: 'desc', label: '説明', type: 'text' }
      ],
      title: function (x) { return x.title || '（無題）'; }, sub: function (x) { return x.url; },
      blank: function () { return { id: U.uid('l'), title: '', url: 'https://', desc: '' }; }
    }
  };

  var state = { tab: 'news', sel: {} };

  function today() {
    var d = new Date(), z = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }
  function toast(t) {
    var el = document.getElementById('toast');
    el.textContent = t; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }
  function persist(msg) { if (LabStore.save(D)) toast(msg || '保存しました'); }

  /* ---------- 全体 ---------- */
  function render() {
    var tabs = Object.keys(SCHEMA).map(function (k) { return [k, SCHEMA[k].icon + ' ' + SCHEMA[k].label]; }).concat([['site', '⚙ サイト設定'], ['publish', '📤 公開（書き出し）']]);
    root.innerHTML =
      '<div class="frame admin-wrap">' +
      '<header class="admin-head"><h1>🛠 ' + esc(D.site.title) + ' 管理ページ</h1><span class="sp"></span>' +
      '<a href="index.html" target="_blank" rel="noopener">公開ページをプレビュー ↗</a>' +
      '</header>' +
      '<div class="tabs" role="tablist" aria-label="編集する項目">' +
      tabs.map(function (t) { return '<button class="tab" role="tab" id="tab-' + t[0] + '" aria-controls="panel" aria-selected="' + (state.tab === t[0]) + '" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') +
      '</div>' +
      '<div class="tabpanel" id="panel" role="tabpanel" aria-labelledby="tab-' + state.tab + '"></div>' +
      '<footer class="foot"><p class="copy"><small>Copyright &copy; ' + new Date().getFullYear() + ' ' + esc(D.site.owner) + ' All Rights Reserved.</small></p></footer>' +
      '</div><div class="toast" id="toast" role="status" aria-live="polite"></div>';

    document.querySelectorAll('.tab').forEach(function (b) {
      b.addEventListener('click', function () { state.tab = b.dataset.tab; render(); document.getElementById('tab-' + state.tab).focus(); });
    });
    document.querySelector('.tabs').addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var ids = tabs.map(function (t) { return t[0]; }), i = ids.indexOf(state.tab);
      state.tab = ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
      render(); document.getElementById('tab-' + state.tab).focus();
    });

    var panel = document.getElementById('panel');
    if (SCHEMA[state.tab]) renderList(panel, state.tab);
    else if (state.tab === 'site') renderSite(panel);
    else renderPublish(panel);
  }

  /* ---------- 一覧＋編集フォーム ---------- */
  function sorted(key) {
    var arr = D[key];
    if (SCHEMA[key].sort === 'date') arr.sort(U.byDateDesc);
    return arr;
  }

  function renderList(panel, key) {
    var S = SCHEMA[key], arr = sorted(key);
    var selId = state.sel[key];
    var item = arr.find(function (x) { return x.id === selId; });

    var list = arr.length ? '<ul class="adm-list" aria-label="' + S.label + 'の一覧">' + arr.map(function (x, i) {
      var mv = S.sort === 'manual'
        ? '<button class="mv" type="button" data-mv="-1" data-i="' + i + '" aria-label="上へ移動"' + (i === 0 ? ' disabled' : '') + '>▲</button><button class="mv" type="button" data-mv="1" data-i="' + i + '" aria-label="下へ移動"' + (i === arr.length - 1 ? ' disabled' : '') + '>▼</button>'
        : '';
      return '<li class="' + (x.id === selId ? 'sel' : '') + '"><button class="pick" type="button" data-id="' + esc(x.id) + '"' + (x.id === selId ? ' aria-current="true"' : '') + '>' + esc(S.title(x)) + (S.sub(x) ? '<small>' + esc(S.sub(x)) + '</small>' : '') + '</button>' + mv + '</li>';
    }).join('') + '</ul>' : '<p class="empty">まだありません</p>';

    var form = item ? formHtml(S, item) : '<p class="empty">← 左の一覧から編集する項目を選ぶか、「＋ 新規追加」を押してください。</p>';

    panel.innerHTML =
      '<div class="adm-grid"><div>' +
      '<div class="adm-tools"><button class="btn primary" type="button" id="addBtn">＋ 新規追加</button></div>' + list +
      (S.sort === 'date' ? '<p class="hint tiny">※日付の新しい順に自動で並びます</p>' : '<p class="hint tiny">※▲▼で表示順を変えられます</p>') +
      '</div><div>' + form + '</div></div>';

    panel.querySelector('#addBtn').addEventListener('click', function () {
      var n = S.blank(); D[key].unshift(n); state.sel[key] = n.id; renderList(panel, key);
      var f = panel.querySelector('.form input, .form textarea'); if (f) f.focus();
    });
    panel.querySelectorAll('.pick').forEach(function (b) {
      b.addEventListener('click', function () { state.sel[key] = b.dataset.id; renderList(panel, key); });
    });
    panel.querySelectorAll('.mv').forEach(function (b) {
      b.addEventListener('click', function () {
        var i = +b.dataset.i, j = i + (+b.dataset.mv), a = D[key];
        var t = a[i]; a[i] = a[j]; a[j] = t; persist('並び順を保存しました'); renderList(panel, key);
      });
    });

    if (!item) return;
    var f = panel.querySelector('#editForm');
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      S.fields.forEach(function (fd) {
        var v = f.elements[fd.k].value;
        item[fd.k] = fd.type === 'lines' ? v.split('\n').map(function (s) { return s.trim(); }).filter(Boolean) : v.trim();
      });
      persist(); renderList(panel, key);
    });
    panel.querySelector('#delBtn').addEventListener('click', function () {
      if (!confirm('「' + S.title(item) + '」を削除しますか？')) return;
      D[key] = D[key].filter(function (x) { return x.id !== item.id; });
      delete state.sel[key]; persist('削除しました'); renderList(panel, key);
    });
  }

  function formHtml(S, item) {
    return '<form class="form" id="editForm" novalidate>' +
      '<h2 class="sub-h" style="margin-top:0">' + S.icon + ' ' + esc(S.label) + 'を編集</h2>' +
      S.fields.map(function (fd) {
        var v = item[fd.k]; if (fd.type === 'lines') v = (v || []).join('\n');
        var req = fd.req ? ' required' : '';
        var input = (fd.type === 'textarea' || fd.type === 'lines')
          ? '<textarea name="' + fd.k + '"' + (fd.tall ? ' class="tall"' : '') + req + '>' + esc(v) + '</textarea>'
          : '<input name="' + fd.k + '" type="' + fd.type + '" value="' + esc(v) + '"' + req + '>';
        return '<label><span>' + esc(fd.label) + (fd.req ? ' <span style="color:#c00" aria-label="必須">*</span>' : '') + '</span>' + input + (fd.hint ? '<span class="hint">' + esc(fd.hint) + '</span>' : '') + '</label>';
      }).join('') +
      (S.extra ? S.extra(item) : '') +
      '<div class="row"><button class="btn primary" type="submit">💾 保存する</button><button class="btn danger" type="button" id="delBtn">🗑 削除</button></div>' +
      '</form>';
  }

  /* ---------- サイト設定 ---------- */
  function renderSite(panel) {
    var s = D.site;
    var F = [
      ['title', '研究室名'], ['subtitle', 'サブタイトル'], ['university', '大学・学部・学科'], ['professor', '指導教員'],
      ['owner', '著作権表示の名義（© の後ろ）'], ['since', '開設年（©の年表記に使用）']
    ];
    panel.innerHTML = '<form class="form" id="siteForm" style="max-width:720px">' +
      '<h2 class="sub-h" style="margin-top:0">⚙ サイト設定</h2>' +
      F.map(function (f) { return '<label>' + f[1] + '<input name="' + f[0] + '" value="' + esc(s[f[0]]) + '"></label>'; }).join('') +
      '<label>トップページの「ようこそ」文<textarea name="welcome">' + esc(s.welcome) + '</textarea></label>' +
      '<div class="row"><button class="btn primary" type="submit">💾 保存する</button></div></form>' +
      '<p class="notice info" style="margin-top:24px">🔑 管理ページのパスワードは Cloudflare Pages の環境変数（ADMIN_USER / ADMIN_PASSWORD）で管理しています。変更は Cloudflare のダッシュボードから行ってください。</p>';

    panel.querySelector('#siteForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      F.concat([['welcome']]).forEach(function (f) { s[f[0]] = ev.target.elements[f[0]].value.trim(); });
      s.since = parseInt(s.since, 10) || new Date().getFullYear();
      persist();
    });
  }

  /* ---------- 公開（書き出し） ---------- */
  function download(name, text, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function renderPublish(panel) {
    panel.innerHTML =
      '<h2 class="sub-h" style="margin-top:0">📤 公開（書き出し）</h2>' +
      '<div class="notice info"><strong>しくみ</strong>：このページで保存した内容は、まず<strong>このブラウザの中だけ</strong>に保存されます（公開ページを開くと黄色いバー付きでプレビューできます）。<br>全員に公開するには、次の手順でサーバーのファイルを差し替えてください。' +
      '<ol class="steps"><li>下の「data.js を書き出す」を押す</li><li>ダウンロードされた <code>data.js</code> で、サイトのフォルダ（またはGitリポジトリ）の <code>js/data.js</code> を上書き</li><li>Cloudflare Pages に再デプロイ（Git連携ならコミット＆プッシュするだけ）</li><li>1〜2分後に公開ページを再読み込みして確認</li></ol></div>' +
      '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:24px">' +
      '<button class="btn primary" type="button" id="expJs">📄 data.js を書き出す</button>' +
      '<button class="btn" type="button" id="expJson">💾 バックアップ（JSON）を保存</button>' +
      '<label class="btn" style="display:inline-flex;align-items:center">📂 バックアップから読み込む<input type="file" id="impJson" accept="application/json,.json" hidden></label>' +
      '</div>' +
      '<h2 class="sub-h">↩ 元に戻す</h2>' +
      '<p>このブラウザで編集した内容を捨てて、公開中の内容（js/data.js）に戻します。</p>' +
      '<button class="btn danger" type="button" id="reset">公開中の内容に戻す</button>';

    panel.querySelector('#expJs').addEventListener('click', function () {
      var head = '/* 中里研究室ホームページ サイトデータ（管理ページから書き出し: ' + new Date().toLocaleString('ja-JP') + '）\n   このファイルでサーバーの js/data.js を上書きすると公開されます。 */\n';
      download('data.js', head + 'window.DEFAULT_DATA = ' + JSON.stringify(D, null, 2) + ';\n', 'text/javascript');
      toast('data.js を書き出しました');
    });
    panel.querySelector('#expJson').addEventListener('click', function () {
      download('nakazato-lab-backup-' + today() + '.json', JSON.stringify(D, null, 2), 'application/json');
    });
    panel.querySelector('#impJson').addEventListener('change', function (ev) {
      var file = ev.target.files[0]; if (!file) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var d = JSON.parse(r.result);
          if (!d.site || !Array.isArray(d.news) || !Array.isArray(d.events)) throw new Error();
          if (!confirm('現在の編集内容をバックアップの内容で置き換えますか？')) return;
          D = d; persist('読み込みました'); render();
        } catch (e) { alert('読み込めませんでした。このサイトのバックアップファイルか確認してください。'); }
      };
      r.readAsText(file);
    });
    panel.querySelector('#reset').addEventListener('click', function () {
      if (!confirm('このブラウザでの編集内容をすべて破棄しますか？（書き出していない変更は失われます）')) return;
      LabStore.discard(); D = LabStore.load(); state.sel = {}; toast('公開中の内容に戻しました'); render();
    });
  }

  render();
})();
