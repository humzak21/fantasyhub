## Goals
- Run both backends under one Express server and one Railway service.
- Unify environment variables and avoid leaks/conflicts between client/server.
- Align Node, Vite and core library versions.
- Merge .gitignore rules so the nested app doesn’t accidentally commit secrets or build outputs.
- Keep MovieTracker “hidden” as a feature path within the hub (e.g., `/api/movies`, `/movies`), while preserving its functionality.

## Current State (audit)
- FantasyHub root uses Vite `^6.0.5`, Tailwind `^4.1.17`, Node engines `>=22.11.0`, and no Express in production (Railway starts `vite preview`) (`package.json:7–13`, `railway.json:8–13`).
- FantasyHub has an Express server for analytics (`server.js`) but it isn’t wired in production.
- MovieTracker root uses Vite `^6.0.0`, Node engines `>=18.0.0` and ships a separate backend (`movietracker/backend/server.js`) which serves the built frontend and APIs.
- Version mismatches: Express 5 vs 4; React Router 6 vs 7; Supabase minor differences; Helmet 8 vs 7.
- Env patterns: client uses `VITE_*`; backend uses non-`VITE_*` plus `TMDB_*` and `FRONTEND_URL`.

## Architecture Plan
- Single Node server (FantasyHub `server.js`) will host both:
  - Keep existing analytics routes.
  - Mount MovieTracker backend as an Express sub-app under `/api/movies` and `/api/movies/stats`.
- Refactor MovieTracker backend to export an Express `router/app` without calling `app.listen()`. Keep its `helmet`, CORS, body-parsing and routes; remove its static serving of `../dist` (frontend will be handled by the hub).
- Frontend integration will happen later; for backend paths we standardize:
  - MovieTracker API base: `/api/movies` (was `/api`) and `/api/movies/stats` (was `/api/stats`).

## Version Alignment (backend-focused)
- Engines: set root to `node >=22` and use that across the project; drop the nested `>=18` requirement.
- Express: upgrade MovieTracker backend to `express ^5.1.0` to match the hub; verify middleware signatures still work (they do for typical usage).
- Helmet: align to `^8.1.0` in both.
- Morgan, CORS, `node-fetch`, `multer`, `rate-limiter-flexible`: align to the hub’s versions where present (most already match or are compatible).
- Supabase server SDK: align to the latest used in the hub or upgrade both to `^2.49.x`.

## Environment Variables (consolidate into hub `.env.local` / Railway)
- Client (exposed):
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (already in hub).
- Server (non-exposed):
  - `SUPABASE_URL` (optional if you rely only on `VITE_*` for client), `SUPABASE_SERVICE_ROLE_KEY`.
  - `TMDB_API_KEY`, `TMDB_BASE_URL` (defaults to `https://api.themoviedb.org/3`).
  - `FRONTEND_URL` (hub domain); `VERCEL_URL` optional.
  - `PORT=3001` for Node server.
  - Rate limiting/limits used by MovieTracker: `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`, `MAX_FILE_SIZE`.
- Rename/avoid collisions:
  - Keep `VITE_*` for anything the browser reads; everything else unprefixed.
  - Do not duplicate `NODE_ENV`/`PORT` entries across sub-projects; use the root values only.

## .gitignore Merge
- Add MovieTracker-specific ignores (nested `.env`, `backend/.env`, guides, `dist/`, CSVs, private docs) into the root `.gitignore` so nothing sensitive within `movietracker/` is committed.
- Keep root’s broader secret and environment patterns; ensure `.env.example` files remain tracked.

## Dev Workflow
- Root dev server remains `vite` for the hub frontend.
- Add a single `server:dev` script to run the unified Express server on `3001`.
- Configure Vite dev proxy in the hub to forward `/api/movies` to `http://localhost:3001` so MovieTracker API calls work in development.

## Deployment (Railway)
- Switch Railway `startCommand` to run the Node server (`node server.js`) instead of `vite preview`.
- Ensure the build step runs `vite build` to produce `dist/` for static serving; the server will serve hub `dist`.
- With the sub-app mounted, MovieTracker APIs run within the same service; remove its separate Railway deployment logic.

## Implementation Steps (backend)
1. Create `movietracker/backend/app.js` that builds and exports an Express `app/router` without `listen()`.
2. Move current route mounts (`/api`, `/api/stats`) into that sub-app; preserve middleware and error handlers that are request-scoped; drop static file serving.
3. In hub `server.js`, import and mount the sub-app under `/api/movies` and `/api/movies/stats`.
4. Align dependencies: bump MovieTracker backend packages to match hub (Express 5, Helmet 8, Supabase 2.49.x).
5. Env consolidation: add server-only vars to root `.env.local` and document required values; remove nested `.env` reliance by loading only once in the root server.
6. Merge `.gitignore` rules from `movietracker/.gitignore` into the root.
7. Update Railway config to start the Node server and keep health checks consistent (`/health`).
8. Add a Vite proxy in the hub for dev (`server.proxy['/api/movies'] -> 'http://localhost:3001'`).

## Validation
- Local: run hub dev (`vite`) + `server:dev`; hit `/health`, `/api/analytics/*`, `/api/movies/*` and `/api/movies/stats/*`.
- Unit smoke tests: add minimal supertest checks for the mounted routes responding 200.
- Deployment: verify Railway healthcheck passes; call both API namespaces and confirm CORS and helmet CSPs play well with Supabase and TMDB endpoints.

## Risks & Mitigations
- Express 4→5 upgrade: test route handlers; most standard usage is compatible.
- CORS/CSP: unify `connectSrc`, `imgSrc` to include TMDB and Supabase; test in production.
- Env leakage: enforce `VITE_*` only for client; keep TMDB key server-side.
- Future frontend integration: React Router 6 vs 7 differences are scoped to frontend work; backend unaffected.

If this plan looks good, I’ll implement the backend refactor, version alignment, env consolidation, `.gitignore` merge, dev proxy, and Railway start command in one pass, verify locally, and prepare a short checklist for production verification.