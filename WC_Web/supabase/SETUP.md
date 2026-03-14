# Supabase Setup Guide

This guide covers everything needed to get Supabase running for both **remote** (hosted) and **local** (Docker) environments.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) |
| Docker Desktop | Latest | [docker.com](https://www.docker.com/products/docker-desktop) |
| Supabase CLI | ≥ 2.x | `npm install -g supabase` or via `devDependencies` |

> The Supabase CLI is already listed as a dev dependency in `white-christmas/package.json`. Run `npm install` inside that directory and use `npx supabase` to invoke it.

---

## 1. Remote Supabase (Hosted)

### 1.1 Create a project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New project** and fill in:
   - **Name** – e.g. `white-christmas`
   - **Database password** – save this somewhere safe
   - **Region** – pick one closest to your users
3. Wait for the project to finish provisioning (~1–2 min).

### 1.2 Retrieve your credentials

In the Supabase dashboard, navigate to **Project Settings → API**:

| Credential | Where to find it | Used for |
|---|---|---|
| **Project URL** | "Project URL" field | `NEXT_PUBLIC_SUPABASE_URL` |
| **Publishable (anon) key** | "Project API keys → anon / public" | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` |
| **Service role key** | "Project API keys → service_role" | Server-side admin tasks only – **never expose to the browser** |
| **Database password** | Set during project creation | Direct Postgres connections |

### 1.3 Configure the Next.js app

Copy the example env file and fill in the remote values:

```bash
cd WC_Web/white-christmas
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=<your-anon-key>
```

> `.env.local` is git-ignored. Never commit real credentials.

### 1.4 Link the CLI to your remote project

```bash
# From WC_Web/white-christmas (where package.json lives)
npx supabase login          # opens browser for auth
npx supabase link --project-ref <your-project-ref>
```

Your project ref is the subdomain in your Supabase URL: `https://<project-ref>.supabase.co`.

---

## 2. Local Supabase (Docker)

Local Supabase spins up a full Supabase stack (Postgres, Auth, Storage, Studio) in Docker containers — no internet required.

### 2.1 Start Docker Desktop

Make sure Docker Desktop is running before proceeding.

### 2.2 Initialise (first time only)

```bash
cd WC_Web/white-christmas
npx supabase init          # creates supabase/ config files if not already present
```

> The `supabase/` directory already exists in this repo, so you can skip this step if it ran previously.

### 2.3 Start the local stack

```bash
npx supabase start
```

After a minute or so the CLI will print something like:

```
API URL:         http://127.0.0.1:54321
GraphQL URL:     http://127.0.0.1:54321/graphql/v1
DB URL:          postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL:      http://127.0.0.1:54323
Inbucket URL:    http://127.0.0.1:54324   ← local email testing
anon key:        eyJ...
service_role key: eyJ...
```

### 2.4 Configure the Next.js app for local

Create a separate env file for local development:

```bash
cp .env.example .env.development.local
```

Edit `.env.development.local` with the values printed above:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=<local-anon-key>
```

Next.js loads `.env.development.local` automatically when running `npm run dev`, and `.env.local` for all environments — so local values will take precedence during development.

### 2.5 Stop the local stack

```bash
npx supabase stop
```

Add `--no-backup` if you don't need to persist local data between sessions.

---

## 3. Database Migrations

Migrations live in `WC_Web/supabase/migrations/` and are applied in chronological order.

### Current migrations

| File | Description |
|------|-------------|
| `20260313132225_create_table_profiles.sql` | Creates `public.profiles` table with RLS enabled |
| `20260313134151_create_table_images.sql` | Creates `public.images` table with RLS enabled |
| `20260313134443_create_policies_profiles.sql` | RLS policies for `profiles` (select, update own row) |
| `20260313134555_create_policies_images.sql` | RLS policies for `images` (public read, own write/delete) |

### Apply migrations locally

```bash
npx supabase db reset        # drops & recreates local DB, then runs all migrations
```

Or incrementally push new migrations:

```bash
npx supabase db push         # applies any pending migrations to the local DB
```

### Push migrations to remote

```bash
npx supabase db push --linked   # pushes to the linked remote project
```

> Make sure you've run `npx supabase link` first (see §1.4).

### Create a new migration

```bash
npx supabase migration new <descriptive_name>
# e.g. npx supabase migration new add_avatar_url_to_profiles
```

This creates a timestamped `.sql` file in `supabase/migrations/`. Write your SQL there, then apply it with `npx supabase db push`.

---

## 4. Supabase Studio

| Environment | URL |
|---|---|
| Local | http://127.0.0.1:54323 |
| Remote | https://supabase.com/dashboard/project/<project-ref> |

Studio lets you browse tables, run SQL queries, manage auth users, and inspect storage.

---

## 5. Useful CLI Commands

```bash
npx supabase status          # show local stack URLs & keys
npx supabase db diff         # diff local schema vs remote
npx supabase gen types typescript --local > types/supabase.ts   # generate TS types from local DB
npx supabase gen types typescript --linked > types/supabase.ts  # generate from remote
```

---

## 6. Troubleshooting

**`supabase start` fails / containers won't start**
- Make sure Docker Desktop is running and has enough memory allocated (≥ 4 GB recommended).
- Try `npx supabase stop --no-backup && npx supabase start` to do a clean restart.

**Env vars not picked up**
- Restart the Next.js dev server after editing any `.env*` file.
- Remember that variables must be prefixed with `NEXT_PUBLIC_` to be available in the browser.

**Migrations fail on remote**
- Check the Supabase dashboard under **Database → Migrations** for error details.
- Make sure your local schema and remote schema are in sync (`npx supabase db diff`).

**Auth emails not arriving locally**
- Local email is intercepted by Inbucket at http://127.0.0.1:54324 — check there instead of a real inbox.
