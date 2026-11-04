/* =========================================================
   データ保存まわり（公開ページ・管理ページ共通）
   - 公開データ: js/data.js の DEFAULT_DATA
   - 管理ページで編集した内容: このブラウザの localStorage（プレビュー）
   ========================================================= */
(function () {
  var KEY = 'nklab_data_v1';

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var Store = {
    KEY: KEY,
    hasDraft: function () {
      try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
    },
    load: function () {
      try {
        var raw = localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) { /* 読めなければ公開データを使う */ }
      return clone(window.DEFAULT_DATA);
    },
    save: function (data) {
      try { localStorage.setItem(KEY, JSON.stringify(data)); return true; }
      catch (e) { alert('保存できませんでした（ブラウザの保存領域が使えません）'); return false; }
    },
    discard: function () {
      try { localStorage.removeItem(KEY); } catch (e) {}
    },
    defaults: function () { return clone(window.DEFAULT_DATA); }
  };

  /* ---- 共通ユーティリティ ---- */
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
