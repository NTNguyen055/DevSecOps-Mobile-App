# ---- Stage 1: Build Frontend (React + Vite) ----
FROM node:22-alpine AS client-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# ---- Stage 2: Production Server ----
FROM node:22-alpine AS runner
WORKDIR /app

# Non-root user for security
RUN addgroup -S ntngroup & adduser -S ntnuser -G ntngroup

# Install production dependencies for backend
COPY package*.json ./
RUN npm ci --omit=dev

# Copy backend source code
COPY . .

# Copy built frontend assets from stage 1 into client/dist
COPY --from=client-builder /app/client/dist ./client/dist

# Remove unnecessary source files from final image (keep docs/openapi.yaml for Swagger UI)
RUN rm -rf client/src client/node_modules test/ docs/*.md .git .env*

USER appuser

EXPOSE 4001

ENV NODE_ENV=production
ENV PORT=4001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider -q http://localhost:4001/health/db || exit 1

CMD ["node", "server.js"]
