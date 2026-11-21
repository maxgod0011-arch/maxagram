# Deploying MAXAGRAM on Netlify

MAXAGRAM is pre-configured for zero-config deployment on **Netlify** using `netlify.toml`, a bundled Express Serverless Function (`netlify/functions/api.ts`), Vite static frontend hosting (`dist/`), and automatic strongly consistent **Netlify Blobs** persistence.

## 1. Deploy via GitHub + Netlify Dashboard (Recommended)

1. Push this repository to GitHub (or GitLab / Bitbucket).
2. Open the [Netlify Dashboard](https://app.netlify.com/) → **Add new site** → **Import an existing project**.
3. Select your repository. Netlify automatically reads `netlify.toml`:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - **Functions directory:** `netlify/functions`
   - **Node version:** `22`
4. Open **Site configuration → Environment variables** and add:
   - `MAXAGRAM_SESSION_SECRET` — A strong random string (32+ characters) used to sign sessions and bind device fingerprints.
   - `MAXAGRAM_ADMIN_EMAIL` — Your administrator login email (defaults to `admin@maxagram.io`).
   - `MAXAGRAM_ADMIN_PASSWORD` — A strong administrator password.
5. Click **Deploy site**.

## 2. Automatic Persistent Storage (Netlify Blobs)

- MAXAGRAM automatically connects to **Netlify Blobs** (`maxagram-state` store with `consistency: 'strong'`) inside `netlify/functions/api.ts`.
- All one-time device registrations (`PRE-REWORD`), admin-managed downloads, download counts, and device recovery keys persist across cold starts and deployments with **no extra database setup or environment variables required**.
- If you prefer **Upstash Redis**, simply set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Netlify Environment Variables and MAXAGRAM will automatically use Redis instead.

## 3. Deploy via Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

## 4. Official Registration Code & Admin Access

- **Official Registration Code:** `PRE-REWORD`
- **Admin Dashboard URL:** `https://<your-site>.netlify.app/admin`
- **Security Note:** Always set `MAXAGRAM_SESSION_SECRET` and `MAXAGRAM_ADMIN_PASSWORD` in Netlify Environment Variables before launching publicly.
