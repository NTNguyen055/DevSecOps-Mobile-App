# ---- Production Server (API Only) ----
# Frontend is React Native / Expo, no longer served by Express.
FROM node:22-alpine AS runner

RUN npm install -g npm@latest && \
    apk upgrade --no-cache && \
    npm cache clean --force

WORKDIR /app

# Non-root user for security
RUN addgroup -S ntngroup && adduser -S ntnuser -G ntngroup

# Install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy backend source code
COPY app.js server.js ./
COPY routes/ routes/
COPY models/ models/
COPY middleware/ middleware/
COPY db/ db/
COPY docs/ docs/
COPY scripts/ scripts/

# npm is not required at runtime
RUN rm -rf /usr/local/lib/node_modules/npm

USER ntnuser

EXPOSE 4001

ENV NODE_ENV=production
ENV PORT=4001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4001/health/db', (res) => process.exit(res.statusCode === 200 ? 0 : 1))" || exit 1

CMD ["node", "server.js"]