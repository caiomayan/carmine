# syntax=docker/dockerfile:1
# Imagem de operação: backup noturno do Postgres para o R2 e restauração (infra/prod/ops).
# Construir a partir da raiz do repositório:
#   docker buildx build -f infra/docker/ops.Dockerfile --platform linux/amd64,linux/arm64 .
#
# Parte da imagem do próprio Postgres (mesma versão do servidor, então pg_dump e pg_restore
# nunca ficam atrás dele) e acrescenta o rclone, que fala com o R2 (S3), e o curl dos avisos.
ARG POSTGRES_IMAGE=postgres:18.6-alpine

FROM ${POSTGRES_IMAGE}
RUN apk add --no-cache rclone curl tzdata
COPY --chmod=0755 infra/prod/ops/ /opt/ops/
# O volume /backups nasce com o dono certo e a imagem roda sem root.
RUN mkdir -p /backups && chown postgres:postgres /backups
USER postgres
ENTRYPOINT ["/opt/ops/scheduler.sh"]
