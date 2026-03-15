# White Christmas Launch Runbook

This runbook is for production launch with:
- Web: AWS Amplify
- API: Render (FastAPI)
- DB/Auth/Storage: Supabase (hosted)
- Extension: Chrome Web Store

## 1) Release Scope

Production flow:
1. User signs up/signs in on web app.
2. User uploads image to backend (`/api/protect`).
3. Backend stores protected image + metadata in Supabase.
4. Owner sends friend request; friend accepts.
5. Friend can decode owner images via backend auth/permission checks.
6. Extension auto-detects protected images and requests key/file/decode via backend.

## 2) Environment Variables

Set these exactly.

### Web (Amplify)

Required:
- `NEXT_PUBLIC_BACKEND_BASE_URL=https://<render-api-domain>`
- `NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=<supabase-anon-key>`

### API (Render)

Required:
- `SUPABASE_URL=https://<project-ref>.supabase.co`
- `SUPABASE_ANON_KEY=<supabase-anon-key>`
- `SUPABASE_SERVICE_KEY=<supabase-service-role-key>`
- `SUPABASE_PROTECTED_IMAGES_BUCKET=protected-images`

Optional:
- `PYTHONUNBUFFERED=1`

Do not expose service key to client.

## 3) Supabase Setup (Remote)

From repo root:

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push --linked
```

Verify critical tables exist:
- `profiles`
- `images`
- `allowed_users`
- `friendships`
- `user_crypto_keys`

Verify storage bucket:
- `protected-images` exists and is private.

## 4) Backend Deployment (Render)

Service type:
- Web service (Python)

Build command:
```bash
pip install -r backend/requirements.txt
```

Start command:
```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

Root directory:
- `backend`

Health endpoint:
- `GET /health` must return `{"status":"ok"}`

## 5) Web Deployment (Amplify)

App root:
- `WC_Web/white-christmas`

Build:
- standard Next.js Amplify build

Post-deploy checks:
1. Home page loads and intro animation plays.
2. Sign in works.
3. Library loads.
4. Encode page can upload and get protected image.

## 6) CORS + Auth Redirects

### Backend CORS (`backend/main.py`)
Allow all production web origins:
- Amplify default domain
- custom production domain
- any staging domain in use

### Supabase Auth Settings
Set:
- Site URL = production web domain
- Redirect URLs include:
  - production domain
  - Amplify preview/staging domains if needed

## 7) Extension Release Checklist

Before packaging:
1. Default backend URL points to Render API.
2. Extension login flow works against production API.
3. Token stored and used for key/file requests.
4. Friend-only decode behavior verified.

Store assets required:
- Privacy policy URL
- Support contact email
- Screenshots
- Clear permission justification

## 8) End-to-End Verification (Must Pass)

Use 2 accounts: `owner` and `viewer`.

1. Owner login.
2. Owner uploads image (`/api/protect`), gets `X-Image-ID`.
3. Owner sends friend request to viewer.
4. Viewer accepts request.
5. Viewer opens owner protected image with extension installed.
6. Viewer can decode original.
7. Non-friend account cannot decode (expect 403).

Expected backend logs include detection lines:
- `[detect] endpoint=key image_id=... detected=true`
- `[detect] endpoint=file image_id=... detected=true`

## 9) Security Minimums Before Launch

1. Rotate any test/shared credentials and JWTs.
2. Ensure service role key only exists in server env.
3. Confirm no secrets committed in git.
4. Rate-limit sensitive endpoints:
   - `/api/auth/*`
   - `/api/friends/*`
   - `/api/images/*/key`
5. Keep storage bucket private.

## 10) Rollback Plan

If incident:
1. Roll back Render to previous stable deploy.
2. Roll back Amplify to previous build.
3. Temporarily disable extension auto-decode (if required) by publishing emergency config update.
4. Review logs for failing endpoint and permission checks.

## 11) Launch Day Timeline

1. Freeze main branch.
2. Push migrations to Supabase remote.
3. Deploy Render backend and validate `/health`.
4. Deploy Amplify frontend.
5. Run E2E verification with 2 real accounts.
6. Submit/publish extension update.
7. Monitor logs and error rate for first 24 hours.

## 12) Ownership

- Web deploy owner: ______
- Backend deploy owner: ______
- Supabase owner: ______
- Extension owner: ______
- Incident contact: ______
