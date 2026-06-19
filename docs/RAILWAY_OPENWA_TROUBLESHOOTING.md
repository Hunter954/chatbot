# Troubleshooting OpenWA no Railway

## Logs mostram `Unable to read config file json: /config`

Isso normalmente indica que o OpenWA tentou ler um arquivo de configuração inexistente. O serviço pode continuar subindo, mas o ideal é iniciar com um arquivo de config válido.

Correção aplicada neste MVP:

- `WORKDIR /data`
- criação de `/data/cli.config.json` com `{}`
- start com `--config cli.config.json`

## Logs mostram `No session data file found`

Isso é esperado no primeiro deploy, antes de escanear o QR Code. Depois de autenticar, mantenha o serviço vivo por pelo menos 5 minutos antes de reiniciar.

## Logs mostram `Data dir: ./_IGNORE_lanhouse-demo`

Esse diretório precisa ficar em armazenamento persistente. No Railway, crie um Volume e monte em `/data` no service `openwa-api`. Como o Dockerfile usa `WORKDIR /data`, o diretório da sessão será salvo dentro do volume.

## URL de autenticação aparece como `http://localhost:8080`

Em produção, use a URL pública do Railway do service OpenWA. Defina:

```env
OPENWA_PUBLIC_URL=https://SEU-OPENWA.up.railway.app
```

O Dockerfile passa essa variável para `--api-host` e `--host`.

## Variáveis mínimas para o OpenWA

```env
OPENWA_API_KEY=uma-chave-forte
OPENWA_SESSION_ID=lanhouse-demo
OPENWA_PUBLIC_URL=https://SEU-OPENWA.up.railway.app
FLASK_WEBHOOK_URL=https://SEU-FLASK.up.railway.app/webhooks/openwa
OPENWA_WEBHOOK_SECRET=o-mesmo-do-flask
```

## Variáveis mínimas no Flask

```env
OPENWA_BASE_URL=https://SEU-OPENWA.up.railway.app
OPENWA_API_KEY=mesma-chave-do-openwa
OPENWA_WEBHOOK_SECRET=o-mesmo-do-openwa
DATABASE_URL=postgresql+psycopg://...
PUBLIC_BASE_URL=https://SEU-FLASK.up.railway.app
ADMIN_API_TOKEN=um-token-forte
SECRET_KEY=uma-chave-forte
```
