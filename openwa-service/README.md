# Serviço OpenWA no Railway

Este diretório é opcional, mas deixa o repositório pronto para ter dois services no Railway:

1. `flask-bot`: usa o `Dockerfile` da raiz.
2. `openwa-api`: usa `openwa-service/Dockerfile`.

Variáveis do service `openwa-api`:

```env
OPENWA_API_KEY=crie-uma-chave-grande
OPENWA_SESSION_ID=lanhouse-demo
OPENWA_PUBLIC_URL=https://SEU-OPENWA.up.railway.app
FLASK_WEBHOOK_URL=https://SEU-FLASK.up.railway.app/webhooks/openwa
OPENWA_WEBHOOK_SECRET=o-mesmo-segredo-configurado-no-flask
```

Volume recomendado para o OpenWA: `/app/data` quando o serviço/imagem usada gravar sessão, mídia ou SQLite nesse caminho. Para o projeto `@open-wa/wa-automate`, também é possível usar `WA_SESSION_DATA` como variável de ambiente quando você já tiver uma sessão persistente.

Depois do primeiro deploy, abra os logs do `openwa-api`, escaneie o QR Code do WhatsApp e teste o envio pela API Explorer em `/api-docs/`.
