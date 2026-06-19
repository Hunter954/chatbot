# OpenWA Service no Railway

Esta versão usa um gateway programático em Node.js com `@open-wa/wa-automate@4.76.0`, sem depender da tela original da EASY API para renderizar QR.

## Correção importante desta versão

O Dockerfile não tenta mais criar `/data` no build. No Railway, `/data` é um Volume montado em runtime; tentar criar/chmod esse caminho durante o build pode gerar:

```txt
mkdir: cannot create directory '/data': Permission denied
```

Agora o `server.js` cria `/data/sessions` somente quando o container já está rodando. Se `/data` não estiver gravável, ele usa fallback temporário em `/tmp/openwa-data/sessions` para o serviço não cair, mas nesse caso a sessão do WhatsApp não será persistida após restart.

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

No service OpenWA do Railway, crie um volume montado exatamente em:

```txt
/data
```

A sessão fica salva em `/data/sessions` quando o volume está correto.

## Rotas

```txt
GET  /             Tela própria de QR
GET  /qr           Tela própria de QR
GET  /healthz      Healthcheck rápido para Railway
GET  /readyz       Estado real da sessão WhatsApp
GET  /qr-state     Estado do QR/conexão em JSON
GET  /api-docs     Documentação simples do gateway
POST /sendText     Compatível com o Flask MVP: {"args":["55...@c.us","mensagem"]}
POST /:method      Chama métodos do client OpenWA quando existirem
POST /             Compatível: {"method":"sendText","args":[...]}
```

## Primeiro uso

1. Faça deploy do service OpenWA.
2. Abra a URL pública do OpenWA.
3. Escaneie o QR pelo WhatsApp em **Aparelhos conectados**.
4. Deixe o serviço ligado por pelo menos 5 minutos.
5. Depois teste `/readyz` e o envio de mensagem.
