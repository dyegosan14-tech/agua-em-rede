# Etapa de compilação
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker
COPY tsconfig*.json ./

RUN npm ci
RUN npm run build -w @aer/worker

# Etapa de execução
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/package.json

RUN npm ci --omit=dev

CMD ["node", "apps/worker/dist/index.js"]
