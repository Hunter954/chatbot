# OpenWA Programmatic Gateway - Railway

Este serviço roda o OpenWA via `create()` e expõe uma tela própria de QR em `/qr`.

## Correção deste patch

O Railway/OpenWA estava chegando em `Page loaded`, mas depois caía com:

```txt
TimeoutError: Waiting failed: 30000ms exceeded
```

Nos logs, o próprio OpenWA avisou:

```txt
Using custom chromium args with multi device will cause issues! Please remove them
```

Por isso o `server.js` agora **não envia `browserArgs` nem `chromiumArgs` por padrão**. A imagem `openwa/wa-automate` já vem preparada para rodar Chrome/Chromium.

## Variáveis principais

```env
OPENWA_SESSION_ID=lanhouse-demo
OPENWA_API_KEY=sua-chave
OPENWA_PUBLIC_URL=https://seu-openwa.up.railway.app
FLASK_WEBHOOK_URL=https://seu-flask.up.railway.app/webhooks/openwa
OPENWA_WEBHOOK_SECRET=mesmo-segredo-do-flask
OPENWA_SESSION_DATA_PATH=/data/sessions
```

Monte o volume do Railway em `/data`.

## Rotas

- `/qr` ou `/`: tela do QR.
- `/healthz`: healthcheck rápido do Railway.
- `/readyz`: estado real do WhatsApp.
- `/qr-state`: debug do QR/conexão.
- `POST /reset-session`: limpa a sessão atual. Requer `X-API-KEY` se `OPENWA_API_KEY` estiver definido.
- `POST /sendText`: compatível com o Flask.

## Observação

Não ative `OPENWA_USE_CUSTOM_CHROMIUM_ARGS=true` no Railway, a não ser para teste pontual.
