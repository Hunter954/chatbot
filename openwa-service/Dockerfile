# Serviço separado para OpenWA/EASY API.
# No Railway, crie um segundo service apontando para este Dockerfile com:
# RAILWAY_DOCKERFILE_PATH=openwa-service/Dockerfile
FROM openwa/wa-automate

ENTRYPOINT ["/bin/sh", "-c"]
CMD ["npx @open-wa/wa-automate@4.76.0 -p ${PORT:-8080} -k ${OPENWA_API_KEY} --session-id ${OPENWA_SESSION_ID:-default} --api-host ${OPENWA_PUBLIC_URL:-} -w ${FLASK_WEBHOOK_URL}?token=${OPENWA_WEBHOOK_SECRET} --keep-alive"]
