# Troubleshooting Railway — WhatsApp gateway

## QR não aparece no OpenWA v4

O problema observado nos logs foi:

```txt
TimeoutError: Waiting failed: 30000ms exceeded
```

O OpenWA carregava a página, passava por `Page loaded`, mas morria antes de emitir QR.

A solução prática aplicada aqui foi trocar o runtime do `openwa-service` para um gateway compatível via Baileys, preservando as rotas usadas pelo Flask (`/sendText`, `/qr`, `/qr-state`, `/healthz`, `/readyz`).

## Conferir estado

```txt
https://SEU-SERVICE.up.railway.app/qr-state
```

Campos importantes:

- `engine`: deve ser `baileys`.
- `has_qr`: deve virar `true` quando o QR for gerado.
- `connection_state`: `STARTING`, `READY`, `DISCONNECTED`, `LOGGED_OUT` ou `ERROR`.
- `last_error`: erro detalhado, se existir.

## Resetar sessão

```bash
curl -X POST "https://SEU-SERVICE.up.railway.app/reset-session" \
  -H "X-API-KEY: SUA_OPENWA_API_KEY"
```

## Testar envio

```bash
curl -X POST "https://SEU-SERVICE.up.railway.app/sendText" \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: SUA_OPENWA_API_KEY" \
  -d '{"args":["55DDDNUMERO@c.us","Teste"]}'
```
