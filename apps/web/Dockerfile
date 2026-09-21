# Etapa de compilação
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY packages ./packages
COPY apps/web ./apps/web
COPY tsconfig*.json ./

RUN npm ci
RUN npm run build -w @aer/web

# Etapa de serviço HTTP Nginx
FROM nginx:1.27-alpine AS runner

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
