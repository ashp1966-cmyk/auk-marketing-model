# Multi-Tenant Migration Brief — Neon + Clerk

Hand this whole file to Claude Code in the auk-marketing-deploy project folder.

## Goal
Replace the single shared-password login and localStorage persistence with real
multi-tenant accounts (Clerk Organizations) and a shared Postgres database (Neon),
so each client company's data is fully isolated from every other's.

## What already exists
- `DATABASE_URL` is already set in Vercel (Neon was provisioned via `vercel install neon`)
- `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are already set in Vercel env vars
- Neon already has three tables: `tenants`, `tenant_data`, `tenant_activity` (schema below, already run)
- Clerk Organizations is enabled; "AUK Marine & Mining" already exists as the first organization

```sql
create table tenants (
  id text primary key, name text not null, created_at timestamptz default now()
);
create table tenant_data (
  tenant_id text primary key references tenants(id) on delete cascade,
  data jsonb not null default '{}'::jsonb, updated_at timestamptz default now()
);
create table tenant_activity (
  id bigserial primary key, tenant_id text references tenants(id) on delete cascade,
  user_id text not null, action text not null, created_at timestamptz default now()
);
```

## Step 1 — Install dependencies
```
npm install @clerk/clerk-react @clerk/backend @neondatabase/serverless
```

## Step 2 — Replace the login screen
The current `Login` component in `src/App.jsx` checks a shared username/password
against `/api/login`. Replace it with Clerk's `<SignIn />` component and wrap the
whole app in `<ClerkProvider>` (using `CLERK_PUBLISHABLE_KEY`, exposed to the client
as `VITE_CLERK_PUBLISHABLE_KEY` — add that to Vercel env vars too, since it must be
public/client-side unlike the secret key).

Require an active organization before showing the app — if the logged-in user has
no active organization, show Clerk's `<OrganizationSwitcher />` or a simple
"contact your admin" screen rather than the main app.

## Step 3 — New API route: `api/tenant-data.js`
Replace `api/login.js`'s role entirely. This new serverless function:
- Verifies the Clerk session token from the request (via `@clerk/backend`)
- Extracts the active organization ID from the verified token — never trust an
  org ID sent directly by the client
- On GET: `select data from tenant_data where tenant_id = $1`, upserting a
  `tenants` row first if this organization has never been seen before
- On POST: `insert into tenant_data (tenant_id, data) values ($1, $2)
  on conflict (tenant_id) do update set data = $2, updated_at = now()`
- Also insert a row into `tenant_activity` on every POST, recording the Clerk
  user ID and a short action description, for a lightweight audit trail

## Step 4 — Rewire persistence in `src/App.jsx`
Replace every `localStorage.getItem`/`setItem` call in `loadSaved()`,
`persistNow()`, and the `beforeunload`/`pagehide` flush handlers with fetch calls
to `/api/tenant-data` (GET to load, POST to save), passing the Clerk session
token in the Authorization header. Keep the exact same debounce/auto-save/
sign-out-flush structure already in place — only the storage backend changes,
not the save-triggering logic.

## Step 5 — Keep api/generate.js unchanged
The Anthropic AI proxy doesn't need to change — it's not tenant-specific data,
it's a stateless pass-through. Leave it exactly as is.

## Testing checklist before pushing
- [ ] Sign in as AUK Marine & Mining → confirm existing data loads (or starts blank first time)
- [ ] Make a change (e.g. add a service) → refresh → confirm it persisted via Neon, not localStorage
- [ ] Check the Neon `tenant_data` table directly in the SQL editor — confirm the row exists and `data` contains the expected JSON
- [ ] Sign out and back in → confirm re-authentication works via Clerk, not the old password screen

## Do NOT do in this pass
- Do not build a client-onboarding/signup flow yet (adding new organizations manually via Clerk's dashboard is fine for now)
- Do not remove `api/login.js` from the repo yet — just stop using it, in case we need to roll back
- Do not touch the AI campaign generation logic, the funnel/optimizer calculations, or any UI styling
