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

## Volume obrigatório

Crie um **Volume no Railway montado exatamente em `/data`** no service `openwa-api`.

Agora o wrapper gera um `cli.config.json` dentro de `/data` com:

```json
{
  "sessionDataPath": "/data/sessions"
}
```

Com isso, arquivos como `_IGNORE_lanhouse-demo` e `lanhouse-demo.data.json` ficam dentro do volume persistente.

## Por que existe `package.json` neste diretório?

O log anterior mostrava:

```txt
npm warn exec The following package was not found and will be installed: @open-wa/wa-automate@4.76.0
```

Isso acontecia porque o boot chamava `npx @open-wa/wa-automate@4.76.0`, fazendo o container baixar o pacote em tempo de execução.

Agora o Dockerfile instala `@open-wa/wa-automate@4.76.0` durante o build e o script chama:

```sh
/app/node_modules/.bin/wa-automate
```

Assim o deploy fica mais previsível e rápido.

## Primeiro deploy

1. Faça deploy do service `openwa-api`.
2. Abra a URL pública do OpenWA, por exemplo: `https://SEU-OPENWA.up.railway.app`.
3. Escaneie o QR Code.
4. Depois de escanear, mantenha o serviço vivo por pelo menos 5 minutos antes de reiniciar/redeployar.
5. Teste a API em `/api-docs/`.

## Como validar nos logs

Procure uma linha parecida com:

```txt
Iniciando OpenWA na porta 8080, sessão lanhouse-demo, sessionDataPath /data/sessions
```

Depois procure no log do OpenWA algo como:

```txt
Data dir: /data/sessions/_IGNORE_lanhouse-demo
```

Se aparecer `Data dir: ./_IGNORE_lanhouse-demo`, o service ainda está rodando uma imagem antiga ou não recebeu estes arquivos.
