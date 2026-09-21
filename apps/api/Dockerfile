# Etapa de compilação
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY tsconfig*.json ./

RUN npm ci
RUN npm run build -w @aer/api

# Etapa de execução
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

RUN npm ci --omit=dev

EXPOSE 3000

CMD ["node", "apps/api/dist/index.js"]
