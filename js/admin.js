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
        { k: 'link', label: 'リンク先（任意）', type: 'text', hint: '例: /report?id=2026050701 / https://〜' }
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
        { k: 'images', label: '写真', type: 'photos' }
      ],
      title: function (x) { return x.title || '（無題）'; }, sub: function (x) { return U.fmtDate(x.date); },
      blank: function () { return { id: 'new', date: today(), title: '', place: '', participants: '', summary: '', body: '', images: [] }; },
      extra: function (x, isNew) {
        return isNew
          ? '<p class="hint">URL は保存時に「日付＋連番」で自動で決まります（例: <code>/report?id=' + esc(x.date.replace(/-/g, '')) + '01</code>）。</p>'
          : '<p class="hint">このレポートのURL: <code>/report?id=' + esc(x.id) + '</code> ／ <a href="/report?id=' + encodeURIComponent(x.id) + '" target="_blank" rel="noopener">公開ページで見る ↗</a><br>※後から日付を変えても URL は変わりません。</p>';
      }
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

  var state = { tab: 'news', sel: {}, draft: {}, dirty: false }; // draft: 未保存の新規項目 / dirty: 未保存の変更あり

  /* 未保存の変更があるときだけ注意書きを出す */
  function setDirty(v) {
    state.dirty = v;
    var el = document.getElementById('dirtyNote');
    if (el) el.hidden = !v;
  }
  /* 未保存の変更があれば、移動してよいか確認する */
  function guard() {
    if (!state.dirty) return true;
    if (!confirm('保存していない変更があります。\n変更を破棄して移動しますか？')) return false;
    Object.keys(state.draft).forEach(function (k) { if (state.sel[k] === state.draft[k].id) delete state.sel[k]; });
    state.draft = {}; setDirty(false);
    return true;
  }
  window.addEventListener('beforeunload', function (e) { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });

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
      '<a href="/" target="_blank" rel="noopener">公開ページを見る ↗</a></header>' +
      '<p class="admin-note" id="dirtyNote" role="status"' + (state.dirty ? '' : ' hidden') + '>⚠ 保存していない変更があります。「保存して公開」を押すと公開ページに反映されます。</p>' +
      '<div class="tabs" role="tablist" aria-label="編集する項目">' +
      tabs.map(function (t) { return '<button class="tab" role="tab" id="tab-' + t[0] + '" aria-controls="panel" aria-selected="' + (state.tab === t[0]) + '" tabindex="' + (state.tab === t[0] ? 0 : -1) + '" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') +
      '</div>' +
      '<div class="tabpanel" id="panel" role="tabpanel" aria-labelledby="tab-' + state.tab + '"></div>' +
      '<footer class="foot"><p class="copy"><small>Copyright &copy; ' + new Date().getFullYear() + ' ' + esc(D.site.owner) + ' All Rights Reserved.</small></p></footer>' +
      '</div><div class="toast" id="toast" role="status" aria-live="polite"></div>';

    function go(t) { if (t !== state.tab && !guard()) return; state.tab = t; render(); document.getElementById('tab-' + t).focus(); }
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

  /* スマホ（1列表示）のときは、選んだ項目のフォームまでスクロール */
  function scrollToForm(panel) {
    if (!window.matchMedia('(max-width: 720px)').matches) return;
    var f = panel.querySelector('#editForm');
    if (f) f.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  /* イベントIDは「YYYYMMDD＋2桁連番」（例: 2026073001） */
  var EVENT_ID = /^\d{10}$/;
  function nextEventId(date, list, taken) {
    var base = String(date).replace(/-/g, ''), used = {};
    list.forEach(function (e) { used[e.id] = 1; });
    (taken || []).forEach(function (id) { used[id] = 1; });
    for (var n = 1; n <= 99; n++) { var id = base + (n < 10 ? '0' : '') + n; if (!used[id]) return id; }
    return null;
  }

  /* 古い形式のID（例: 20260730-otsukare）を新しい形式に変換し、お知らせのリンクも書き換える */
  function migrateEventIds(btn) {
    var old = D.events.filter(function (e) { return !EVENT_ID.test(e.id); })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    if (!old.length) return;
    var keep = D.events.filter(function (e) { return EVENT_ID.test(e.id); }), assigned = [], map = {};
    old.forEach(function (e) { var id = nextEventId(e.date, keep, assigned); assigned.push(id); map[e.id] = id; });
    if (!confirm('次のように URL を変更します。よろしいですか？\n\n' + old.map(function (e) { return e.title + '\n  ' + e.id + ' → ' + map[e.id]; }).join('\n'))) return;

    var data = { site: D.site, news: D.news, research: D.research, links: D.links,
      events: D.events.map(function (e) { return Object.assign({}, e, { id: map[e.id] || e.id }); }) };
    data.news = D.news.map(function (n) {
      var link = String(n.link || '').replace(/^\/?report(\.html)?\?id=([\w-]+)/, function (m, h, id) { return '/report?id=' + (map[id] || id); });
      return Object.assign({}, n, { link: link });
    });
    busy(btn, api('POST', 'import', data), 'URL を変換しました').then(function (r) { D = r.data; state.sel = {}; render(); });
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

    var needMigrate = key === 'events' && arr.some(function (e) { return !EVENT_ID.test(e.id); });
    panel.innerHTML =
      (needMigrate ? '<div class="notice info">古い形式の URL（例: <code>/report?id=20260730-otsukare</code>）のレポートがあります。短い形式（例: <code>/report?id=2026073001</code>）に変換できます。お知らせのリンクも自動で書き換えます。<div class="row" style="margin-top:8px"><button class="btn primary" type="button" id="migrateBtn">URL を短い形式に変換する</button></div></div>' : '') +
      '<div class="adm-grid"><div>' +
      '<div class="adm-tools"><button class="btn primary" type="button" id="addBtn"' + (draft ? ' disabled' : '') + '>＋ 新規追加</button></div>' + list +
      (S.sort === 'date' ? '<p class="hint">※日付の新しい順に自動で並びます</p>' : '<p class="hint">※▲▼で表示順を変えられます</p>') +
      '</div><div>' + (item ? formHtml(S, item, isNew) : '<p class="empty"><span class="hint-wide">← 左</span><span class="hint-narrow">↑ 上</span>の一覧から編集する項目を選ぶか、「＋ 新規追加」を押してください。</p>') + '</div></div>';

    var mb = panel.querySelector('#migrateBtn');
    if (mb) mb.addEventListener('click', function () { if (guard()) migrateEventIds(mb); });
    panel.querySelector('#addBtn').addEventListener('click', function () {
      if (!guard()) return;
      var n = S.blank(); state.draft[key] = n; state.sel[key] = n.id; renderList(panel, key); setDirty(true); scrollToForm(panel);
      var f = panel.querySelector('.form input, .form textarea'); if (f) f.focus();
    });
    panel.querySelectorAll('.pick').forEach(function (b) {
      b.addEventListener('click', function () { if (b.dataset.id === state.sel[key] || !guard()) return; state.sel[key] = b.dataset.id; renderList(panel, key); scrollToForm(panel); });
    });
    panel.querySelectorAll('.mv').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!guard()) return;
        var i = +b.dataset.i, j = i + (+b.dataset.mv), a = D[key].slice();
        var t = a[i]; a[i] = a[j]; a[j] = t;
        busy(null, api('PUT', 'order/' + key, { ids: a.map(function (x) { return x.id; }) }), '並び順を保存しました')
          .then(function () { a.forEach(function (x, k) { x.sort = k; }); D[key] = a; renderList(panel, key); });
      });
    });

    if (!item) return;
    var f = panel.querySelector('#editForm');
    var photos = null;
    if (panel.querySelector('#phBox')) photos = photoManager(panel.querySelector('#phBox'), item.images || [], f);
    f.addEventListener('input', function () { setDirty(true); });
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!f.reportValidity()) return;
      var next = Object.assign({}, item);
      if (photos && photos.uploading()) { toast('写真のアップロード中です。終わるまでお待ちください', true); return; }
      S.fields.forEach(function (fd) {
        if (fd.type === 'photos') { next[fd.k] = photos.list(); return; }
        var v = f.elements[fd.k].value;
        next[fd.k] = fd.type === 'lines' ? v.split('\n').map(function (s) { return s.trim(); }).filter(Boolean) : v.trim();
      });
      if (S.sort === 'manual' && isNew) next.sort = arr.length;
      var saveId = item.id;
      if (key === 'events' && isNew) {
        saveId = nextEventId(next.date, arr);
        if (!saveId) { toast('同じ日付のレポートが多すぎます（1日99件まで）', true); return; }
      }
      var btn = f.querySelector('button[type=submit]');
      busy(btn, api('PUT', key + '/' + encodeURIComponent(saveId), next), isNew ? '追加して公開しました' : '保存して公開しました').then(function (r) {
        var saved = r.item;
        setDirty(false);
        if (isNew) { arr.push(saved); delete state.draft[key]; state.sel[key] = saved.id; }
        else arr[arr.indexOf(item)] = saved;
        renderList(panel, key);
        if (key === 'events') loadUsage();
      });
    });
    panel.querySelector('#delBtn').addEventListener('click', function () {
      if (isNew) { delete state.draft[key]; delete state.sel[key]; setDirty(false); renderList(panel, key); return; }
      if (!confirm('「' + S.title(item) + '」を削除しますか？\n公開ページからもすぐに消えます。')) return;
      busy(null, api('DELETE', key + '/' + encodeURIComponent(item.id)), '削除しました').then(function () {
        D[key] = arr.filter(function (x) { return x !== item; }); delete state.sel[key]; setDirty(false); renderList(panel, key);
        if (key === 'events') loadUsage();
      });
    });
  }

  /* =======================================================
     写真
     ======================================================= */
  var PHOTO_MAX_SIDE = 1600;     // 長辺のピクセル数
  var PHOTO_MAX_COUNT = 50;      // 1レポートあたりの上限
  var PHOTO_LIMIT_BYTES = 1900000;

  function mb(n) { return (n / 1e6).toFixed(n < 1e7 ? 1 : 0); }

  /* 使用量を取得して、画面の .usage 要素をすべて更新 */
  function loadUsage() {
    api('GET', 'usage').then(function (u) { state.usage = u; paintUsage(); }).catch(function () {});
  }
  function usageHtml() {
    var u = state.usage;
    if (!u) return '<span class="hint">使用量を確認中…</span>';
    var used = u.dbBytes != null ? u.dbBytes : u.photoBytes, pct = Math.min(100, used / u.limit * 100);
    return '<div class="meter' + (pct >= 80 ? ' warn' : '') + '" role="img" aria-label="データベース使用量 ' + pct.toFixed(0) + '%"><span style="width:' + Math.max(pct, 0.5).toFixed(1) + '%"></span></div>' +
      '<span class="hint">データベース使用量 <strong>' + mb(used) + 'MB</strong> / ' + mb(u.limit) + 'MB（写真 ' + u.photoCount + '枚）' +
      (pct >= 80 ? ' ⚠ 残りが少なくなっています' : '') + '</span>';
  }
  function paintUsage() { document.querySelectorAll('.usage').forEach(function (el) { el.innerHTML = usageHtml(); }); }

  /* 画像を読み込む（スマホ写真の向きも正しく扱う） */
  function loadImage(file) {
    function viaImg() {
      return new Promise(function (ok, ng) {
        var url = URL.createObjectURL(file), img = new Image();
        img.onload = function () { ok(img); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); };
        img.onerror = function () { URL.revokeObjectURL(url); ng(new Error('この画像は読み込めません（JPEG / PNG / WebP を選んでください）')); };
        img.src = url;
      });
    }
    if (window.createImageBitmap) return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(viaImg);
    return viaImg();
  }
  function toBlob(canvas, type, q) {
    return new Promise(function (ok) { canvas.toBlob(function (b) { ok(b); }, type, q); });
  }
  /* 長辺 1600px に縮小して圧縮（WebP、非対応のブラウザは JPEG）。位置情報などの撮影データもここで消える */
  function shrink(file) {
    return loadImage(file).then(function (src) {
      var w0 = src.naturalWidth || src.width, h0 = src.naturalHeight || src.height;
      function attempt(side, q) {
        var r = Math.min(1, side / Math.max(w0, h0)), w = Math.round(w0 * r), h = Math.round(h0 * r);
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(src, 0, 0, w, h);
        return toBlob(c, 'image/webp', q).then(function (b) { return b && b.type === 'image/webp' ? b : toBlob(c, 'image/jpeg', q + 0.03); })
          .then(function (b) {
            if (!b) throw new Error('画像の変換に失敗しました');
            if (b.size > PHOTO_LIMIT_BYTES && side > 800) return attempt(Math.round(side * 0.8), Math.max(0.6, q - 0.1));
            return { blob: b, w: w, h: h };
          });
      }
      return attempt(PHOTO_MAX_SIDE, 0.82);
    });
  }
  function upload(shrunk) {
    return fetch('/api/admin/photos', {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': shrunk.blob.type, 'X-Lab-Admin': '1', 'X-Width': String(shrunk.w), 'X-Height': String(shrunk.h) },
      body: shrunk.blob
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) throw new Error('ログインの有効期限が切れました。ページを再読み込みしてください。');
        if (!r.ok || j.ok === false) throw new Error(j.error || ('アップロードに失敗しました（' + r.status + '）'));
        return j;
      });
    });
  }

  /* イベントの編集フォーム内の写真欄 */
  function photoManager(box, initial, form) {
    var list = initial.slice(), pending = 0, done = 0, total = 0;

    function paint() {
      box.innerHTML =
        '<ul class="ph-grid" aria-label="写真の一覧">' + list.map(function (u, i) {
          return '<li><img src="' + esc(u) + '" alt="写真 ' + (i + 1) + '" loading="lazy">' +
            (i === 0 ? '<span class="ph-cover">表紙</span>' : '') +
            '<div class="ph-ops">' +
            '<button type="button" data-op="-1" data-i="' + i + '" aria-label="写真 ' + (i + 1) + ' を前へ"' + (i === 0 ? ' disabled' : '') + '>◀</button>' +
            '<button type="button" data-op="x" data-i="' + i + '" aria-label="写真 ' + (i + 1) + ' を外す">✕</button>' +
            '<button type="button" data-op="1" data-i="' + i + '" aria-label="写真 ' + (i + 1) + ' を後ろへ"' + (i === list.length - 1 ? ' disabled' : '') + '>▶</button>' +
            '</div></li>';
        }).join('') +
        (pending ? '<li class="ph-wait" aria-hidden="true"><span>処理中…</span></li>' : '') + '</ul>' +
        '<div class="ph-actions">' +
        '<label class="btn' + (list.length >= PHOTO_MAX_COUNT ? ' is-disabled' : '') + '">📷 写真を追加<input type="file" accept="image/*" multiple hidden' + (list.length >= PHOTO_MAX_COUNT ? ' disabled' : '') + '></label>' +
        '<span class="hint" role="status" aria-live="polite">' + (pending ? 'アップロード中… ' + done + ' / ' + total + '枚' : (list.length ? list.length + '枚 / 最大' + PHOTO_MAX_COUNT + '枚' : 'まだ写真がありません')) + '</span>' +
        '</div>' +
        '<p class="hint">複数枚まとめて選べます' + (window.matchMedia('(hover: hover)').matches ? '（この枠にドラッグ＆ドロップも可）' : '') + '。自動で縮小され、撮影場所などの情報は消えます。1枚目が一覧の「表紙」になります。</p>' +
        '<div class="usage">' + usageHtml() + '</div>';
    }

    function addFiles(files) {
      files = Array.prototype.filter.call(files, function (f) { return /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name); });
      if (!files.length) return;
      var room = PHOTO_MAX_COUNT - list.length - pending;
      if (files.length > room) { toast('1つのレポートに入れられる写真は ' + PHOTO_MAX_COUNT + ' 枚までです', true); files = files.slice(0, Math.max(0, room)); }
      if (!files.length) return;
      if (!pending) { done = 0; total = 0; }
      total += files.length; pending += files.length; paint();
      var errors = [], chain = Promise.resolve();
      files.forEach(function (file) {
        chain = chain.then(function () {
          return shrink(file).then(upload).then(function (r) { list.push(r.url); setDirty(true); })
            .catch(function (e) { errors.push(file.name + '：' + e.message); })
            .then(function () { pending--; done++; paint(); });
        });
      });
      chain.then(function () {
        loadUsage();
        if (errors.length) toast(errors.join(' ／ '), true);
        else toast(files.length + '枚追加しました。「保存して公開」で反映されます');
      });
    }

    box.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-op]'); if (!b) return;
      var i = +b.dataset.i;
      if (b.dataset.op === 'x') {
        if (!confirm('写真 ' + (i + 1) + ' をこのレポートから外しますか？\n（「保存して公開」を押すと削除されます）')) return;
        list.splice(i, 1);
      } else {
        var j = i + (+b.dataset.op), t = list[i]; list[i] = list[j]; list[j] = t;
      }
      setDirty(true); paint();
      var again = box.querySelector('button[data-op="' + b.dataset.op + '"][data-i="' + Math.min(b.dataset.op === 'x' ? i : i + (+b.dataset.op), list.length - 1) + '"]');
      if (again && !again.disabled) again.focus();
    });
    box.addEventListener('change', function (e) {
      if (e.target.type === 'file') { addFiles(e.target.files); e.target.value = ''; }
    });
    ['dragenter', 'dragover'].forEach(function (t) { box.addEventListener(t, function (e) { e.preventDefault(); box.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (t) { box.addEventListener(t, function (e) { e.preventDefault(); box.classList.remove('drag'); }); });
    box.addEventListener('drop', function (e) { if (e.dataTransfer) addFiles(e.dataTransfer.files); });

    paint();
    if (!state.usage) loadUsage();
    return { list: function () { return list.slice(); }, uploading: function () { return pending > 0; } };
  }

  function formHtml(S, item, isNew) {
    return '<form class="form" id="editForm">' +
      '<h2 class="sub-h" style="margin-top:0">' + S.icon + ' ' + esc(S.label) + (isNew ? 'を追加' : 'を編集') + '</h2>' +
      S.fields.map(function (fd) {
        if (fd.type === 'photos') return '<div class="field"><span class="flabel">' + esc(fd.label) + '</span><div class="ph-box" id="phBox"></div></div>';
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
    form.addEventListener('input', function () { setDirty(true); });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var next = {};
      F.concat([['welcome']]).forEach(function (f) { next[f[0]] = form.elements[f[0]].value.trim(); });
      busy(form.querySelector('button'), api('PUT', 'site', next), '保存して公開しました').then(function (r) { D.site = r.site; setDirty(false); render(); });
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
      '<p class="notice">⚠ 復元すると、今公開中の内容はすべてバックアップの内容に置き換わります。<br>写真のファイルそのものはバックアップに含まれません（データベースに残っている写真は、復元後もそのまま表示されます）。</p>' +
      '<h2 class="sub-h">📊 使用量</h2><div class="usage" style="max-width:520px">' + usageHtml() + '</div>' +
      '<p class="hint">Cloudflare D1 の無料プランは 1データベース 500MB までです。写真1枚あたりおよそ 0.2〜0.4MB です。</p>';
    loadUsage();

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
