# Build from the repository root:  docker build -f apps/server/Dockerfile .
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --filter @gramwritingly/server...
COPY packages/core packages/core
COPY apps/server apps/server
RUN pnpm --filter @gramwritingly/core build && pnpm --filter @gramwritingly/server build \
 && pnpm deploy --filter @gramwritingly/server --prod --legacy /out

FROM node:22-slim
ENV NODE_ENV=production PORT=8787 DATABASE_PATH=/data/gramwritingly.db
WORKDIR /app
COPY --from=build /out .
VOLUME ["/data"]
EXPOSE 8787
USER node
CMD ["node", "dist/index.js"]
