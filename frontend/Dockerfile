# Build context is the repo root (npm workspaces monorepo).
FROM node:22-alpine

WORKDIR /repo

COPY package.json package-lock.json ./
COPY frontend frontend
COPY backend/package.json backend/package.json

RUN npm ci --workspace frontend --include-workspace-root

# VITE_API_URL is baked into the static bundle at build time (Vite convention),
# so it must be a build ARG, not just a runtime container env var.
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build --workspace frontend

WORKDIR /repo/frontend
EXPOSE 5173

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]
