# Serviço separado para OpenWA/EASY API.
# No Railway, crie um segundo service apontando para este Dockerfile com:
# RAILWAY_DOCKERFILE_PATH=openwa-service/Dockerfile
#
# Importante para Railway:
# - Monte um Volume em /data para persistir a sessão do WhatsApp.
# - O WORKDIR /data faz o OpenWA salvar ./_IGNORE_<session> dentro do volume.
FROM openwa/wa-automate

WORKDIR /data
ENTRYPOINT []

CMD ["sh", "-c", "printf '{}' > /data/cli.config.json && npx @open-wa/wa-automate@4.76.0 --config cli.config.json -p ${PORT:-8080} -k \"${OPENWA_API_KEY}\" --session-id \"${OPENWA_SESSION_ID:-default}\" --api-host \"${OPENWA_PUBLIC_URL}\" --host \"${OPENWA_PUBLIC_URL}\" -w \"${FLASK_WEBHOOK_URL}?token=${OPENWA_WEBHOOK_SECRET}\" --keep-alive --skip-save-postman-collection"]
