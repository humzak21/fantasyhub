# Build the static bundle, then serve it. There is no application server:
# the weekly ESPN sync runs as a GitHub Actions cron (.github/workflows/sync-week.yml),
# not as a long-lived node-cron process inside this image.
FROM node:22-alpine AS build

WORKDIR /app

# Vite inlines these at build time, so they must be present for `npm run build`,
# not at runtime. All are public values; nothing secret belongs here.
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

# Runtime stage carries the built assets and a static server, nothing else.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/dist ./dist
RUN npm install --no-audit --no-fund --global serve@14

EXPOSE 3000

CMD ["sh", "-c", "serve -s dist -l ${PORT:-3000}"]
