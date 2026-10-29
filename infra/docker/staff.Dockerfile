# syntax=docker/dockerfile:1
# Imagem do painel da Staff (S25, Next.js standalone). Construir a partir da raiz do repositório:
#   docker buildx build -f infra/docker/staff.Dockerfile --platform linux/amd64,linux/arm64 .
#
# Igual à do web (infra/docker/web.Dockerfile): a compilação roda sempre na arquitetura de quem constrói
# ($BUILDPLATFORM) e o resultado serve amd64 e arm64 (Oracle A1), porque o servidor standalone é JavaScript puro.
# O painel não usa o sharp (images.unoptimized); o que o Next rastrear dele é removido abaixo.

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
COPY apps/staff/package.json apps/staff/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@carmine/staff..."

COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/staff apps/staff
# next/font baixa a Inter no build e a serve do próprio domínio (sem Google em runtime).
# O standalone não leva o .next/static nem o public/: os dois são copiados para dentro dele.
RUN pnpm --filter @carmine/contracts run build && NEXT_OUTPUT=standalone pnpm --filter @carmine/staff run build \
 && cd apps/staff/.next/standalone \
 && find . \( -path '*/@img/*' -o -path '*/node_modules/sharp' \) -prune -exec rm -rf {} + \
 && cp -r ../static apps/staff/.next/static \
 && if [ -d ../../public ]; then cp -r ../../public apps/staff/public; fi \
 && if find . -name '*.node' | grep -q .; then echo 'binário nativo no standalone' >&2; exit 1; fi

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3100
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/staff/.next/standalone ./
USER node
EXPOSE 3100
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/healthz`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/staff/server.js"]
