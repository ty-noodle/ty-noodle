# GEMINI.md - T&YNoodle Project Context

## Project Overview
**T&YNoodle** is a digital management system for a noodle and raw material distribution business. It handles orders, delivery, payments, and reporting. The application is built with **Next.js 16 (App Router)** and designed as a **Progressive Web App (PWA)** to provide a mobile-first, offline-capable experience for staff.

### Main Technologies
- **Framework:** [Next.js 16](https://nextjs.org) (App Router, Server Components, Server Actions).
- **Database & Auth:** [Supabase](https://supabase.com) via `@supabase/ssr`.
- **Integration:** [LINE LIFF](https://developers.line.biz/en/docs/liff/) (`@line/liff`) for mobile app integration.
- **Styling:** [Tailwind CSS 4](https://tailwindcss.com) with custom Thai fonts (**Sarabun**) and **IBM Plex Mono**.
- **Icons:** [Lucide React](https://lucide.dev).
- **Language:** TypeScript.
- **Primary Language:** Thai (UI/UX).

---

## Architecture & Structure
- `src/app`: Routes, layouts, and server components.
  - `/login`: PIN-based authentication.
  - `/orders` & `/order`: Core order management.
  - `/dashboard`: Business analytics and reporting.
  - `/stock`: Inventory management.
  - `/settings`: Organization and user settings.
- `src/components`: UI components, including `liff-provider` and `pwa-provider`.
- `src/lib`: Core logic, divided by domain (auth, orders, stock, supabase).
  - `auth/`: Custom session management with HMAC signatures and PIN hashing (scrypt).
  - `supabase/`: Server and browser clients for Supabase.
- `src/types`: TypeScript definitions, including Supabase generated types.
- `scripts/`: Utility scripts for type generation and migrations.

---

## Building and Running

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm run start
```

### Utility Scripts
- **Type Generation:** `npm run gen:types` (Generates types from Supabase).
- **Linting:** `npm run lint`.

---

## Required Environment Variables
The application requires the following environment variables (defined in `.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (for admin operations).
- `LOGIN_PIN_PEPPER`: Secret pepper for PIN hashing.
- `SESSION_SECRET`: Secret for signing session cookies.
- `NEXT_PUBLIC_LIFF_ID`: LINE LIFF ID.

---

## Development Conventions
1. **Server-Side Logic:** Always use `"server-only"` for modules containing sensitive logic or direct database access in `src/lib`.
2. **Authentication:** Uses a custom PIN-based authentication system. Sessions are stored in a signed cookie (`tynoodle_session`).
3. **Data Fetching:** Prefer Server Components and Server Actions for data operations. Use `createServerClient` from `src/lib/supabase/server.ts`.
4. **PWA:** The application is a PWA. Ensure new UI elements are responsive and mobile-friendly.
5. **i18n:** The primary user interface is in Thai. Use the `Sarabun` font for Thai text.
6. **Icons:** Use `lucide-react` for all iconography.

---

## Key Files
- `src/app/layout.tsx`: Root layout with font and provider setup.
- `src/lib/auth/session.ts`: Custom session signing and verification.
- `src/lib/auth/pin.ts`: PIN hashing and lookup logic.
- `src/lib/supabase/server.ts`: Supabase client factory for Server Components/Actions.
- `src/components/liff-provider.tsx`: LINE LIFF integration provider.
- `manifest.ts`: Web App Manifest configuration.
