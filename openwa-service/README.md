# Serviço OpenWA no Railway

Este diretório roda o OpenWA/EASY API como um service separado do Flask.

## Service no Railway

Crie um service `openwa-api` usando:

```env
RAILWAY_DOCKERFILE_PATH=openwa-service/Dockerfile
```

## Variáveis obrigatórias

```env
OPENWA_API_KEY=crie-uma-chave-grande
OPENWA_SESSION_ID=lanhouse-demo
OPENWA_PUBLIC_URL=https://SEU-OPENWA.up.railway.app
FLASK_WEBHOOK_URL=https://SEU-FLASK.up.railway.app/webhooks/openwa
OPENWA_WEBHOOK_SECRET=o-mesmo-segredo-configurado-no-flask
```

Opcional:

```env
OPENWA_LOG_STDERR_TO_STDOUT=true
```

Essa variável fica `true` por padrão porque o OpenWA escreve várias mensagens normais no `stderr`; no Railway elas aparecem como `[err]`, mesmo quando não existe erro real.

## Volume obrigatório

Monte um **Volume exatamente em `/data`** no service `openwa-api`.

A sessão fica em:

```txt
/data/sessions
```

O log correto deve mostrar algo como:

```txt
Data dir: /data/sessions/_IGNORE_lanhouse-demo
```

Se aparecer `./_IGNORE_lanhouse-demo`, você ainda está rodando uma imagem antiga ou não aplicou estes arquivos.

## Primeiro deploy

1. Faça redeploy do `openwa-api`.
2. Abra a URL pública do OpenWA.
3. Escaneie o QR Code.
4. Depois de escanear, mantenha o serviço ligado por pelo menos 5 minutos.
5. Só depois faça novo deploy/restart.

Antes de escanear, é normal aparecer que não existe sessão salva. Isso não é crash.

## O que esta versão corrige

- Não baixa `@open-wa/wa-automate` no boot; instala no build.
- Força `sessionDataPath=/data/sessions`.
- Garante que `/data` está gravável antes de iniciar.
- Cria a pasta `_IGNORE_<sessão>` antes do OpenWA iniciar.
- Redireciona logs normais de `stderr` para `stdout` para evitar falso `[err]` no Railway.
- Mantém o config em `/app/config/cli.config.json`, fora do volume, evitando novos problemas de permissão.
