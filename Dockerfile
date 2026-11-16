# The build output is plain JavaScript, so it is built once on the build machine for all platforms.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.server.json tsconfig.client.json vite.config.ts ./
COPY src ./src
RUN npm run build

FROM node:24-alpine
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    APP_VERSION=$APP_VERSION
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1
CMD ["node", "dist/server/server/index.js"]
