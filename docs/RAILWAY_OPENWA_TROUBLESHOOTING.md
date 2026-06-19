# Troubleshooting OpenWA no Railway

## QR não aparece

Confira `/qr-state`.

Se aparecer erro parecido com:

```txt
Error: spawn ps ENOENT
syscall: spawn ps
path: ps
spawnargs: [ '-A', '-o', 'ppid,pid,stat,comm' ]
```

O problema é que a imagem base não tem o binário `ps`, usado por dependências do OpenWA/Puppeteer para lidar com processos. O Dockerfile desta versão instala `procps` e também cria um fallback para `ps` caso o gerenciador de pacotes não esteja disponível.

## Timeout antes do QR

Se aparecer:

```txt
TimeoutError: Waiting failed: 30000ms exceeded
```

Esta versão configura:

```js
qrTimeout: 0
authTimeout: 0
useChrome: true
autoRefresh: true
killProcessOnTimeout: false
```

Isso impede que o OpenWA mate a sessão antes de você conseguir escanear o QR.

## Sessão antiga quebrada

Use o endpoint:

```bash
curl -X POST "https://SEU-OPENWA.up.railway.app/reset-session" \
  -H "X-API-KEY: SUA_CHAVE"
```

Ele remove:

```txt
/data/sessions/_IGNORE_<OPENWA_SESSION_ID>
```

Depois atualize `/qr`.

## Healthcheck

O Railway deve apontar para:

```txt
/healthz
```

Essa rota responde rápido, mesmo quando o WhatsApp ainda não está autenticado.

