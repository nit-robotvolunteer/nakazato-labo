/* =========================================================
   管理ページ
   - 「保存」を押すと D1 データベースに書き込まれ、すぐ全員に公開されます
   - ログイン（パスワード）は functions/_middleware.js が担当
   ========================================================= */
(function () {
  var U = LabUtil, esc = U.esc;
  var root = document.getElementById('root');
  var D = null;

  /* ---------- API ---------- */
  function api(method, path, data) {
    return fetch('/api/admin/' + path, {
      method: method,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Lab-Admin': '1' },
      body: data === undefined ? undefined : JSON.stringify(data)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) throw new Error('ログインの有効期限が切れました。ページを再読み込みしてください。');
        if (!r.ok || j.ok === false) throw new Error(j.error || ('エラーが発生しました（' + r.status + '）'));
        return j;
      });
    });
  }

  /* 保存中はボタンを押せなくし、結果をトーストで知らせる */
  function busy(btn, promise, okMsg) {
    if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = '保存中…'; }
    var p = promise.then(function (r) { if (okMsg) toast(okMsg); return r; })
      .catch(function (e) { toast(e.message, true); throw e; })
      .finally(function () { if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label; } });
    /* 成功したときだけ続きの処理を実行（失敗はトーストで通知済み） */
    return { then: function (onOk) { p.then(onOk, function () {}); } };
  }

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
        { k: 'images', label: '写真のURL（1行に1つ）', type: 'lines', hint: '例: images/akiba01.jpg（サイトに置いた画像のパス）' }
      ],
      title: function (x) { return x.title || '（無題）'; }, sub: function (x) { return U.fmtDate(x.date); },
      blank: function () { return { id: today().replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6), date: today(), title: '', place: '', participants: '', summary: '', body: '', images: [] }; },
      extra: function (x, isNew) { return isNew ? '' : '<p class="hint">このレポートのURL: <code>report.html?id=' + esc(x.id) + '</code> ／ <a href="report.html?id=' + encodeURIComponent(x.id) + '" target="_blank" rel="noopener">公開ページで見る ↗</a></p>'; }
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

  var state = { tab: 'news', sel: {}, draft: {} }; // draft: 未保存の新規項目

  function today() {
    var d = new Date(), z = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }
  function toast(t, isErr) {
    var el = document.getElementById('toast');
    if (!el) { alert(t); return; }
    el.textContent = t; el.classList.toggle('err', !!isErr); el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.remove('show'); }, isErr ? 5000 : 2000);
  }

  /* ---------- 起動 ---------- */
  function boot() {
    root.innerHTML = '<p style="padding:24px">読み込み中…</p>';
    api('GET', 'data').then(function (d) {
      if (!d.initialized) return renderSetup();
      D = d; render();
    }).catch(function (e) {
      root.innerHTML = '<div class="frame admin-wrap"><div class="tabpanel"><p class="notice" role="alert">' + esc(e.message) + '</p>' +
        '<p class="hint">Cloudflare Pages の設定で D1 データベースが「DB」という名前でバインドされているか確認してください。</p></div></div>';
    });
  }

  /* 初回：D1 が空のとき、js/data.js の内容を登録する */
  function renderSetup() {
    root.innerHTML = '<div class="frame admin-wrap"><header class="admin-head"><h1>🛠 管理ページ 初期設定</h1></header><div class="tabpanel">' +
      '<p class="notice info">D1 データベースにまだデータがありません。<br>下のボタンを押すと、今のサイトの内容（js/data.js）をデータベースに登録します。登録後は、このページで保存した内容がすぐ公開されます。</p>' +
      '<button class="btn primary" type="button" id="seed">📥 初期データを登録する</button></div></div><div class="toast" id="toast" role="status" aria-live="polite"></div>';
    var b = document.getElementById('seed');
    b.addEventListener('click', function () {
      busy(b, api('POST', 'import', LabStore.defaults()), '登録しました').then(function (r) { D = r.data; render(); });
    });
  }

  /* ---------- 全体 ---------- */
  function render() {
    var tabs = Object.keys(SCHEMA).map(function (k) { return [k, SCHEMA[k].icon + ' ' + SCHEMA[k].label]; }).concat([['site', '⚙ サイト設定'], ['backup', '💾 バックアップ']]);
    root.innerHTML =
      '<div class="frame admin-wrap">' +
      '<header class="admin-head"><h1>🛠 ' + esc(D.site.title) + ' 管理ページ</h1><span class="sp"></span>' +
      '<a href="index.html" target="_blank" rel="noopener">公開ページを見る ↗</a></header>' +
      '<p class="admin-note">✔ 「保存」を押すとすぐに公開ページへ反映されます。</p>' +
      '<div class="tabs" role="tablist" aria-label="編集する項目">' +
      tabs.map(function (t) { return '<button class="tab" role="tab" id="tab-' + t[0] + '" aria-controls="panel" aria-selected="' + (state.tab === t[0]) + '" tabindex="' + (state.tab === t[0] ? 0 : -1) + '" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') +
      '</div>' +
      '<div class="tabpanel" id="panel" role="tabpanel" aria-labelledby="tab-' + state.tab + '"></div>' +
      '<footer class="foot"><p class="copy"><small>Copyright &copy; ' + new Date().getFullYear() + ' ' + esc(D.site.owner) + ' All Rights Reserved.</small></p></footer>' +
      '</div><div class="toast" id="toast" role="status" aria-live="polite"></div>';

    function go(t) { state.tab = t; render(); document.getElementById('tab-' + t).focus(); }
    document.querySelectorAll('.tab').forEach(function (b) { b.addEventListener('click', function () { go(b.dataset.tab); }); });
    document.querySelector('.tabs').addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var ids = tabs.map(function (t) { return t[0]; }), i = ids.indexOf(state.tab);
      go(ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length]);
    });

    var panel = document.getElementById('panel');
    if (SCHEMA[state.tab]) renderList(panel, state.tab);
    else if (state.tab === 'site') renderSite(panel);
    else renderBackup(panel);
  }

  /* ---------- 一覧＋編集フォーム ---------- */
  function renderList(panel, key) {
    var S = SCHEMA[key], arr = D[key];
    if (S.sort === 'date') arr.sort(U.byDateDesc);
    var draft = state.draft[key];
    var selId = state.sel[key];
    var item = draft && draft.id === selId ? draft : arr.find(function (x) { return x.id === selId; });
    var isNew = !!(draft && item === draft);

    var rows = (draft ? [draft] : []).concat(arr);
    var list = rows.length ? '<ul class="adm-list" aria-label="' + S.label + 'の一覧">' + rows.map(function (x) {
      var i = arr.indexOf(x), fresh = x === draft;
      var mv = S.sort === 'manual' && !fresh
        ? '<button class="mv" type="button" data-mv="-1" data-i="' + i + '" aria-label="上へ移動"' + (i === 0 ? ' disabled' : '') + '>▲</button><button class="mv" type="button" data-mv="1" data-i="' + i + '" aria-label="下へ移動"' + (i === arr.length - 1 ? ' disabled' : '') + '>▼</button>'
        : '';
      return '<li class="' + (x.id === selId ? 'sel' : '') + '"><button class="pick" type="button" data-id="' + esc(x.id) + '"' + (x.id === selId ? ' aria-current="true"' : '') + '>' +
        (fresh ? '🆕 ' : '') + esc(S.title(x)) + (S.sub(x) ? '<small>' + esc(S.sub(x)) + '</small>' : '') + '</button>' + mv + '</li>';
    }).join('') + '</ul>' : '<p class="empty">まだありません</p>';

    panel.innerHTML =
      '<div class="adm-grid"><div>' +
      '<div class="adm-tools"><button class="btn primary" type="button" id="addBtn"' + (draft ? ' disabled' : '') + '>＋ 新規追加</button></div>' + list +
      (S.sort === 'date' ? '<p class="hint">※日付の新しい順に自動で並びます</p>' : '<p class="hint">※▲▼で表示順を変えられます</p>') +
      '</div><div>' + (item ? formHtml(S, item, isNew) : '<p class="empty">← 左の一覧から編集する項目を選ぶか、「＋ 新規追加」を押してください。</p>') + '</div></div>';

    panel.querySelector('#addBtn').addEventListener('click', function () {
      var n = S.blank(); state.draft[key] = n; state.sel[key] = n.id; renderList(panel, key);
      var f = panel.querySelector('.form input, .form textarea'); if (f) f.focus();
    });
    panel.querySelectorAll('.pick').forEach(function (b) {
      b.addEventListener('click', function () { state.sel[key] = b.dataset.id; renderList(panel, key); });
    });
    panel.querySelectorAll('.mv').forEach(function (b) {
      b.addEventListener('click', function () {
        var i = +b.dataset.i, j = i + (+b.dataset.mv), a = D[key].slice();
        var t = a[i]; a[i] = a[j]; a[j] = t;
        busy(null, api('PUT', 'order/' + key, { ids: a.map(function (x) { return x.id; }) }), '並び順を保存しました')
          .then(function () { a.forEach(function (x, k) { x.sort = k; }); D[key] = a; renderList(panel, key); });
      });
    });

    if (!item) return;
    var f = panel.querySelector('#editForm');
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!f.reportValidity()) return;
      var next = Object.assign({}, item);
      S.fields.forEach(function (fd) {
        var v = f.elements[fd.k].value;
        next[fd.k] = fd.type === 'lines' ? v.split('\n').map(function (s) { return s.trim(); }).filter(Boolean) : v.trim();
      });
      if (S.sort === 'manual' && isNew) next.sort = arr.length;
      var btn = f.querySelector('button[type=submit]');
      busy(btn, api('PUT', key + '/' + encodeURIComponent(item.id), next), isNew ? '追加して公開しました' : '保存して公開しました').then(function (r) {
        var saved = r.item;
        if (isNew) { arr.push(saved); delete state.draft[key]; }
        else arr[arr.indexOf(item)] = saved;
        renderList(panel, key);
      });
    });
    panel.querySelector('#delBtn').addEventListener('click', function () {
      if (isNew) { delete state.draft[key]; delete state.sel[key]; renderList(panel, key); return; }
      if (!confirm('「' + S.title(item) + '」を削除しますか？\n公開ページからもすぐに消えます。')) return;
      busy(null, api('DELETE', key + '/' + encodeURIComponent(item.id)), '削除しました').then(function () {
        D[key] = arr.filter(function (x) { return x !== item; }); delete state.sel[key]; renderList(panel, key);
      });
    });
  }

  function formHtml(S, item, isNew) {
    return '<form class="form" id="editForm">' +
      '<h2 class="sub-h" style="margin-top:0">' + S.icon + ' ' + esc(S.label) + (isNew ? 'を追加' : 'を編集') + '</h2>' +
      S.fields.map(function (fd) {
        var v = item[fd.k]; if (fd.type === 'lines') v = (v || []).join('\n');
        var req = fd.req ? ' required' : '';
        var input = (fd.type === 'textarea' || fd.type === 'lines')
          ? '<textarea name="' + fd.k + '"' + (fd.tall ? ' class="tall"' : '') + req + '>' + esc(v) + '</textarea>'
          : '<input name="' + fd.k + '" type="' + fd.type + '" value="' + esc(v) + '"' + req + '>';
        return '<label><span>' + esc(fd.label) + (fd.req ? ' <span style="color:#c00" aria-label="必須">*</span>' : '') + '</span>' + input + (fd.hint ? '<span class="hint">' + esc(fd.hint) + '</span>' : '') + '</label>';
      }).join('') +
      (S.extra ? S.extra(item, isNew) : '') +
      '<div class="row"><button class="btn primary" type="submit">💾 ' + (isNew ? '追加して公開' : '保存して公開') + '</button>' +
      '<button class="btn danger" type="button" id="delBtn">' + (isNew ? '取り消す' : '🗑 削除') + '</button></div>' +
      '</form>';
  }

  /* ---------- サイト設定 ---------- */
  function renderSite(panel) {
    var s = D.site;
    var F = [['title', '研究室名'], ['subtitle', 'サブタイトル'], ['university', '大学・学部・学科'], ['professor', '指導教員'],
      ['owner', '著作権表示の名義（© の後ろ）'], ['since', '開設年（©の年表記に使用）']];
    panel.innerHTML = '<form class="form" id="siteForm" style="max-width:720px">' +
      '<h2 class="sub-h" style="margin-top:0">⚙ サイト設定</h2>' +
      F.map(function (f) { return '<label>' + f[1] + '<input name="' + f[0] + '" value="' + esc(s[f[0]]) + '"' + (f[0] === 'title' ? ' required' : '') + '></label>'; }).join('') +
      '<label>トップページの紹介文<textarea name="welcome">' + esc(s.welcome) + '</textarea></label>' +
      '<div class="row"><button class="btn primary" type="submit">💾 保存して公開</button></div></form>' +
      '<p class="notice info" style="margin-top:24px">🔑 管理ページのパスワードは Cloudflare Pages の環境変数（ADMIN_USER / ADMIN_PASSWORD）で管理しています。変更は Cloudflare のダッシュボードから行い、再デプロイしてください。</p>';

    var form = panel.querySelector('#siteForm');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var next = {};
      F.concat([['welcome']]).forEach(function (f) { next[f[0]] = form.elements[f[0]].value.trim(); });
      busy(form.querySelector('button'), api('PUT', 'site', next), '保存して公開しました').then(function (r) { D.site = r.site; render(); });
    });
  }

  /* ---------- バックアップ ---------- */
  function download(name, text, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function renderBackup(panel) {
    panel.innerHTML =
      '<h2 class="sub-h" style="margin-top:0">💾 バックアップ</h2>' +
      '<p>データベースの内容を丸ごとファイルに保存したり、保存したファイルから元に戻したりできます。大きな変更の前に保存しておくと安心です。</p>' +
      '<div class="row" style="margin-bottom:24px">' +
      '<button class="btn primary" type="button" id="expJson">⬇ バックアップを保存（JSON）</button>' +
      '<label class="btn">⬆ バックアップから復元<input type="file" id="impJson" accept="application/json,.json" hidden></label>' +
      '</div>' +
      '<p class="notice">⚠ 復元すると、今公開中の内容はすべてバックアップの内容に置き換わります。</p>';

    panel.querySelector('#expJson').addEventListener('click', function () {
      var out = { site: D.site, news: D.news, research: D.research, events: D.events, links: D.links };
      download('nakazato-lab-backup-' + today() + '.json', JSON.stringify(out, null, 2), 'application/json');
    });
    panel.querySelector('#impJson').addEventListener('change', function (ev) {
      var file = ev.target.files[0]; ev.target.value = ''; if (!file) return;
      var r = new FileReader();
      r.onload = function () {
        var d;
        try { d = JSON.parse(r.result); if (!d.site || !Array.isArray(d.news) || !Array.isArray(d.events)) throw 0; }
        catch (e) { alert('読み込めませんでした。このサイトのバックアップファイルか確認してください。'); return; }
        if (!confirm('公開中の内容を、このバックアップの内容に置き換えますか？')) return;
        busy(null, api('POST', 'import', d), '復元しました').then(function (res) { D = res.data; state.sel = {}; state.draft = {}; render(); });
      };
      r.readAsText(file);
    });
  }

  boot();
})();
