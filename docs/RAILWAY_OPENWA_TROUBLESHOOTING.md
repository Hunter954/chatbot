# Troubleshooting OpenWA no Railway

## QR não aparece e `/qr-state` fica STARTING

Verifique os logs. Se aparecer:

```txt
Using custom chromium args with multi device will cause issues! Please remove them
TimeoutError: Waiting failed: 30000ms exceeded
```

aplique este patch. Ele remove `browserArgs`/`chromiumArgs` do `create()` por padrão.

## Build quebra por apt/GPG do Chrome

Não use `apt-get update` neste Dockerfile. A imagem base pode ter repositório do Google Chrome com chave expirada/ausente. O Dockerfile deste patch não usa apt.

## Sessão quebrada

Troque temporariamente `OPENWA_SESSION_ID` ou limpe via:

```bash
curl -X POST "https://SEU-OPENWA.up.railway.app/reset-session" \
  -H "X-API-KEY: SUA_OPENWA_API_KEY"
```

## Volume

O volume do Railway deve estar montado em:

```txt
/data
```

A sessão deve ficar em:

```txt
/data/sessions/_IGNORE_<OPENWA_SESSION_ID>
```
