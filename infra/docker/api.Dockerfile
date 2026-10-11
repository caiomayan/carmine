# syntax=docker/dockerfile:1
# Imagem da API. Construir a partir da raiz do repositório:
#   docker buildx build -f infra/docker/api.Dockerfile --platform linux/amd64,linux/arm64 .
#
# A compilação roda sempre na arquitetura de quem constrói ($BUILDPLATFORM): a API só tem
# dependências JavaScript puras, então o resultado serve para amd64 e arm64 (Oracle A1)
# sem emular a instalação. Só o estágio final usa a imagem da arquitetura de destino.

ARG NODE_IMAGE=node:24.21.0-alpine3.24

FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

# Manifestos primeiro, para a camada de dependências ficar em cache entre builds.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@carmine/api..."

COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
# As traduções da cs2-lib (~220 MB) só servem ao web: a API valida pelo catálogo, sem nomes.
RUN pnpm --filter "@carmine/api..." run build \
 && pnpm --filter @carmine/api deploy --prod /out \
 && find /out/node_modules -type d -path '*/@ianlucas/cs2-lib/dist/translations' -prune \
      -exec rm -rf {} +

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3333
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3333
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# Migrações: docker run --rm <imagem> node dist/database/migrate.cli.js
CMD ["node", "dist/main.js"]
