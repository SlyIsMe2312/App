# App

## Supabase authentication and data access

The finance dashboard in `app.html` uses Supabase email/password Auth. The sign-in screen supports creating an account; signup and email confirmation must also be enabled/configured in Supabase Auth. The dashboard stays hidden until Supabase restores or creates an authenticated session.

### Protect existing data with Row Level Security

The existing schema uses integer `user_id` values. Before using the authenticated dashboard:

1. In Supabase Auth, create and confirm the account that should own the existing records where `user_id = 1`.
2. Before deploying the updated app, open `supabase-auth-rls.sql`, replace `REPLACE_WITH_AUTH_EMAIL` with that Auth account's email, and run the script in the Supabase SQL Editor.
3. Configure the Supabase Auth Site URL and allowed redirect URL to match the deployed `app.html` URL.
4. Deploy the updated files and sign in with that account. New users can then use **Create Account**.

The migration adds UUID ownership columns, assigns the existing `user_id = 1` records to that Auth account, enables RLS, and replaces policies on `users`, `accounts`, and `transactions` with owner-scoped policies. Rows with other legacy `user_id` values are not assigned and will not be visible until explicitly migrated. The `categories` table is not modified; it contains shared category definitions rather than account/transaction records.

New accounts and transactions are written with the authenticated user's UUID. Database policies enforce ownership independently of client-side filters, and a database trigger prevents transactions from referencing another user's accounts.

### GitHub Pages and Supabase keys

This project is deployed from a GitHub Pages branch, which serves static files and does not run builds or inject GitHub Actions secrets. The Supabase URL and `sb_publishable_...` key in `js/finance/config.js` are public client configuration; browser code cannot keep them secret. Data security comes from Supabase Auth and the RLS migration, not from hiding the publishable key.

Never put a Supabase `service_role` or secret key in this app, GitHub Pages, or any browser bundle. If one was exposed, rotate it in Supabase. GitHub repository secrets would only be usable by switching Pages to an Actions build, and any client-side value inserted at build time would still be visible to visitors.
