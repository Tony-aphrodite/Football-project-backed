# Root-level Dockerfile for Railway — builds the NestJS backend from the monorepo.

# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app

COPY backend/package*.json ./
RUN npm ci

COPY backend/tsconfig*.json backend/nest-cli.json ./
COPY backend/src ./src
RUN npm run build && npm prune --omit=dev

# ---- Runtime stage ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S nodejs && adduser -S nodejs -G nodejs
USER nodejs

COPY --from=build --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist
COPY --from=build --chown=nodejs:nodejs /app/package.json ./package.json

EXPOSE 3000
CMD ["node", "dist/main.js"]
