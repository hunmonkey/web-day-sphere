FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV HOME=/tmp
ENV DAY_SPHERE_DATA_DIR=/app/.day-sphere

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force \
  && mkdir -p /app/.day-sphere \
  && chmod 775 /app/.day-sphere

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000

CMD ["./node_modules/.bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
