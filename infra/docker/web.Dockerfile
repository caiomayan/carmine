# syntax=docker/dockerfile:1
# Imagem do web (Next.js standalone). Construir a partir da raiz do repositório:
#   docker buildx build -f infra/docker/web.Dockerfile --platform linux/amd64,linux/arm64 .
#
# A compilação roda sempre na arquitetura de quem constrói ($BUILDPLATFORM) e o resultado serve
# amd64 e arm64 (Oracle A1): o servidor standalone é JavaScript puro. O único binário nativo que
# o Next rastreia é o sharp, que não usamos (images.unoptimized) e é removido abaixo.

ARG NODE_IMAGE=node:24.21.0-alpine3.24

FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

# Manifestos primeiro, para a camada de dependências ficar em cache entre builds.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@carmine/web..."

COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/web apps/web
# Documentos legais (Regras de conduta, Termos, Privacidade) lidos pelo web: docs/legal/*.md.
COPY docs/legal docs/legal
# next/font baixa a Inter no build e a serve do próprio domínio (sem Google em runtime).
# Os contratos (@carmine/contracts) são compilados antes, como dependência do web.
RUN pnpm --filter @carmine/contracts run build  && NEXT_OUTPUT=standalone pnpm --filter @carmine/web run build \
 && cd apps/web/.next/standalone \
 && find . \( -path '*/@img/*' -o -path '*/node_modules/sharp' \) -prune -exec rm -rf {} + \
 && cp -r ../static apps/web/.next/static \
 && if find . -name '*.node' | grep -q .; then echo 'binário nativo no standalone' >&2; exit 1; fi

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/web/server.js"]
