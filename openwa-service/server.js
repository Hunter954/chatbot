import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import P from 'pino';
import QRCode from 'qrcode';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';

const PORT = Number(process.env.PORT || 8080);
const SESSION_ID = process.env.OPENWA_SESSION_ID || process.env.SESSION_ID || 'lanhouse-demo';
const API_KEY = process.env.OPENWA_API_KEY || '';
const WEBHOOK_URL = process.env.FLASK_WEBHOOK_URL || process.env.OPENWA_WEBHOOK_URL || '';
const WEBHOOK_SECRET = process.env.OPENWA_WEBHOOK_SECRET || '';
const PUBLIC_URL = process.env.OPENWA_PUBLIC_URL || '';
const IGNORE_GROUPS = String(process.env.OPENWA_IGNORE_GROUPS || 'false').toLowerCase() === 'true';
const QR_MAX_AGE_MS = Number(process.env.OPENWA_QR_MAX_AGE_MS || 120_000);
const START_RETRY_MS = Number(process.env.OPENWA_START_RETRY_MS || 5_000);
const PAIRING_PHONE = String(process.env.OPENWA_PAIRING_PHONE || '').replace(/\D/g, '');
const LOG_LEVEL = process.env.OPENWA_LOG_LEVEL || 'silent';

let DATA_DIR = process.env.OPENWA_DATA_DIR || '/data';
let SESSION_DATA_PATH = process.env.OPENWA_SESSION_DATA_PATH || path.join(DATA_DIR, 'sessions');
let AUTH_DIR = path.join(SESSION_DATA_PATH, SESSION_ID);

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function ensureWritableSessionPath() {
  try {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    fs.accessSync(AUTH_DIR, fs.constants.W_OK);
  } catch (err) {
    const fallbackDataDir = '/tmp/openwa-data';
    DATA_DIR = fallbackDataDir;
    SESSION_DATA_PATH = path.join(fallbackDataDir, 'sessions');
    AUTH_DIR = path.join(SESSION_DATA_PATH, SESSION_ID);
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    log('AVISO: /data sem escrita. Usando sessão temporária:', AUTH_DIR, 'erro:', err?.message || err);
  }
}

ensureWritableSessionPath();

let sock = null;
let starting = false;
let startedAt = new Date().toISOString();
let lastQr = '';
let lastRawQr = '';
let lastQrAt = null;
let lastPairingCode = '';
let connectionState = 'BOOTING';
let lastError = '';
let lastDisconnectReason = '';
let lastWebhookError = '';
let receivedMessages = 0;
let sentMessages = 0;
let reconnectTimer = null;
let saveCredsFn = null;

function nowIso() {
  return new Date().toISOString();
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

function qrExpired() {
  return lastQrAt ? Date.now() - new Date(lastQrAt).getTime() > QR_MAX_AGE_MS : false;
}

function publicState() {
  return {
    ok: true,
    service: 'openwa-compatible-baileys-gateway',
    engine: 'baileys',
    session_id: SESSION_ID,
    started_at: startedAt,
    connection_state: connectionState,
    has_client: Boolean(sock && connectionState === 'READY'),
    starting,
    has_qr: Boolean(lastQr),
    qr_at: lastQrAt,
    qr_expired: qrExpired(),
    has_pairing_code: Boolean(lastPairingCode),
    public_url: PUBLIC_URL,
    session_data_path: SESSION_DATA_PATH,
    auth_dir: AUTH_DIR,
    webhook_configured: Boolean(WEBHOOK_URL),
    last_error: lastError,
    last_disconnect_reason: lastDisconnectReason,
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
  log('Estado WhatsApp:', connectionState);
  emitState(io);
}

async function setQr(io, rawQr) {
  if (!rawQr || typeof rawQr !== 'string') return;
  lastRawQr = rawQr;
  lastQr = await QRCode.toDataURL(rawQr, {
    errorCorrectionLevel: 'M',
    margin: 2,
    scale: 8,
    color: { dark: '#111827', light: '#ffffff' },
  });
  lastQrAt = nowIso();
  lastPairingCode = '';
  log('QR real recebido via Baileys. DataURL chars:', lastQr.length);
  io.emit('qr', { qrcode: lastQr, raw_qr: lastRawQr, at: lastQrAt, session_id: SESSION_ID });
  emitState(io);
}

function clearQr(io) {
  lastQr = '';
  lastRawQr = '';
  lastQrAt = null;
  lastPairingCode = '';
  io.emit('qr-clear', { at: nowIso(), session_id: SESSION_ID });
  emitState(io);
}

function scheduleReconnect(io, delay = START_RETRY_MS) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startWhatsApp(io).catch((err) => {
      lastError = err?.stack || err?.message || String(err);
      setConnectionState(io, 'ERROR');
    });
  }, delay);
}

function toBaileysJid(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  if (input.endsWith('@s.whatsapp.net') || input.endsWith('@g.us') || input.endsWith('@broadcast')) return input;
  if (input.endsWith('@c.us')) return input.replace('@c.us', '@s.whatsapp.net');
  const digits = input.replace(/\D/g, '');
  if (!digits) return input;
  return `${digits}@s.whatsapp.net`;
}

function toOpenWaJid(jid) {
  const input = String(jid || '').trim();
  if (input.endsWith('@s.whatsapp.net')) return input.replace('@s.whatsapp.net', '@c.us');
  return input;
}

function extractText(message) {
  const m = message?.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.title ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.templateButtonReplyMessage?.selectedDisplayText ||
    m.templateButtonReplyMessage?.selectedId ||
    ''
  );
}

function detectType(message) {
  const m = message?.message || {};
  const keys = Object.keys(m);
  if (keys.length === 0) return 'unknown';
  if (m.conversation || m.extendedTextMessage) return 'text';
  if (m.imageMessage) return 'image';
  if (m.videoMessage) return 'video';
  if (m.audioMessage) return 'audio';
  if (m.documentMessage) return 'document';
  return keys[0];
}

function normalizeIncomingMessage(msg) {
  const remoteJid = msg?.key?.remoteJid || '';
  const fromMe = Boolean(msg?.key?.fromMe);
  const isGroup = remoteJid.endsWith('@g.us');
  const participant = msg?.key?.participant || '';
  const fromJid = isGroup ? participant || remoteJid : remoteJid;
  const id = msg?.key?.id || '';
  const body = extractText(msg);
  const type = detectType(msg);
  const timestampRaw = msg?.messageTimestamp;
  const timestamp = typeof timestampRaw === 'number' ? timestampRaw : Number(timestampRaw || 0) || undefined;

  return {
    id,
    messageId: id,
    from: toOpenWaJid(fromJid),
    chatId: toOpenWaJid(remoteJid),
    to: '',
    body,
    text: body,
    caption: body,
    type,
    timestamp,
    t: timestamp,
    isGroupMsg: isGroup,
    isGroup,
    fromMe,
    isSentByMe: fromMe,
    notifyName: msg?.pushName || '',
    senderName: msg?.pushName || '',
    sender: {
      id: toOpenWaJid(fromJid),
      pushname: msg?.pushName || '',
      name: msg?.pushName || '',
    },
    raw: msg,
  };
}

async function postWebhook(message) {
  if (!WEBHOOK_URL) return;
  if (IGNORE_GROUPS && (message?.isGroupMsg || String(message?.chatId || message?.from || '').endsWith('@g.us'))) return;

  const payload = {
    event: 'message',
    sessionId: SESSION_ID,
    engine: 'baileys',
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

async function startWhatsApp(io) {
  if (starting) return;
  starting = true;
  lastError = '';
  setConnectionState(io, 'STARTING');

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    saveCredsFn = saveCreds;

    let version;
    try {
      const latest = await fetchLatestBaileysVersion();
      version = latest.version;
      log('Baileys WhatsApp Web version:', version.join('.'), 'latest:', latest.isLatest);
    } catch (err) {
      log('Não consegui buscar versão mais recente do WhatsApp Web. Usando default do Baileys:', err?.message || err);
    }

    sock = makeWASocket({
      version,
      auth: state,
      logger: P({ level: LOG_LEVEL }),
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      browser: ['OpenWA-Compatible-Gateway', 'Chrome', '1.0.0'],
      generateHighQualityLinkPreview: false,
    });

    sock.ev.on('creds.update', saveCredsFn);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        await setQr(io, qr);
        if (PAIRING_PHONE && !state.creds?.registered && typeof sock.requestPairingCode === 'function') {
          try {
            const code = await sock.requestPairingCode(PAIRING_PHONE);
            lastPairingCode = String(code || '').trim();
            io.emit('pairing-code', { code: lastPairingCode, at: nowIso(), session_id: SESSION_ID });
            emitState(io);
            log('Código de pareamento gerado para OPENWA_PAIRING_PHONE.');
          } catch (err) {
            log('Falha ao gerar código de pareamento:', err?.message || err);
          }
        }
      }

      if (connection === 'connecting') setConnectionState(io, 'STARTING');

      if (connection === 'open') {
        clearQr(io);
        lastDisconnectReason = '';
        setConnectionState(io, 'READY');
        log('WhatsApp conectado via Baileys.');
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        lastDisconnectReason = `${statusCode || ''} ${lastDisconnect?.error?.message || ''}`.trim();
        sock = null;
        setConnectionState(io, statusCode === DisconnectReason.loggedOut ? 'LOGGED_OUT' : 'DISCONNECTED');
        log('Conexão WhatsApp fechada:', lastDisconnectReason || 'sem motivo');

        if (statusCode === DisconnectReason.loggedOut) {
          clearQr(io);
          lastError = 'Sessão deslogada. Use POST /reset-session e abra /qr novamente.';
          emitState(io);
          return;
        }
        scheduleReconnect(io, 1500);
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (!Array.isArray(messages) || type !== 'notify') return;
      for (const msg of messages) {
        const normalized = normalizeIncomingMessage(msg);
        if (normalized.fromMe || normalized.isSentByMe) continue;
        if (!normalized.body && normalized.type === 'unknown') continue;
        receivedMessages += 1;
        await postWebhook(normalized);
      }
      emitState(io);
    });
  } catch (err) {
    sock = null;
    lastError = err?.stack || err?.message || String(err);
    setConnectionState(io, 'ERROR');
    log('Erro ao iniciar gateway Baileys:', lastError);
    scheduleReconnect(io, START_RETRY_MS);
  } finally {
    starting = false;
    emitState(io);
  }
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
  if (sock && connectionState === 'READY') return true;
  res.status(503).json({
    ok: false,
    error: 'whatsapp_not_ready',
    message: 'O WhatsApp ainda não está autenticado. Abra /qr e escaneie o QR Code.',
    state: publicState(),
  });
  return false;
}

async function sendText(to, content) {
  if (!sock) throw new Error('WhatsApp não está pronto');
  const jid = toBaileysJid(to);
  const result = await sock.sendMessage(jid, { text: String(content) });
  sentMessages += 1;
  return {
    id: result?.key?.id || '',
    to: toOpenWaJid(jid),
    chatId: toOpenWaJid(jid),
    body: String(content),
    raw: result,
  };
}

async function callCompatMethod(method, args) {
  if (/^sendText$/i.test(method)) {
    const [to, content] = args;
    if (!to || !content) {
      const err = new Error('missing_args: esperado args [to, content]');
      err.statusCode = 400;
      throw err;
    }
    return sendText(to, content);
  }

  const err = new Error(`Método não suportado neste gateway compatível: ${method}. Por enquanto use sendText.`);
  err.statusCode = 404;
  throw err;
}

async function resetAuthDir() {
  try {
    if (sock?.logout && connectionState === 'READY') {
      await sock.logout().catch(() => {});
    }
  } catch {}
  sock = null;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

function qrPageHtml() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>WhatsApp Gateway - QR Code</title>
  <style>
    *{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#f5f7fb;color:#111827}.wrap{max-width:980px;margin:0 auto;padding:24px 14px 48px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 16px 45px rgba(15,23,42,.10);padding:24px}h1{margin:0 0 8px;font-size:28px}p{color:#4b5563;line-height:1.45}.grid{display:grid;grid-template-columns:minmax(280px,410px) 1fr;gap:28px;align-items:start;margin-top:22px}.qrbox{min-height:410px;border:2px dashed #cbd5e1;border-radius:16px;display:flex;align-items:center;justify-content:center;padding:16px;background:#fbfdff}#qr{display:none;width:100%;max-width:370px;height:auto;background:#fff;border-radius:12px;image-rendering:pixelated}#placeholder{text-align:center;color:#64748b}.spinner{width:54px;height:54px;border:7px solid #dbeafe;border-top-color:#2563eb;border-radius:999px;animation:spin 1s linear infinite;margin:0 auto 14px}@keyframes spin{to{transform:rotate(360deg)}}.status{padding:12px 14px;border-radius:12px;margin:14px 0;font-weight:700}.info{background:#eff6ff;color:#1d4ed8}.ok{background:#ecfdf5;color:#047857}.warn{background:#fffbeb;color:#92400e}.err{background:#fef2f2;color:#b91c1c}#pairing-code{display:none;margin-top:12px;font-size:28px;letter-spacing:4px;font-weight:800;background:#111827;color:#fff;padding:14px;border-radius:12px;text-align:center}.steps{margin:16px 0;padding-left:18px;color:#374151}.steps li{margin:8px 0}.links a{display:inline-block;margin-right:10px;margin-top:8px;color:#2563eb;text-decoration:none;font-weight:700}textarea{width:100%;min-height:150px;margin-top:14px;border:1px solid #d1d5db;border-radius:12px;padding:12px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}.small{font-size:13px;color:#6b7280}code{background:#f1f5f9;padding:2px 5px;border-radius:6px}@media(max-width:800px){.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <div class="wrap"><div class="card">
    <h1>WhatsApp Gateway - QR Code</h1>
    <p>Esta tela usa um gateway compatível com OpenWA, mas sem Chromium. O QR vem do evento <code>connection.update.qr</code>, então ele não depende mais da tela quebrada do OpenWA v4.</p>
    <div id="status" class="status info">Conectando ao gateway...</div>
    <div class="grid"><div><div class="qrbox"><img id="qr" alt="QR Code do WhatsApp"/><div id="placeholder"><div class="spinner"></div><strong>Aguardando QR Code real...</strong><div class="small">Se demorar mais de 30 segundos, clique em Estado QR e veja last_error.</div></div></div><div id="pairing-code"></div></div>
    <div><h2>Como conectar</h2><ol class="steps"><li>Abra o WhatsApp no celular.</li><li>Toque em <b>Aparelhos conectados</b>.</li><li>Toque em <b>Conectar aparelho</b>.</li><li>Escaneie o QR Code que aparecer aqui.</li><li>Depois de conectar, deixe o serviço ligado por pelo menos 5 minutos.</li></ol><div class="links"><a href="/healthz" target="_blank">Health</a><a href="/readyz" target="_blank">Readiness</a><a href="/qr-state" target="_blank">Estado QR</a><a href="/api-docs" target="_blank">API Docs</a></div><textarea id="log" readonly></textarea></div></div>
  </div></div>
  <script src="/socket.io/socket.io.js"></script>
  <script>
    const statusEl=document.getElementById('status'),qrEl=document.getElementById('qr'),placeholderEl=document.getElementById('placeholder'),codeEl=document.getElementById('pairing-code'),logEl=document.getElementById('log');
    function setStatus(text,kind){statusEl.className='status '+(kind||'info');statusEl.textContent=text}
    function log(message){const line='['+new Date().toLocaleTimeString()+'] '+message;logEl.value=(line+'\n'+logEl.value).slice(0,5000)}
    function renderQr(qrcode,at){if(!qrcode||!qrcode.startsWith('data:image/'))return;qrEl.onload=function(){placeholderEl.style.display='none';qrEl.style.display='block';codeEl.style.display='none';setStatus('QR Code real recebido. Escaneie pelo WhatsApp antes de expirar.','ok');log('QR exibido. '+qrEl.naturalWidth+'x'+qrEl.naturalHeight+' em '+(at||'agora'))};qrEl.onerror=function(){setStatus('Recebi QR, mas o navegador não renderizou.','err')};qrEl.src=qrcode}
    function renderCode(code){if(!code)return;codeEl.textContent=code;codeEl.style.display='block';placeholderEl.style.display='none';qrEl.style.display='none';setStatus('Código de pareamento recebido.','ok')}
    function updateState(state){if(!state)return;if(state.has_qr){setStatus('QR disponível. Escaneie agora.','ok')}else if(state.has_client){setStatus('WhatsApp conectado/autenticado.','ok')}else if(state.connection_state==='ERROR'||state.connection_state==='LOGGED_OUT'){setStatus('Estado: '+state.connection_state+'. '+(state.last_error||state.last_disconnect_reason||''),'err')}else{setStatus('Estado: '+state.connection_state+'. Aguardando QR...','info')}}
    async function loadInitial(){try{const r=await fetch('/qr-state',{cache:'no-store'});const d=await r.json();updateState(d);if(d.qrcode)renderQr(d.qrcode,d.qr_at);if(d.pairing_code)renderCode(d.pairing_code);log('Estado inicial: '+d.connection_state+' | engine='+d.engine+' | has_qr='+d.has_qr)}catch(e){log('Falha ao carregar estado: '+e.message)}}
    const socket=io({transports:['websocket','polling'],reconnection:true});socket.on('connect',()=>{log('Socket conectado.');loadInitial()});socket.on('disconnect',r=>{setStatus('Socket desconectado: '+r,'warn');log('Socket desconectado: '+r)});socket.on('state',s=>{updateState(s);log('Estado: '+s.connection_state+' | has_qr='+s.has_qr+' | has_client='+s.has_client)});socket.on('qr',p=>{log('Evento QR recebido.');renderQr(p.qrcode,p.at)});socket.on('qr-clear',()=>log('QR limpo.'));socket.on('pairing-code',p=>renderCode(p.code));loadInitial();setInterval(loadInitial,5000);
  </script>
</body>
</html>`;
}

function docsHtml() {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WhatsApp Gateway API</title><style>body{font-family:Arial,sans-serif;max-width:900px;margin:30px auto;padding:0 18px;color:#111827}pre{background:#0f172a;color:#e5e7eb;padding:14px;border-radius:12px;overflow:auto}code{background:#f1f5f9;padding:2px 5px;border-radius:6px}</style></head><body><h1>WhatsApp Gateway API</h1><p>Gateway compatível com o MVP Flask/OpenWA, usando Baileys para QR estável sem Chromium.</p><h2>Rotas</h2><ul><li><code>GET /qr</code>: tela de QR.</li><li><code>GET /healthz</code>: healthcheck Railway.</li><li><code>GET /readyz</code>: estado real.</li><li><code>GET /qr-state</code>: estado + qrcode.</li><li><code>POST /sendText</code>: <code>{"args":["55DDDNUMERO@c.us","mensagem"]}</code>.</li><li><code>POST /reset-session</code>: limpa sessão e força QR novo.</li></ul><pre>curl -X POST '${PUBLIC_URL || 'https://SEU-SERVICE.up.railway.app'}/sendText' \\\n  -H 'Content-Type: application/json' \\\n  -H 'X-API-KEY: sua-chave' \\\n  -d '{"args":["55DDDNUMERO@c.us","Teste"]}'</pre></body></html>`;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, transports: ['websocket', 'polling'] });

app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

app.get(['/healthz', '/healthz/'], (_req, res) => res.json({ ok: true, service: 'openwa-compatible-baileys-gateway', engine: 'baileys', session_id: SESSION_ID }));
app.get(['/readyz', '/readyz/'], (_req, res) => res.status(connectionState === 'READY' ? 200 : 503).json(publicState()));
app.get(['/qr-state', '/qr-state/'], (_req, res) => res.json({ ...publicState(), qrcode: lastQr, raw_qr: lastRawQr, pairing_code: lastPairingCode }));
app.get(['/', '/qr', '/login'], (_req, res) => res.set('cache-control', 'no-store').type('html').send(qrPageHtml()));
app.get(['/api-docs', '/docs'], (_req, res) => res.type('html').send(docsHtml()));

app.post('/reset-session', requireApiKey, async (_req, res) => {
  await resetAuthDir();
  clearQr(io);
  lastError = '';
  lastDisconnectReason = '';
  setConnectionState(io, 'STARTING');
  startWhatsApp(io).catch(() => {});
  res.json({ ok: true, message: 'Sessão removida e reinício solicitado.', removed: AUTH_DIR, state: publicState() });
});

app.post('/restart-session', requireApiKey, async (_req, res) => {
  sock = null;
  clearQr(io);
  startWhatsApp(io).catch(() => {});
  res.json({ ok: true, message: 'Restart solicitado.', state: publicState() });
});

app.post('/sendText', requireApiKey, async (req, res) => {
  if (!ensureClient(res)) return;
  const { args } = normalizeArgs(req.body, 'sendText');
  const [to, content] = args;
  if (!to || !content) return res.status(400).json({ ok: false, error: 'missing_args', expected: ['to', 'content'] });
  try {
    const result = await sendText(to, content);
    emitState(io);
    res.json({ ok: true, response: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

app.post('/', requireApiKey, async (req, res) => {
  if (!ensureClient(res)) return;
  const { method, args } = normalizeArgs(req.body);
  if (!method) return res.status(400).json({ ok: false, error: 'missing_method' });
  try {
    const result = await callCompatMethod(method, args);
    emitState(io);
    res.json({ ok: true, method, response: result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ ok: false, method, error: err?.message || String(err) });
  }
});

app.post('/:method', requireApiKey, async (req, res) => {
  if (!ensureClient(res)) return;
  const { method } = req.params;
  const { args } = normalizeArgs(req.body, method);
  try {
    const result = await callCompatMethod(method, args);
    emitState(io);
    res.json({ ok: true, method, response: result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ ok: false, method, error: err?.message || String(err) });
  }
});

io.on('connection', (socket) => {
  socket.emit('state', publicState());
  if (lastQr) socket.emit('qr', { qrcode: lastQr, raw_qr: lastRawQr, at: lastQrAt, session_id: SESSION_ID });
  if (lastPairingCode) socket.emit('pairing-code', { code: lastPairingCode, at: nowIso(), session_id: SESSION_ID });
});

server.listen(PORT, '0.0.0.0', () => {
  log(`Gateway WhatsApp compatível OpenWA escutando em 0.0.0.0:${PORT}`);
  log(`Sessão: ${SESSION_ID} | authDir: ${AUTH_DIR}`);
  startWhatsApp(io).catch((err) => log('Falha inesperada ao iniciar WhatsApp:', err?.message || err));
});

async function shutdown(signal) {
  log(`${signal} recebido. Encerrando...`);
  try { if (sock?.end) sock.end(); } catch {}
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  lastError = err?.stack || err?.message || String(err);
  log('uncaughtException:', lastError);
});
process.on('unhandledRejection', (reason) => {
  lastError = reason?.stack || reason?.message || String(reason);
  log('unhandledRejection:', lastError);
});
