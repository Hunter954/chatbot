FROM openwa/wa-automate:latest

WORKDIR /app

ENV NODE_ENV=production

COPY openwa-service/package.json /app/package.json
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY openwa-service/server.js /app/server.js

EXPOSE 8080

# IMPORTANT:
# The openwa/wa-automate base image ships with its own ENTRYPOINT
# that tries to run ./start.sh through dumb-init. This project now
# uses our custom programmatic gateway in server.js, so we must fully
# override the inherited ENTRYPOINT. Without this, Railway starts the
# container with: [dumb-init] ./start.sh: No such file or directory.
ENTRYPOINT ["node", "/app/server.js"]
