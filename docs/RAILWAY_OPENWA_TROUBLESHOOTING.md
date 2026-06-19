# Troubleshooting OpenWA no Railway

## Logs mostram `sh: 1: cannot create /data/cli.config.json: Permission denied`

Esse erro indica que o container tentou criar um arquivo dentro do volume `/data`, mas o usuário padrão da imagem não tinha permissão de escrita.

Correção aplicada:

- `USER root` no `openwa-service/Dockerfile`;
- config fixo em `/app/config/cli.config.json`;
- script `/app/start-openwa.sh` para iniciar o OpenWA;
- teste explícito de escrita no volume `/data`;
- `/data` fica reservado para sessão persistente do WhatsApp.

Depois de aplicar estes arquivos, faça redeploy do service `openwa-api`.

## Logs mostram `Unable to read config file json: /config`

Isso normalmente indica que o OpenWA tentou ler um arquivo de configuração inexistente. O serviço pode continuar subindo, mas o ideal é iniciar com um arquivo de config válido.

Correção aplicada neste MVP:

- criação do config durante o build em `/app/config/cli.config.json`;
- start com `--config /app/config/cli.config.json`;
- config fora do volume para evitar erro de permissão.

## Logs mostram `No session data file found`

Isso é esperado no primeiro deploy, antes de escanear o QR Code. Depois de autenticar, mantenha o serviço vivo por pelo menos 5 minutos antes de reiniciar.

## Logs mostram `Data dir: ./_IGNORE_lanhouse-demo`

Esse diretório precisa ficar em armazenamento persistente. No Railway, crie um Volume e monte exatamente em `/data` no service `openwa-api`. Como o Dockerfile usa `WORKDIR /data`, o diretório da sessão será salvo dentro do volume.

## URL de autenticação aparece como `http://localhost:8080`

Em produção, use a URL pública do Railway do service OpenWA. Defina:

```env
OPENWA_PUBLIC_URL=https://SEU-OPENWA.up.railway.app
```

O script passa essa variável para `--api-host` e `--host`.

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

## Checklist Railway

- Service Flask usando `Dockerfile` da raiz.
- Service OpenWA usando `RAILWAY_DOCKERFILE_PATH=openwa-service/Dockerfile`.
- Volume montado em `/data` no service OpenWA.
- `OPENWA_PUBLIC_URL` apontando para a URL pública do service OpenWA.
- `FLASK_WEBHOOK_URL` apontando para `/webhooks/openwa` no service Flask.
- Mesmo `OPENWA_WEBHOOK_SECRET` nos dois services.
