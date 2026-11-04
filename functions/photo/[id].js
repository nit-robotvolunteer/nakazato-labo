/* =========================================================
   写真の配信  GET /photo/{id}
   D1 から読み出して返します。Cloudflare のキャッシュに1日保存するので、
   同じ写真を何度見ても D1 への読み取りはほとんど増えません。
   ========================================================= */
import { getDB, ensureSchema, PHOTO_ID_RE } from '../_lib/db.js';

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
}

export async function onRequestGet({ request, env, params, waitUntil }) {
  const id = String(params.id || '');
  if (!PHOTO_ID_RE.test(id)) return notFound();

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) {
    const hit = await cache.match(request);
    if (hit) return hit;
  }

  try {
    const db = getDB(env);
    await ensureSchema(db);
    const row = await db.prepare('SELECT mime, data FROM photos WHERE id = ?').bind(id).first();
    if (!row) return notFound();
    // D1 は BLOB を数値の配列または ArrayBuffer で返すので、どちらにも対応
    const data = row.data instanceof ArrayBuffer ? row.data : new Uint8Array(row.data);
    const res = new Response(data, {
      headers: {
        'Content-Type': row.mime,
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
    if (cache && waitUntil) waitUntil(cache.put(request, res.clone()));
    return res;
  } catch (e) {
    console.error(e);
    return new Response('Error', { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
