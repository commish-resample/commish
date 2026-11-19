// Commish API. Static files in /public are served by Cloudflare; this only runs for /api/*.
// Exports are never sent here: all file reading happens in the browser.

const SESSION_DAYS = 30;
const LINK_MINUTES = 20;
const COOKIE = 'commish_session';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free',
    stripe_customer TEXT,
    stripe_sub TEXT,
    sub_status TEXT,
    sub_interval TEXT,
    period_end INTEGER,
    cancel_at_end INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_seen INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS users_customer ON users(stripe_customer)`,
  `CREATE TABLE IF NOT EXISTS login_tokens (
    hash TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    expires INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS login_tokens_email ON login_tokens(email, created_at)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS login_ips (
    ip_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS login_ips_ip ON login_ips(ip_hash, created_at)`,
  `CREATE TABLE IF NOT EXISTS stripe_events (
    id TEXT PRIMARY KEY,
    type TEXT,
    created_at INTEGER NOT NULL
  )`
];

let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
  schemaReady = true;
}

const now = () => Math.floor(Date.now() / 1000);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}

function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cleanEmail(e) {
  e = String(e || '').trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return null;
  return e;
}

function getCookie(req, name) {
  const c = req.headers.get('cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function sessionCookie(value, maxAge) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function origin(req, env) {
  return env.SITE_URL || new URL(req.url).origin;
}

function isAdmin(env, email) {
  return String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean).includes(email);
}

async function currentUser(req, env) {
  const raw = getCookie(req, COOKIE);
  if (!raw) return null;
  const row = await env.DB.prepare(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ? AND s.expires > ?'
  ).bind(await sha256(raw), now()).first();
  return row || null;
}

function isGifted(env, email) {
  return String(env.PRO_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean).includes(email);
}

function publicUser(u, env) {
  const admin = isAdmin(env, u.email);
  const gifted = !admin && isGifted(env, u.email);
  return {
    signedIn: true,
    email: u.email,
    plan: admin || gifted ? 'pro' : u.plan,
    admin,
    gifted,
    status: u.sub_status || null,
    interval: u.sub_interval || null,
    renews: u.period_end || null,
    cancelAtEnd: !!u.cancel_at_end,
    hasBilling: !!u.stripe_customer
  };
}

// Same-site check for state-changing requests (cookie is SameSite=Lax, this is belt and braces).
function sameOrigin(req) {
  const o = req.headers.get('origin');
  if (!o) return true;
  return o === new URL(req.url).origin;
}

/* ---------- Sign-in by email link ---------- */

async function sendLoginEmail(env, email, link) {
  const html = `<!doctype html><html><body style="margin:0;background:#FFE45C;font-family:Helvetica,Arial,sans-serif;color:#1B1340">
<div style="max-width:440px;margin:0 auto;padding:36px 24px">
<p style="font-size:28px;font-weight:800;margin:0 0 20px">Commish</p>
<div style="background:#fff;border:3px solid #1B1340;border-radius:18px;padding:24px">
<p style="font-size:18px;font-weight:700;margin:0 0 10px">Here's your sign-in link</p>
<p style="margin:0 0 20px;line-height:1.5">Tap the button to sign in to Commish. It works once and expires in ${LINK_MINUTES} minutes.</p>
<a href="${link}" style="display:inline-block;background:#1B1340;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px">Sign in to Commish</a>
<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#4b4470">If you didn't ask for this, you can ignore this email. Nobody can sign in without the link.</p>
</div></div></body></html>`;
  const text = `Sign in to Commish:\n${link}\n\nThe link works once and expires in ${LINK_MINUTES} minutes. If you didn't ask for this, you can ignore this email.`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM || 'Commish <hello@commish.fyi>',
      to: [email],
      subject: 'Your Commish sign-in link',
      html,
      text
    })
  });
  if (!r.ok) throw new Error('email ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

async function login(req, env) {
  let body = {};
  try { body = await req.json(); } catch (e) {}
  const email = cleanEmail(body.email);
  if (!email) return json({ error: 'That email address doesn\'t look right. Check it and try again.' }, 400);

  const hourAgo = now() - 3600;
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_tokens WHERE email = ? AND created_at > ?').bind(email, hourAgo).first();
  if (recent && recent.n >= 5) return json({ error: 'Too many sign-in emails for this address. Wait an hour and try again.' }, 429);
  // Stop one visitor sending sign-in emails to lots of different addresses.
  const ipHash = await sha256('ip:' + (req.headers.get('cf-connecting-ip') || 'unknown'));
  const fromIp = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_ips WHERE ip_hash = ? AND created_at > ?').bind(ipHash, hourAgo).first();
  if (fromIp && fromIp.n >= 10) return json({ error: 'Too many sign-in emails from this connection. Wait an hour and try again.' }, 429);
  await env.DB.prepare('INSERT INTO login_ips (ip_hash, created_at) VALUES (?, ?)').bind(ipHash, now()).run();

  const token = randomToken();
  await env.DB.prepare('INSERT INTO login_tokens (hash, email, expires, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), email, now() + LINK_MINUTES * 60, now()).run();
  // Tidy up: old sign-in links (kept a day at most), ended sessions and old rate-limit rows.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_tokens WHERE created_at < ?').bind(now() - 86400),
    env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(now()),
    env.DB.prepare('DELETE FROM login_ips WHERE created_at < ?').bind(now() - 86400)
  ]);

  // Remember why they signed in, so they land in the right place afterwards.
  const next = body.next === 'upgrade' ? '&next=upgrade' : '';
  const link = `${origin(req, env)}/api/verify?t=${token}${next}`;
  if (env.DEV_SHOW_LINK === '1') return json({ ok: true, devLink: link });
  if (!env.RESEND_API_KEY) return json({ error: 'Sign-in emails aren\'t switched on yet.' }, 503);
  try {
    await sendLoginEmail(env, email, link);
  } catch (e) {
    console.error(e.message);
    return json({ error: 'We couldn\'t send the email just now. Try again in a minute.' }, 502);
  }
  return json({ ok: true });
}

// Email security scanners often open links before the person does. So opening the link
// only shows a page that signs you in with a second step; scanners don't take it.
function verifyPage(token, next) {
  const t = String(token).replace(/[^A-Za-z0-9_-]/g, '');
  const n = next === 'upgrade' ? 'upgrade' : '';
  return new Response(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Signing you in · Commish</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#FFE45C;color:#1B1340;font-family:system-ui,sans-serif}
.c{background:#fff;border:3px solid #1B1340;border-radius:24px;padding:28px 24px;max-width:360px;margin:20px;text-align:center}
h1{margin:0 0 8px;font-size:26px}p{margin:0 0 18px;line-height:1.5}
button{min-height:52px;padding:0 24px;border:0;border-radius:26px;background:#1B1340;color:#FFE45C;font:inherit;font-weight:800;font-size:17px;cursor:pointer}</style></head>
<body><form class="c" method="post" action="/api/verify"><h1>Signing you in</h1><p>One moment. If nothing happens, tap the button.</p>
<input type="hidden" name="t" value="${t}"><input type="hidden" name="next" value="${n}"><button type="submit">Sign in to Commish</button></form>
<script>document.forms[0].submit()</script></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'same-origin' } });
}

async function verify(req, env) {
  const site = origin(req, env);
  let token = '', next = '';
  try { const f = await req.formData(); token = String(f.get('t') || ''); next = f.get('next') === 'upgrade' ? '&next=upgrade' : ''; } catch (e) {}
  const row = token ? await env.DB.prepare('SELECT * FROM login_tokens WHERE hash = ?').bind(await sha256(token)).first() : null;
  if (!row || row.used || row.expires < now()) {
    return Response.redirect(`${site}/?signin=expired`, 302);
  }
  await env.DB.prepare('UPDATE login_tokens SET used = 1 WHERE hash = ?').bind(row.hash).run();

  let user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(row.email).first();
  if (!user) {
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO users (id, email, created_at, last_seen) VALUES (?, ?, ?, ?)').bind(id, row.email, now(), now()).run();
    user = { id };
  }
  const sid = randomToken();
  await env.DB.prepare('INSERT INTO sessions (hash, user_id, expires, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(sid), user.id, now() + SESSION_DAYS * 86400, now()).run();

  return new Response(null, {
    status: 302,
    headers: { location: `${site}/?signin=ok${next}`, 'set-cookie': sessionCookie(sid, SESSION_DAYS * 86400), 'cache-control': 'no-store' }
  });
}

async function me(req, env) {
  const u = await currentUser(req, env);
  const ready = { signin: !!env.RESEND_API_KEY || env.DEV_SHOW_LINK === '1', pay: !!(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_MONTH && env.STRIPE_PRICE_YEAR) };
  if (!u) return json({ signedIn: false, plan: 'free', ready });
  if (!u.last_seen || now() - u.last_seen > 3600) {
    await env.DB.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(now(), u.id).run();
  }
  return json({ ...publicUser(u, env), ready });
}

async function logout(req, env) {
  const raw = getCookie(req, COOKIE);
  if (raw) await env.DB.prepare('DELETE FROM sessions WHERE hash = ?').bind(await sha256(raw)).run();
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
}

/* ---------- Stripe ---------- */

function form(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(v));
  }
  return out.join('&');
}

async function stripe(env, path, params, method = 'POST') {
  const r = await fetch('https://api.stripe.com/v1/' + path, {
    method,
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: method === 'POST' ? form(params || {}) : undefined
  });
  const data = await r.json();
  if (!r.ok) throw new Error('stripe ' + r.status + ' ' + (data.error && data.error.message));
  return data;
}

async function checkout(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'Sign in first.' }, 401);
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Payments aren\'t switched on yet.' }, 503);
  if (u.plan === 'pro' || isAdmin(env, u.email) || isGifted(env, u.email)) return json({ error: 'You\'re already on Pro.' }, 400);
  let body = {};
  try { body = await req.json(); } catch (e) {}
  const yearly = body.interval === 'year';
  const price = yearly ? env.STRIPE_PRICE_YEAR : env.STRIPE_PRICE_MONTH;
  if (!price) return json({ error: 'Payments aren\'t switched on yet.' }, 503);

  const site = origin(req, env);
  const params = {
    mode: 'subscription',
    'line_items[0][price]': price,
    'line_items[0][quantity]': 1,
    client_reference_id: u.id,
    success_url: `${site}/?upgrade=done`,
    cancel_url: `${site}/?upgrade=cancelled`,
    allow_promotion_codes: 'true',
    billing_address_collection: 'required',
    'custom_text[submit][message]': 'Commish Pro is for UK customers. Pro starts straight away and renews until you cancel. Full refund within 14 days: email hello@commish.fyi. Terms: commish.fyi/terms',
    'subscription_data[metadata][user_id]': u.id,
    'metadata[user_id]': u.id
  };
  if (u.stripe_customer) params.customer = u.stripe_customer;
  else params.customer_email = u.email;
  try {
    const s = await stripe(env, 'checkout/sessions', params);
    return json({ url: s.url });
  } catch (e) {
    console.error(e.message);
    return json({ error: 'We couldn\'t open the payment page. Try again in a minute.' }, 502);
  }
}

async function portal(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'Sign in first.' }, 401);
  if (!u.stripe_customer) return json({ error: 'There\'s no subscription on this account yet.' }, 400);
  try {
    const s = await stripe(env, 'billing_portal/sessions', { customer: u.stripe_customer, return_url: origin(req, env) + '/' });
    return json({ url: s.url });
  } catch (e) {
    console.error(e.message);
    return json({ error: 'We couldn\'t open your billing page. Try again in a minute.' }, 502);
  }
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function verifyStripeSignature(payload, header, secret) {
  if (!header || !secret) return false;
  const tPart = header.split(',').find((p) => p.startsWith('t='));
  const t = tPart && tPart.slice(2);
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !sigs.length) return false;
  if (Math.abs(now() - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  for (const s of sigs) {
    if (!/^[0-9a-f]{64}$/.test(s)) continue;
    const ok = await crypto.subtle.verify('HMAC', key, hexToBytes(s), new TextEncoder().encode(`${t}.${payload}`));
    if (ok) return true;
  }
  return false;
}

async function applySubscription(env, sub, userIdHint) {
  const active = ['active', 'trialing', 'past_due'].includes(sub.status);
  const item = sub.items && sub.items.data && sub.items.data[0];
  const interval = item && item.price && item.price.recurring ? item.price.recurring.interval : null;
  const periodEnd = sub.current_period_end || (item && item.current_period_end) || null;
  const userId = userIdHint || (sub.metadata && sub.metadata.user_id);
  // If this person already has a different subscription on file, don't let an old,
  // ended one switch them back to Free.
  const current = userId
    ? await env.DB.prepare('SELECT stripe_sub, plan FROM users WHERE id = ?').bind(userId).first()
    : await env.DB.prepare('SELECT stripe_sub, plan FROM users WHERE stripe_customer = ?').bind(sub.customer).first();
  if (current && current.stripe_sub && current.stripe_sub !== sub.id && !active && current.plan === 'pro') return;
  // Newer Stripe API versions record a scheduled cancellation as cancel_at (a date)
  // rather than cancel_at_period_end, so treat either as "ending".
  const ending = !!(sub.cancel_at_period_end || sub.cancel_at) && active;
  const endDate = ending && sub.cancel_at ? sub.cancel_at : periodEnd;
  const fields = [active ? 'pro' : 'free', sub.customer, sub.id, sub.status, interval, endDate, ending ? 1 : 0];
  let res;
  if (userId) {
    res = await env.DB.prepare('UPDATE users SET plan=?, stripe_customer=?, stripe_sub=?, sub_status=?, sub_interval=?, period_end=?, cancel_at_end=? WHERE id=?')
      .bind(...fields, userId).run();
  }
  if (!res || !res.meta || !res.meta.changes) {
    await env.DB.prepare('UPDATE users SET plan=?, stripe_customer=?, stripe_sub=?, sub_status=?, sub_interval=?, period_end=?, cancel_at_end=? WHERE stripe_customer=?')
      .bind(...fields, sub.customer).run();
  }
}

async function webhook(req, env) {
  const payload = await req.text();
  const ok = await verifyStripeSignature(payload, req.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return json({ error: 'bad signature' }, 400);
  const event = JSON.parse(payload);

  // Log the event. Handling is safe to repeat, so resent events are processed again.
  await env.DB.prepare('INSERT OR IGNORE INTO stripe_events (id, type, created_at) VALUES (?, ?, ?)').bind(event.id, event.type, now()).run();

  const obj = event.data.object;
  try {
    if (event.type === 'checkout.session.completed' && obj.mode === 'subscription') {
      const userId = obj.client_reference_id || (obj.metadata && obj.metadata.user_id);
      if (userId && obj.customer) {
        await env.DB.prepare('UPDATE users SET stripe_customer = ? WHERE id = ?').bind(obj.customer, userId).run();
      }
      if (obj.subscription && env.STRIPE_SECRET_KEY) {
        const sub = await stripe(env, 'subscriptions/' + obj.subscription, null, 'GET');
        await applySubscription(env, sub, userId);
      }
    } else if (event.type.startsWith('customer.subscription.')) {
      await applySubscription(env, obj, null);
    }
  } catch (e) {
    // Let Stripe retry.
    console.error(e.message);
    return json({ error: 'try again' }, 500);
  }
  return json({ received: true });
}

/* ---------- Owner dashboard ---------- */

async function adminStats(req, env) {
  const u = await currentUser(req, env);
  if (!u || !isAdmin(env, u.email)) return json({ error: 'not found' }, 404);
  const t = now(), day = 86400;
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b);
  const [tot, d1, d7, d30, act7, plans, perDay, recent] = await env.DB.batch([
    q('SELECT COUNT(*) AS n FROM users'),
    q('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', t - day),
    q('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', t - 7 * day),
    q('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', t - 30 * day),
    q('SELECT COUNT(*) AS n FROM users WHERE last_seen > ?', t - 7 * day),
    q(`SELECT plan, sub_interval, cancel_at_end, sub_status, COUNT(*) AS n FROM users GROUP BY plan, sub_interval, cancel_at_end, sub_status`),
    q(`SELECT strftime('%Y-%m-%d', created_at, 'unixepoch') AS d, COUNT(*) AS n FROM users WHERE created_at > ? GROUP BY d ORDER BY d`, t - 30 * day),
    q('SELECT email, plan, sub_interval, cancel_at_end, sub_status, created_at, last_seen FROM users ORDER BY created_at DESC LIMIT 100')
  ]);
  const gifted = String(env.PRO_EMAILS || '').split(',').map((x) => x.trim()).filter(Boolean).length;
  let monthly = 0, yearly = 0, cancelling = 0, pastDue = 0;
  for (const r of plans.results) {
    if (r.plan !== 'pro') continue;
    if (r.sub_interval === 'year') yearly += r.n; else monthly += r.n;
    if (r.cancel_at_end) cancelling += r.n;
    if (r.sub_status === 'past_due') pastDue += r.n;
  }
  const first = (x) => (x.results[0] || { n: 0 }).n;
  return json({
    mode: String(env.STRIPE_SECRET_KEY || '').startsWith('sk_live_') ? 'live' : 'test',
    signups: { total: first(tot), today: first(d1), week: first(d7), month: first(d30) },
    activeWeek: first(act7),
    pro: { monthly, yearly, paying: monthly + yearly, cancelling, pastDue, gifted },
    mrr: Math.round((monthly * 2.99 + yearly * 19.99 / 12) * 100) / 100,
    perDay: perDay.results,
    recent: recent.results.map((r) => ({
      email: r.email, plan: isAdmin(env, r.email) ? 'owner' : isGifted(env, r.email) ? 'gifted' : r.plan,
      interval: r.sub_interval, cancelling: !!r.cancel_at_end, status: r.sub_status, joined: r.created_at, seen: r.last_seen
    }))
  });
}

/* ---------- Router ---------- */

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    // One address for everyone: send www.commish.fyi to commish.fyi.
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname.startsWith('/media/')) return media(req, env);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      await ensureSchema(env);
      const p = url.pathname, m = req.method;
      if (m === 'POST' && p !== '/api/stripe-webhook' && !sameOrigin(req)) return json({ error: 'forbidden' }, 403);
      if (p === '/api/me' && m === 'GET') return await me(req, env);
      if (p === '/api/admin/stats' && m === 'GET') return await adminStats(req, env);
      if (p === '/api/login' && m === 'POST') return await login(req, env);
      if (p === '/api/verify' && m === 'GET') return verifyPage(url.searchParams.get('t') || '', url.searchParams.get('next'));
      if (p === '/api/verify' && m === 'POST') return await verify(req, env);
      if (p === '/api/logout' && m === 'POST') return await logout(req, env);
      if (p === '/api/checkout' && m === 'POST') return await checkout(req, env);
      if (p === '/api/portal' && m === 'POST') return await portal(req, env);
      if (p === '/api/stripe-webhook' && m === 'POST') return await webhook(req, env);
      return json({ error: 'not found' }, 404);
    } catch (e) {
      console.error(e && e.stack || e);
      return json({ error: 'Something went wrong on our side. Try again in a minute.' }, 500);
    }
  }
};

// Videos need byte-range support (iPhones refuse to play without it)
async function media(req, env) {
  const res = await env.ASSETS.fetch(req);
  if (res.status === 206 || !res.ok || req.method !== 'GET') return res;
  const range = req.headers.get('Range');
  const h = new Headers(res.headers);
  h.set('Accept-Ranges', 'bytes');
  if (!range) return new Response(res.body, { status: 200, headers: h });
  const buf = await res.arrayBuffer();
  const size = buf.byteLength;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  let start, end;
  if (m && m[1] !== '') { start = +m[1]; end = m[2] !== '' ? Math.min(+m[2], size - 1) : size - 1; }
  else if (m && m[2] !== '') { start = Math.max(0, size - +m[2]); end = size - 1; }
  if (start === undefined || start > end || start >= size) {
    h.set('Content-Range', 'bytes */' + size); h.delete('Content-Length');
    return new Response(null, { status: 416, headers: h });
  }
  h.set('Content-Range', 'bytes ' + start + '-' + end + '/' + size);
  h.set('Content-Length', String(end - start + 1));
  return new Response(buf.slice(start, end + 1), { status: 206, headers: h });
}
