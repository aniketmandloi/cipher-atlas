# Repository Guidelines

## Project Structure & Module Organization
`cipher-atlas` is a `pnpm` workspace managed with Turborepo. App entry points live in `apps/`: `web` (Next.js), `server` (Fastify + tRPC), and `native` (Expo/React Native). Shared code lives in `packages/`: `api`, `auth`, `db`, `env`, `ui`, and `config`. UI source is primarily under `packages/ui/src`, while the web app uses route groups under `apps/web/src/app/(app)` and `apps/web/src/app/(marketing)`. Design and planning artifacts live in `design-artifacts/`, `docs/`, and `_bmad/`; avoid mixing those with runtime code.

## Build, Test, and Development Commands
Use `pnpm` from the repository root.

- `pnpm dev`: run the full workspace in development via Turbo.
- `pnpm dev:web`, `pnpm dev:server`, `pnpm dev:native`: start one app at a time.
- `pnpm build`: build all configured workspaces.
- `pnpm check-types`: run TypeScript checks across apps and packages.
- `pnpm db:push`, `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:studio`: manage Drizzle schema and local database workflows.

The web app serves on `http://localhost:3001`; the API runs on `http://localhost:3000`.

## Coding Style & Naming Conventions
This repo is TypeScript-first and uses ES modules. Follow the existing style: 2-space indentation, semicolons, double quotes, and trailing commas where the formatter would place them. Use `PascalCase` for React components, `camelCase` for functions and variables, and lowercase route directory names in `apps/web/src/app`. Keep shared imports package-scoped, for example `@cipher-atlas/ui/components/button`.

No root lint or format script is currently defined, so rely on consistent local formatting and `pnpm check-types` before submitting changes.

## Testing Guidelines
There is no dedicated automated test suite checked in yet. Treat `pnpm check-types` and targeted manual verification as the current minimum gate. When adding tests, colocate them near the code they cover using `*.test.ts` or `*.test.tsx`, and prefer covering shared package logic before app-only UI details.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commit style with scopes, for example `feat(web): ...` and `fix(ui): ...`. Keep commit messages imperative and scoped to the surface you changed.

PRs should include a short summary, linked issue or task when applicable, and screenshots or recordings for visible `web` or `native` UI changes. Call out any env, auth, or database schema changes explicitly, and run `pnpm build` plus `pnpm check-types` before requesting review.
