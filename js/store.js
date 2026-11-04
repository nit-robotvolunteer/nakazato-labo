/* =========================================================
   データ読み込み・共通処理（公開ページ・管理ページ共通）
   - Cloudflare 上では D1（/api/data）から読み込みます
   - D1 が未登録・ローカルで開いた場合は js/data.js の内容を表示します
   ========================================================= */
(function () {
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var Store = {
    load: function () {
      return fetch('/api/data', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { return d && d.initialized ? d : clone(window.DEFAULT_DATA); })
        .catch(function () { return clone(window.DEFAULT_DATA); });
    },
    defaults: function () { return clone(window.DEFAULT_DATA); }
  };

  var U = {
    esc: function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    /* 空行区切りで段落、改行は <br> */
    paras: function (s) {
      return String(s || '').split(/\n\s*\n/).filter(function (p) { return p.trim(); })
        .map(function (p) { return '<p>' + U.esc(p.trim()).replace(/\n/g, '<br>') + '</p>'; }).join('');
    },
    fmtDate: function (d) { return String(d || '').replace(/-/g, '/'); },
    isNew: function (d, days) {
      var t = new Date(d + 'T00:00:00');
      if (isNaN(t)) return false;
      return (Date.now() - t.getTime()) / 864e5 <= (days || 30);
    },
    byDateDesc: function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; },
    safeUrl: function (u) {
      u = String(u || '').trim();
      if (/^(https?:\/\/|mailto:|\.?\/|[\w\-]+\.html)/i.test(u)) return u;
      return '';
    },
    isExternal: function (u) { return /^https?:\/\//i.test(u); },
    uid: function (prefix) { return (prefix || 'id') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  };

  window.LabStore = Store;
  window.LabUtil = U;
})();
