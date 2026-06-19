# Serviço separado para OpenWA/EASY API.
# No Railway, crie um segundo service apontando para este Dockerfile com:
# RAILWAY_DOCKERFILE_PATH=openwa-service/Dockerfile
#
# Importante:
# - Monte um Volume em /data para persistir QR/session do WhatsApp.
# - O pacote OpenWA fica instalado no build, não no boot.
# - O sessionDataPath é forçado em /data/sessions via cli.config.json.
FROM openwa/wa-automate

USER root
WORKDIR /app

ENV W_A_V=4.76.0 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    OPENWA_DATA_DIR=/data \
    OPENWA_SESSION_DATA_DIR=/data/sessions

COPY openwa-service/package.json /app/package.json
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force \
    && mkdir -p /data /data/sessions /app/config

COPY openwa-service/start-openwa.sh /app/start-openwa.sh
RUN chmod +x /app/start-openwa.sh

ENTRYPOINT []
CMD ["/app/start-openwa.sh"]
