/* =========================================================
   公開ページの描画
   body の data-page 属性でページを切り替えます
   (top / news / research / events / report / links)
   ========================================================= */
(function () {
  var D;
  var U = LabUtil;
  var esc = U.esc;
  var page = document.body.getAttribute('data-page') || 'top';

  var NAV = [
    { id: 'top', href: '/', label: 'トップ' },
    { id: 'news', href: '/news', label: 'お知らせ' },
    { id: 'research', href: '/research', label: '研究紹介', icon: '🔬', desc: '研究室の方針と、主な研究テーマを紹介します。' },
    { id: 'events', href: '/events', label: 'イベントレポート', icon: '📷', desc: '研究室で行ったイベントの様子をレポートします。' },
    { id: 'links', href: '/links', label: '関連リンク', icon: '🔗', desc: '大学公式の研究室・教員紹介ページなど。' }
  ];

  /* ---------- 共通パーツ ---------- */
  function box(title, inner, key, tag) {
    tag = tag || 'section';
    return '<' + tag + ' class="win" aria-labelledby="h-' + key + '">' +
      '<h2 class="win-title" id="h-' + key + '">' + esc(title) + '</h2>' +
      '<div class="win-body">' + inner + '</div></' + tag + '>';
  }
  function newBadge(date) { return U.isNew(date, 30) ? ' <span class="new">NEW</span>' : ''; }
  function linkAttrs(url) { return U.isExternal(url) ? ' target="_blank" rel="noopener noreferrer"' : ''; }
  function extMark(url) { return U.isExternal(url) ? '<span class="ext" aria-label="（外部サイト・新しいタブで開きます）">↗</span>' : ''; }

  function pageHead(title, lead, crumbs) {
    var c = '<nav class="crumb" aria-label="現在位置"><ol>' + crumbs.map(function (it, i) {
      return '<li>' + (it.href && i < crumbs.length - 1 ? '<a href="' + it.href + '">' + esc(it.label) + '</a>' : '<span aria-current="page">' + esc(it.label) + '</span>') + '</li>';
    }).join('') + '</ol></nav>';
    return c + '<h1 class="page-h">' + esc(title) + '</h1>' + (lead ? '<p class="page-lead">' + lead + '</p>' : '');
  }

  function layout(content, pageTitle) {
    var s = D.site;
    document.title = (pageTitle ? pageTitle + '｜' : '') + s.title + '（' + s.subtitle + '）';
    var year = new Date().getFullYear();
    var cy = (s.since && s.since < year) ? s.since + '–' + year : year;

    var nav = NAV.map(function (n) {
      var cur = (n.id === page) || (page === 'report' && n.id === 'events');
      return '<li><a href="' + n.href + '"' + (cur ? ' aria-current="page"' : '') + '>' + n.label + '</a></li>';
    }).join('');

    document.getElementById('root').innerHTML =
      '<a class="skip" href="#main">本文へスキップ</a>' +
      '<div class="frame" id="top">' +
        '<header class="masthead">' +
          '<a class="logo" href="/">' +
            '<span class="univ">' + esc(s.university) + '</span>' +
            '<span class="logo-main">' + esc(s.title) + '</span>' +
            '<span class="logo-sub">' + esc(s.subtitle) + '</span>' +
          '</a>' +
        '</header>' +
        '<nav class="gnav" aria-label="メインメニュー"><ul>' + nav + '</ul></nav>' +
        '<main id="main" tabindex="-1">' + content + '</main>' +
        '<footer class="foot">' +
          '<ul class="foot-nav">' + NAV.map(function (n) { return '<li><a href="' + n.href + '">' + n.label + '</a></li>'; }).join('') + '</ul>' +
          '<p><a href="#top" class="totop">▲ ページの先頭へ</a></p>' +
          '<p class="copy"><small>Copyright &copy; ' + cy + ' ' + esc(s.owner) + '（' + esc(s.subtitle) + '）, Nippon Institute of Technology. All Rights Reserved.</small></p>' +
        '</footer>' +
      '</div>';

  }

  /* ---------- 各パーツ ---------- */
  function newsList(limit) {
    var list = D.news.slice().sort(U.byDateDesc);
    if (limit) list = list.slice(0, limit);
    if (!list.length) return '<p>現在お知らせはありません。</p>';
    return '<dl class="news">' + list.map(function (n) {
      var url = U.safeUrl(n.link);
      var text = url ? '<a href="' + esc(url) + '"' + linkAttrs(url) + '>' + esc(n.text) + extMark(url) + '</a>' : esc(n.text);
      return '<div class="news-row"><dt><time datetime="' + esc(n.date) + '">' + U.fmtDate(n.date) + '</time></dt><dd>' + text + newBadge(n.date) + '</dd></div>';
    }).join('') + '</dl>';
  }

  function eventRows(list) {
    if (!list.length) return '<p>レポートはまだありません。</p>';
    /* 1件でも写真があれば、全行にサムネイル枠を用意して列をそろえる */
    var anyThumb = list.some(function (e) { return U.safeUrl((e.images || [])[0]); });
    return '<ul class="ev-list">' + list.map(function (e) {
      var cover = U.safeUrl((e.images || [])[0]);
      return '<li><a class="ev-item' + (anyThumb ? ' has-thumb' : '') + '" href="/report?id=' + encodeURIComponent(e.id) + '">' +
        (cover ? '<img class="ev-thumb" src="' + esc(cover) + '" alt="" loading="lazy">' : anyThumb ? '<span class="ev-thumb ev-nothumb" aria-hidden="true">📷</span>' : '') +
        '<span class="ev-date"><time datetime="' + esc(e.date) + '">' + U.fmtDate(e.date) + '</time></span>' +
        '<span class="ev-main"><span class="ev-title">' + esc(e.title) + '</span>' + newBadge(e.date) +
        (e.summary ? '<span class="ev-sum">' + esc(e.summary) + '</span>' : '') + '</span>' +
        '<span class="ev-go" aria-hidden="true">›</span></a></li>';
    }).join('') + '</ul>';
  }

  /* ---------- 写真ビューア（拡大表示・前後移動・スワイプ・キーボード操作） ---------- */
  function viewer(imgs, title) {
    var dlg = document.createElement('dialog');
    dlg.className = 'lb';
    dlg.setAttribute('aria-label', title + ' の写真');
    dlg.innerHTML =
      '<figure><img alt=""><figcaption></figcaption></figure>' +
      '<button type="button" class="lb-btn lb-close" aria-label="閉じる">✕</button>' +
      '<button type="button" class="lb-btn lb-prev" aria-label="前の写真">‹</button>' +
      '<button type="button" class="lb-btn lb-next" aria-label="次の写真">›</button>';
    document.body.appendChild(dlg);
    var img = dlg.querySelector('img'), cap = dlg.querySelector('figcaption'), cur = 0, opener = null;

    function show(k) {
      cur = (k + imgs.length) % imgs.length;
      img.src = imgs[cur]; img.alt = title + ' の写真 ' + (cur + 1);
      cap.textContent = (cur + 1) + ' / ' + imgs.length;
      dlg.querySelector('.lb-prev').hidden = dlg.querySelector('.lb-next').hidden = imgs.length < 2;
      if (imgs.length > 1) { var pre = new Image(); pre.src = imgs[(cur + 1) % imgs.length]; }
    }
    function open(k, from) {
      if (typeof dlg.showModal !== 'function') { window.open(imgs[k], '_blank', 'noopener'); return; }
      opener = from; show(k); dlg.showModal(); document.documentElement.classList.add('lb-open');
    }
    dlg.addEventListener('close', function () { document.documentElement.classList.remove('lb-open'); if (opener) opener.focus(); });
    dlg.querySelector('.lb-close').addEventListener('click', function () { dlg.close(); });
    dlg.querySelector('.lb-prev').addEventListener('click', function () { show(cur - 1); });
    dlg.querySelector('.lb-next').addEventListener('click', function () { show(cur + 1); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.tagName === 'FIGURE') dlg.close(); });
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(cur - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); show(cur + 1); }
    });
    var x0 = null;
    dlg.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    dlg.addEventListener('touchend', function (e) {
      if (x0 == null) return;
      var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1));
    });
    document.querySelectorAll('.gallery a[data-k]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); open(+a.dataset.k, a); });
    });
  }

  /* ---------- ページ ---------- */
  var pages = {
    top: function () {
      var cards = NAV.filter(function (n) { return n.desc; }).map(function (n) {
        return '<li><a class="card" href="' + n.href + '"><span class="card-icon" aria-hidden="true">' + n.icon + '</span>' +
          '<span class="card-t">' + n.label + '</span><span class="card-d">' + n.desc + '</span><span class="card-go" aria-hidden="true">見る ›</span></a></li>';
      }).join('');
      var c =
        '<h1 class="sr-only">' + esc(D.site.title) + '（' + esc(D.site.subtitle) + '）</h1>' +
        '<p class="welcome">' + esc(D.site.welcome) + '</p>' +
        box('お知らせ', newsList(3) + '<p class="more"><a href="/news">お知らせ一覧へ ›</a></p>', 'news') +
        '<nav aria-label="各ページへのリンク"><ul class="cards">' + cards + '</ul></nav>';
      layout(c, '');
    },

    news: function () {
      var c = pageHead('お知らせ', '', [{ label: 'トップ', href: '/' }, { label: 'お知らせ' }]) +
        box('お知らせ一覧', newsList(0), 'newsall');
      layout(c, 'お知らせ');
    },

    research: function () {
      var toc = '<ul class="toc">' + D.research.map(function (r) { return '<li><a href="#' + esc(r.id) + '">' + esc(r.title) + '</a></li>'; }).join('') + '</ul>';
      var c =
        pageHead('研究紹介', '', [{ label: 'トップ', href: '/' }, { label: '研究紹介' }]) +
        box('研究室について', '<p>本研究室では、次世代ロボットを「人間の生活空間で、人間と協調しながら作業できるロボット」と位置づけて研究・開発を行っています。人間と同程度の大きさや動き方、人を傷つけない安全な機構・材質、人と協調するためのシステム、親しみを感じさせるデザインなどがテーマです。</p>' +
          '<p>分野としては、<strong>医療・福祉ロボット</strong>、<strong>災害救助ロボット</strong>、<strong>教育・サービス用ロボット</strong>の開発が中心です。</p>' +
          '<p class="motto"><span>研究室のモットー</span>「とにかく経験しろ」</p>' +
          '<p>ロボットは設計で終わらせず、実際に作って動かすところまで取り組みます。</p>', 'about') +
        box('主な研究テーマ', toc +
          D.research.map(function (r) {
            return '<article class="res" id="' + esc(r.id) + '"><h3><span aria-hidden="true">' + esc(r.icon || '') + '</span> ' + esc(r.title) + '</h3>' +
              '<p class="res-lead">' + esc(r.summary) + '</p>' + U.paras(r.detail) + '</article>';
          }).join(''), 'themes') +
        box('指導教員', '<table class="prof"><tbody>' +
          '<tr><th scope="row">氏名</th><td>' + esc(D.site.professor) + '</td></tr>' +
          '<tr><th scope="row">所属</th><td>' + esc(D.site.university) + '</td></tr>' +
          '<tr><th scope="row">専門</th><td>ロボティクスに関する機械システムの制御とその応用、次世代ロボットの研究・開発</td></tr>' +
          '</tbody></table><p class="more"><a href="https://www.nit.ac.jp/campus/teacher/rb_nakazato" target="_blank" rel="noopener noreferrer">教員紹介ページ（大学公式）<span class="ext" aria-label="（外部サイト）">↗</span></a></p>', 'prof');
      layout(c, '研究紹介');
    },

    events: function () {
      var evs = D.events.slice().sort(U.byDateDesc);
      var c = pageHead('イベントレポート', '中里研究室で行われたイベントのレポートです。イベントを選ぶとレポートページが開きます。', [{ label: 'トップ', href: '/' }, { label: 'イベントレポート' }]) +
        eventRows(evs);
      layout(c, 'イベントレポート');
    },

    report: function () {
      var id = new URLSearchParams(location.search).get('id');
      var evs = D.events.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      var i = evs.findIndex(function (e) { return e.id === id; });
      var crumbs = [{ label: 'トップ', href: '/' }, { label: 'イベントレポート', href: '/events' }];
      if (i < 0) {
        layout(pageHead('レポートが見つかりません', 'お探しのレポートは削除されたか、URLが間違っている可能性があります。', crumbs.concat({ label: '見つかりません' })) +
          '<p><a class="btn" href="/events">‹ イベントレポート一覧へ</a></p>', 'ページが見つかりません');
        return;
      }
      var e = evs[i], prev = evs[i - 1], next = evs[i + 1];
      var meta = '<dl class="meta"><div><dt>日付</dt><dd><time datetime="' + esc(e.date) + '">' + U.fmtDate(e.date) + '</time></dd></div>' +
        (e.place ? '<div><dt>場所</dt><dd>' + esc(e.place) + '</dd></div>' : '') +
        (e.participants ? '<div><dt>参加</dt><dd>' + esc(e.participants) + '</dd></div>' : '') + '</dl>';
      var imgs = (e.images || []).map(function (u) { return U.safeUrl(u); }).filter(Boolean);
      var gallery = imgs.length
        ? '<h3 class="sub-h">写真 <span class="ph-count">' + imgs.length + '枚</span></h3><ul class="gallery">' + imgs.map(function (u, k) { return '<li><a href="' + esc(u) + '" data-k="' + k + '" aria-label="写真 ' + (k + 1) + ' を拡大"><img src="' + esc(u) + '" alt="' + esc(e.title) + ' の写真 ' + (k + 1) + '" loading="lazy"></a></li>'; }).join('') + '</ul>'
        : '';
      var pager = '<nav class="pager" aria-label="前後のレポート">' +
        (prev ? '<a class="btn" href="/report?id=' + encodeURIComponent(prev.id) + '" rel="prev">‹ 前のレポート<span class="pg-t">' + esc(prev.title) + '</span></a>' : '<span></span>') +
        '<a class="btn" href="/events">一覧へ戻る</a>' +
        (next ? '<a class="btn" href="/report?id=' + encodeURIComponent(next.id) + '" rel="next">次のレポート ›<span class="pg-t">' + esc(next.title) + '</span></a>' : '<span></span>') +
        '</nav>';
      var c = pageHead(e.title, '', crumbs.concat({ label: e.title })) +
        '<article class="win report">' + '<div class="win-body">' + meta + '<div class="rep-body">' + U.paras(e.body) + '</div>' + gallery + '</div></article>' + pager;
      layout(c, e.title);
      if (imgs.length) viewer(imgs, e.title);
    },

    links: function () {
      var list = D.links.length ? '<ul class="links">' + D.links.map(function (l) {
        var url = U.safeUrl(l.url);
        return '<li><a href="' + esc(url) + '"' + linkAttrs(url) + '>' + esc(l.title) + extMark(url) + '</a>' +
          (l.desc ? '<span class="link-desc">' + esc(l.desc) + '</span>' : '') +
          '<span class="link-url">' + esc(url) + '</span></li>';
      }).join('') + '</ul>' : '<p>リンクはまだありません。</p>';
      var c = pageHead('関連リンク', '外部サイトは新しいタブで開きます。', [{ label: 'トップ', href: '/' }, { label: '関連リンク' }]) +
        box('リンク集', list, 'linklist');
      layout(c, '関連リンク');
    }
  };

  LabStore.load().then(function (data) {
    D = data;
    (pages[page] || pages.top)();
  });
})();
