# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the repo root via `pnpm`.

```bash
pnpm dev              # start all apps (web + server + native)
pnpm dev:web          # Next.js only (port 3001)
pnpm dev:server       # Fastify/tRPC only (port 3000)
pnpm dev:native       # Expo only
pnpm build            # build all workspaces
pnpm check-types      # TypeScript check across all apps/packages

pnpm db:push          # push Drizzle schema to Neon (no migration file)
pnpm db:generate      # generate migration files
pnpm db:migrate       # run migrations
pnpm db:studio        # open Drizzle Studio
```

No lint or format script exists at the root. Use `pnpm check-types` as the minimum gate before submitting changes.

## Architecture

`cipher-atlas` is a pnpm + Turborepo monorepo. Apps live in `apps/`, shared packages in `packages/`.

### Request lifecycle

```
apps/web (Next.js)  ──trpc──▶  apps/server (Fastify)  ──mounts──▶  packages/api (routers)
                                       │                                     │
                               packages/auth (better-auth)          packages/db (Drizzle+Neon)
```

- **`packages/api`** is where all tRPC logic lives — routers, procedures, context. `apps/server` just registers the Fastify plugin and wires it to this package.
- **Context** (`packages/api/src/context.ts`) resolves a `better-auth` session from request headers. All procedures receive `{ session, auth }`.
- Two procedure types: `publicProcedure` (unauthenticated) and `protectedProcedure` (throws `UNAUTHORIZED` if no session).
- New routers go in `packages/api/src/routers/` and are registered in `packages/api/src/routers/index.ts`.

### Auth

`packages/auth` configures `better-auth` with:
- Drizzle adapter (schema in `packages/db/src/schema/auth.ts`)
- Polar payments plugin (checkout + customer portal)
- Expo plugin for native deep-link redirects

The server mounts the auth handler at `/api/auth/*`. The web client uses `authClient` from `apps/web/src/lib/auth-client.ts`.

### Database

`packages/db` uses Drizzle ORM with `@neondatabase/serverless`. Schema files live in `packages/db/src/schema/`. Import the `db` singleton or `createDb()` factory from `@cipher-atlas/db`.

### Environment variables

`packages/env` exports three separate validated env objects via `@t3-oss/env-core`:
- `@cipher-atlas/env/server` — server-only vars (`DATABASE_URL`, `BETTER_AUTH_SECRET`, etc.)
- `@cipher-atlas/env/web` — client-safe vars prefixed `NEXT_PUBLIC_`
- `@cipher-atlas/env/native` — Expo vars

Always import the correct export for the context. Never import `server` env in web/native code.

Each app has its own `.env` file at `apps/{web,server,native}/.env`.

### Web app routes

`apps/web/src/app` uses Next.js route groups:
- `(marketing)` — public-facing pages (landing, login, etc.)
- `(app)` — authenticated dashboard pages

### UI / Styling

All shared shadcn/ui primitives live in `packages/ui/src/components/`. Import them as `@cipher-atlas/ui/components/<name>`.

To add shared primitives (available across web + native):
```bash
pnpm dlx shadcn add <component> -c packages/ui
```

To add app-specific blocks for the web app only, run the CLI from `apps/web`.

Brand design tokens are defined in `packages/ui/src/styles/globals.css` using `@theme`. Style with Tailwind utility classes only — do not add per-route CSS files.

Motion primitives (`packages/ui/src/components/motion/`) come from the `@beui` registry.

## Conventions

- TypeScript-first, ES modules throughout.
- Conventional Commits with scopes: `feat(web):`, `fix(ui):`, `chore(db):`, etc.
- React components: `PascalCase`. Functions/variables: `camelCase`. Route directories: `lowercase`.
- Package-scoped imports: `@cipher-atlas/ui/components/button`, `@cipher-atlas/db`, etc.
- Do not add Co-Authored-By trailers to commits.
- Build UI/design explorations as separate previewable routes, not by picking one design upfront.
