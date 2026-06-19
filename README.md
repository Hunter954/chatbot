# OpenWA Chatbot MVP — Flask + Postgres + Railway

MVP completo de chatbot WhatsApp para testar primeiro em uma lan house e depois reutilizar em outros estabelecimentos.

A arquitetura separa:

- **Flask Bot API**: regras, FAQ, catálogo, tickets, reservas, campanhas, dashboard e analytics.
- **OpenWA/EASY API**: gateway WhatsApp, QR Code, sessão e envio/recebimento de mensagens.
- **PostgreSQL**: dados de tenants, contatos, conversas, mensagens, FAQs, produtos, tickets, reservas e campanhas.
- **Railway Volumes**: quando necessário, para sessão/mídia do serviço OpenWA.

## Principais funções do MVP

- Multiestabelecimento por `Tenant`.
- Webhook para OpenWA em `/webhooks/openwa`.
- Envio ativo de mensagens pelo admin em `/api/v1/messages/send`.
- Menu automático por intenção: preços, horário/localização, reservas, suporte, atendente humano e encerramento.
- FAQ com busca fuzzy por pergunta/palavras-chave.
- Catálogo de serviços/produtos com preços.
- Reservas/agendamentos com coleta de dados por conversa.
- Handoff humano: pausa a automação por conversa e abre ticket.
- Tickets de suporte.
- Campanhas simples com opt-out.
- Contatos com tags e atributos.
- Analytics básico.
- Dashboard HTML simples em `/admin?token=...`.
- Healthcheck `/healthz` e readiness `/readyz`.
- IA opcional via API compatível com `/chat/completions`.

## Estrutura

```txt
app/
  routes/        # endpoints públicos, webhook, admin API e dashboard
  services/      # bot engine, OpenWA client, intent, FAQ, analytics, segurança
  templates/     # dashboard básico
  models.py      # modelos SQLAlchemy
  seed.py        # dados iniciais da lan house demo
openwa-service/  # Dockerfile opcional para rodar OpenWA como 2º service no Railway
scripts/         # init DB e start Railway
```

## Variáveis essenciais do Flask

Copie `.env.example` para as variáveis do Railway:

```env
SECRET_KEY=troque
ADMIN_API_TOKEN=troque
OPENWA_WEBHOOK_SECRET=troque
DATABASE_URL=${{Postgres.DATABASE_URL}}
PUBLIC_BASE_URL=https://seu-flask.up.railway.app
DEFAULT_TENANT_SLUG=lanhouse-demo
AUTO_CREATE_TABLES=true
SEED_DEMO=true
OPENWA_BASE_URL=https://seu-openwa.up.railway.app
OPENWA_API_KEY=a-mesma-chave-do-openwa
OPENWA_SESSION_ID=lanhouse-demo
```

## Deploy no Railway

### 1. Suba este projeto para o GitHub

Crie um repositório e envie os arquivos deste MVP.

### 2. Crie o serviço Flask

No Railway:

1. New Project → Deploy from GitHub.
2. Selecione o repo.
3. O Railway detecta o `Dockerfile` da raiz.
4. Adicione o plugin PostgreSQL.
5. Configure as variáveis do `.env.example`.
6. Gere um domínio público para o serviço Flask.

### 3. Crie o serviço OpenWA

Opção A, dentro do mesmo repo:

1. Crie outro service apontando para o mesmo repo.
2. Defina `RAILWAY_DOCKERFILE_PATH=openwa-service/Dockerfile`.
3. Configure:

```env
OPENWA_API_KEY=mesma-chave-usada-no-Flask
OPENWA_SESSION_ID=lanhouse-demo
OPENWA_PUBLIC_URL=https://seu-openwa.up.railway.app
FLASK_WEBHOOK_URL=https://seu-flask.up.railway.app/webhooks/openwa
OPENWA_WEBHOOK_SECRET=mesmo-segredo-do-Flask
```

4. Gere um domínio público para o OpenWA.
5. Escaneie o QR Code nos logs do service OpenWA.

Opção B, OpenWA externo/VPS:

```bash
npx @open-wa/wa-automate@4.76.0 \
  -p 8080 \
  -k 'SUA_OPENWA_API_KEY' \
  --session-id lanhouse-demo \
  --api-host 'https://seu-openwa.dominio.com' \
  -w 'https://seu-flask.up.railway.app/webhooks/openwa?token=SEU_OPENWA_WEBHOOK_SECRET'
```

## Teste rápido via webhook

Depois do deploy, simule uma mensagem recebida:

```bash
curl -X POST 'https://seu-flask.up.railway.app/webhooks/openwa?token=SEU_OPENWA_WEBHOOK_SECRET' \
  -H 'Content-Type: application/json' \
  -d '{
    "id":"msg-demo-1",
    "from":"5546999999999@c.us",
    "chatId":"5546999999999@c.us",
    "notifyName":"Alexandre",
    "body":"menu",
    "type":"text"
  }'
```

O Flask vai salvar contato/conversa/mensagem e tentar responder via OpenWA. Se `OPENWA_BASE_URL` ainda não estiver configurado, a mensagem fica registrada como falha no outbox, mas o fluxo do bot funciona.

## Admin API

Todas as rotas `/api/v1/*` exigem `X-Admin-Token` ou `?admin_token=`.

Exemplo: listar conversas

```bash
curl 'https://seu-flask.up.railway.app/api/v1/conversations' \
  -H 'X-Admin-Token: SEU_ADMIN_API_TOKEN'
```

Enviar mensagem manual:

```bash
curl -X POST 'https://seu-flask.up.railway.app/api/v1/messages/send' \
  -H 'Content-Type: application/json' \
  -H 'X-Admin-Token: SEU_ADMIN_API_TOKEN' \
  -d '{"to":"5546999999999", "body":"Olá! Como posso ajudar?"}'
```

Criar FAQ:

```bash
curl -X POST 'https://seu-flask.up.railway.app/api/v1/faqs' \
  -H 'Content-Type: application/json' \
  -H 'X-Admin-Token: SEU_ADMIN_API_TOKEN' \
  -d '{"question":"Vocês fazem currículo?","answer":"Sim, fazemos currículo em PDF.","keywords":["currículo","cv"]}'
```

## Dashboard

Abra:

```txt
https://seu-flask.up.railway.app/admin?token=SEU_ADMIN_API_TOKEN
```

O painel é propositalmente simples para o MVP. No próximo ciclo, ele pode virar um frontend React/Next.js ou integrar com Chatwoot.

## IA opcional

Por padrão, o MVP usa regras + FAQ. Para usar fallback com IA:

```env
AI_FALLBACK_ENABLED=true
AI_API_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sua-chave
AI_MODEL=gpt-4o-mini
```

A IA só entra quando não há intenção clara nem FAQ correspondente.

## Próximos passos recomendados

- Criar fila assíncrona para campanhas e retry de outbox.
- Criar autenticação completa para operadores.
- Adicionar upload e envio de mídia pelo dashboard.
- Integrar pagamentos Pix/link.
- Adicionar templates aprovados caso migre para WhatsApp Business Cloud API oficial.
- Criar migrações Alembic para produção avançada.
- Adicionar integração Chatwoot/CRM.
