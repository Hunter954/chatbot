'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { create, ev } = require('@open-wa/wa-automate');

let earlyCrashLog = '';

process.on('uncaughtException', (err) => {
  const message = err?.stack || err?.message || String(err);
  earlyCrashLog = message;
  console.error(new Date().toISOString(), 'uncaughtException:', message);

  // O erro `spawn ps ENOENT` vem de libs de processo usadas pelo OpenWA/Puppeteer
  // quando o binário `ps` não existe no container. O Dockerfile agora instala procps,
  // mas este guard impede que um evento não tratado derrube o gateway antes do QR.
  if (/spawn ps ENOENT/i.test(message)) return;
});

process.on('unhandledRejection', (reason) => {
  const message = reason?.stack || reason?.message || String(reason);
  earlyCrashLog = message;
  console.error(new Date().toISOString(), 'unhandledRejection:', message);
});


const PORT = Number(process.env.PORT || 8080);
const SESSION_ID = process.env.OPENWA_SESSION_ID || process.env.SESSION_ID || 'lanhouse-demo';
const API_KEY = process.env.OPENWA_API_KEY || '';
const WEBHOOK_URL = process.env.FLASK_WEBHOOK_URL || process.env.OPENWA_WEBHOOK_URL || '';
const WEBHOOK_SECRET = process.env.OPENWA_WEBHOOK_SECRET || '';
let DATA_DIR = process.env.OPENWA_DATA_DIR || '/data';
let SESSION_DATA_PATH = process.env.OPENWA_SESSION_DATA_PATH || path.join(DATA_DIR, 'sessions');
const PUBLIC_URL = process.env.OPENWA_PUBLIC_URL || '';
const IGNORE_GROUPS = String(process.env.OPENWA_IGNORE_GROUPS || 'false').toLowerCase() === 'true';
const QR_MAX_AGE_MS = Number(process.env.OPENWA_QR_MAX_AGE_MS || 60_000);
const START_RETRY_MS = Number(process.env.OPENWA_START_RETRY_MS || 10_000);
const OPENWA_USE_CHROME = String(process.env.OPENWA_USE_CHROME || 'true').toLowerCase() !== 'false';
const OPENWA_AUTO_REFRESH = String(process.env.OPENWA_AUTO_REFRESH || 'true').toLowerCase() !== 'false';
const OPENWA_QR_TIMEOUT = Number(process.env.OPENWA_QR_TIMEOUT ?? 0);
const OPENWA_AUTH_TIMEOUT = Number(process.env.OPENWA_AUTH_TIMEOUT ?? 0);
const OPENWA_MAX_QR = Number(process.env.OPENWA_MAX_QR || 0);
const OPENWA_DEBUG_LOGS = String(process.env.OPENWA_DEBUG_LOGS || 'false').toLowerCase() === 'true';
const OPENWA_USE_CUSTOM_CHROMIUM_ARGS = String(process.env.OPENWA_USE_CUSTOM_CHROMIUM_ARGS || 'false').toLowerCase() === 'true';


function ensureWritableSessionPath() {
  const requestedDataDir = DATA_DIR;
  const requestedSessionPath = SESSION_DATA_PATH;

  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(SESSION_DATA_PATH, { recursive: true });
    fs.accessSync(SESSION_DATA_PATH, fs.constants.W_OK);
    return;
  } catch (err) {
    const fallbackDataDir = '/tmp/openwa-data';
    const fallbackSessionPath = path.join(fallbackDataDir, 'sessions');
    console.warn(
      new Date().toISOString(),
      'Não consegui escrever no diretório de sessão configurado.',
      `dataDir=${requestedDataDir}`,
      `sessionDataPath=${requestedSessionPath}`,
      `erro=${err?.message || err}`,
      `Usando fallback temporário ${fallbackSessionPath}. No Railway, confira se o Volume está montado em /data.`
    );
    DATA_DIR = fallbackDataDir;
    SESSION_DATA_PATH = fallbackSessionPath;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(SESSION_DATA_PATH, { recursive: true });
  }
}

ensureWritableSessionPath();

let client = null;
let starting = false;
let startedAt = new Date().toISOString();
let lastQr = '';
let lastQrAt = null;
let lastPairingCode = '';
let connectionState = 'BOOTING';
let lastError = '';
let lastWebhookError = '';
let receivedMessages = 0;
let sentMessages = 0;

function nowIso() {
  return new Date().toISOString();
}

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function normalizeBearer(value) {
  if (!value) return '';
  return String(value).replace(/^Bearer\s+/i, '').trim();
}

function providedApiKey(req) {
  return (
    req.get('api_key') ||
    req.get('api-key') ||
    req.get('x-api-key') ||
    normalizeBearer(req.get('authorization')) ||
    req.query.api_key ||
    req.query.key ||
    req.body?.api_key ||
    req.body?.apiKey ||
    ''
  );
}

function requireApiKey(req, res, next) {
  if (!API_KEY) return next();
  if (providedApiKey(req) === API_KEY) return next();
  return res.status(401).json({ ok: false, error: 'invalid_api_key' });
}

function publicState() {
  const qrExpired = lastQrAt ? Date.now() - new Date(lastQrAt).getTime() > QR_MAX_AGE_MS : false;
  return {
    ok: true,
    service: 'openwa-programmatic-gateway',
    session_id: SESSION_ID,
    started_at: startedAt,
    connection_state: connectionState,
    has_client: Boolean(client),
    starting,
    has_qr: Boolean(lastQr),
    qr_at: lastQrAt,
    qr_expired: qrExpired,
    has_pairing_code: Boolean(lastPairingCode),
    public_url: PUBLIC_URL,
    session_data_path: SESSION_DATA_PATH,
    webhook_configured: Boolean(WEBHOOK_URL),
    last_error: lastError || earlyCrashLog,
    last_webhook_error: lastWebhookError,
    counters: {
      inbound_messages: receivedMessages,
      outbound_messages: sentMessages,
    },
  };
}

function emitState(io) {
  io.emit('state', publicState());
}

function setConnectionState(io, state) {
  connectionState = String(state || 'UNKNOWN');
  log('Estado OpenWA:', connectionState);
  emitState(io);
}

function setQr(io, qrcode, source = 'qr-event') {
  if (!qrcode || typeof qrcode !== 'string') return;
  const cleanQr = qrcode.trim();
  if (!cleanQr.startsWith('data:image/')) {
    log('QR ignorado porque não é data:image:', cleanQr.slice(0, 40));
    return;
  }
  lastQr = cleanQr;
  lastQrAt = nowIso();
  lastPairingCode = '';
  log(`QR recebido via ${source}. Tamanho: ${cleanQr.length} chars.`);
  io.emit('qr', { qrcode: lastQr, at: lastQrAt, session_id: SESSION_ID });
  emitState(io);
}

function clearQr(io) {
  lastQr = '';
  lastQrAt = null;
  lastPairingCode = '';
  io.emit('qr-clear', { at: nowIso(), session_id: SESSION_ID });
  emitState(io);
}

function normalizeArgs(body, fallbackMethod = '') {
  let method = body?.method || fallbackMethod || '';
  let args = body?.args;

  if (args === undefined) {
    const ignored = new Set(['method', 'api_key', 'apiKey']);
    const rest = Object.fromEntries(Object.entries(body || {}).filter(([key]) => !ignored.has(key)));
    args = Object.keys(rest).length ? rest : [];
  }

  if (!Array.isArray(args)) {
    if (args && typeof args === 'object') {
      if ('to' in args && ('content' in args || 'text' in args || 'message' in args)) {
        args = [args.to, args.content ?? args.text ?? args.message];
      } else {
        args = [args];
      }
    } else if (args === undefined || args === null) {
      args = [];
    } else {
      args = [args];
    }
  }

  return { method, args };
}

function ensureClient(res) {
  if (client) return true;
  res.status(503).json({
    ok: false,
    error: 'whatsapp_not_ready',
    message: 'O WhatsApp ainda não está autenticado. Abra /qr e escaneie o QR Code.',
    state: publicState(),
  });
  return false;
}

async function callClientMethod(method, args) {
  if (!client) throw new Error('Client not ready');
  if (!method || typeof client[method] !== 'function') {
    const err = new Error(`Método OpenWA não encontrado: ${method}`);
    err.statusCode = 404;
    throw err;
  }
  return client[method](...args);
}

async function postWebhook(message) {
  if (!WEBHOOK_URL) return;
  if (IGNORE_GROUPS && (message?.isGroupMsg || String(message?.chatId || message?.from || '').endsWith('@g.us'))) return;

  const payload = {
    event: 'message',
    sessionId: SESSION_ID,
    data: message,
  };

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': WEBHOOK_SECRET,
        'x-openwa-webhook-secret': WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Webhook HTTP ${response.status}: ${body.slice(0, 300)}`);
    }
    lastWebhookError = '';
  } catch (err) {
    lastWebhookError = err?.message || String(err);
    log('Falha ao enviar webhook para Flask:', lastWebhookError);
  }
}

function registerQrEvents(io) {
  // A documentação oficial do OpenWA v4 usa ev.on('qr.**') para capturar o QR em base64.
  ev.on('qr.**', async (qrcode, emittedSessionId) => {
    if (!emittedSessionId || emittedSessionId === SESSION_ID) {
      setQr(io, qrcode, `qr.**/${emittedSessionId || 'sem-session'}`);
    }
  });

  ev.on(`qr.${SESSION_ID}`, async (qrcode) => {
    setQr(io, qrcode, `qr.${SESSION_ID}`);
  });

  ev.on('code.**', async (code, emittedSessionId) => {
    if (!emittedSessionId || emittedSessionId === SESSION_ID) {
      lastPairingCode = String(code || '').trim();
      io.emit('pairing-code', { code: lastPairingCode, at: nowIso(), session_id: SESSION_ID });
      emitState(io);
    }
  });
}

async function startOpenWa(io) {
  if (client || starting) return;
  starting = true;
  lastError = '';
  setConnectionState(io, 'STARTING');

  try {
    log('Iniciando OpenWA programático:', {
      sessionId: SESSION_ID,
      sessionDataPath: SESSION_DATA_PATH,
      dataDir: DATA_DIR,
      webhookConfigured: Boolean(WEBHOOK_URL),
      useChrome: OPENWA_USE_CHROME,
      qrTimeout: OPENWA_QR_TIMEOUT,
      authTimeout: OPENWA_AUTH_TIMEOUT,
      customChromiumArgs: OPENWA_USE_CUSTOM_CHROMIUM_ARGS,
    });

    // IMPORTANTE: não enviar browserArgs/chromiumArgs por padrão.
    // O próprio OpenWA avisou nos logs que argumentos customizados com Multi Device
    // podem travar antes do QR: "Using custom chromium args with multi device will cause issues".
    // No Railway, o Chrome da imagem base já roda com as flags necessárias.
    const createConfig = {
      sessionId: SESSION_ID,
      sessionDataPath: SESSION_DATA_PATH,
      multiDevice: true,
      useChrome: OPENWA_USE_CHROME,
      autoRefresh: OPENWA_AUTO_REFRESH,
      headless: true,
      popup: false,
      cacheEnabled: false,
      qrTimeout: OPENWA_QR_TIMEOUT,
      authTimeout: OPENWA_AUTH_TIMEOUT,
      maxQr: OPENWA_MAX_QR,
      killProcessOnTimeout: false,
      blockCrashLogs: true,
      logConsole: OPENWA_DEBUG_LOGS,
      logConsoleErrors: true,
      disableSpins: true,
      restartOnCrash: async () => {
        log('OpenWA pediu restartOnCrash. Reiniciando sessão...');
        client = null;
        setConnectionState(io, 'RESTARTING');
        setTimeout(() => startOpenWa(io).catch(() => {}), START_RETRY_MS);
      },
    };

    if (OPENWA_USE_CUSTOM_CHROMIUM_ARGS) {
      createConfig.browserArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
      createConfig.chromiumArgs = createConfig.browserArgs;
    }

    client = await create(createConfig);

    clearQr(io);
    setConnectionState(io, 'READY');

    if (typeof client.onStateChanged === 'function') {
      client.onStateChanged((state) => {
        setConnectionState(io, state);
        if (/CONNECTED|SYNCING|PAIRING|OPENING/i.test(String(state))) {
          if (/CONNECTED|SYNCING/i.test(String(state))) clearQr(io);
        }
      });
    }

    if (typeof client.onMessage === 'function') {
      client.onMessage(async (message) => {
        receivedMessages += 1;
        if (message?.fromMe || message?.isSentByMe) return;
        await postWebhook(message);
        emitState(io);
      });
    }

    log('OpenWA autenticado e cliente pronto.');
  } catch (err) {
    client = null;
    lastError = err?.stack || err?.message || String(err);
    setConnectionState(io, 'ERROR');
    log('Erro ao iniciar OpenWA:', lastError);
    setTimeout(() => startOpenWa(io).catch(() => {}), START_RETRY_MS);
  } finally {
    starting = false;
    emitState(io);
  }
}

function qrPageHtml() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenWA - QR Code</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #f5f7fb; color: #111827; }
    .wrap { max-width: 980px; margin: 0 auto; padding: 28px 18px 48px; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 18px; box-shadow: 0 18px 55px rgba(15, 23, 42, .10); padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    p { color: #4b5563; line-height: 1.5; }
    .grid { display: grid; grid-template-columns: minmax(280px, 410px) 1fr; gap: 28px; align-items: start; margin-top: 22px; }
    .qrbox { min-height: 410px; border: 2px dashed #cbd5e1; border-radius: 16px; display: flex; align-items: center; justify-content: center; padding: 16px; background: #fbfdff; }
    #qr { display: none; width: 100%; max-width: 370px; height: auto; background: #fff; border-radius: 12px; image-rendering: pixelated; }
    #placeholder { text-align: center; color: #64748b; }
    .spinner { width: 54px; height: 54px; border: 7px solid #dbeafe; border-top-color: #2563eb; border-radius: 999px; animation: spin 1s linear infinite; margin: 0 auto 14px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .status { padding: 12px 14px; border-radius: 12px; margin: 14px 0; font-weight: 700; }
    .status.info { background: #eff6ff; color: #1d4ed8; }
    .status.ok { background: #ecfdf5; color: #047857; }
    .status.warn { background: #fffbeb; color: #92400e; }
    .status.err { background: #fef2f2; color: #b91c1c; }
    #pairing-code { display: none; margin-top: 12px; font-size: 28px; letter-spacing: 4px; font-weight: 800; background: #111827; color: #fff; padding: 14px; border-radius: 12px; text-align: center; }
    .steps { margin: 16px 0; padding-left: 18px; color: #374151; }
    .steps li { margin: 8px 0; }
    .links a { display: inline-block; margin-right: 10px; margin-top: 8px; color: #2563eb; text-decoration: none; font-weight: 700; }
    textarea { width: 100%; min-height: 150px; margin-top: 14px; border: 1px solid #d1d5db; border-radius: 12px; padding: 12px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
    .small { font-size: 13px; color: #6b7280; }
    code { background: #f1f5f9; padding: 2px 5px; border-radius: 6px; }
    @media (max-width: 800px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>OpenWA - QR Code</h1>
      <p>Esta tela agora vem do nosso gateway programático. O QR é capturado diretamente do evento oficial <code>qr</code> do OpenWA, não da tela HTML original.</p>
      <div id="status" class="status info">Conectando ao gateway...</div>
      <div class="grid">
        <div>
          <div class="qrbox">
            <img id="qr" alt="QR Code do WhatsApp" />
            <div id="placeholder">
              <div class="spinner"></div>
              <strong>Aguardando QR Code real...</strong>
              <div class="small">No primeiro boot isso pode levar alguns segundos.</div>
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
            <a href="/healthz" target="_blank">Health</a>
            <a href="/readyz" target="_blank">Readiness</a>
            <a href="/qr-state" target="_blank">Estado QR</a>
            <a href="/api-docs" target="_blank">API Docs</a>
          </div>
          <textarea id="log" readonly placeholder="Eventos aparecerão aqui..."></textarea>
        </div>
      </div>
    </div>
  </div>
  <script src="/socket.io/socket.io.js"></script>
  <script>
    const statusEl = document.getElementById('status');
    const qrEl = document.getElementById('qr');
    const placeholderEl = document.getElementById('placeholder');
    const codeEl = document.getElementById('pairing-code');
    const logEl = document.getElementById('log');

    function setStatus(text, kind) {
      statusEl.className = 'status ' + (kind || 'info');
      statusEl.textContent = text;
    }

    function log(message) {
      const line = '[' + new Date().toLocaleTimeString() + '] ' + message;
      logEl.value = (line + '\\n' + logEl.value).slice(0, 5000);
    }

    function renderQr(qrcode, at) {
      if (!qrcode || !qrcode.startsWith('data:image/')) return;
      qrEl.onload = function () {
        placeholderEl.style.display = 'none';
        qrEl.style.display = 'block';
        codeEl.style.display = 'none';
        setStatus('QR Code real recebido. Escaneie pelo WhatsApp antes de expirar.', 'ok');
        log('QR exibido. Tamanho da imagem: ' + qrEl.naturalWidth + 'x' + qrEl.naturalHeight + '. Evento: ' + (at || 'agora'));
      };
      qrEl.onerror = function () {
        setStatus('Recebi um QR, mas o navegador não conseguiu renderizar a imagem.', 'err');
        log('Falha ao renderizar QR.');
      };
      qrEl.src = qrcode;
    }

    function renderCode(code) {
      if (!code) return;
      codeEl.textContent = code;
      codeEl.style.display = 'block';
      placeholderEl.style.display = 'none';
      qrEl.style.display = 'none';
      setStatus('Código de pareamento recebido.', 'ok');
      log('Código de pareamento exibido.');
    }

    function updateState(state) {
      if (!state) return;
      if (state.has_qr && state.qr_at) {
        setStatus('QR disponível. Se não aparecer, atualize a página.', 'ok');
      } else if (state.has_client) {
        setStatus('WhatsApp conectado/autenticado. Você já pode testar mensagens.', 'ok');
      } else if (state.connection_state === 'ERROR') {
        setStatus('Erro ao iniciar OpenWA: ' + (state.last_error ? state.last_error.split('\n')[0] : 'veja os logs do Railway'), 'err');
      } else {
        setStatus('Estado: ' + state.connection_state + '. Aguardando QR...', 'info');
      }
    }

    async function loadInitial() {
      try {
        const response = await fetch('/qr-state', { cache: 'no-store' });
        const data = await response.json();
        updateState(data);
        if (data.qrcode) renderQr(data.qrcode, data.qr_at);
        if (data.pairing_code) renderCode(data.pairing_code);
        log('Estado inicial carregado: ' + data.connection_state);
      } catch (err) {
        log('Falha ao carregar estado inicial: ' + err.message);
      }
    }

    const socket = io({ transports: ['websocket', 'polling'], reconnection: true });
    socket.on('connect', function () {
      log('Socket do gateway conectado.');
      loadInitial();
    });
    socket.on('disconnect', function (reason) {
      setStatus('Socket desconectado: ' + reason, 'warn');
      log('Socket desconectado: ' + reason);
    });
    socket.on('state', function (state) {
      updateState(state);
      log('Estado: ' + state.connection_state + ' | has_qr=' + state.has_qr + ' | has_client=' + state.has_client);
    });
    socket.on('qr', function (payload) {
      log('Evento QR recebido do gateway.');
      renderQr(payload.qrcode, payload.at);
    });
    socket.on('qr-clear', function () {
      log('QR limpo porque a sessão conectou ou mudou de estado.');
    });
    socket.on('pairing-code', function (payload) {
      renderCode(payload.code);
    });

    loadInitial();
    setInterval(loadInitial, 5000);
  </script>
</body>
</html>`;
}

function docsHtml() {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>OpenWA Gateway API</title>
<style>body{font-family:Arial,sans-serif;max-width:900px;margin:30px auto;padding:0 18px;color:#111827}pre{background:#0f172a;color:#e5e7eb;padding:14px;border-radius:12px;overflow:auto}code{background:#f1f5f9;padding:2px 5px;border-radius:6px}</style></head>
<body><h1>OpenWA Gateway API</h1>
<p>Gateway programático compatível com o MVP Flask.</p>
<h2>Rotas</h2>
<ul>
<li><code>GET /</code> ou <code>/qr</code>: tela de QR.</li>
<li><code>GET /healthz</code>: healthcheck Railway, sempre rápido.</li>
<li><code>GET /readyz</code>: estado real do cliente WhatsApp.</li>
<li><code>GET /qr-state</code>: estado do QR e conexão.</li>
<li><code>POST /sendText</code>: envia texto. Body: <code>{"args":["559999999999@c.us","mensagem"]}</code>.</li>
<li><code>POST /:method</code>: chama método do client OpenWA quando existir.</li>
<li><code>POST /</code>: formato compatível: <code>{"method":"sendText","args":[...]}</code>.</li>
</ul>
<h2>Autenticação</h2>
<p>Quando <code>OPENWA_API_KEY</code> estiver definido, envie uma destas opções:</p>
<pre>X-API-KEY: ${API_KEY ? 'sua-chave' : '(não configurado)'}
Authorization: Bearer sua-chave
api_key: sua-chave</pre>
<h2>Teste rápido</h2>
<pre>curl -X POST '${PUBLIC_URL || 'https://SEU-OPENWA.up.railway.app'}/sendText' \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-KEY: sua-chave' \\
  -d '{"args":["55DDDNUMERO@c.us","Teste do gateway OpenWA"]}'</pre>
</body></html>`;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
});

app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

app.get(['/healthz', '/healthz/'], (_req, res) => {
  res.json({ ok: true, service: 'openwa-programmatic-gateway', session_id: SESSION_ID });
});

app.get(['/readyz', '/readyz/'], (_req, res) => {
  const state = publicState();
  res.status(client ? 200 : 503).json(state);
});

app.get(['/qr-state', '/qr-state/'], (_req, res) => {
  res.json({ ...publicState(), qrcode: lastQr, pairing_code: lastPairingCode });
});

app.get(['/', '/qr', '/login'], (_req, res) => {
  res.set('cache-control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.type('html').send(qrPageHtml());
});

app.get(['/api-docs', '/docs'], (_req, res) => {
  res.type('html').send(docsHtml());
});


app.post('/reset-session', requireApiKey, async (_req, res) => {
  try {
    if (client && typeof client.kill === 'function') await client.kill();
  } catch (err) {
    log('Erro ao matar cliente antes do reset:', err?.message || err);
  }

  client = null;
  clearQr(io);

  const sessionDir = path.join(SESSION_DATA_PATH, `_IGNORE_${SESSION_ID}`);
  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      log('Sessão removida:', sessionDir);
    }
  } catch (err) {
    lastError = `Falha ao remover sessão ${sessionDir}: ${err?.message || err}`;
    return res.status(500).json({ ok: false, error: lastError, state: publicState() });
  }

  startOpenWa(io).catch(() => {});
  res.json({ ok: true, message: 'Sessão removida e reinício solicitado.', removed: sessionDir, state: publicState() });
});

app.post('/restart-session', requireApiKey, async (_req, res) => {
  try {
    if (client && typeof client.kill === 'function') {
      await client.kill();
    }
  } catch (err) {
    log('Erro ao matar cliente antes do restart:', err?.message || err);
  }
  client = null;
  clearQr(io);
  startOpenWa(io).catch(() => {});
  res.json({ ok: true, message: 'Restart solicitado.', state: publicState() });
});

app.post('/sendText', requireApiKey, async (req, res) => {
  if (!ensureClient(res)) return;
  const { args } = normalizeArgs(req.body, 'sendText');
  const [to, content] = args;
  if (!to || !content) return res.status(400).json({ ok: false, error: 'missing_args', expected: ['to', 'content'] });
  try {
    const result = await client.sendText(to, content);
    sentMessages += 1;
    emitState(io);
    res.json({ ok: true, response: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

app.post('/', requireApiKey, async (req, res) => {
  const { method, args } = normalizeArgs(req.body);
  if (!method) return res.status(400).json({ ok: false, error: 'missing_method' });
  if (!ensureClient(res)) return;
  try {
    const result = await callClientMethod(method, args);
    if (/^send/i.test(method)) sentMessages += 1;
    emitState(io);
    res.json({ ok: true, method, response: result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ ok: false, method, error: err?.message || String(err) });
  }
});

app.post('/:method', requireApiKey, async (req, res) => {
  const method = req.params.method;
  if (!ensureClient(res)) return;
  const { args } = normalizeArgs(req.body, method);
  try {
    const result = await callClientMethod(method, args);
    if (/^send/i.test(method)) sentMessages += 1;
    emitState(io);
    res.json({ ok: true, method, response: result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ ok: false, method, error: err?.message || String(err) });
  }
});

io.on('connection', (socket) => {
  socket.emit('state', publicState());
  if (lastQr) socket.emit('qr', { qrcode: lastQr, at: lastQrAt, session_id: SESSION_ID });
  if (lastPairingCode) socket.emit('pairing-code', { code: lastPairingCode, at: nowIso(), session_id: SESSION_ID });
});

registerQrEvents(io);

server.listen(PORT, '0.0.0.0', () => {
  log(`Gateway OpenWA escutando em 0.0.0.0:${PORT}`);
  log(`Sessão: ${SESSION_ID} | sessionDataPath: ${SESSION_DATA_PATH}`);
  startOpenWa(io).catch((err) => log('Falha inesperada ao iniciar OpenWA:', err?.message || err));
});

process.on('SIGTERM', async () => {
  log('SIGTERM recebido. Encerrando...');
  try {
    if (client && typeof client.kill === 'function') await client.kill();
  } catch (err) {
    log('Erro ao encerrar cliente:', err?.message || err);
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  log('SIGINT recebido. Encerrando...');
  try {
    if (client && typeof client.kill === 'function') await client.kill();
  } catch (err) {
    log('Erro ao encerrar cliente:', err?.message || err);
  }
  process.exit(0);
});
