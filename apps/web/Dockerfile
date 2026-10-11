# Build from the repository root:  docker build -f apps/web/Dockerfile --build-arg VITE_API_URL=https://api.example.com .
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
ARG VITE_API_URL=http://localhost:8787
ENV VITE_API_URL=$VITE_API_URL
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @gramwritingly/web...
COPY packages/core packages/core
COPY apps/web apps/web
RUN pnpm --filter @gramwritingly/core build && pnpm --filter @gramwritingly/web build

FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
RUN printf 'server { listen 80; root /usr/share/nginx/html; location / { try_files $uri /index.html; } }\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
