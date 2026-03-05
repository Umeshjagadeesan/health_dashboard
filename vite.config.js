import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { request as httpsRequest } from 'https';
import { request as httpRequest } from 'http';

// Server-side proxy middleware to bypass CORS
function proxyMiddleware() {
  return {
    name: 'cors-proxy',
    configureServer(server) {
      server.middlewares.use('/cpproxy', (req, res) => {
        const targetBase = req.headers['x-target-base'];
        if (!targetBase) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing x-target-base header' }));
          return;
        }

        const targetUrl = new URL(req.url, targetBase);
        const isHttps = targetUrl.protocol === 'https:';
        const doRequest = isHttps ? httpsRequest : httpRequest;

        // Copy relevant headers, skip host/origin
        const fwdHeaders = {};
        for (const [key, val] of Object.entries(req.headers)) {
          if (!['host', 'origin', 'referer', 'x-target-base', 'connection'].includes(key)) {
            fwdHeaders[key] = val;
          }
        }
        fwdHeaders['host'] = targetUrl.host;

        const options = {
          hostname: targetUrl.hostname,
          port: targetUrl.port || (isHttps ? 443 : 80),
          path: targetUrl.pathname + targetUrl.search,
          method: req.method || 'GET',
          headers: fwdHeaders,
          rejectUnauthorized: false,
        };

        const proxyReq = doRequest(options, (proxyRes) => {
          // Return the response with CORS headers
          const headers = { ...proxyRes.headers };
          headers['access-control-allow-origin'] = '*';
          delete headers['transfer-encoding']; // avoid chunked issues
          res.writeHead(proxyRes.statusCode, headers);
          proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });

        req.pipe(proxyReq);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), proxyMiddleware()],
  server: {
    port: 3000,
    open: true,
  },
});
