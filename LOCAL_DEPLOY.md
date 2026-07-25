# Local deploy guide

This is a standalone TanStack Start (React 19 + Vite 7) app. No Lovable account or
workspace is required — plain Node + npm is enough.

## 1. Requirements

- Node.js 20 or newer
- npm (or bun / pnpm — any works)

## 2. Install

```sh
npm install
```

## 3. Environment variables

Copy `.env.example` to `.env` (a working `.env` is already included in the zip):

```sh
cp .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | Backend REST + Auth URL |
| `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Public key, safe in the browser |
| `SUPABASE_PROJECT_ID` / `VITE_SUPABASE_PROJECT_ID` | Project reference id |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional. Only needed if you add admin-only server code |

The app talks to the same hosted backend (database, auth, storage) that the preview
uses, so data and logins carry over. Point the variables at your own backend project
if you want a separate database — then re-create the schema there (tables, enums,
RLS policies, the `app-media` storage bucket).

## 4. Run in development

```sh
npm run dev
```

Opens on http://localhost:8080

## 5. Production build

```sh
npm run build
npm run preview
```

`npm run build` emits a server bundle in `.output/`. It targets an edge/worker
runtime by default (Cloudflare). To run it on a Node server instead, build with the
Node preset:

```sh
NITRO_PRESET=node_server npm run build
node .output/server/index.mjs
```

Then serve it behind any reverse proxy (nginx, Caddy) on your own host.

## 6. Auth redirect URLs

Email verification and password reset links point back to the origin the user signed
up from. When you deploy under a new domain, add that domain to the backend Auth
redirect allow-list, otherwise the confirmation link bounces.

## Project layout

```
src/routes/          file-based routes (pages + api)
src/routes/_authenticated/   logged-in app (owner, cleaner, worker, HR)
src/components/      shared UI (app shell, shadcn components)
src/lib/*.functions.ts  server functions (RPC called from the client)
src/i18n/            EN / 简体 / 繁體 translations
src/integrations/supabase/  generated backend clients and types
```
