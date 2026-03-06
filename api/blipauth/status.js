/**
 * Vercel Serverless Function – Blip auth status endpoint.
 *
 * Returns the current authentication state so the frontend
 * can display a connection badge (connected / connecting / failed).
 *
 * On Vercel, this replaces the Vite proxy's /blipauth/status middleware.
 */

// Import the session state from the blipproxy function.
// NOTE: Vercel serverless functions each run in their own isolate,
// so we can't share module-level state between different function files.
// Instead, we perform a quick health check by hitting a lightweight
// Servo endpoint with an existing session (or trying to login).
import https from 'https';

const BASE_URL = 'https://pocs.demo.amagi.tv';
const AUTH_EMAIL = 'umesh.j@amagi.com';
const AUTH_PASSWORD = 'Jagadeesan#345';

// Lightweight session cache for this function instance
let cachedSession = null;
let cachedAt = 0;
let lastError = null;

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
  return null;
}

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443,
      path: u.pathname + u.search, method: 'GET',
      headers: { ...headers, host: u.host },
      rejectUnauthorized: false,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
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
      hostname: u.hostname, port: 443,
      path: u.pathname + u.search, method: 'POST',
      headers: { ...headers, host: u.host, 'Content-Length': buf.length },
      rejectUnauthorized: false,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

async function ensureSession() {
  if (cachedSession && (Date.now() - cachedAt < 12 * 3600_000)) {
    return true;
  }
  try {
    const page = await httpsGet(`${BASE_URL}/`, {
      'Accept': 'text/html', 'User-Agent': 'HealthDashboard/1.0',
    });
    if (page.statusCode !== 200) throw new Error(`GET / → ${page.statusCode}`);
    const csrf = extractCsrf(page.body.toString('utf-8'));
    if (!csrf) throw new Error('CSRF not found');
    const initSess = extractCookie(page.headers, '_blip_session');

    const form = new URLSearchParams({
      'utf8': '✓', 'authenticity_token': csrf,
      'user[email]': AUTH_EMAIL, 'user[password]': AUTH_PASSWORD,
      'user[remember_me]': '1', 'commit': 'Sign in',
    }).toString();

    const resp = await httpsPost(`${BASE_URL}/users/sign_in`, form, {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'text/html', 'User-Agent': 'HealthDashboard/1.0',
      'Cookie': initSess ? `_blip_session=${initSess}` : '',
      'Referer': `${BASE_URL}/`, 'Origin': BASE_URL,
    });

    const newSess = extractCookie(resp.headers, '_blip_session');
    if (resp.statusCode === 302 && newSess && newSess !== initSess) {
      cachedSession = newSess;
      cachedAt = Date.now();
      lastError = null;
      return true;
    }
    throw new Error('Login failed — session unchanged');
  } catch (err) {
    lastError = err.message;
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const hasSession = await ensureSession();

  return res.status(200).json({
    hasSession,
    sessionAge: cachedAt ? Math.round((Date.now() - cachedAt) / 1000) : null,
    lastError,
    mode: 'vercel-serverless',
  });
}
