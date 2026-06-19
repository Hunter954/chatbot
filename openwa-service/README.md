# Serviço OpenWA no Railway

Este diretório deixa o repositório pronto para ter dois services no Railway:

1. `flask-bot`: usa o `Dockerfile` da raiz.
2. `openwa-api`: usa `openwa-service/Dockerfile`.

## Variáveis do service `openwa-api`

```env
OPENWA_API_KEY=crie-uma-chave-grande
OPENWA_SESSION_ID=lanhouse-demo
OPENWA_PUBLIC_URL=https://SEU-OPENWA.up.railway.app
FLASK_WEBHOOK_URL=https://SEU-FLASK.up.railway.app/webhooks/openwa
OPENWA_WEBHOOK_SECRET=o-mesmo-segredo-configurado-no-flask
```

## Volume obrigatório/recomendado

Crie um **Volume no Railway montado em `/data`**.

O OpenWA salva a sessão em um diretório relativo como `./_IGNORE_lanhouse-demo`. Este Dockerfile usa `WORKDIR /data`, então esse diretório fica dentro do volume e não some quando o container reinicia ou faz redeploy.

Sem volume, o WhatsApp pode pedir QR Code novamente a cada redeploy.

## Primeiro deploy

1. Faça deploy do service `openwa-api`.
2. Abra a URL pública do OpenWA, por exemplo: `https://SEU-OPENWA.up.railway.app`.
3. Escaneie o QR Code.
4. Depois de escanear, mantenha o serviço vivo por pelo menos 5 minutos antes de reiniciar/redeployar.
5. Teste a API em `/api-docs/`.

## Sobre o aviso `/config`

Alguns deploys do container mostram:

```txt
Unable to read config file json: /config
```

Este Dockerfile cria `/data/cli.config.json` com `{}` e inicia o OpenWA com `--config cli.config.json`, evitando o aviso e mantendo as configurações controladas por variáveis de ambiente.
