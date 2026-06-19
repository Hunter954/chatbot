# Troubleshooting OpenWA no Railway

## 1. Healthcheck falhando

Use `/healthz` como healthcheck. Ele só verifica se o gateway está vivo.

`/readyz` mostra o estado real do WhatsApp e pode retornar `503` antes do QR ser escaneado. Não use `/readyz` como healthcheck do Railway.

## 2. QR aparece como spinner ou imagem azul

Isso acontecia na tela original da EASY API. Esta versão não usa mais essa tela. O QR agora vem diretamente do evento `qr` do `@open-wa/wa-automate`.

Abra:

```txt
https://SEU-OPENWA.up.railway.app/
```

ou:

```txt
https://SEU-OPENWA.up.railway.app/qr
```

Se ainda aparecer apenas carregando, abra:

```txt
https://SEU-OPENWA.up.railway.app/qr-state
```

Veja os campos:

```json
{
  "connection_state": "...",
  "has_qr": true,
  "has_client": false,
  "last_error": "..."
}
```

## 3. Sessão perde login após deploy

Confirme que existe volume no service OpenWA montado exatamente em:

```txt
/data
```

A sessão fica em:

```txt
/data/sessions
```

## 4. Variáveis obrigatórias

```env
OPENWA_API_KEY=uma-chave-forte
OPENWA_SESSION_ID=lanhouse-demo
OPENWA_PUBLIC_URL=https://SEU-OPENWA.up.railway.app
FLASK_WEBHOOK_URL=https://SEU-FLASK.up.railway.app/webhooks/openwa
OPENWA_WEBHOOK_SECRET=o-mesmo-segredo-do-flask
OPENWA_DATA_DIR=/data
OPENWA_SESSION_DATA_PATH=/data/sessions
```

No Flask, use:

```env
OPENWA_BASE_URL=https://SEU-OPENWA.up.railway.app
OPENWA_API_KEY=mesma-chave-do-openwa
OPENWA_WEBHOOK_SECRET=o-mesmo-segredo-do-openwa
```

## 5. Como testar envio depois de escanear

```bash
curl -X POST "https://SEU-OPENWA.up.railway.app/sendText" \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: sua-chave" \
  -d '{"args":["55DDDNUMERO@c.us","Teste"]}'
```

## 6. Webhook para o Flask

Quando chegar mensagem, o gateway envia para:

```txt
FLASK_WEBHOOK_URL
```

com os headers:

```txt
X-Webhook-Secret: OPENWA_WEBHOOK_SECRET
X-OpenWA-Webhook-Secret: OPENWA_WEBHOOK_SECRET
```

O parser do MVP Flask aceita o payload em `data`, então ele continua compatível.

## 7. Logs esperados

No primeiro boot você deve ver algo como:

```txt
Gateway OpenWA escutando em 0.0.0.0:8080
Sessão: lanhouse-demo | sessionDataPath: /data/sessions
Iniciando OpenWA programático
QR recebido via qr.**
```

Depois de conectar:

```txt
OpenWA autenticado e cliente pronto.
Estado OpenWA: CONNECTED
```

## 8. Build falha com `mkdir: cannot create directory '/data': Permission denied`

Esse erro acontece durante o build quando o Dockerfile tenta criar `/data` antes do Railway montar o Volume. O Volume só existe corretamente em runtime, não no build.

A correção atual remove qualquer `mkdir/chmod /data` do Dockerfile. O `server.js` cria `/data/sessions` apenas quando o container já está rodando. Se `/data` não estiver gravável, ele cai temporariamente para `/tmp/openwa-data/sessions` para o serviço não morrer, mas o login do WhatsApp não será persistente até o volume ser corrigido.

Mantenha o Volume do Railway montado em:

```txt
/data
```
