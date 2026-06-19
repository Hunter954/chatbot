'use strict';

const http = require('http');
const net = require('net');

const proxyPort = Number(process.env.PORT || 8080);
const targetPort = Number(process.env.OPENWA_INTERNAL_PORT || 8081);
const targetHost = process.env.OPENWA_INTERNAL_HOST || '127.0.0.1';
const maxInjectBytes = Number(process.env.OPENWA_PROXY_MAX_HTML_BYTES || 5 * 1024 * 1024);

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function html(res, statusCode, body) {
  res.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    pragma: 'no-cache',
    expires: '0',
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

const QR_RENDER_FIX_SCRIPT = `
(function () {
  if (window.__openwaQrRenderFixLoaded) return;
  window.__openwaQrRenderFixLoaded = true;

  function byId(id) { return document.getElementById(id); }

  function findDataUri(value, depth) {
    if (depth > 8 || value == null) return '';

    if (typeof value === 'string') {
      var match = value.match(/data:image\\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]{500,}/);
      return match ? match[0] : '';
    }

    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        var foundFromArray = findDataUri(value[i], depth + 1);
        if (foundFromArray) return foundFromArray;
      }
      return '';
    }

    if (typeof value === 'object') {
      for (var key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        var foundFromObject = findDataUri(value[key], depth + 1);
        if (foundFromObject) return foundFromObject;
      }
    }

    return '';
  }

  function findPairingCode(value, depth) {
    if (depth > 8 || value == null) return '';

    if (typeof value === 'string') {
      var trimmed = value.trim();
      if (/^[A-Z0-9-]{6,20}$/i.test(trimmed) && !trimmed.startsWith('data:')) return trimmed;
      return '';
    }

    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        var foundFromArray = findPairingCode(value[i], depth + 1);
        if (foundFromArray) return foundFromArray;
      }
      return '';
    }

    if (typeof value === 'object') {
      for (var key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        if (/code|pair/i.test(key)) {
          var direct = findPairingCode(value[key], depth + 1);
          if (direct) return direct;
        }
      }
      for (var key2 in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key2)) continue;
        var foundFromObject = findPairingCode(value[key2], depth + 1);
        if (foundFromObject) return foundFromObject;
      }
    }

    return '';
  }

  function setStatus(text, kind) {
    var status = byId('status');
    if (!status) return;
    status.className = 'status ' + (kind || 'info');
    status.textContent = text;
  }

  function appendLog(message) {
    var log = byId('log');
    if (!log) return;
    var line = '[' + new Date().toLocaleTimeString() + '] ' + message;
    log.value = (line + '\\n' + log.value).slice(0, 4000);
  }

  function renderQr(dataUri) {
    var qr = byId('qr');
    var placeholder = byId('placeholder');
    if (!qr || !dataUri) return;

    qr.src = dataUri;
    qr.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
    setStatus('QR recebido. Escaneie pelo WhatsApp antes de expirar.', 'ok');
    appendLog('QR renderizado na tela.');
  }

  function renderCode(code) {
    var box = byId('pairing-code');
    if (!box || !code) return;
    box.textContent = code;
    box.style.display = 'block';
    setStatus('Código de pareamento recebido.', 'ok');
    appendLog('Código de pareamento recebido.');
  }

  function handlePayload(eventName, payload) {
    var all = [eventName, payload];
    var qr = findDataUri(all, 0);
    if (qr) {
      renderQr(qr);
      return;
    }

    if (/code|pair/i.test(String(eventName || ''))) {
      var code = findPairingCode(payload, 0);
      if (code) renderCode(code);
    }

    if (/ready|authenticated|auth|logged|success|connected/i.test(String(eventName || ''))) {
      setStatus('WhatsApp autenticado/conectado. Aguarde alguns segundos e teste o envio.', 'ok');
    }

    if (/fail|error|timeout|logout|disconnected/i.test(String(eventName || ''))) {
      setStatus('Evento recebido: ' + String(eventName), 'warn');
    }
  }

  function scanDomFallback() {
    try {
      var text = document.body ? document.body.innerText : '';
      var nodes = document.querySelectorAll('textarea,input,pre,code');
      for (var i = 0; i < nodes.length; i++) {
        if (typeof nodes[i].value === 'string') text += '\\n' + nodes[i].value;
        if (typeof nodes[i].textContent === 'string') text += '\\n' + nodes[i].textContent;
      }
      var qr = findDataUri(text, 0);
      if (qr) renderQr(qr);
    } catch (err) {}
  }

  function connectSocket() {
    if (!window.io) {
      setStatus('Não consegui carregar o socket.io do OpenWA. Atualize a página em alguns segundos.', 'warn');
      appendLog('socket.io não carregou.');
      return;
    }

    var socket = window.io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 20000
    });

    if (typeof socket.onevent === 'function') {
      var originalOnevent = socket.onevent;
      socket.onevent = function (packet) {
        try {
          var data = packet && packet.data ? packet.data : [];
          var eventName = data[0];
          var args = data.slice ? data.slice(1) : data;
          appendLog('Evento socket: ' + String(eventName || 'sem-nome'));
          handlePayload(eventName, args);
        } catch (err) {}
        return originalOnevent.apply(this, arguments);
      };
    }

    socket.on('connect', function () {
      setStatus('Conectado ao OpenWA. Aguardando QR...', 'info');
      appendLog('Socket conectado.');
    });

    socket.on('disconnect', function (reason) {
      setStatus('Socket desconectado: ' + reason + '. Tentando reconectar...', 'warn');
      appendLog('Socket desconectado: ' + reason);
    });

    socket.on('connect_error', function (err) {
      setStatus('Ainda aguardando o OpenWA iniciar...', 'warn');
      appendLog('Erro de conexão socket: ' + (err && err.message ? err.message : err));
    });

    ['qr', 'code', 'pairingCode', 'pairing-code', 'authenticated', 'auth_failure', 'ready', 'logged', 'logout', 'state'].forEach(function (eventName) {
      socket.on(eventName, function () {
        var args = Array.prototype.slice.call(arguments);
        appendLog('Evento socket: ' + eventName);
        handlePayload(eventName, args);
      });
    });
  }

  connectSocket();
  setInterval(scanDomFallback, 700);
})();
`;

function customQrPage() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenWA - QR Code</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #f5f7fb; color: #111827; }
    .wrap { max-width: 980px; margin: 0 auto; padding: 28px 18px 48px; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 18px; box-shadow: 0 18px 55px rgba(15, 23, 42, .10); padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    p { color: #4b5563; line-height: 1.5; }
    .grid { display: grid; grid-template-columns: minmax(280px, 390px) 1fr; gap: 28px; align-items: start; margin-top: 22px; }
    .qrbox { min-height: 390px; border: 2px dashed #cbd5e1; border-radius: 16px; display: flex; align-items: center; justify-content: center; padding: 16px; background: #fbfdff; }
    #qr { display: none; width: 100%; max-width: 350px; height: auto; background: #fff; border-radius: 12px; }
    #placeholder { text-align: center; color: #64748b; }
    .spinner { width: 54px; height: 54px; border: 7px solid #dbeafe; border-top-color: #2563eb; border-radius: 999px; animation: spin 1s linear infinite; margin: 0 auto 14px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .status { padding: 12px 14px; border-radius: 12px; margin: 14px 0; font-weight: 700; }
    .status.info { background: #eff6ff; color: #1d4ed8; }
    .status.ok { background: #ecfdf5; color: #047857; }
    .status.warn { background: #fffbeb; color: #92400e; }
    #pairing-code { display: none; margin-top: 12px; font-size: 28px; letter-spacing: 4px; font-weight: 800; background: #111827; color: #fff; padding: 14px; border-radius: 12px; text-align: center; }
    .steps { margin: 16px 0; padding-left: 18px; color: #374151; }
    .steps li { margin: 8px 0; }
    .links a { display: inline-block; margin-right: 10px; margin-top: 8px; color: #2563eb; text-decoration: none; font-weight: 700; }
    textarea { width: 100%; min-height: 120px; margin-top: 14px; border: 1px solid #d1d5db; border-radius: 12px; padding: 12px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; box-sizing: border-box; }
    .small { font-size: 13px; color: #6b7280; }
    @media (max-width: 800px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>OpenWA - QR Code</h1>
      <p>Esta é uma tela própria do proxy para renderizar o QR corretamente. Não usamos a tela original do OpenWA porque ela pode mostrar o <code>data:image/png;base64</code> como texto.</p>
      <div id="status" class="status info">Conectando ao OpenWA...</div>
      <div class="grid">
        <div>
          <div class="qrbox">
            <img id="qr" alt="QR Code do WhatsApp" />
            <div id="placeholder">
              <div class="spinner"></div>
              <strong>Aguardando QR Code...</strong>
              <div class="small">Isso pode levar alguns segundos no primeiro boot.</div>
            </div>
          </div>
          <div id="pairing-code"></div>
        </div>
        <div>
          <h2>Como conectar</h2>
          <ol class="steps">
            <li>Abra o WhatsApp no celular.</li>
            <li>Toque em <b>Aparelhos conectados</b>.</li>
            <li>Toque em <b>Conectar aparelho</b>.</li>
            <li>Escaneie o QR Code que aparecer aqui.</li>
            <li>Depois de conectar, deixe o serviço ligado por pelo menos 5 minutos.</li>
          </ol>
          <div class="links">
            <a href="/readyz" target="_blank">Ver readiness</a>
            <a href="/api-docs" target="_blank">Abrir API Docs</a>
            <a href="/openwa-original" target="_blank">Tela original</a>
          </div>
          <textarea id="log" readonly placeholder="Eventos do socket aparecerão aqui..."></textarea>
        </div>
      </div>
    </div>
  </div>
  <script src="/socket.io/socket.io.js"></script>
  <script>${QR_RENDER_FIX_SCRIPT}</script>
</body>
</html>`;
}

function shouldInjectQrFix(req, proxyRes) {
  if (req.method !== 'GET') return false;
  const contentType = String(proxyRes.headers['content-type'] || '').toLowerCase();
  const contentEncoding = String(proxyRes.headers['content-encoding'] || '').toLowerCase();
  return contentType.includes('text/html') && !contentEncoding;
}

function injectQrFix(htmlBody) {
  if (!htmlBody || htmlBody.includes('__openwaQrRenderFixLoaded')) return htmlBody;
  const scriptTag = `<script>${QR_RENDER_FIX_SCRIPT}</script>`;
  if (htmlBody.includes('</body>')) return htmlBody.replace('</body>', `${scriptTag}</body>`);
  if (htmlBody.includes('</html>')) return htmlBody.replace('</html>', `${scriptTag}</html>`);
  return `${htmlBody}${scriptTag}`;
}

function proxyHttp(req, res, pathOverride) {
  const url = pathOverride || req.url || '/';
  const headers = { ...req.headers, host: `${targetHost}:${targetPort}` };

  // Força resposta sem gzip/deflate para permitir injeção em HTML quando necessário.
  delete headers['accept-encoding'];

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

        const originalHtml = Buffer.concat(chunks).toString('utf8');
        const patchedHtml = injectQrFix(originalHtml);
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
  const pathname = url.split('?')[0];

  // Railway healthcheck. Deve ser rápido e independente do QR/autenticação.
  if (pathname === '/healthz' || pathname === '/healthz/') {
    return json(res, 200, {
      ok: true,
      service: 'openwa-health-proxy',
      target: `${targetHost}:${targetPort}`,
    });
  }

  // Readiness real da EASY API interna.
  if (pathname === '/readyz' || pathname === '/readyz/') {
    const openwaReady = await canConnect();
    return json(res, openwaReady ? 200 : 503, {
      ok: openwaReady,
      service: 'openwa-health-proxy',
      openwa_ready: openwaReady,
      target: `${targetHost}:${targetPort}`,
    });
  }

  if (pathname === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }

  // Tela própria para QR. Esta rota NÃO repassa a tela quebrada do OpenWA.
  if (req.method === 'GET' && (pathname === '/' || pathname === '/qr' || pathname === '/login')) {
    return html(res, 200, customQrPage());
  }

  // Fallback para comparar com a tela original do OpenWA.
  if (req.method === 'GET' && pathname === '/openwa-original') {
    return proxyHttp(req, res, '/');
  }

  return proxyHttp(req, res);
});

server.on('upgrade', (req, socket, head) => {
  // Proxy bruto para WebSocket/Socket.IO usado pela tela de login do OpenWA.
  const upstream = net.connect(targetPort, targetHost, () => {
    let requestHead = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const name = req.rawHeaders[i];
      const value = req.rawHeaders[i + 1];
      requestHead += `${name}: ${value}\r\n`;
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
  console.log(`Health/QR proxy escutando em 0.0.0.0:${proxyPort} e repassando para ${targetHost}:${targetPort}`);
});
