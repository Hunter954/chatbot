'use strict';

const http = require('http');
const net = require('net');

const proxyPort = Number(process.env.PORT || 8080);
const targetPort = Number(process.env.OPENWA_INTERNAL_PORT || 8081);
const targetHost = process.env.OPENWA_INTERNAL_HOST || '127.0.0.1';

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function canConnect(timeoutMs = 600) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: targetHost, port: targetPort });
    const done = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';

  // Railway healthcheck. It must be fast and independent from WhatsApp QR/auth startup.
  if (url === '/healthz' || url === '/healthz/') {
    return json(res, 200, {
      ok: true,
      service: 'openwa-health-proxy',
      target: `${targetHost}:${targetPort}`,
    });
  }

  // Optional readiness endpoint for humans/monitors.
  if (url === '/readyz' || url === '/readyz/') {
    const openwaReady = await canConnect();
    return json(res, openwaReady ? 200 : 503, {
      ok: openwaReady,
      service: 'openwa-health-proxy',
      openwa_ready: openwaReady,
      target: `${targetHost}:${targetPort}`,
    });
  }

  const headers = { ...req.headers, host: `${targetHost}:${targetPort}` };
  const proxyReq = http.request(
    {
      host: targetHost,
      port: targetPort,
      method: req.method,
      path: url,
      headers,
      timeout: 120000,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('timeout', () => {
    proxyReq.destroy(new Error('OpenWA upstream timeout'));
  });

  proxyReq.on('error', (err) => {
    json(res, 503, {
      ok: false,
      error: 'OpenWA ainda está iniciando. Tente novamente em instantes.',
      detail: err.message,
    });
  });

  req.pipe(proxyReq);
});

server.on('upgrade', (req, socket, head) => {
  // Minimal WebSocket/TCP upgrade proxy, caso alguma tela do OpenWA precise.
  const upstream = net.connect(targetPort, targetHost, () => {
    upstream.write(
      `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` +
        Object.entries(req.headers)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\r\n') +
        '\r\n\r\n'
    );
    if (head && head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
});

server.listen(proxyPort, '0.0.0.0', () => {
  console.log(`Health proxy escutando em 0.0.0.0:${proxyPort} e repassando para ${targetHost}:${targetPort}`);
});
