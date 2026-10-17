# VCB_BE — auth, users, gateway sang VCB_AI
#
#   docker build -t vcb-be:latest .
#   docker tag  vcb-be:latest <registry>/vcb-be:latest
#   docker push <registry>/vcb-be:latest
#
# Runtime cần Postgres + secret (đừng bake .env):
#   -e DATABASE_URL=postgresql://... -e DIRECT_URL=postgresql://...
#   -e JWT_SECRET=... -e JWT_REFRESH_SECRET=...
#   -e ASSISTANT_INTERNAL_SECRET=... -e AI_SERVICE_URL=http://vcb-ai:8787
#   -e FRONTEND_URL=https://... -e ALLOWED_ORIGINS=https://...
#   -e NODE_ENV=production

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npx nest build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        openssl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3011 \
    API_PREFIX=api/v1

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --ignore-scripts \
    && npm install prisma@$(node -p "require('./package.json').devDependencies.prisma") --omit=dev \
    && npx prisma generate

COPY --from=build /app/dist ./dist

EXPOSE 3011

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3011/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
