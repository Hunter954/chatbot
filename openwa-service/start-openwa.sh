#!/usr/bin/env sh
set -eu

DATA_DIR="/data"
CONFIG_FILE="/app/config/cli.config.json"
PORT="${PORT:-8080}"
SESSION_ID="${OPENWA_SESSION_ID:-default}"

: "${OPENWA_API_KEY:?OPENWA_API_KEY precisa estar configurada no Railway}"
: "${FLASK_WEBHOOK_URL:?FLASK_WEBHOOK_URL precisa estar configurada no Railway}"
: "${OPENWA_WEBHOOK_SECRET:?OPENWA_WEBHOOK_SECRET precisa estar configurada no Railway}"

mkdir -p "$DATA_DIR"

# Railway pode montar o volume como root-owned. Esse chmod evita o erro:
# sh: 1: cannot create /data/cli.config.json: Permission denied
chmod -R a+rwX "$DATA_DIR" 2>/dev/null || true

if ! (touch "$DATA_DIR/.write-test" && rm -f "$DATA_DIR/.write-test"); then
  echo "ERRO: o volume em $DATA_DIR não está gravável." >&2
  echo "No Railway, monte o Volume exatamente em /data no service openwa-api." >&2
  exit 1
fi

WEBHOOK_URL="${FLASK_WEBHOOK_URL}?token=${OPENWA_WEBHOOK_SECRET}"
PUBLIC_ARGS=""

if [ -n "${OPENWA_PUBLIC_URL:-}" ]; then
  PUBLIC_ARGS="--api-host ${OPENWA_PUBLIC_URL} --host ${OPENWA_PUBLIC_URL}"
fi

cd "$DATA_DIR"

echo "Iniciando OpenWA na porta ${PORT}, sessão ${SESSION_ID}, data dir ${DATA_DIR}"

# shellcheck disable=SC2086
exec npx @open-wa/wa-automate@4.76.0 \
  --config "$CONFIG_FILE" \
  -p "$PORT" \
  -k "$OPENWA_API_KEY" \
  --session-id "$SESSION_ID" \
  $PUBLIC_ARGS \
  -w "$WEBHOOK_URL" \
  --keep-alive \
  --skip-save-postman-collection
