# OpenWA Service - Railway

Este service roda o gateway programático do OpenWA usado pelo Flask.

## O que esta versão corrige

- Instala `procps` no Dockerfile para disponibilizar o comando `ps`.
- Corrige o crash `Error: spawn ps ENOENT` que impedia o QR de aparecer.
- Força `useChrome: true`, conforme recomendação do próprio OpenWA para sessões Multi Device.
- Define `qrTimeout: 0` e `authTimeout: 0`, evitando que a sessão morra antes de você escanear.
- Mantém a sessão persistente em `/data/sessions` quando o volume Railway estiver montado.
- Mantém a tela própria em `/` e `/qr`.
- Adiciona `POST /reset-session` para apagar a sessão atual e gerar QR limpo quando necessário.

## Variáveis principais

```env
OPENWA_API_KEY=uma-chave-forte
OPENWA_SESSION_ID=lanhouse-demo
OPENWA_PUBLIC_URL=https://SEU-OPENWA.up.railway.app
FLASK_WEBHOOK_URL=https://SEU-FLASK.up.railway.app/webhooks/openwa
OPENWA_WEBHOOK_SECRET=o-mesmo-segredo-do-flask
OPENWA_DATA_DIR=/data
OPENWA_SESSION_DATA_PATH=/data/sessions
OPENWA_USE_CHROME=true
OPENWA_QR_TIMEOUT=0
OPENWA_AUTH_TIMEOUT=0
```

## Volume

No Railway, monte um volume em:

```txt
/data
```

## Rotas

```txt
GET  /             Tela do QR
GET  /qr           Tela do QR
GET  /healthz      Healthcheck rápido do Railway
GET  /readyz       Estado real da sessão
GET  /qr-state     Estado + qrcode/pairing code, se existir
POST /reset-session Apaga a sessão atual e força novo QR
POST /sendText     Envia mensagem usando o client OpenWA
```

## Reset da sessão

Se a página ficar sem QR depois do deploy, chame:

```bash
curl -X POST "https://SEU-OPENWA.up.railway.app/reset-session" \
  -H "X-API-KEY: SUA_CHAVE"
```

Depois abra:

```txt
https://SEU-OPENWA.up.railway.app/qr
```

