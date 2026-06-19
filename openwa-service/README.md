# OpenWA Service no Railway

Esta versão substitui a tela/CLI da EASY API por um gateway programático em Node.js usando `@open-wa/wa-automate@4.76.0`.

## Por que mudou

A tela original do OpenWA estava entregando um `data:image/png;base64` que podia virar imagem de loading/spinner ou texto bruto no navegador. Agora o QR é capturado diretamente do evento oficial `qr` do OpenWA e enviado para a nossa página via Socket.IO.

## Arquivos principais

- `server.js`: gateway HTTP, tela de QR, healthcheck, webhook para Flask e endpoints compatíveis.
- `Dockerfile`: build do serviço OpenWA no Railway.
- `package.json`: dependências Node.

## Variáveis do service OpenWA

```env
OPENWA_API_KEY=uma-chave-forte
OPENWA_SESSION_ID=lanhouse-demo
OPENWA_PUBLIC_URL=https://SEU-OPENWA.up.railway.app
FLASK_WEBHOOK_URL=https://SEU-FLASK.up.railway.app/webhooks/openwa
OPENWA_WEBHOOK_SECRET=o-mesmo-segredo-do-flask
OPENWA_DATA_DIR=/data
OPENWA_SESSION_DATA_PATH=/data/sessions
```

## Volume obrigatório

No service OpenWA do Railway, crie um volume montado em:

```txt
/data
```

A sessão fica salva em `/data/sessions`. Sem volume, você terá que escanear o QR novamente após restart/redeploy.

## Rotas

```txt
GET  /             Tela de QR
GET  /qr           Tela de QR
GET  /healthz      Healthcheck rápido para Railway
GET  /readyz       Estado real da sessão WhatsApp
GET  /qr-state     Estado do QR/conexão em JSON
GET  /api-docs     Documentação simples do gateway
POST /sendText     Compatível com o Flask MVP: {"args":["55...@c.us","mensagem"]}
POST /:method      Chama métodos do client OpenWA quando existirem
POST /             Compatível: {"method":"sendText","args":[...]}
```

## Teste de envio

```bash
curl -X POST "https://SEU-OPENWA.up.railway.app/sendText" \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: sua-chave" \
  -d '{"args":["55DDDNUMERO@c.us","Teste do gateway OpenWA"]}'
```

## Primeiro uso

1. Faça deploy do service OpenWA.
2. Abra a URL pública do OpenWA.
3. Escaneie o QR pelo WhatsApp em **Aparelhos conectados**.
4. Deixe o serviço ligado por pelo menos 5 minutos.
5. Depois teste `/readyz` e o envio de mensagem.

## Observação

O endpoint `/readyz` pode retornar `503` enquanto o WhatsApp não estiver autenticado. Isso é esperado. O Railway deve usar `/healthz`, que sempre responde rápido quando o container está vivo.
