FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl postgresql-client
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm db:generate
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache libc6-compat openssl postgresql-client
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY --from=builder /app ./
EXPOSE 3000
CMD ["sh", "-c", "until pg_isready -h relay-status-postgres -p 5432 -U relay_status; do sleep 2; done; pnpm db:generate && pnpm db:push && pnpm db:seed && pnpm start -p 3000"]
