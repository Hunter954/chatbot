FROM openwa/wa-automate:latest

USER root
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    OPENWA_DATA_DIR=/data \
    OPENWA_SESSION_DATA_PATH=/data/sessions \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# NÃO usar apt-get aqui.
# A imagem base tem um repositório do Google Chrome com chave expirada/ausente,
# e o apt-get update quebra o build no Railway.
# Criamos um fallback mínimo para o binário `ps`, suficiente para evitar o crash
# `spawn ps ENOENT` observado nos logs.
RUN mkdir -p /usr/local/bin \
 && printf '#!/bin/sh\nexit 0\n' > /usr/local/bin/ps \
 && chmod +x /usr/local/bin/ps

COPY openwa-service/package.json /app/package.json
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY openwa-service/server.js /app/server.js

EXPOSE 8080
ENTRYPOINT ["node", "/app/server.js"]
