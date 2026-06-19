# Serviço separado para OpenWA/EASY API.
# No Railway, crie um segundo service apontando para este Dockerfile com:
# RAILWAY_DOCKERFILE_PATH=openwa-service/Dockerfile
#
# Importante para Railway:
# - Monte um Volume em /data para persistir a sessão do WhatsApp.
# - Rodamos como root porque volumes do Railway podem ser montados sem permissão
#   de escrita para o usuário padrão da imagem OpenWA.
# - O arquivo de config fica fora do volume para evitar erro de permissão.
FROM openwa/wa-automate

USER root
WORKDIR /data

RUN mkdir -p /data /app/config \
    && printf '{}' > /app/config/cli.config.json \
    && chmod 644 /app/config/cli.config.json

COPY openwa-service/start-openwa.sh /app/start-openwa.sh
RUN chmod +x /app/start-openwa.sh

ENTRYPOINT []
CMD ["/app/start-openwa.sh"]
