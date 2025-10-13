# syntax=docker/dockerfile:1.6

ARG NODE_VERSION=20-alpine

FROM node:${NODE_VERSION} AS dev

WORKDIR /app

ARG NPM_REGISTRY_URL=https://registry.npmjs.org/
RUN npm config set registry ${NPM_REGISTRY_URL}

COPY frontend/package.json frontend/package-lock.json ./

ARG NPM_CACHE_DIR=deploy/offline/npm/frontend
COPY ${NPM_CACHE_DIR}/ /offline/npm-cache/

RUN if find /offline/npm-cache -mindepth 1 -type f ! -name '.gitkeep' -print -quit >/dev/null; then \
        npm ci --offline --cache /offline/npm-cache; \
    else \
        npm ci --cache /offline/npm-cache; \
    fi

COPY frontend/ ./

ENV HOST=0.0.0.0 \
    NPM_CONFIG_CACHE=/offline/npm-cache

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]
