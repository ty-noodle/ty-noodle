# TYNoodle: LINE Authentication & Store Selection Flow

This document details the implementation of **Plan B** for user authentication and authorization within the TYNoodle ordering system.

## 1. Purpose & Objective
We needed a secure and user-friendly way to restrict access to the ordering catalog.
- **Why?** To ensure only authorized customers can place orders and to map LINE users to specific customer records in our database.
- **Plan B:** Instead of a complex pre-verification, we allow any LINE user to access the app, but they **must select their store (Customer record)** on their first visit. This links their `line_user_id` to the `customers` table permanently.

---

## 2. Current Status

### Backend (Server Actions)
Implemented in `src/app/order/actions.ts`:
- **Verification:** `getCustomerByLineId` checks if a user is already linked.
- **Listing:** `getUnlinkedCustomers` fetches customers who haven't linked a LINE account yet.
- **Linking:** `linkLineIdToCustomer` saves the mapping in Supabase.

### Frontend (Client Component)
Implemented in `src/app/order/order-client.tsx`:
- **State Machine:** Uses 6 views (`loading`, `login`, `select_store`, `catalog`, `cart`, `success`).
- **Persistence:** Uses `useEffect` and `useTransition` to handle the logic flow automatically upon app start.

### Local Development (Simulator Mode)
- Integrated `@line/liff-mock` to allow development without being blocked by real LINE OAuth redirects (which fail on localhost/ngrok free tier).
- Controlled by `NEXT_PUBLIC_LIFF_MOCK=true` in `.env.local`.

---

## 3. Implementation Details for Developers

### Database Schema Change
You MUST apply this SQL in the Supabase Dashboard SQL Editor:
```sql
alter table public.customers add column if not exists line_user_id text;
create unique index if not exists customers_line_user_id_unique on public.customers (line_user_id) where line_user_id is not null;
```

### TypeScript Types
After applying the SQL, run:
```bash
npm run gen:types
```

### File Map
1. **`src/app/order/page.tsx`**: Entry point, fetches initial data and passes `organizationId`.
2. **`src/app/order/order-client.tsx`**: Main UI logic and view management.
3. **`src/app/order/actions.ts`**: Secure backend logic using Supabase Admin client.
4. **`src/components/liff-provider.tsx`**: Wrapper for LIFF SDK with mock support.

---

## 4. Next Steps & TODOs

### 1. Polish the Store Selection UI
- [ ] Add more details to the store cards (e.g., address or branch name).
- [ ] Implement a "Request new store" if the user can't find their store in the list.

### 2. Admin Interface
- [ ] Create a view for admins to see which LINE IDs are linked to which customers.
- [ ] Add a way to "Unlink" a user if they made a mistake.

### 3. Production Deployment
- [ ] Change `NEXT_PUBLIC_LIFF_MOCK` to `false` in production.
- [ ] Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in the production environment variables (Vercel/etc.).
- [ ] Update LIFF Endpoint URL in LINE Developers Console to the production URL.

---

## 5. Troubleshooting (Local Testing)
If the **Login** button does nothing on localhost:
- Ensure `NEXT_PUBLIC_LIFF_MOCK=true` is in `.env.local`.
- Restart the dev server (`npm run dev`).
- Check the browser console (F12) for any LIFF initialization errors.
