/**
 * Vercel Serverless Function – Servo / ePub proxy with auto _blip_session.
 *
 * Servo and ePub APIs REQUIRE a _blip_session cookie (x-user-token → 302).
 * This function logs in via Devise form, caches the session, and proxies
 * requests with the cookie attached. Re-logins transparently on expiry.
 *
 * Rewrite rule (vercel.json):
 *   /blipproxy/:path*  →  /api/blipproxy?p=/:path*
 */
import https from 'https';

// ── Config ───────────────────────────────────────────────────────────
const EMAIL     = 'umesh.j@amagi.com';
const PASSWORD  = 'Jagadeesan#345';
const BASE      = 'https://pocs.demo.amagi.tv';
const TTL       = 12 * 3600_000;    // cache session 12 h (cookie lasts ~15 d)

// ── Session cache (survives warm invocations) ────────────────────────
let _session = null;
let _sessionAt = 0;
let _loginFlight = null;
let _lastErr = null;

// ── Low-level HTTPS ──────────────────────────────────────────────────
function req(method, url, hdrs = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, port: 443,
      path: u.pathname + u.search, method,
      headers: { ...hdrs, host: u.host },
      rejectUnauthorized: false,
    };
    if (body) opts.headers['Content-Length'] = Buffer.byteLength(body);

    const r = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

// ── Cookie / CSRF helpers ────────────────────────────────────────────
function cookie(headers, name) {
  for (const c of [].concat(headers['set-cookie'] || [])) {
    const m = c.match(new RegExp(`${name}=([^;]+)`));
    if (m) return m[1];
  }
  return null;
}

function csrf(html) {
  const m = html.match(/name="csrf-token"\s+content="([^"]+)"/);
  return m ? m[1] : null;
}

// ── Auth-failure detection ───────────────────────────────────────────
function isAuthFail(r) {
  if (r.status === 401) return true;
  if (r.status === 302) {
    const loc = (r.headers.location || '').toLowerCase();
    return loc.includes('sign_in') || loc.includes('login') || loc === BASE.toLowerCase() + '/';
  }
  if (r.status === 200 && (r.headers['content-type'] || '').includes('text/html')) {
    const peek = r.body.toString('utf-8', 0, 500).toLowerCase();
    return peek.includes('sign_in') || peek.includes('<!doctype');
  }
  return false;
}

// ── Devise login ─────────────────────────────────────────────────────
async function login() {
  console.log('[blipproxy] logging in…');
  const page = await req('GET', `${BASE}/`, {
    Accept: 'text/html', 'User-Agent': 'HealthDashboard/1.0',
  });
  if (page.status !== 200) throw new Error(`GET / → ${page.status}`);

  const html  = page.body.toString('utf-8');
  const token = csrf(html);
  if (!token) throw new Error('CSRF token not found');

  const initSess = cookie(page.headers, '_blip_session');

  const form = new URLSearchParams({
    utf8: '✓', authenticity_token: token,
    'user[email]': EMAIL, 'user[password]': PASSWORD,
    'user[remember_me]': '1', commit: 'Sign in',
  }).toString();

  const resp = await req('POST', `${BASE}/users/sign_in`, {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'text/html', 'User-Agent': 'HealthDashboard/1.0',
    Cookie: initSess ? `_blip_session=${initSess}` : '',
    Referer: `${BASE}/`, Origin: BASE,
  }, form);

  const newSess = cookie(resp.headers, '_blip_session');
  if (resp.status === 302 && newSess && newSess !== initSess) {
    console.log(`[blipproxy] ✓ session: ${newSess.substring(0, 12)}…`);
    return newSess;
  }
  throw new Error(resp.status === 302 ? 'password wrong (session unchanged)' : `HTTP ${resp.status}`);
}

async function getSession() {
  if (_session && Date.now() - _sessionAt < TTL) return _session;
  if (_loginFlight) return _loginFlight;

  _loginFlight = login()
    .then((s) => { _session = s; _sessionAt = Date.now(); _lastErr = null; return s; })
    .catch((e) => { _lastErr = e.message; console.error('[blipproxy] ✗', e.message); return null; })
    .finally(() => { _loginFlight = null; });

  return _loginFlight;
}

function invalidate() { _session = null; _sessionAt = 0; }

// ── Proxy the actual API call ────────────────────────────────────────
async function proxy(path, method, acceptHeader, body, session) {
  const hdrs = {
    Accept: acceptHeader || 'application/json',
    'User-Agent': 'HealthDashboard/1.0',
  };
  if (session) hdrs.Cookie = `_blip_session=${session}`;
  if (body && method !== 'GET') hdrs['Content-Type'] = 'application/json';

  return req(method, `${BASE}${path}`, hdrs, body);
}

// ── Vercel handler ───────────────────────────────────────────────────
export default async function handler(request, response) {
  // CORS
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', '*');
  if (request.method === 'OPTIONS') return response.status(200).end();

  // Get target path from query param (set by Vercel rewrite)
  let targetPath = request.query.p || '/';
  // Ensure leading slash
  if (!targetPath.startsWith('/')) targetPath = '/' + targetPath;

  // Collect body
  let body = null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = typeof request.body === 'string' ? request.body
         : request.body ? JSON.stringify(request.body) : null;
  }

  try {
    let session = await getSession();
    if (!session) {
      return response.status(503).json({ error: 'Login failed', detail: _lastErr });
    }

    let result = await proxy(targetPath, request.method, request.headers.accept, body, session);

    // Re-login once on auth failure
    if (isAuthFail(result)) {
      console.log(`[blipproxy] auth fail on ${targetPath}, re-login…`);
      invalidate();
      session = await getSession();
      if (!session) {
        return response.status(503).json({ error: 'Re-login failed', detail: _lastErr });
      }
      result = await proxy(targetPath, request.method, request.headers.accept, body, session);
    }

    const ct = result.headers['content-type'] || 'application/octet-stream';
    response.setHeader('Content-Type', ct);
    return response.status(result.status).send(result.body);

  } catch (err) {
    console.error('[blipproxy]', err);
    return response.status(502).json({ error: err.message });
  }
}
