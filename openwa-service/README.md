# OpenWA no Railway

Este serviço roda o OpenWA/EASY API separado do Flask.

## Arquivos importantes

- `openwa-service/Dockerfile`: imagem do serviço OpenWA.
- `openwa-service/start-openwa.sh`: inicialização, webhook, sessão persistente e proxy.
- `openwa-service/health-proxy.js`: responde `/healthz`, serve uma tela própria de QR Code e repassa chamadas para a EASY API.
- `openwa-service/package.json`: fixa `@open-wa/wa-automate@4.76.0` no build.

## Por que existe `health-proxy.js`?

O `railway.json` do projeto usa `healthcheckPath: /healthz`, que funciona no Flask.
O OpenWA/EASY API não expõe `/healthz` por padrão. Sem o proxy, o Railway marca o deploy como unhealthy mesmo quando o OpenWA está iniciando corretamente.

O proxy escuta na porta pública do Railway (`PORT`, normalmente `8080`) e repassa as chamadas reais para o OpenWA rodando internamente em `OPENWA_INTERNAL_PORT` (`8081`).

## Correção definitiva da tela do QR

A tela original do OpenWA, em alguns ambientes, mostra isto:

```txt
SOCKET CONNECTED
qr
data:image/png;base64,...
```

Ou seja: o QR chegou, mas a página original colocou o QR dentro de uma caixa de texto.

Por isso, a raiz `/` agora **não usa mais a tela original do OpenWA**. Ela serve uma tela própria do proxy que conecta no Socket.IO do OpenWA e renderiza o QR como imagem.

Rotas úteis:

```txt
/                 -> tela própria de QR Code
/qr               -> tela própria de QR Code
/login            -> tela própria de QR Code
/openwa-original  -> tela original do OpenWA, apenas para comparação
/api-docs         -> documentação da EASY API
/healthz          -> healthcheck do Railway
/readyz           -> readiness da EASY API interna
```

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

## Login pelo QR Code

1. Abra a URL pública do OpenWA.
2. Aguarde a tela própria “OpenWA - QR Code”.
3. No celular, abra WhatsApp > Aparelhos conectados > Conectar aparelho.
4. Escaneie o QR.
5. Depois de autenticar, mantenha o serviço ligado por pelo menos 5 minutos antes de reiniciar.

Se precisar comparar, abra `/openwa-original`, mas use `/` ou `/qr` para escanear.
