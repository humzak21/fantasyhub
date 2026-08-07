# Build the static bundle, then serve it. There is no application server:
# the weekly ESPN sync runs as a GitHub Actions cron (.github/workflows/sync-week.yml),
# not as a long-lived node-cron process inside this image.
FROM node:22-alpine AS build

WORKDIR /app

# Vite inlines these at build time, so they must be present for `npm run build`,
# not at runtime. Railway passes service variables to Dockerfile builds as build
# args, which is why they are ARGs here. All are public values; nothing secret
# belongs in a client bundle.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_ADMIN_USER_ID
ARG VITE_APP_NAME
ARG VITE_APP_VERSION

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_ADMIN_USER_ID=$VITE_ADMIN_USER_ID
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_APP_VERSION=$VITE_APP_VERSION

RUN npm config set cache /tmp/.npm-cache

COPY package*.json ./
RUN npm ci --prefer-offline --no-audit

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime: the built assets and a static server, nothing else.
# ---------------------------------------------------------------------------
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/dist ./dist

# package.json is copied for one reason: so `npm start` still works here.
# A runtime stage holding only ./dist is enough for the CMD below, and the first
# version of this file did exactly that -- but Railway's deploy.startCommand
# overrides the image CMD, and it was set to `npm start`, so every container
# died with "ENOENT: no such file or directory, open '/app/package.json'" and
# restarted ten times. railway.json no longer sets a start command, but the
# Railway dashboard can carry its own that this repo cannot clear, so the image
# is built to survive either entry point. `npm start` resolves to the same
# `serve -s dist` the CMD runs. No node_modules is installed here.
COPY --from=build /app/package.json ./package.json

RUN npm install --no-audit --no-fund --global serve@14

EXPOSE 3000

# -s: single-page-app fallback, so client-side routes resolve to index.html
# rather than 404ing.
CMD ["sh", "-c", "serve -s dist -l ${PORT:-3000}"]
