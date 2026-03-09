import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { request as httpsRequest } from 'https';
import { request as httpRequest } from 'http';
import { createTransport } from 'nodemailer';

/* ═══════════════════════════════════════════════════════════════════════
   Blip Session Manager
   ───────────────────────────────────────────────────────────────────────
   Logs in to CloudPort with email/password (Devise form login).
   Acquires an authenticated _blip_session cookie for Servo/ePub APIs.

   • Session is cached and reused until a Servo/ePub request actually
     fails (302/401), at which point the proxy transparently re-logs in
     and retries — the client never sees auth failures.
   • NO JWT refresh, NO Auth0 token exchange, NO 30-second loops.
   ═══════════════════════════════════════════════════════════════════════ */
const blipAuth = {
  email: 'umesh.j@amagi.com',
  password: 'Jagadeesan#345',
  baseUrl: 'https://pocs.demo.amagi.tv',

  // Cached state
  session: null,
  sessionTime: 0,
  loginPromise: null,
  lastError: null,
  loginAttempts: 0,

  /** Get cached session, or login to get one */
  async getSession() {
    // Session cached for up to 12 hours (actual _blip_session lasts ~15 days)
    if (this.session && (Date.now() - this.sessionTime < 12 * 3600 * 1000)) {
      return this.session;
    }
    return this.login();
  },

  /** Mark session as expired (will re-login on next getSession call) */
  invalidate() {
    if (!this.session) return;
    console.log('[BlipAuth] Session invalidated — will re-login on next request');
    this.session = null;
    this.sessionTime = 0;
  },

  /** Login to get a fresh _blip_session (prevents concurrent login attempts) */
  async login() {
    if (this.loginPromise) return this.loginPromise;
    this.loginPromise = this._doLogin();
    try { return await this.loginPromise; }
    finally { this.loginPromise = null; }
  },

  async _doLogin() {
    this.loginAttempts++;
    console.log(`[BlipAuth] Logging in (attempt #${this.loginAttempts})...`);

    try {
      // ── Step 1: GET / (root SPA) → CSRF token + initial _blip_session cookie ──
      // NOTE: /users/sign_in returns 301 redirect, so we use the root page
      //       which serves the SPA and includes the CSRF meta tag.
      const loginPage = await httpGet(
        `${this.baseUrl}/`,
        {
          'Accept': 'text/html,application/xhtml+xml',
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0',
        }
      );

      if (loginPage.statusCode !== 200) {
        this.lastError = `GET / returned HTTP ${loginPage.statusCode}`;
        console.log('[BlipAuth] ✗', this.lastError);
        return null;
      }

      const html = loginPage.body.toString('utf-8');

      // Extract CSRF token from <meta name="csrf-token" content="...">
      const csrf = extractCsrf(html);
      if (!csrf) {
        this.lastError = 'Could not find CSRF token on root page';
        console.log('[BlipAuth] ✗', this.lastError);
        return null;
      }

      // Extract initial _blip_session cookie
      const initialSession = extractCookie(loginPage.headers, '_blip_session');
      console.log('[BlipAuth] Got CSRF token + initial session cookie');

      // ── Step 2: POST /users/sign_in with email/password ──
      const formBody = new URLSearchParams({
        'utf8': '✓',
        'authenticity_token': csrf,
        'user[email]': this.email,
        'user[password]': this.password,
        'user[remember_me]': '1',
        'commit': 'Sign in',
      }).toString();

      const cookieStr = initialSession ? `_blip_session=${initialSession}` : '';

      const loginResp = await httpPost(
        `${this.baseUrl}/users/sign_in`,
        formBody,
        {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'text/html,application/xhtml+xml',
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0',
          'Cookie': cookieStr,
          'Referer': `${this.baseUrl}/`,
          'Origin': this.baseUrl,
        }
      );

      // Extract new _blip_session from response
      const newSession = extractCookie(loginResp.headers, '_blip_session');

      // Success indicator: 302 redirect AND session ID changed
      // (If password is wrong, Devise returns 302 but keeps the SAME session ID)
      const sessionChanged = newSession && newSession !== initialSession;

      if (loginResp.statusCode === 302 && sessionChanged) {
        this.session = newSession;
        this.sessionTime = Date.now();
        this.lastError = null;
        const expiry = extractCookieExpiry(loginResp.headers, '_blip_session');
        console.log(`[BlipAuth] ✓ Login successful! Session: ${newSession.substring(0, 12)}… (expires: ${expiry || 'unknown'})`);
        return newSession;
      }

      // Login failed
      if (loginResp.statusCode === 302 && !sessionChanged) {
        this.lastError = 'Login returned 302 but session unchanged — password may be incorrect';
      } else {
        const respHtml = loginResp.body.toString('utf-8');
        const flashError = extractFlashError(respHtml);
        this.lastError = `Login failed (HTTP ${loginResp.statusCode}): ${flashError}`;
      }
      console.log('[BlipAuth] ✗', this.lastError);
      return null;
    } catch (err) {
      this.lastError = `Login error: ${err.message}`;
      console.log('[BlipAuth] ✗', this.lastError);
      return null;
    }
  },
};


/* ═══════════════════════════════════════════════════════════════════════
   HTTP helpers (low-level, no redirect following)
   ═══════════════════════════════════════════════════════════════════════ */

/** Make an HTTPS GET and buffer the full response */
function httpGet(urlStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = httpsRequest({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { ...headers, host: url.host },
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

/** Make an HTTPS POST and buffer the full response */
function httpPost(urlStr, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const bodyBuf = Buffer.from(body, 'utf-8');
    const req = httpsRequest({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        ...headers,
        host: url.host,
        'Content-Length': bodyBuf.length,
      },
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
    req.write(bodyBuf);
    req.end();
  });
}

/** Buffer an arbitrary HTTPS request */
function bufferRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const isHttps = options.port === 443 || options.protocol === 'https:';
    const doReq = isHttps ? httpsRequest : httpRequest;
    delete options.protocol;
    options.rejectUnauthorized = false;

    const req = doReq(options, (res) => {
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

/** Collect incoming request body into a Buffer */
function collectBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(chunks.length > 0 ? Buffer.concat(chunks) : null));
  });
}

/** Extract CSRF token from HTML */
function extractCsrf(html) {
  // Try meta tag first
  const metaMatch = html.match(/name="csrf-token"\s+content="([^"]+)"/);
  if (metaMatch) return metaMatch[1];
  // Try hidden input
  const inputMatch = html.match(/name="authenticity_token"[^>]*value="([^"]+)"/);
  if (inputMatch) return inputMatch[1];
  return null;
}

/** Extract a specific cookie from response headers */
function extractCookie(headers, cookieName) {
  const setCookies = headers['set-cookie'] || [];
  const cookies = Array.isArray(setCookies) ? setCookies : [setCookies];
  for (const c of cookies) {
    const re = new RegExp(`${cookieName}=([^;]+)`);
    const m = c.match(re);
    if (m) return m[1];
  }
  return null;
}

/** Extract cookie expiry from Set-Cookie header */
function extractCookieExpiry(headers, cookieName) {
  const setCookies = headers['set-cookie'] || [];
  const cookies = Array.isArray(setCookies) ? setCookies : [setCookies];
  for (const c of cookies) {
    if (c.includes(cookieName)) {
      const m = c.match(/expires=([^;]+)/i);
      if (m) return m[1].trim();
    }
  }
  return null;
}

/** Extract flash error message from Devise HTML response */
function extractFlashError(html) {
  // Common Devise flash patterns
  const patterns = [
    /<div[^>]*class="[^"]*alert[^"]*"[^>]*>(.*?)<\/div>/s,
    /<div[^>]*id="flash[^"]*"[^>]*>(.*?)<\/div>/s,
    /<p[^>]*class="[^"]*error[^"]*"[^>]*>(.*?)<\/p>/s,
  ];
  for (const pat of patterns) {
    const m = html.match(pat);
    if (m) return m[1].replace(/<[^>]*>/g, '').trim();
  }
  return 'Unknown error (check logs)';
}

/** Check if an upstream response indicates auth failure */
function isBlipAuthFailure(result) {
  if (result.statusCode === 401) return true;
  if (result.statusCode === 302) {
    const loc = (result.headers.location || '').toLowerCase();
    if (loc.includes('sign_in') || loc.includes('auth') || loc.includes('login')) return true;
  }
  // 200 but HTML (login page served instead of JSON)
  const ct = (result.headers['content-type'] || '').toLowerCase();
  if (ct.includes('text/html') && result.statusCode === 200) {
    const preview = result.body.toString('utf-8', 0, 500).toLowerCase();
    if (preview.includes('sign_in') || preview.includes('sign in') || preview.includes('<!doctype')) {
      return true;
    }
  }
  return false;
}


/* ═══════════════════════════════════════════════════════════════════════
   Email Notification (Gmail SMTP via nodemailer)
   ═══════════════════════════════════════════════════════════════════════ */
const mailTransporter = createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'india_se@amagi.com',
    pass: 'xzxz ppoq vjhd cahn',
  },
});

async function sendOrcEmail(action, feedCode, playerId, httpStatus) {
  const verb = action === 'start' ? 'Started' : 'Stopped';
  const subject = `Player ${verb} in pocs.demo.amagi.tv`;
  const body = [
    `Player action: ${action.toUpperCase()}`,
    `Feed code:     ${feedCode}`,
    `Player ID:     ${playerId}`,
    `HTTP status:   ${httpStatus}`,
    `Triggered by:  ${blipAuth.email}`,
    `Time:          ${new Date().toISOString()}`,
    '',
    `Orchestrator URL: https://aws-use1-psync-cp-orchestrator.demo.amagi.tv/pocs/api/v1/feeds/${feedCode}/players/${playerId}`,
  ].join('\n');

  await mailTransporter.sendMail({
    from: '"Health Dashboard" <india_se@amagi.com>',
    to: 'se.india@amagi.com',
    subject,
    text: body,
  });
  console.log(`[OrcAction] ✉ Email sent: ${subject}`);
}

/* ═══════════════════════════════════════════════════════════════════════
   Vite Proxy Middleware
   ═══════════════════════════════════════════════════════════════════════ */
function proxyMiddleware() {
  return {
    name: 'cors-proxy',
    configureServer(server) {

      // ── /blipproxy: ALL APIs (auto-managed session) ─────────────────
      //    Buffers upstream response to detect auth failures.
      //    On failure: re-logs in and retries once. Client never sees 302s.
      server.middlewares.use('/blipproxy', async (req, res) => {
        const targetBase = req.headers['x-target-base'];
        if (!targetBase) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing x-target-base header' }));
          return;
        }

        // Buffer request body (for POST/PUT)
        const reqBody = await collectBody(req);

        // Helper: make the upstream request with a session cookie
        const makeUpstream = async (session) => {
          const targetUrl = new URL(req.url, targetBase);
          const fwdHeaders = {};
          for (const [key, val] of Object.entries(req.headers)) {
            if (!['host', 'origin', 'referer', 'x-target-base', 'connection'].includes(key)) {
              fwdHeaders[key] = val;
            }
          }
          fwdHeaders['host'] = targetUrl.host;
          if (session) {
            fwdHeaders['cookie'] = `_blip_session=${session}`;
          }

          return bufferRequest({
            hostname: targetUrl.hostname,
            port: 443,
            path: targetUrl.pathname + targetUrl.search,
            method: req.method || 'GET',
            headers: fwdHeaders,
          }, reqBody);
        };

        try {
          // Get session (login if needed)
          let session = await blipAuth.getSession();
          let result;

          if (session) {
            result = await makeUpstream(session);

            // If auth failure, re-login once and retry
            if (isBlipAuthFailure(result)) {
              console.log(`[BlipProxy] Auth failure for ${req.url} — re-logging in...`);
              blipAuth.invalidate();
              session = await blipAuth.login();
              if (session) {
                result = await makeUpstream(session);
              }
            }
          }

          if (!result) {
            // No session available at all
            res.writeHead(503, {
              'Content-Type': 'application/json',
              'access-control-allow-origin': '*',
            });
            res.end(JSON.stringify({
              error: 'Blip session unavailable',
              detail: blipAuth.lastError,
            }));
            return;
          }

          // Forward the response to the client
          const headers = { ...result.headers };
          headers['access-control-allow-origin'] = '*';
          delete headers['transfer-encoding'];
          delete headers['set-cookie']; // Don't leak session cookies to browser
          res.writeHead(result.statusCode, headers);
          res.end(result.body);

        } catch (err) {
          res.writeHead(502, {
            'Content-Type': 'application/json',
            'access-control-allow-origin': '*',
          });
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      // ── /orcaction: Orchestrator start/stop + email notification ─────
      server.middlewares.use('/orcaction', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'POST, OPTIONS',
            'access-control-allow-headers': 'Content-Type',
          });
          res.end();
          return;
        }
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json', 'access-control-allow-origin': '*' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        try {
          // Read POST body
          const body = await new Promise((resolve, reject) => {
            let data = '';
            req.on('data', c => data += c);
            req.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); } });
            req.on('error', reject);
          });

          const { action, feedCode, playerId } = body;
          if (!action || !feedCode || !playerId) {
            res.writeHead(400, { 'Content-Type': 'application/json', 'access-control-allow-origin': '*' });
            res.end(JSON.stringify({ error: 'Missing action, feedCode, or playerId' }));
            return;
          }
          if (!['start', 'stop'].includes(action)) {
            res.writeHead(400, { 'Content-Type': 'application/json', 'access-control-allow-origin': '*' });
            res.end(JSON.stringify({ error: 'action must be "start" or "stop"' }));
            return;
          }

          // Forward to orchestrator
          const orcBase = 'https://aws-use1-psync-cp-orchestrator.demo.amagi.tv';
          const orcUrl = `${orcBase}/pocs/api/v1/feeds/${feedCode}/players/${playerId}/action`;
          console.log(`[OrcAction] ${action.toUpperCase()} ${orcUrl}`);

          const orcResult = await new Promise((resolve, reject) => {
            const orcReq = httpsRequest(orcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            }, (orcRes) => {
              let data = '';
              orcRes.on('data', c => data += c);
              orcRes.on('end', () => resolve({ statusCode: orcRes.statusCode, body: data }));
            });
            orcReq.on('error', reject);
            orcReq.write(JSON.stringify({ command: action }));
            orcReq.end();
          });

          console.log(`[OrcAction] Response ${orcResult.statusCode}: ${orcResult.body}`);

          // Parse orchestrator response
          let orcData;
          try { orcData = JSON.parse(orcResult.body); } catch { orcData = { raw: orcResult.body }; }

          // Send email notification (fire-and-forget, don't block the response)
          sendOrcEmail(action, feedCode, playerId, orcResult.statusCode).catch(err => {
            console.error('[OrcAction] Email send failed:', err.message);
          });

          // Return orchestrator response to the client
          res.writeHead(orcResult.statusCode, {
            'Content-Type': 'application/json',
            'access-control-allow-origin': '*',
          });
          res.end(JSON.stringify(orcData));

        } catch (err) {
          console.error('[OrcAction] Error:', err);
          res.writeHead(502, { 'Content-Type': 'application/json', 'access-control-allow-origin': '*' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      // ── /blipauth/status: Auth status for the frontend ──────────────
      server.middlewares.use('/blipauth', (req, res) => {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'access-control-allow-origin': '*',
        });
        res.end(JSON.stringify({
          hasSession: !!blipAuth.session,
          sessionAge: blipAuth.sessionTime
            ? Math.round((Date.now() - blipAuth.sessionTime) / 1000)
            : null,
          lastError: blipAuth.lastError,
          loginAttempts: blipAuth.loginAttempts,
        }));
      });
    },
  };
}


export default defineConfig({
  plugins: [react(), proxyMiddleware()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      // WebSocket proxy for Janus WebRTC preview (T-Rex / ELIC)
      '/janusproxy': {
        target: 'https://pocs-trex.demo.amagi.tv',
        changeOrigin: true,
        ws: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/janusproxy/, ''),
      },
      // Orchestrator proxy for player start/stop/status
      '/orcproxy': {
        target: 'https://aws-use1-psync-cp-orchestrator.demo.amagi.tv',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/orcproxy/, ''),
      },
    },
  },
});
