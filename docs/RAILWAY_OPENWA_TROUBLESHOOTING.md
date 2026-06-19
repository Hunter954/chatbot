# Troubleshooting OpenWA no Railway

## 1. `cannot create /data/cli.config.json: Permission denied`

O volume foi montado, mas o processo não conseguia escrever em `/data`.

Correção aplicada:

- container OpenWA roda como `root`;
- o script cria `/data` e `/data/sessions`;
- o script aplica `chmod -R a+rwX /data` antes de gravar;
- o config é criado após o teste de escrita.

## 2. `npm warn exec The following package was not found and will be installed`

Isso indica instalação do OpenWA em tempo de execução, o que deixa cada boot mais lento e instável.

Correção aplicada:

- `openwa-service/package.json` fixa `@open-wa/wa-automate` em `4.76.0`;
- o `Dockerfile` roda `npm install` durante o build;
- o `start-openwa.sh` chama `/app/node_modules/.bin/wa-automate`, sem baixar pacote no boot.

## 3. OpenWA mostra `Data dir: ./_IGNORE_lanhouse-demo`

Esse era o problema principal do último log.

Mesmo com `WORKDIR /data`, o OpenWA pode cair no padrão `./_IGNORE_<session>` quando `sessionDataPath` não é configurado explicitamente.

Correção aplicada:

- `start-openwa.sh` gera `/data/cli.config.json` com:

```json
{
  "sessionId": "lanhouse-demo",
  "sessionDataPath": "/data/sessions",
  "qrTimeout": 0,
  "authTimeout": 0
}
```

Resultado esperado:

```txt
Data dir: /data/sessions/_IGNORE_lanhouse-demo
```

## 4. Depois de escanear o QR Code

Mantenha o service vivo por pelo menos 5 minutos antes de reiniciar ou redeployar. O próprio OpenWA avisa isso nos logs porque a sessão multi-device precisa de tempo para salvar os dados iniciais.

## 5. Quando limpar o volume

Limpe o volume somente se quiser forçar um novo QR Code.

Ao limpar o volume, o WhatsApp vai perder a sessão persistida e será necessário autenticar novamente.
