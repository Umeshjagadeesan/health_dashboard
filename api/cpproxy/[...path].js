/**
 * Vercel Serverless Function – replaces the Vite dev-server proxy in production.
 *
 * Catch-all route: /api/cpproxy/any/api/path → forwards to target backend.
 *
 * The frontend sends these headers:
 *   - x-target-base  → e.g. "https://pocs.demo.amagi.tv"
 *   - x-user-token   → auth token
 *   - Content-Type    → application/json
 *
 * Vercel rewrite: /cpproxy/* → /api/cpproxy/*
 * Then req.query.path = ["v1", "api", "feeds", "1", "storage"]
 */

export const config = {
  maxDuration: 60, // 60s timeout (Vercel free tier max)
};

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.status(200).end();
    return;
  }

  // ── Extract the API path from the catch-all parameter ──
  const pathSegments = req.query.path;
  if (!pathSegments || pathSegments.length === 0) {
    res.status(400).json({ error: 'No API path specified' });
    return;
  }

  const apiPath = '/' + pathSegments.join('/');

  // ── Get the target base URL ──
  const targetBase = req.headers['x-target-base'];
  if (!targetBase) {
    res.status(400).json({ error: 'Missing x-target-base header' });
    return;
  }

  // ── Build full target URL (preserve query string) ──
  const targetUrl = new URL(apiPath, targetBase);

  // Forward query params from the original request (excluding 'path' which is the catch-all)
  const url = new URL(req.url, `http://${req.headers.host}`);
  for (const [key, val] of url.searchParams.entries()) {
    if (key !== 'path') {
      targetUrl.searchParams.set(key, val);
    }
  }

  // ── Build headers to forward ──
  const skipHeaders = new Set([
    'host', 'origin', 'referer', 'x-target-base', 'connection',
    'x-matched-path', 'x-invoke-path', 'x-invoke-query',
    'x-vercel-id', 'x-vercel-deployment-url', 'x-vercel-forwarded-for',
    'x-real-ip', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto',
    'transfer-encoding', 'accept-encoding',
  ]);

  const forwardHeaders = {};
  for (const [key, val] of Object.entries(req.headers)) {
    if (!skipHeaders.has(key.toLowerCase())) {
      forwardHeaders[key] = val;
    }
  }
  forwardHeaders['host'] = targetUrl.host;

  try {
    const fetchOptions = {
      method: req.method || 'GET',
      headers: forwardHeaders,
    };

    // Forward body for non-GET/HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOptions.body = typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl.toString(), fetchOptions);

    // ── Set CORS headers on response ──
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    // ── Forward content type ──
    const contentType = response.headers.get('content-type') || '';
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    // ── Return the response ──
    const body = await response.text();
    res.status(response.status).send(body);
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(502).json({ error: err.message });
  }
}
