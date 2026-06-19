# OpenWA no Railway

Este serviço roda o OpenWA/EASY API separado do Flask.

## Arquivos importantes

- `openwa-service/Dockerfile`: imagem do serviço OpenWA.
- `openwa-service/start-openwa.sh`: inicialização, webhook, sessão persistente e proxy.
- `openwa-service/health-proxy.js`: responde `/healthz`, repassa chamadas para a EASY API e corrige a tela do QR Code quando o OpenWA exibe `data:image/png;base64` como texto bruto.
- `openwa-service/package.json`: fixa `@open-wa/wa-automate@4.76.0` no build.

## Por que existe `health-proxy.js`?

O `railway.json` do projeto usa `healthcheckPath: /healthz`, que funciona no Flask.
O OpenWA/EASY API não expõe `/healthz` por padrão. Sem o proxy, o Railway marca o deploy como unhealthy mesmo quando o OpenWA está iniciando corretamente.

O proxy escuta na porta pública do Railway (`PORT`, normalmente `8080`) e repassa as chamadas reais para o OpenWA rodando internamente em `OPENWA_INTERNAL_PORT` (`8081`).

Além disso, algumas versões/telas do OpenWA podem mostrar o QR como texto bruto no formato:

```txt
qr data:image/png;base64,...
```

O proxy injeta um pequeno script em páginas HTML do OpenWA para detectar esse `data:image` e renderizar o QR Code em uma caixa limpa no canto da tela.

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

## Login pelo QR Code

1. Abra a URL pública do OpenWA.
2. Aguarde aparecer a caixa “QR Code do WhatsApp”.
3. No celular, abra WhatsApp > Aparelhos conectados > Conectar aparelho.
4. Escaneie o QR.
5. Depois de autenticar, mantenha o serviço ligado por pelo menos 5 minutos antes de reiniciar.
