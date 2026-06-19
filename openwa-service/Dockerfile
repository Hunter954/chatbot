FROM openwa/wa-automate:latest

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    OPENWA_DATA_DIR=/data \
    OPENWA_SESSION_DATA_PATH=/data/sessions

COPY openwa-service/package.json /app/package.json
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force \
    && mkdir -p /data /data/sessions \
    && chmod -R 777 /data

COPY openwa-service/server.js /app/server.js

EXPOSE 8080
CMD ["npm", "start"]
