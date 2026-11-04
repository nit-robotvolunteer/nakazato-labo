/* 公開用：サイトの全データを返す  GET /api/data */
import { getDB, readAll, json, handleError } from '../_lib/db.js';

export async function onRequestGet({ env }) {
  try {
    return json(await readAll(getDB(env)));
  } catch (e) {
    return handleError(e);
  }
}
