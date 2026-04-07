# Repository Guidelines

## Project Structure & Module Organization
This repository is a Next.js 16 App Router application. Main application code lives in `src/app`, shared UI in `src/components`, server utilities in `src/lib`, static datasets in `src/data`, and generated database types in `src/types/database.ts`. Public assets and the service worker live in `public/`. Supabase SQL migrations are stored in `supabase/migrations`, utility scripts in `scripts/`, and implementation notes in `docs/`.

## Build, Test, and Development Commands
- `npm run dev`: start the local development server at `http://localhost:3000`.
- `npm run build`: create a production build.
- `npm run start`: serve the production build locally.
- `npm run lint`: run ESLint with the Next.js core-web-vitals and TypeScript rules.
- `npm run gen:types`: regenerate `src/types/database.ts` from the configured Supabase project.

Example: run `npm run gen:types` after editing SQL in `supabase/migrations/`.

## Coding Style & Naming Conventions
Use TypeScript for app code and keep `strict`-mode compatibility. Follow the existing style: 2-space indentation, double quotes, semicolons, and path aliases via `@/*`. Name React components in PascalCase (`CustomerForm.tsx`), helper modules in camelCase or descriptive lowercase (`authorization.ts`, `server.ts`), and route folders with App Router conventions such as `src/app/login/page.tsx`. Keep server-only logic in `src/lib` or server actions, not client components.

## Testing Guidelines
There is no first-party automated test suite in this workspace yet. Until one is added, treat `npm run lint` and a successful `npm run build` as the minimum pre-PR checks. When adding tests, place them near the feature or under a dedicated `src/__tests__/` folder and use `*.test.ts` or `*.test.tsx` naming.

## Commit & Pull Request Guidelines
Git history is not available in this workspace, so no repository-specific commit pattern can be verified. Use short, imperative commit subjects such as `Add customer settings form validation`. For pull requests, include a clear summary, note any Supabase migration or environment variable changes, link related issues, and attach screenshots for UI updates.

## Security & Configuration Tips
Keep secrets in `.env.local` and only commit safe defaults in `.env.example`. Never hand-edit `src/types/database.ts`; regenerate it with `npm run gen:types`. Review `src/proxy.ts` and `src/lib/supabase/*` carefully when changing authentication, session handling, or middleware behavior.
