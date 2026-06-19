# API principal

Use `X-Admin-Token: SEU_ADMIN_API_TOKEN` em todas as rotas `/api/v1`.

## Rotas públicas

- `GET /healthz`
- `GET /readyz`
- `POST /webhooks/openwa?token=OPENWA_WEBHOOK_SECRET`

## Admin

- `GET /api/v1/tenants`
- `POST /api/v1/tenants`
- `GET /api/v1/channels`
- `POST /api/v1/channels`
- `PATCH /api/v1/channels/<id>`
- `GET /api/v1/contacts`
- `PATCH /api/v1/contacts/<id>`
- `GET /api/v1/conversations`
- `GET /api/v1/conversations/<id>`
- `POST /api/v1/conversations/<id>/reply`
- `POST /api/v1/conversations/<id>/handoff`
- `POST /api/v1/conversations/<id>/resume`
- `POST /api/v1/messages/send`
- `GET/POST/PATCH/DELETE /api/v1/faqs`
- `GET/POST/PATCH/DELETE /api/v1/products`
- `GET/PATCH /api/v1/bookings`
- `GET/PATCH /api/v1/tickets`
- `GET/POST /api/v1/campaigns`
- `POST /api/v1/campaigns/<id>/dispatch`
- `GET /api/v1/analytics/summary`
