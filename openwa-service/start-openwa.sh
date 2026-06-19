#!/usr/bin/env sh
set -eu

DATA_DIR="${OPENWA_DATA_DIR:-/data}"
SESSION_DATA_DIR="${OPENWA_SESSION_DATA_DIR:-${DATA_DIR}/sessions}"
CONFIG_FILE="${DATA_DIR}/cli.config.json"
PORT="${PORT:-8080}"
SESSION_ID="${OPENWA_SESSION_ID:-default}"

: "${OPENWA_API_KEY:?OPENWA_API_KEY precisa estar configurada no Railway}"
: "${FLASK_WEBHOOK_URL:?FLASK_WEBHOOK_URL precisa estar configurada no Railway}"
: "${OPENWA_WEBHOOK_SECRET:?OPENWA_WEBHOOK_SECRET precisa estar configurada no Railway}"

mkdir -p "$DATA_DIR" "$SESSION_DATA_DIR"

# Railway pode montar o volume como root-owned ou com permissões inconsistentes.
# Como este container roda como root, isso normaliza o volume antes de gravar.
chmod -R a+rwX "$DATA_DIR" 2>/dev/null || true

if ! (touch "$DATA_DIR/.write-test" && rm -f "$DATA_DIR/.write-test"); then
  echo "ERRO: o volume em $DATA_DIR não está gravável." >&2
  echo "No Railway, monte o Volume exatamente em /data no service openwa-api." >&2
  exit 1
fi

# O OpenWA usa sessionDataPath para decidir onde salvar arquivos como:
# <session>.data.json e _IGNORE_<session>.
# Sem isso, ele volta para ./_IGNORE_<session>, que pode não persistir no Railway.
cat > "$CONFIG_FILE" <<EOF_CONFIG
{
  "sessionId": "${SESSION_ID}",
  "sessionDataPath": "${SESSION_DATA_DIR}",
  "qrTimeout": 0,
  "authTimeout": 0,
  "killProcessOnBrowserClose": false,
  "blockCrashLogs": true,
  "disableSpins": true
}
EOF_CONFIG

WEBHOOK_URL="${FLASK_WEBHOOK_URL}?token=${OPENWA_WEBHOOK_SECRET}"
PUBLIC_ARGS=""

if [ -n "${OPENWA_PUBLIC_URL:-}" ]; then
  PUBLIC_ARGS="--api-host ${OPENWA_PUBLIC_URL} --host ${OPENWA_PUBLIC_URL}"
fi

cd "$DATA_DIR"

echo "Iniciando OpenWA na porta ${PORT}, sessão ${SESSION_ID}, sessionDataPath ${SESSION_DATA_DIR}"

# Usamos o pacote instalado no build em /app/node_modules, evitando download via npx a cada boot.
# shellcheck disable=SC2086
exec /app/node_modules/.bin/wa-automate \
  --config "cli.config.json" \
  --port "$PORT" \
  --key "$OPENWA_API_KEY" \
  --session-id "$SESSION_ID" \
  $PUBLIC_ARGS \
  --webhook "$WEBHOOK_URL" \
  --keep-alive \
  --skip-save-postman-collection
