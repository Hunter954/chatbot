FROM openwa/wa-automate:latest

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    OPENWA_DATA_DIR=/data \
    OPENWA_SESSION_DATA_PATH=/data/sessions

COPY openwa-service/package.json /app/package.json

# NÃO criar/chmod /data no build.
# No Railway, /data só existe corretamente em runtime quando o Volume é montado.
# A imagem openwa/wa-automate pode rodar como usuário não-root; tentar mkdir /data no build quebra o deploy.
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY openwa-service/server.js /app/server.js

EXPOSE 8080
CMD ["npm", "start"]
