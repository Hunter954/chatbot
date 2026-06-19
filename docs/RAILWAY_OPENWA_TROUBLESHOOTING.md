# Troubleshooting OpenWA no Railway

## 1. `Healthcheck failed` em `/healthz`

Causa: o `railway.json` do projeto usa `/healthz`, que existe no Flask, mas não existe no OpenWA/EASY API por padrão.

Correção aplicada: o serviço OpenWA agora inclui `openwa-service/health-proxy.js`.

Esse proxy:

- escuta na porta pública do Railway (`PORT`);
- responde `200` em `/healthz`;
- expõe `/readyz` para indicar se a EASY API interna já está aceitando conexão;
- repassa todo o restante para o OpenWA interno em `OPENWA_INTERNAL_PORT`, por padrão `8081`.

Com isso, você não precisa quebrar o healthcheck do Flask nem remover o `railway.json`.

## 2. `Data dir: /data/sessions/_IGNORE_lanhouse-demo`

Isso está correto. A sessão está dentro do volume persistente.

Se aparecer `No session data file found`, significa apenas que o QR Code ainda não foi escaneado para essa sessão.

## 3. Primeiro login

1. Abra a URL pública do OpenWA.
2. Escaneie o QR Code.
3. Mantenha o serviço ligado por pelo menos 5 minutos.
4. Depois disso, reinícios devem manter a sessão se o volume estiver montado em `/data`.

## 4. Variáveis obrigatórias

No service OpenWA, configure:

```env
OPENWA_API_KEY=troque-por-uma-chave-forte
OPENWA_SESSION_ID=lanhouse-demo
OPENWA_PUBLIC_URL=https://SEU-OPENWA.up.railway.app
FLASK_WEBHOOK_URL=https://SEU-FLASK.up.railway.app/webhooks/openwa
OPENWA_WEBHOOK_SECRET=o-mesmo-segredo-do-flask
```

## 5. Endpoints úteis

```txt
/healthz  -> healthcheck rápido do Railway
/readyz   -> verifica se a EASY API interna está aceitando conexão
/api-docs -> documentação da EASY API do OpenWA
```
