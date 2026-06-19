# OpenWA service — gateway compatível sem Chromium

Este service substitui o runtime quebrado do `@open-wa/wa-automate@4.76.0` por um gateway compatível usando Baileys.

Motivo: o OpenWA v4 está travando antes do QR com `TimeoutError: Waiting failed: 30000ms exceeded` depois de carregar o WhatsApp Web. Existe issue recente no repositório do OpenWA com o mesmo comportamento em 4.76.0 e Chrome atual/outdated.

## O que continua igual para o Flask

As rotas principais continuam compatíveis:

- `GET /healthz`
- `GET /readyz`
- `GET /qr`
- `GET /qr-state`
- `POST /sendText` com `{"args":["55DDDNUMERO@c.us","mensagem"]}`
- webhook para `FLASK_WEBHOOK_URL`

## Variáveis

```env
OPENWA_API_KEY=uma-chave-forte
OPENWA_SESSION_ID=lanhouse-demo
OPENWA_PUBLIC_URL=https://SEU-SERVICE.up.railway.app
FLASK_WEBHOOK_URL=https://SEU-FLASK.up.railway.app/webhooks/openwa
OPENWA_WEBHOOK_SECRET=o-mesmo-segredo-do-flask
OPENWA_DATA_DIR=/data
OPENWA_SESSION_DATA_PATH=/data/sessions
```

## Volume Railway

Monte o volume em:

```txt
/data
```

A sessão fica em:

```txt
/data/sessions/<OPENWA_SESSION_ID>
```

## Reset de sessão

```bash
curl -X POST "https://SEU-SERVICE.up.railway.app/reset-session" \
  -H "X-API-KEY: SUA_OPENWA_API_KEY"
```

Depois abra:

```txt
https://SEU-SERVICE.up.railway.app/qr
```
