# Troubleshooting OpenWA no Railway

## 1. `Healthcheck failed` em `/healthz`

Causa: o `railway.json` do projeto usa `/healthz`, que existe no Flask, mas não existe no OpenWA/EASY API por padrão.

Correção aplicada: o serviço OpenWA inclui `openwa-service/health-proxy.js`.

Esse proxy:

- escuta na porta pública do Railway (`PORT`);
- responde `200` em `/healthz`;
- expõe `/readyz` para indicar se a EASY API interna já está aceitando conexão;
- repassa todo o restante para o OpenWA interno em `OPENWA_INTERNAL_PORT`, por padrão `8081`.

Com isso, você não precisa quebrar o healthcheck do Flask nem remover o `railway.json`.

## 2. QR Code aparecendo como texto `data:image/png;base64`

Se a tela do OpenWA mostrar algo parecido com isto em uma caixa de texto:

```txt
SOCKET CONNECTED
qr
data:image/png;base64,...
```

isso significa que o QR chegou, mas a interface do OpenWA não renderizou a imagem.

Correção aplicada: `health-proxy.js` injeta um script em páginas HTML do OpenWA. Esse script detecta automaticamente `data:image/png;base64,...` e renderiza o QR Code em uma caixa limpa no canto da tela.

Depois do redeploy:

1. abra novamente a URL pública do OpenWA;
2. dê um refresh forçado no navegador (`Ctrl + F5`);
3. aguarde aparecer a caixa “QR Code do WhatsApp”;
4. escaneie pelo WhatsApp.

## 3. `Data dir: /data/sessions/_IGNORE_lanhouse-demo`

Isso está correto. A sessão está dentro do volume persistente.

Se aparecer `No session data file found`, significa apenas que o QR Code ainda não foi escaneado para essa sessão.

## 4. Primeiro login

1. Abra a URL pública do OpenWA.
2. Escaneie o QR Code.
3. Mantenha o serviço ligado por pelo menos 5 minutos.
4. Depois disso, reinícios devem manter a sessão se o volume estiver montado em `/data`.

## 5. Variáveis obrigatórias

No service OpenWA, configure:

```env
OPENWA_API_KEY=troque-por-uma-chave-forte
OPENWA_SESSION_ID=lanhouse-demo
OPENWA_PUBLIC_URL=https://SEU-OPENWA.up.railway.app
FLASK_WEBHOOK_URL=https://SEU-FLASK.up.railway.app/webhooks/openwa
OPENWA_WEBHOOK_SECRET=o-mesmo-segredo-do-flask
```

## 6. Endpoints úteis

```txt
/healthz  -> healthcheck rápido do Railway
/readyz   -> verifica se a EASY API interna está aceitando conexão
/api-docs -> documentação da EASY API do OpenWA
```
