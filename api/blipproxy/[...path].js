/**
 * Vercel Serverless Function – Servo / ePub proxy with auto-session management.
 *
 * Servo and ePub APIs on pocs.demo.amagi.tv require a `_blip_session` cookie.
 * `x-user-token` does NOT work for these endpoints (they return 302).
 *
 * This function:
 *   1. Logs in via Devise form (email + password) to obtain _blip_session
 *   2. Caches the session in a module-level variable (survives warm invocations)
 *   3. Proxies the real request with the session cookie
 *   4. Re-logins transparently if the session expires mid-flight
 */
import https from 'https';

// ── Configuration ────────────────────────────────────────────────────
const AUTH_EMAIL    = 'umesh.j@amagi.com';
const AUTH_PASSWORD = 'Jagadeesan#345';
const BASE_URL      = 'https://pocs.demo.amagi.tv';
const SESSION_TTL   = 12 * 3600 * 1000; // 12 hours cache (actual cookie lasts ~15 days)

// ── Session cache (persists across warm Vercel invocations) ──────────
let cachedSession   = null;
let cachedSessionAt = 0;
let loginInFlight   = null;
let lastLoginError  = null;

// ── HTTPS helpers ────────────────────────────────────────────────────

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { ...headers, host: u.host },
      rejectUnauthorized: false,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

function httpsPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const buf = Buffer.from(body, 'utf-8');
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { ...headers, host: u.host, 'Content-Length': buf.length },
      rejectUnauthorized: false,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

function httpsRequest(method, url, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method,
      headers: { ...headers, host: u.host },
      rejectUnauthorized: false,
    };
    if (body) opts.headers['Content-Length'] = Buffer.byteLength(body);

    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Cookie / CSRF helpers ────────────────────────────────────────────

function extractCookie(headers, name) {
  const sc = headers['set-cookie'] || [];
  const list = Array.isArray(sc) ? sc : [sc];
  for (const c of list) {
    const m = c.match(new RegExp(`${name}=([^;]+)`));
    if (m) return m[1];
  }
  return null;
}

function extractCsrf(html) {
  const meta = html.match(/name="csrf-token"\s+content="([^"]+)"/);
  if (meta) return meta[1];
  const input = html.match(/name="authenticity_token"[^>]*value="([^"]+)"/);
  if (input) return input[1];
  return null;
}

// ── Auth failure detection ───────────────────────────────────────────

function isAuthFailure(result) {
  if (result.statusCode === 401) return true;
  if (result.statusCode === 302) {
    const loc = (result.headers.location || '').toLowerCase();
    if (loc.includes('sign_in') || loc.includes('auth') || loc.includes('login') || loc === `${BASE_URL.toLowerCase()}/`) {
      return true;
    }
  }
  if (result.statusCode === 200) {
    const ct = (result.headers['content-type'] || '').toLowerCase();
    if (ct.includes('text/html')) {
      const preview = result.body.toString('utf-8', 0, 500).toLowerCase();
      if (preview.includes('sign_in') || preview.includes('<!doctype')) return true;
    }
  }
  return false;
}

// ── Login (Devise form) ─────────────────────────────────────────────

async function doLogin() {
  console.log('[BlipProxy] Logging in to get _blip_session...');

  // Step 1: GET / to obtain CSRF token + initial _blip_session cookie
  const page = await httpsGet(`${BASE_URL}/`, {
    'Accept': 'text/html,application/xhtml+xml',
    'User-Agent': 'HealthDashboard/1.0',
  });

  if (page.statusCode !== 200) {
    throw new Error(`GET / returned HTTP ${page.statusCode}`);
  }

  const html = page.body.toString('utf-8');
  const csrf = extractCsrf(html);
  if (!csrf) throw new Error('CSRF token not found');

  const initSession = extractCookie(page.headers, '_blip_session');

  // Step 2: POST /users/sign_in
  const formBody = new URLSearchParams({
    'utf8': '✓',
    'authenticity_token': csrf,
    'user[email]': AUTH_EMAIL,
    'user[password]': AUTH_PASSWORD,
    'user[remember_me]': '1',
    'commit': 'Sign in',
  }).toString();

  const loginResp = await httpsPost(`${BASE_URL}/users/sign_in`, formBody, {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'text/html,application/xhtml+xml',
    'User-Agent': 'HealthDashboard/1.0',
    'Cookie': initSession ? `_blip_session=${initSession}` : '',
    'Referer': `${BASE_URL}/`,
    'Origin': BASE_URL,
  });

  const newSession = extractCookie(loginResp.headers, '_blip_session');
  const sessionChanged = newSession && newSession !== initSession;

  if (loginResp.statusCode === 302 && sessionChanged) {
    console.log(`[BlipProxy] ✓ Login OK, session: ${newSession.substring(0, 12)}…`);
    return newSession;
  }

  throw new Error(
    loginResp.statusCode === 302 && !sessionChanged
      ? 'Session unchanged after login — check password'
      : `Login returned HTTP ${loginResp.statusCode}`
  );
}

async function getSession() {
  // Return cached session if fresh
  if (cachedSession && (Date.now() - cachedSessionAt < SESSION_TTL)) {
    return cachedSession;
  }
  // Deduplicate concurrent login attempts
  if (loginInFlight) return loginInFlight;

  loginInFlight = doLogin()
    .then((session) => {
      cachedSession = session;
      cachedSessionAt = Date.now();
      lastLoginError = null;
      return session;
    })
    .catch((err) => {
      lastLoginError = err.message;
      console.error('[BlipProxy] Login failed:', err.message);
      return null;
    })
    .finally(() => { loginInFlight = null; });

  return loginInFlight;
}

function invalidateSession() {
  cachedSession = null;
  cachedSessionAt = 0;
}

// ── Proxy the actual request ─────────────────────────────────────────

async function proxyRequest(targetPath, method, reqHeaders, reqBody, session) {
  const url = `${BASE_URL}${targetPath}`;
  const fwdHeaders = {
    'Accept': reqHeaders['accept'] || 'application/json',
    'User-Agent': 'HealthDashboard/1.0',
  };
  if (reqHeaders['content-type']) {
    fwdHeaders['Content-Type'] = reqHeaders['content-type'];
  }
  if (session) {
    fwdHeaders['Cookie'] = `_blip_session=${session}`;
  }

  return httpsRequest(method, url, fwdHeaders, reqBody);
}

// ── Vercel handler ───────────────────────────────────────────────────

export default async function handler(req, res) {
  // Reconstruct the target path from the catch-all segments
  const pathSegments = req.query.path || [];
  const targetPath = '/' + pathSegments.join('/');
  const queryString = new URL(req.url, 'http://localhost').search;
  const fullPath = targetPath + queryString;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Read request body (for POST/PUT)
  let reqBody = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    reqBody = typeof req.body === 'string' ? req.body
            : req.body ? JSON.stringify(req.body) : null;
  }

  try {
    // Attempt 1: use cached (or fresh) session
    let session = await getSession();
    if (!session) {
      return res.status(503).json({
        error: 'Blip session unavailable — login failed',
        detail: lastLoginError,
      });
    }

    let result = await proxyRequest(fullPath, req.method, req.headers, reqBody, session);

    // If auth failure, re-login and retry once
    if (isAuthFailure(result)) {
      console.log(`[BlipProxy] Auth failure on ${fullPath}, re-logging in…`);
      invalidateSession();
      session = await getSession();

      if (!session) {
        return res.status(503).json({
          error: 'Blip session unavailable — re-login failed',
          detail: lastLoginError,
        });
      }

      result = await proxyRequest(fullPath, req.method, req.headers, reqBody, session);
    }

    // Forward response
    const contentType = result.headers['content-type'] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    return res.status(result.statusCode).send(result.body);

  } catch (err) {
    console.error('[BlipProxy] Error:', err);
    return res.status(502).json({ error: err.message });
  }
}
