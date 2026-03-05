/**
 * Vercel Serverless Proxy – replaces the Vite dev-server CORS proxy.
 *
 * Rewrite rule:  /cpproxy/:path*  →  /api/proxy?proxyPath=/:path*
 *
 * The frontend sends:
 *   - x-target-base  header  → e.g. "https://pocs.demo.amagi.tv"
 *   - x-user-token   header  → auth token
 *   - The API path is captured by the rewrite into ?proxyPath=
 */

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  // ── CORS headers ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ── Extract API path from query parameter (set by Vercel rewrite) ──
  let apiPath = req.query.proxyPath || '';

  // Ensure it starts with /
  if (apiPath && !apiPath.startsWith('/')) {
    apiPath = '/' + apiPath;
  }

  if (!apiPath) {
    return res.status(400).json({
      error: 'No API path specified',
      hint: 'The /cpproxy rewrite should set ?proxyPath=',
      query: req.query,
      url: req.url,
    });
  }

  // ── Get target base URL ──
  const targetBase = req.headers['x-target-base'];
  if (!targetBase) {
    return res.status(400).json({ error: 'Missing x-target-base header' });
  }

  // ── Build the full target URL ──
  const targetUrl = new URL(apiPath, targetBase);

  // Forward any extra query params (e.g. feed_id=1) — skip our own proxyPath
  for (const [key, val] of Object.entries(req.query)) {
    if (key !== 'proxyPath' && key !== 'path') {
      targetUrl.searchParams.set(key, val);
    }
  }

  // ── Forward headers ──
  const skipHeaders = new Set([
    'host', 'origin', 'referer', 'x-target-base', 'connection',
    'x-matched-path', 'x-invoke-path', 'x-invoke-query',
    'x-now-route-matches',
    'x-vercel-id', 'x-vercel-deployment-url', 'x-vercel-forwarded-for',
    'x-vercel-proxy-signature', 'x-vercel-proxy-signature-ts',
    'x-real-ip', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto',
    'transfer-encoding', 'accept-encoding',
  ]);

  const fwdHeaders = {};
  for (const [key, val] of Object.entries(req.headers)) {
    if (!skipHeaders.has(key.toLowerCase())) {
      fwdHeaders[key] = val;
    }
  }
  fwdHeaders['host'] = targetUrl.host;

  // ── Proxy the request ──
  try {
    const fetchOpts = {
      method: req.method || 'GET',
      headers: fwdHeaders,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOpts.body = typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl.toString(), fetchOpts);

    const ct = response.headers.get('content-type') || '';
    if (ct) res.setHeader('Content-Type', ct);

    const body = await response.text();
    return res.status(response.status).send(body);
  } catch (err) {
    console.error('Proxy error:', err.message);
    return res.status(502).json({ error: err.message });
  }
}
