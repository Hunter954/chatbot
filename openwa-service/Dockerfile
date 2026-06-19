# Serviço separado para OpenWA/EASY API no Railway.
# Configure o Railway para usar este Dockerfile:
# RAILWAY_DOCKERFILE_PATH=openwa-service/Dockerfile
#
# Importante:
# - Monte um Volume em /data para persistir a sessão do WhatsApp.
# - O OpenWA é instalado no build, nunca baixado no boot.
# - A sessão é forçada para /data/sessions pelo start-openwa.sh.
FROM openwa/wa-automate

USER root
WORKDIR /app

ENV W_A_V=4.76.0 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    OPENWA_DATA_DIR=/data \
    OPENWA_SESSION_DATA_DIR=/data/sessions \
    OPENWA_LOG_STDERR_TO_STDOUT=true

COPY openwa-service/package.json /app/package.json
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force \
    && mkdir -p /data /data/sessions /app/config \
    && chmod -R 777 /data /app/config

COPY openwa-service/start-openwa.sh /app/start-openwa.sh
RUN chmod +x /app/start-openwa.sh

ENTRYPOINT []
CMD ["/app/start-openwa.sh"]
