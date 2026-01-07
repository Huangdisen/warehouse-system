# Repository Guidelines

## Project Structure & Module Organization
- `app/` contains Next.js App Router routes and page components (e.g., `app/dashboard`, `app/products`).
- `components/` holds shared UI components.
- `lib/` stores client helpers and shared utilities.
- `database.sql` is the Supabase schema/bootstrap SQL.
- `public/` is not present; static assets live alongside routes when needed.

## Build, Test, and Development Commands
- `npm run dev`: start the local Next.js dev server at `http://localhost:3000`.
- `npm run build`: create a production build with Next.js.
- `npm run start`: run the production server after a build.
- `npm run lint`: run Next.js linting.

## Coding Style & Naming Conventions
- JavaScript (no TypeScript); follow Next.js App Router conventions.
- Indentation: 2 spaces in JS/JSON/CSS.
- File names use lower-case, route-based folders under `app/` (e.g., `app/records`).
- Tailwind CSS is configured via `tailwind.config.js` and `postcss.config.js`.

## Testing Guidelines
- No automated test framework is configured yet.
- For manual verification, exercise core flows: login, product CRUD, stock in/out, and records filtering.
- If adding tests, document the framework and update this file with commands.

## Commit & Pull Request Guidelines
- Recent commits mix conventional prefixes (e.g., `feat:`) with short Chinese descriptions.
- Prefer a short, imperative summary; add a scope prefix when it improves clarity.
- PRs should include: purpose, key changes, and screenshots for UI changes.
- Link relevant issues or tickets when applicable.

## Security & Configuration Tips
- Store Supabase credentials in `.env.local` using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Never commit secrets or personal access tokens.
