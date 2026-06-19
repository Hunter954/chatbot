# Troubleshooting OpenWA no Railway

## 1. Logs `[err]` sem crash

O OpenWA imprime muitas mensagens normais no `stderr`. O Railway mostra qualquer coisa escrita no `stderr` como `[err]`, mesmo quando o processo está saudável.

Esta versão redireciona `stderr` para `stdout` por padrão:

```env
OPENWA_LOG_STDERR_TO_STDOUT=true
```

Se quiser voltar ao comportamento original:

```env
OPENWA_LOG_STDERR_TO_STDOUT=false
```

## 2. `No session data file found`

Antes de escanear o QR Code, isso é normal. O OpenWA ainda não tem uma sessão do WhatsApp para carregar.

Fluxo correto:

1. Abra a URL pública do OpenWA.
2. Escaneie o QR Code.
3. Mantenha o container ligado por pelo menos 5 minutos.
4. Depois disso, a sessão deve persistir no volume.

## 3. Verifique se a sessão está no volume

O log correto é:

```txt
Data dir: /data/sessions/_IGNORE_lanhouse-demo
```

Se aparecer isto, está errado:

```txt
Data dir: ./_IGNORE_lanhouse-demo
```

Nesse caso, confira se você aplicou estes arquivos e redeployou o service correto.

## 4. `Permission denied` em `/data`

Garanta que o Volume do Railway está montado exatamente em:

```txt
/data
```

O script já tenta normalizar permissões com `chmod -R a+rwX /data`. Se ainda falhar, remova e recrie o Volume no service `openwa-api`.

## 5. Variáveis necessárias

```env
OPENWA_API_KEY=crie-uma-chave-grande
OPENWA_SESSION_ID=lanhouse-demo
OPENWA_PUBLIC_URL=https://SEU-OPENWA.up.railway.app
FLASK_WEBHOOK_URL=https://SEU-FLASK.up.railway.app/webhooks/openwa
OPENWA_WEBHOOK_SECRET=o-mesmo-segredo-configurado-no-flask
```

## 6. Depois do deploy

Acesse:

```txt
https://SEU-OPENWA.up.railway.app/api-docs/
```

Depois de autenticar a sessão no WhatsApp, o Flask deve receber mensagens em:

```txt
/webhooks/openwa
```
