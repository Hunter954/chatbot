# Debug de mensagens WhatsApp -> Flask

Use isto quando o WhatsApp conecta, mas o painel Flask continua zerado.

## 1. Ver se o gateway recebeu a mensagem

Abra no navegador:

```txt
https://SEU-OPENWA.up.railway.app/debug/inbox?api_key=SUA_OPENWA_API_KEY
```

Campos importantes:

- `counters.raw_message_events`: eventos crus recebidos pelo Baileys.
- `counters.inbound_messages`: mensagens encaminhadas para o Flask.
- `counters.ignored_from_me`: mensagens ignoradas porque foram enviadas pelo próprio número conectado.
- `last_webhook_status`: deve ser `200`.
- `last_webhook_error`: deve ficar vazio.
- `recent_inbound`: últimas mensagens que o gateway viu.

Se `ignored_from_me` subir, você está testando pelo mesmo WhatsApp conectado. Use outro número para mandar mensagem para o bot.

## 2. Testar o webhook sem depender de mensagem real

```bash
curl -X POST "https://SEU-OPENWA.up.railway.app/test-webhook" \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: SUA_OPENWA_API_KEY" \
  -d '{"from":"5511999999999@c.us","body":"teste webhook"}'
```

Depois abra o painel Flask:

```txt
https://SEU-FLASK.up.railway.app/admin?token=SEU_ADMIN_TOKEN
```

Ou o debug do Flask:

```txt
https://SEU-FLASK.up.railway.app/api/v1/debug/webhook?admin_token=SEU_ADMIN_TOKEN
```

## 3. Se o gateway recebeu, mas o Flask não recebeu

Confira no service OpenWA/Baileys:

```env
FLASK_WEBHOOK_URL=https://SEU-FLASK.up.railway.app/webhooks/openwa
OPENWA_WEBHOOK_SECRET=o-mesmo-segredo-do-flask
```

Confira no service Flask:

```env
OPENWA_WEBHOOK_SECRET=o-mesmo-segredo-do-openwa
ADMIN_API_TOKEN=seu-token-admin
```

O valor de `OPENWA_WEBHOOK_SECRET` precisa ser idêntico nos dois serviços.
