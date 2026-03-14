# Supabase Setup Guide

This guide covers everything needed to get Supabase running for both **remote** (hosted) and **local** (Docker) environments.

> **Monorepo note:** `supabase/` now lives at the **repo root** so it is shared by `WC_Web/` and `backend/`. All `supabase` CLI commands must be run from the **repo root** (`white-christmas/`), not from inside a sub-project.

---

## Repo layout

```
white-christmas/          ← run all supabase CLI commands here
├── supabase/
│   ├── config.toml       ← local stack configuration
│   ├── migrations/       ← shared SQL migrations
│   └── SETUP.md          ← this file
├── WC_Web/
│   └── white-christmas/  ← Next.js app (npm run dev here)
├── backend/              ← Python API
└── WC_plugin/            ← Browser extension
```

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) |
| Docker Desktop | Latest | [docker.com](https://www.docker.com/products/docker-desktop) |
| Supabase CLI | ≥ 2.x | `npm install -g supabase` or via `WC_Web/white-christmas/package.json` |

> The Supabase CLI is a dev dependency of `WC_Web/white-christmas`. After `npm install` in that directory, invoke it from the **repo root** with:
> ```bash
> node WC_Web/white-christmas/node_modules/.bin/supabase <command>
> ```
> Or install it globally once: `npm install -g supabase`.

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
| **Project URL** | "Project URL" field | `NEXT_PUBLIC_SUPABASE_URL` in Next.js / `SUPABASE_URL` in backend |
| **Publishable (anon) key** | "Project API keys → anon / public" | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` |
| **Service role key** | "Project API keys → service_role" | Server-side / backend only – **never expose to the browser** |
| **Database password** | Set during project creation | Direct Postgres connections |

### 1.3 Configure each sub-project

**Next.js (`WC_Web/white-christmas/`):**

```bash
cd WC_Web/white-christmas
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=<your-anon-key>
```

**Python backend (`backend/`):**

Add to your `.env` (create one if it doesn't exist):

```env
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

> All `.env.local` and `.env.*.local` files are git-ignored. Never commit real credentials.

### 1.4 Link the CLI to your remote project

```bash
# From repo root
supabase login                             # opens browser for auth
supabase link --project-ref <project-ref>  # links this supabase/ dir to remote
```

Your project ref is the subdomain in your project URL: `https://<project-ref>.supabase.co`.

---

## 2. Local Supabase (Docker)

Local Supabase spins up a full Supabase stack (Postgres, Auth, Storage, Studio) in Docker containers — no internet required.

### 2.1 Start Docker Desktop

Make sure Docker Desktop is running before proceeding.

### 2.2 Start the local stack

```bash
# From repo root
supabase start
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

### 2.3 Configure sub-projects for local

**Next.js (`WC_Web/white-christmas/`):**

```bash
cd WC_Web/white-christmas
cp .env.example .env.development.local
```

Edit `.env.development.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=<local-anon-key>
```

Next.js loads `.env.development.local` automatically when running `npm run dev`, so local values take precedence over `.env.local` during development.

**Python backend (`backend/`):**

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key>
```

### 2.4 Stop the local stack

```bash
# From repo root
supabase stop
```

Add `--no-backup` if you don't need to persist local data between sessions.

---

## 3. Database Migrations

Migrations live in `supabase/migrations/` and are applied in chronological order. Since this directory is at the repo root, both `WC_Web/` and `backend/` share the same schema.

### Current migrations

| File | Description |
|------|-------------|
| `20260313132225_create_table_profiles.sql` | Creates `public.profiles` table with RLS enabled |
| `20260313134151_create_table_images.sql` | Creates `public.images` table with RLS enabled |
| `20260313134443_create_policies_profiles.sql` | RLS policies for `profiles` (select, update own row) |
| `20260313134555_create_policies_images.sql` | RLS policies for `images` (public read, own write/delete) |

### Apply migrations locally

```bash
# From repo root
supabase db reset        # drops & recreates local DB, then runs all migrations
```

Or incrementally:

```bash
supabase db push         # applies any pending migrations to the local DB
```

### Push migrations to remote

```bash
# From repo root
supabase db push --linked   # pushes to the linked remote project
```

> Make sure you've run `supabase link` first (see §1.4).

### Create a new migration

```bash
# From repo root
supabase migration new <descriptive_name>
# e.g. supabase migration new add_avatar_url_to_profiles
```

This creates a timestamped `.sql` file in `supabase/migrations/`. Write your SQL there, then apply it with `supabase db push`.

---

## 4. Supabase Studio

| Environment | URL |
|---|---|
| Local | http://127.0.0.1:54323 |
| Remote | https://supabase.com/dashboard/project/<project-ref> |

Studio lets you browse tables, run SQL queries, manage auth users, and inspect storage.

---

## 5. Useful CLI Commands

All commands run from the **repo root**:

```bash
supabase status                                             # show local stack URLs & keys
supabase db diff                                           # diff local schema vs remote
supabase gen types typescript --local  > WC_Web/white-christmas/types/supabase.ts
supabase gen types typescript --linked > WC_Web/white-christmas/types/supabase.ts
```

---

## 6. Troubleshooting

**`supabase start` fails / containers won't start**
- Make sure Docker Desktop is running and has enough memory allocated (≥ 4 GB recommended).
- Try `supabase stop --no-backup && supabase start` to do a clean restart.

**CLI can't find `config.toml`**
- Always run `supabase` commands from the **repo root** (`white-christmas/`), not from inside `WC_Web/` or `backend/`.
- If you must run from a sub-directory, pass `--workdir ../../` (or the relative path to the repo root).

**Env vars not picked up in Next.js**
- Restart the Next.js dev server after editing any `.env*` file.
- Variables must be prefixed with `NEXT_PUBLIC_` to be available in the browser.

**Migrations fail on remote**
- Check the Supabase dashboard under **Database → Migrations** for error details.
- Make sure your local schema and remote schema are in sync (`supabase db diff`).

**Auth emails not arriving locally**
- Local email is intercepted by Inbucket at http://127.0.0.1:54324 — check there instead of a real inbox.
