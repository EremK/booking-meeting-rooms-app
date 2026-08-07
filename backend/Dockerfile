# Build context is the repo root (npm workspaces monorepo).
FROM node:22-alpine

WORKDIR /repo

COPY package.json package-lock.json ./
COPY backend backend
COPY frontend/package.json frontend/package.json

RUN npm ci --workspace backend --include-workspace-root
RUN npm run build --workspace backend

WORKDIR /repo/backend
EXPOSE 3000

# Migrations are safe to run on every startup (idempotent); seeding is not
# (it wipes demo data), so it stays a manual, documented step.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
