FROM openwa/wa-automate:latest

# A imagem base do OpenWA vem com Node/Chromium, mas algumas variantes não trazem o binário `ps`.
# O @open-wa/wa-automate/puppeteer chama `ps -A -o ppid,pid,stat,comm` ao lidar com processos.
# Sem isso o container cai com: Error: spawn ps ENOENT, antes de mostrar o QR.
USER root
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    OPENWA_DATA_DIR=/data \
    OPENWA_SESSION_DATA_PATH=/data/sessions \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN set -eux; \
    if command -v apt-get >/dev/null 2>&1; then \
      apt-get update; \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends procps; \
      rm -rf /var/lib/apt/lists/*; \
    elif command -v apk >/dev/null 2>&1; then \
      apk add --no-cache procps; \
    elif command -v microdnf >/dev/null 2>&1; then \
      microdnf install -y procps-ng; \
      microdnf clean all; \
    fi; \
    if ! command -v ps >/dev/null 2>&1; then \
      printf '#!/bin/sh\nexit 0\n' > /usr/local/bin/ps; \
      chmod +x /usr/local/bin/ps; \
    fi

COPY openwa-service/package.json /app/package.json
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY openwa-service/server.js /app/server.js

EXPOSE 8080

# Sobrescreve totalmente o ENTRYPOINT herdado da imagem openwa/wa-automate.
# Sem isso, a imagem tenta rodar ./start.sh via dumb-init e o Railway reinicia o container.
ENTRYPOINT ["node", "/app/server.js"]
