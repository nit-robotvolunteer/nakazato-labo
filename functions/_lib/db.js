/* =========================================================
   D1 データベース共通処理
   Cloudflare Pages の「バインディング」で D1 を変数名 DB として接続します。
   テーブルは初回アクセス時に自動で作成されます。
   ========================================================= */

export const TABLES = {
  news:     { cols: ['date', 'text', 'link'], order: 'date DESC, id DESC' },
  events:   { cols: ['date', 'title', 'place', 'participants', 'summary', 'body', 'images'], json: ['images'], order: 'date DESC, id DESC' },
  research: { cols: ['sort', 'icon', 'title', 'summary', 'detail'], order: 'sort ASC, id ASC' },
  links:    { cols: ['sort', 'title', 'url', 'desc'], order: 'sort ASC, id ASC' },
};

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS news (id TEXT PRIMARY KEY, date TEXT NOT NULL, text TEXT NOT NULL, link TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, date TEXT NOT NULL, title TEXT NOT NULL, place TEXT NOT NULL DEFAULT '', participants TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', images TEXT NOT NULL DEFAULT '[]')`,
  `CREATE TABLE IF NOT EXISTS research (id TEXT PRIMARY KEY, sort INTEGER NOT NULL DEFAULT 0, icon TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS links (id TEXT PRIMARY KEY, sort INTEGER NOT NULL DEFAULT 0, title TEXT NOT NULL, url TEXT NOT NULL, "desc" TEXT NOT NULL DEFAULT '')`,
];

const SITE_KEYS = ['title', 'subtitle', 'university', 'professor', 'welcome', 'owner', 'since'];

let ready = false;
export async function ensureSchema(db) {
  if (ready) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  ready = true;
}

export function getDB(env) {
  if (!env.DB) throw new HttpError(500, 'D1 データベースが接続されていません（Pages の設定 → バインディングで変数名 DB として D1 を追加してください）');
  return env.DB;
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store', ...extra },
  });
}

export function handleError(e) {
  const status = e instanceof HttpError ? e.status : 500;
  if (status === 500 && !(e instanceof HttpError)) console.error(e);
  return json({ ok: false, error: e instanceof HttpError ? e.message : 'サーバーでエラーが発生しました' }, status);
}

const q = (c) => `"${c}"`;

/* ---------- 読み出し ---------- */
export async function readAll(db) {
  await ensureSchema(db);
  const names = Object.keys(TABLES);
  const res = await db.batch([
    db.prepare(`SELECT value FROM settings WHERE key = 'site'`),
    ...names.map((n) => db.prepare(`SELECT id, ${TABLES[n].cols.map(q).join(', ')} FROM ${n} ORDER BY ${TABLES[n].order}`)),
  ]);
  const siteRow = res[0].results[0];
  if (!siteRow) return { initialized: false };
  const out = { initialized: true, site: JSON.parse(siteRow.value) };
  names.forEach((n, i) => {
    out[n] = res[i + 1].results.map((r) => {
      (TABLES[n].json || []).forEach((k) => { try { r[k] = JSON.parse(r[k]); } catch { r[k] = []; } });
      return r;
    });
  });
  return out;
}

/* ---------- 入力チェック ---------- */
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function checkId(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new HttpError(400, 'ID が不正です（英数字・-・_ のみ）');
  return id;
}

function str(v, max, label, required) {
  const s = v == null ? '' : String(v).trim();
  if (required && !s) throw new HttpError(400, `「${label}」は必須です`);
  if (s.length > max) throw new HttpError(400, `「${label}」が長すぎます（${max}文字まで）`);
  return s;
}

export function cleanItem(col, x) {
  if (!TABLES[col]) throw new HttpError(404, '存在しない項目です');
  x = x || {};
  const r = {};
  switch (col) {
    case 'news':
      r.date = str(x.date, 10, '日付', true); r.text = str(x.text, 500, '内容', true); r.link = str(x.link, 1000, 'リンク先');
      break;
    case 'events':
      r.date = str(x.date, 10, '日付', true); r.title = str(x.title, 200, 'イベント名', true);
      r.place = str(x.place, 200, '場所'); r.participants = str(x.participants, 200, '参加者');
      r.summary = str(x.summary, 1000, '概要'); r.body = str(x.body, 50000, '本文');
      r.images = (Array.isArray(x.images) ? x.images : []).map((u) => str(u, 1000, '写真URL')).filter(Boolean).slice(0, 50);
      break;
    case 'research':
      r.sort = Number.isFinite(+x.sort) ? Math.trunc(+x.sort) : 0;
      r.icon = str(x.icon, 16, 'アイコン'); r.title = str(x.title, 200, 'テーマ名', true);
      r.summary = str(x.summary, 500, '概要'); r.detail = str(x.detail, 20000, '説明');
      break;
    case 'links':
      r.sort = Number.isFinite(+x.sort) ? Math.trunc(+x.sort) : 0;
      r.title = str(x.title, 200, 'リンク名', true); r.url = str(x.url, 1000, 'URL', true); r.desc = str(x.desc, 500, '説明');
      if (!/^https?:\/\//i.test(r.url)) throw new HttpError(400, 'URL は http:// か https:// で始めてください');
      break;
  }
  if (r.date !== undefined && !DATE_RE.test(r.date)) throw new HttpError(400, '日付の形式が不正です');
  return r;
}

export function cleanSite(x) {
  x = x || {};
  const s = {};
  SITE_KEYS.forEach((k) => { s[k] = k === 'since' ? (parseInt(x.since, 10) || new Date().getFullYear()) : str(x[k], k === 'welcome' ? 2000 : 200, k); });
  if (!s.title) throw new HttpError(400, '「研究室名」は必須です');
  return s;
}

/* ---------- 書き込み ---------- */
export function upsertStmt(db, col, id, item) {
  const t = TABLES[col];
  const vals = t.cols.map((c) => ((t.json || []).includes(c) ? JSON.stringify(item[c]) : item[c]));
  const cols = ['id', ...t.cols].map(q).join(', ');
  const ph = ['?', ...t.cols.map(() => '?')].join(', ');
  const upd = t.cols.map((c) => `${q(c)} = excluded.${q(c)}`).join(', ');
  return db.prepare(`INSERT INTO ${col} (${cols}) VALUES (${ph}) ON CONFLICT(id) DO UPDATE SET ${upd}`).bind(id, ...vals);
}

export function siteStmt(db, site) {
  return db.prepare(`INSERT INTO settings (key, value) VALUES ('site', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(JSON.stringify(site));
}
