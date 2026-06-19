# OpenWA no Railway

Este serviço roda o OpenWA/EASY API separado do Flask.

## Arquivos importantes

- `openwa-service/Dockerfile`: imagem do serviço OpenWA.
- `openwa-service/start-openwa.sh`: inicialização, webhook, sessão persistente e proxy.
- `openwa-service/health-proxy.js`: responde `/healthz` para o Railway e repassa o restante para a EASY API.
- `openwa-service/package.json`: fixa `@open-wa/wa-automate@4.76.0` no build.

## Por que existe `health-proxy.js`?

O `railway.json` do projeto usa `healthcheckPath: /healthz`, que funciona no Flask.
O OpenWA/EASY API não expõe `/healthz` por padrão. Sem o proxy, o Railway marca o deploy como unhealthy mesmo quando o OpenWA está iniciando corretamente.

O proxy escuta na porta pública do Railway (`PORT`, normalmente `8080`) e repassa as chamadas reais para o OpenWA rodando internamente em `OPENWA_INTERNAL_PORT` (`8081`).

## Variáveis obrigatórias

```env
OPENWA_API_KEY=troque-por-uma-chave-forte
OPENWA_SESSION_ID=lanhouse-demo
OPENWA_PUBLIC_URL=https://SEU-OPENWA.up.railway.app
FLASK_WEBHOOK_URL=https://SEU-FLASK.up.railway.app/webhooks/openwa
OPENWA_WEBHOOK_SECRET=o-mesmo-segredo-do-flask
```

## Volume

Monte o volume do Railway exatamente em:

```txt
/data
```

A sessão será salva em:

```txt
/data/sessions
```

## Testes rápidos

Após o deploy:

```txt
https://SEU-OPENWA.up.railway.app/healthz
https://SEU-OPENWA.up.railway.app/readyz
https://SEU-OPENWA.up.railway.app/api-docs
```

`/healthz` deve responder mesmo antes do QR Code.  
`/readyz` só responde `ok: true` quando a EASY API interna estiver aceitando conexão.
