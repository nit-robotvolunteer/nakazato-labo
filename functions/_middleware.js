/* =========================================================
   Cloudflare Pages Functions：管理ページのパスワード保護
   ---------------------------------------------------------
   Cloudflare ダッシュボード → Workers & Pages → このプロジェクト
   → 設定 → 変数とシークレット に次の2つを登録してください。
     ADMIN_USER      … ユーザー名
     ADMIN_PASSWORD  … パスワード（「暗号化」/ Secret にする）
   登録・変更後は再デプロイすると反映されます。

   保護対象は _routes.json で指定した管理ページ関連のURLだけです
   （公開ページではこの関数は動かないので無料枠を消費しません）。
   ========================================================= */

const PROTECTED = /^\/(admin(\.html)?\/?|admin\/.*|js\/admin\.js)$/;

function safeEqual(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

function decodeBasic(header) {
  if (!header || !header.startsWith('Basic ')) return null;
  try {
    const bin = atob(header.slice(6).trim());
    const text = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const i = text.indexOf(':');
    return i < 0 ? null : { user: text.slice(0, i), pass: text.slice(i + 1) };
  } catch (e) {
    return null;
  }
}

function unauthorized() {
  return new Response('管理ページを開くにはユーザー名とパスワードが必要です。', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Nakazato Lab Admin", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=UTF-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const path = new URL(request.url).pathname;
  if (!PROTECTED.test(path)) return next();

  if (!env.ADMIN_USER || !env.ADMIN_PASSWORD) {
    return new Response('管理ページのパスワードが未設定です。Cloudflare の環境変数 ADMIN_USER / ADMIN_PASSWORD を設定してください。', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=UTF-8', 'Cache-Control': 'no-store' },
    });
  }

  const cred = decodeBasic(request.headers.get('Authorization'));
  const ok = cred && safeEqual(cred.user, env.ADMIN_USER) & safeEqual(cred.pass, env.ADMIN_PASSWORD);
  if (!ok) return unauthorized();

  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'no-store');
  out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return out;
}
