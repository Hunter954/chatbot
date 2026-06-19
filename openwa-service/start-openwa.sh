#!/usr/bin/env sh
set -eu

DATA_DIR="${OPENWA_DATA_DIR:-/data}"
SESSION_DATA_DIR="${OPENWA_SESSION_DATA_DIR:-${DATA_DIR}/sessions}"
CONFIG_DIR="/app/config"
CONFIG_FILE="${CONFIG_DIR}/cli.config.json"
PUBLIC_PORT="${PORT:-8080}"
OPENWA_INTERNAL_PORT="${OPENWA_INTERNAL_PORT:-8081}"
SESSION_ID="${OPENWA_SESSION_ID:-default}"

: "${OPENWA_API_KEY:?OPENWA_API_KEY precisa estar configurada no Railway}"
: "${FLASK_WEBHOOK_URL:?FLASK_WEBHOOK_URL precisa estar configurada no Railway}"
: "${OPENWA_WEBHOOK_SECRET:?OPENWA_WEBHOOK_SECRET precisa estar configurada no Railway}"

mkdir -p "$DATA_DIR" "$SESSION_DATA_DIR" "$CONFIG_DIR"

# O Railway monta volumes com permissões que podem variar entre deploys.
# O container roda como root para conseguir normalizar o volume antes do OpenWA iniciar.
chmod -R a+rwX "$DATA_DIR" 2>/dev/null || true

if ! (touch "$DATA_DIR/.write-test" && rm -f "$DATA_DIR/.write-test"); then
  echo "ERRO REAL: o volume em $DATA_DIR não está gravável." >&2
  echo "No Railway, monte o Volume exatamente em /data no service openwa-api." >&2
  exit 1
fi

# Evita ruído desnecessário de primeiro boot: o OpenWA espera esta pasta.
mkdir -p "${SESSION_DATA_DIR}/_IGNORE_${SESSION_ID}"

# O OpenWA usa sessionDataPath para decidir onde salvar arquivos como:
# <session>.data.json e _IGNORE_<session>.
# Mantemos este config fora do volume para evitar problemas de permissão em /data.
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

case "$FLASK_WEBHOOK_URL" in
  *\?*) WEBHOOK_URL="${FLASK_WEBHOOK_URL}&token=${OPENWA_WEBHOOK_SECRET}" ;;
  *) WEBHOOK_URL="${FLASK_WEBHOOK_URL}?token=${OPENWA_WEBHOOK_SECRET}" ;;
esac

PUBLIC_ARGS=""
if [ -n "${OPENWA_PUBLIC_URL:-}" ]; then
  PUBLIC_ARGS="--api-host ${OPENWA_PUBLIC_URL} --host ${OPENWA_PUBLIC_URL}"
fi

if [ ! -f "${SESSION_DATA_DIR}/${SESSION_ID}.data.json" ]; then
  echo "Sessão '${SESSION_ID}' ainda não autenticada. Abra a URL pública do OpenWA e escaneie o QR Code."
  echo "Depois de escanear, mantenha o serviço ligado por pelo menos 5 minutos antes de reiniciar."
fi

# O railway.json do projeto usa /healthz para o Flask.
# Este proxy faz /healthz existir também no service OpenWA e repassa o restante para a EASY API.
export OPENWA_INTERNAL_HOST="${OPENWA_INTERNAL_HOST:-127.0.0.1}"
export OPENWA_INTERNAL_PORT
node /app/health-proxy.js &
PROXY_PID="$!"

cleanup() {
  kill "$PROXY_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "Iniciando OpenWA interno na porta ${OPENWA_INTERNAL_PORT}, proxy público na porta ${PUBLIC_PORT}, sessão ${SESSION_ID}, sessionDataPath ${SESSION_DATA_DIR}"

# Importante: o OpenWA escreve várias mensagens normais no stderr.
# No Railway isso aparece como [err], mesmo sem crash. Por padrão redirecionamos stderr para stdout
# para os logs normais aparecerem como informação. Desative com OPENWA_LOG_STDERR_TO_STDOUT=false.
if [ "${OPENWA_LOG_STDERR_TO_STDOUT:-true}" = "true" ]; then
  # shellcheck disable=SC2086
  exec /app/node_modules/.bin/wa-automate \
    --config "$CONFIG_FILE" \
    --port "$OPENWA_INTERNAL_PORT" \
    --key "$OPENWA_API_KEY" \
    --session-id "$SESSION_ID" \
    $PUBLIC_ARGS \
    --webhook "$WEBHOOK_URL" \
    --keep-alive \
    2>&1
else
  # shellcheck disable=SC2086
  exec /app/node_modules/.bin/wa-automate \
    --config "$CONFIG_FILE" \
    --port "$OPENWA_INTERNAL_PORT" \
    --key "$OPENWA_API_KEY" \
    --session-id "$SESSION_ID" \
    $PUBLIC_ARGS \
    --webhook "$WEBHOOK_URL" \
    --keep-alive
fi
