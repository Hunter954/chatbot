'use strict';

const http = require('http');
const net = require('net');

const proxyPort = Number(process.env.PORT || 8080);
const targetPort = Number(process.env.OPENWA_INTERNAL_PORT || 8081);
const targetHost = process.env.OPENWA_INTERNAL_HOST || '127.0.0.1';
const maxInjectBytes = Number(process.env.OPENWA_PROXY_MAX_HTML_BYTES || 5 * 1024 * 1024);

const QR_RENDER_FIX_SCRIPT = `
(function () {
  if (window.__openwaQrRenderFixLoaded) return;
  window.__openwaQrRenderFixLoaded = true;

  var lastQr = '';

  function addStyles() {
    if (document.getElementById('openwa-qr-render-fix-style')) return;
    var style = document.createElement('style');
    style.id = 'openwa-qr-render-fix-style';
    style.textContent = [
      '#openwa-qr-render-fix{box-sizing:border-box;position:fixed;z-index:2147483647;right:24px;top:24px;width:min(360px,calc(100vw - 48px));background:#fff;border:1px solid #d6d6d6;border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.18);padding:18px;font-family:Arial,Helvetica,sans-serif;color:#111}',
      '#openwa-qr-render-fix h3{margin:0 0 8px;font-size:18px;line-height:1.2}',
      '#openwa-qr-render-fix p{margin:0 0 12px;font-size:13px;line-height:1.35;color:#444}',
      '#openwa-qr-render-fix img{display:none;width:100%;height:auto;border:1px solid #eee;border-radius:10px;background:#fff}',
      '#openwa-qr-render-fix .status{font-size:12px;color:#666;margin-top:10px}',
      '#openwa-qr-render-fix .ok{color:#14823b;font-weight:700}',
      '#openwa-qr-render-fix .warn{color:#9a6700;font-weight:700}',
      '#openwa-qr-render-fix button{position:absolute;top:8px;right:10px;border:0;background:transparent;font-size:20px;line-height:1;cursor:pointer;color:#777}',
      '@media(max-width:720px){#openwa-qr-render-fix{left:12px;right:12px;top:12px;width:auto}}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensurePanel() {
    if (!document.body) return null;
    addStyles();
    var panel = document.getElementById('openwa-qr-render-fix');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'openwa-qr-render-fix';
    panel.innerHTML = '' +
      '<button type="button" aria-label="Fechar">×</button>' +
      '<h3>QR Code do WhatsApp</h3>' +
      '<p>Abra o WhatsApp no celular, toque em <b>Aparelhos conectados</b> e escaneie o QR abaixo.</p>' +
      '<img alt="QR Code para autenticar o WhatsApp" />' +
      '<div class="status"><span class="warn">Aguardando QR...</span></div>';

    panel.querySelector('button').addEventListener('click', function () {
      panel.style.display = 'none';
    });

    document.body.appendChild(panel);
    return panel;
  }

  function getPageText() {
    var parts = [];
    try {
      var nodes = document.querySelectorAll('textarea,input,pre,code,div,span');
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (typeof node.value === 'string') parts.push(node.value);
        if (typeof node.textContent === 'string') parts.push(node.textContent);
      }
      if (document.body && document.body.innerText) parts.push(document.body.innerText);
    } catch (err) {}
    return parts.join('\n');
  }

  function extractQr(text) {
    if (!text) return '';
    var match = text.match(/data:image\/(?:png|jpeg|jpg);base64,[A-Za-z0-9+/=]{500,}/);
    return match ? match[0] : '';
  }

  function looksLoggedIn(text) {
    return /authenticated|isLogged|READY|qr-scanned|session data loaded|successfully authenticated|phone is connected/i.test(text || '');
  }

  function shrinkRawTextAreas() {
    try {
      var textareas = document.querySelectorAll('textarea');
      for (var i = 0; i < textareas.length; i++) {
        if ((textareas[i].value || '').indexOf('data:image/') !== -1) {
          textareas[i].style.maxHeight = '130px';
          textareas[i].style.opacity = '0.35';
        }
      }
    } catch (err) {}
  }

  function renderQr() {
    var panel = ensurePanel();
    if (!panel) return;

    var text = getPageText();
    var qr = extractQr(text);
    var img = panel.querySelector('img');
    var status = panel.querySelector('.status');

    if (qr) {
      if (qr !== lastQr) {
        lastQr = qr;
        img.src = qr;
      }
      img.style.display = 'block';
      status.innerHTML = '<span class="ok">QR recebido.</span> Escaneie antes que ele expire.';
      shrinkRawTextAreas();
      return;
    }

    if (looksLoggedIn(text)) {
      img.style.display = 'none';
      status.innerHTML = '<span class="ok">WhatsApp autenticado/conectado.</span>';
      return;
    }

    status.innerHTML = '<span class="warn">Aguardando QR...</span> Se demorar, atualize a página em alguns segundos.';
  }

  function start() {
    renderQr();
    setInterval(renderQr, 600);
    try {
      var observer = new MutationObserver(renderQr);
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    } catch (err) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
`;

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

function shouldInjectQrFix(req, proxyRes) {
  if (req.method !== 'GET') return false;
  const contentType = String(proxyRes.headers['content-type'] || '').toLowerCase();
  const contentEncoding = String(proxyRes.headers['content-encoding'] || '').toLowerCase();
  return contentType.includes('text/html') && !contentEncoding;
}

function injectQrFix(html) {
  if (!html || html.includes('__openwaQrRenderFixLoaded')) return html;
  const scriptTag = `<script>${QR_RENDER_FIX_SCRIPT}</script>`;
  if (html.includes('</body>')) return html.replace('</body>', `${scriptTag}</body>`);
  if (html.includes('</html>')) return html.replace('</html>', `${scriptTag}</html>`);
  return `${html}${scriptTag}`;
}

function proxyHttp(req, res) {
  const url = req.url || '/';
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
      if (!shouldInjectQrFix(req, proxyRes)) {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
        return;
      }

      const chunks = [];
      let total = 0;
      proxyRes.on('data', (chunk) => {
        total += chunk.length;
        if (total <= maxInjectBytes) chunks.push(chunk);
      });
      proxyRes.on('end', () => {
        const responseHeaders = { ...proxyRes.headers };
        delete responseHeaders['content-length'];

        if (total > maxInjectBytes) {
          res.writeHead(proxyRes.statusCode || 502, responseHeaders);
          res.end(Buffer.concat(chunks));
          return;
        }

        const html = Buffer.concat(chunks).toString('utf8');
        const patchedHtml = injectQrFix(html);
        responseHeaders['content-length'] = Buffer.byteLength(patchedHtml);
        res.writeHead(proxyRes.statusCode || 502, responseHeaders);
        res.end(patchedHtml);
      });
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

  return proxyHttp(req, res);
});

server.on('upgrade', (req, socket, head) => {
  // Raw TCP/WebSocket upgrade proxy. Socket.IO/WebSocket is used by the OpenWA login page.
  const upstream = net.connect(targetPort, targetHost, () => {
    let requestHead = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      requestHead += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    }
    requestHead += '\r\n';

    upstream.write(requestHead);
    if (head && head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });

  const closeBoth = () => {
    socket.destroy();
    upstream.destroy();
  };

  upstream.on('error', closeBoth);
  socket.on('error', closeBoth);
});

server.listen(proxyPort, '0.0.0.0', () => {
  console.log(`Health proxy escutando em 0.0.0.0:${proxyPort} e repassando para ${targetHost}:${targetPort}`);
});
