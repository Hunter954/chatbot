FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY openwa-service/package.json /app/package.json
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY openwa-service/server.js /app/server.js

EXPOSE 8080
ENTRYPOINT ["node", "/app/server.js"]
