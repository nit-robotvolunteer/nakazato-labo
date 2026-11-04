/* =========================================================
   管理用 API（_middleware.js のパスワード認証を通ったときだけ動く）
     GET    /api/admin/data              … 全データ
     PUT    /api/admin/site              … サイト設定を保存
     PUT    /api/admin/{種類}/{id}       … 1件を追加・更新
     DELETE /api/admin/{種類}/{id}       … 1件を削除
     PUT    /api/admin/order/{種類}      … 並び順を保存 { ids: [...] }
     POST   /api/admin/import            … 全データを置き換え（初期登録・バックアップ復元）
   {種類} = news / events / research / links
   ========================================================= */
import { TABLES, HttpError, getDB, ensureSchema, readAll, json, handleError, checkId, cleanItem, cleanSite, upsertStmt, siteStmt } from '../../_lib/db.js';

async function body(request) {
  try { return await request.json(); } catch { throw new HttpError(400, 'データの形式が不正です'); }
}

/* 他サイトからの書き換え（CSRF）を防ぐ：専用ヘッダーと同一オリジンを必須にする */
function checkCsrf(request) {
  if (request.method === 'GET') return;
  if (request.headers.get('X-Lab-Admin') !== '1') throw new HttpError(403, '不正なリクエストです');
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, '不正なリクエストです');
}

export async function onRequest({ request, env, params }) {
  try {
    checkCsrf(request);
    const db = getDB(env);
    await ensureSchema(db);
    const p = [].concat(params.path || []);
    const m = request.method;

    if (m === 'GET' && p[0] === 'data' && p.length === 1) return json(await readAll(db));

    if (m === 'PUT' && p[0] === 'site' && p.length === 1) {
      const site = cleanSite(await body(request));
      await siteStmt(db, site).run();
      return json({ ok: true, site });
    }

    if (m === 'POST' && p[0] === 'import' && p.length === 1) {
      const d = await body(request);
      const stmts = [siteStmt(db, cleanSite(d.site))];
      for (const col of Object.keys(TABLES)) {
        stmts.push(db.prepare(`DELETE FROM ${col}`));
        (Array.isArray(d[col]) ? d[col] : []).forEach((x, i) => {
          const item = cleanItem(col, { sort: i, ...x });
          stmts.push(upsertStmt(db, col, checkId(x.id), item));
        });
      }
      await db.batch(stmts); // batch はまとめて成功 or まとめて失敗
      return json({ ok: true, data: await readAll(db) });
    }

    if (m === 'PUT' && p[0] === 'order' && p.length === 2) {
      const col = p[1];
      if (!TABLES[col] || !TABLES[col].cols.includes('sort')) throw new HttpError(400, 'この項目は並び替えできません');
      const { ids } = await body(request);
      if (!Array.isArray(ids)) throw new HttpError(400, 'ids がありません');
      await db.batch(ids.map((id, i) => db.prepare(`UPDATE ${col} SET sort = ? WHERE id = ?`).bind(i, checkId(id))));
      return json({ ok: true });
    }

    if (p.length === 2 && TABLES[p[0]]) {
      const [col, rawId] = p;
      const id = checkId(rawId);
      if (m === 'PUT') {
        const item = cleanItem(col, await body(request));
        await upsertStmt(db, col, id, item).run();
        return json({ ok: true, item: { id, ...item } });
      }
      if (m === 'DELETE') {
        await db.prepare(`DELETE FROM ${col} WHERE id = ?`).bind(id).run();
        return json({ ok: true });
      }
    }

    throw new HttpError(404, '見つかりません');
  } catch (e) {
    return handleError(e);
  }
}
