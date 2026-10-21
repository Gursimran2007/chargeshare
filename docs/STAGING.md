# Private staging on Supabase + Razorpay test mode

Staging is a **production build running on your machine** (`http://localhost:3260`), backed by a real Supabase project and Razorpay **test mode**. It costs nothing and is reachable only from your computer.

What it proves that demo mode can't: Supabase Auth sign-up and sign-in, Postgres with the real RLS and migrations, Supabase Storage uploads, and valid Razorpay test keys.

Don't paste secrets into chats, issues or commits. They go only in `.env.staging.local`, which git ignores.

## 1. Supabase (free plan), about 10 minutes

1. Sign up at **supabase.com** and create a new project.
   - **Name:** `chargeshare-staging`
   - **Region:** South Asia (Mumbai)
   - **Database password:** letters and numbers only (no symbols, so it can go in a URL unescaped). Save it in your password manager.
   - **Plan:** Free
2. When the project is ready, open **Project Settings → API** (or **API Keys**) and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / publishable key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role / secret key** → `SUPABASE_SERVICE_ROLE_KEY`. This bypasses all security, so never share it.
3. Click **Connect** (top of the dashboard) → **Session pooler**. Copy the URI, put your database password in place of `[YOUR-PASSWORD]`, and use it as `DATABASE_URL`.
4. TLS (recommended): **Project Settings → Database → SSL configuration → Download certificate**. Save it as `.data/supabase-ca.crt` inside the project folder, then append this to `DATABASE_URL`:
   `?sslmode=verify-full&sslrootcert=.data/supabase-ca.crt`
   If that fails to connect, use the fallback `?uselibpqcompat=true&sslmode=require` (encrypted but unverified) and tell me.
5. **Authentication → Sign In / Providers → Email:** turn **Confirm email** OFF (staging only; the automated sign-up test needs it).
6. **Authentication → URL Configuration:**
   - **Site URL:** `http://localhost:3260`
   - **Redirect URL:** add `http://localhost:3260/auth/callback`

## 2. Razorpay test mode, about 5 minutes

1. Sign up at **dashboard.razorpay.com**. Test mode works before KYC; don't submit business documents for this step.
2. Switch the dashboard to **Test Mode** (toggle at the top).
3. **Account & Settings → API Keys → Generate Test Key.** Copy:
   - **Key Id** (starts with `rzp_test_`) → `RAZORPAY_KEY_ID`
   - **Key Secret** → `RAZORPAY_KEY_SECRET`. It's shown once, so save it.
4. Set `RAZORPAY_WEBHOOK_SECRET` to any random string for now. Webhooks need a public URL, which local staging doesn't have.

## 3. Fill in the env file

```bash
cp .env.staging.example .env.staging.local
```

Fill in the values above. Generate the two secrets with:

```bash
openssl rand -base64 32
```

Use it once for `SESSION_SECRET` and again for `CRON_SECRET`.

## 4. Run it

```bash
npm run staging:check      # validates everything, prints only masked values (STAGING_ENV_FILE overrides the file)
npm run staging:seed       # migrations + fictional demo data (demo users created via Supabase Auth)
npm run staging:build
npm run staging:start      # serves http://localhost:3260 (keep running)
npm run test:e2e:staging   # in a second terminal: the full browser suite against staging
```

To re-run the suite from a clean state:

```bash
npm run staging:seed -- --reset
```

This wipes app data and demo/E2E accounts. It refuses to run if any other account exists in the project.

## 5. Razorpay test payment (manual, 2 minutes)

The E2E suite uses simulated payments so it is repeatable. To see a real Razorpay test-mode checkout:

1. In `.env.staging.local` set `DEMO_MODE=false`, `PAYMENT_PROVIDER=razorpay` and `ALLOW_DEMO_PAYMENTS=false`.
2. Rebuild and restart:
   ```bash
   npm run staging:build
   npm run staging:start
   ```
3. Sign in as `driver@chargeshare.demo` (password `Demo@1234`), book any charger, and pay in the Razorpay window with a test method, e.g. **Netbanking → any bank → Success**.
4. The booking page should show "Payment verified" and "via Razorpay". The payment also appears under Test Mode → Transactions.

## Safety rails built into the scripts

- Live Razorpay keys (`rzp_live_`) are refused.
- `NEXT_PUBLIC_APP_URL` must be localhost.
- `--reset` only removes `@chargeshare.demo` and `e2e.host.*@example.com` accounts, and aborts if anyone else exists.
- Nothing prints secret values.

## Without any accounts: staging on a local PostgreSQL server

This exercises the networked database path the Supabase deployment uses (node-postgres adapter, migrations script, real Postgres server), with the app's own local auth instead of Supabase Auth. It was run on 21 October 2026: **16/16 browser tests passed twice, with a `--reset` in between, and zero server errors.**

1. Install PostgreSQL:
   ```bash
   brew install postgresql@17
   ```
2. Create a throwaway cluster inside the project and start it on port 5433:
   ```bash
   /opt/homebrew/opt/postgresql@17/bin/initdb -D .data/pg-staging -U postgres --auth=trust -E UTF8 --locale=en_US.UTF-8
   ```
   ```bash
   LC_ALL=en_US.UTF-8 /opt/homebrew/opt/postgresql@17/bin/pg_ctl -D .data/pg-staging -o "-p 5433 -c listen_addresses=localhost" -l .data/pg-staging.log start
   ```
   ```bash
   /opt/homebrew/opt/postgresql@17/bin/psql -h localhost -p 5433 -U postgres -c "create database chargeshare_staging"
   ```
   `LC_ALL` is required on macOS, otherwise the server refuses to start.
3. Create `.env.pgstaging.local` (git-ignored) with these settings, plus `SESSION_SECRET` and `CRON_SECRET` generated with `openssl rand -base64 32`:
   - `NEXT_PUBLIC_APP_URL=http://localhost:3260`
   - `DATABASE_URL=postgres://postgres@localhost:5433/chargeshare_staging`
   - `AUTH_PROVIDER=local`
   - `UPLOAD_DIR=.data/pg-staging-uploads`
   - `DEMO_MODE=true`
   - `PAYMENT_PROVIDER=demo`
   - `ALLOW_DEMO_PAYMENTS=true`
4. Seed, build, start and test:
   ```bash
   STAGING_ENV_FILE=.env.pgstaging.local npm run staging:seed
   ```
   ```bash
   STAGING_ENV_FILE=.env.pgstaging.local npm run staging:build
   ```
   ```bash
   STAGING_ENV_FILE=.env.pgstaging.local npm run staging:start
   ```
   ```bash
   npm run test:e2e:staging
   ```
5. Stop the cluster when you're done:
   ```bash
   LC_ALL=en_US.UTF-8 /opt/homebrew/opt/postgresql@17/bin/pg_ctl -D .data/pg-staging stop
   ```
   To remove PostgreSQL entirely:
   ```bash
   brew uninstall postgresql@17
   ```

