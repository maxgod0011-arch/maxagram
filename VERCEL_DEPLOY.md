# Deploying MAXAGRAM to Vercel

This project is pre-configured for **Vercel** with:
- Vite frontend built into `dist/` (including bundled `/src/assets/images/*` assets)
- Express backend mounted as a Vercel Serverless Function at `api/index.ts`
- `vercel.json` routing `/api/*` to the backend and all client routes (`/home`, `/success`, `/download/:id`, `/admin`) to `index.html`
- Serverless-safe writable storage (`/tmp` fallback out of the box + built-in **Upstash Redis / Vercel KV** REST sync for permanent cross-region persistence)

## 1. Deploy via GitHub + Vercel Dashboard (Recommended)
1. Push this project to a GitHub, GitLab, or Bitbucket repository.
2. Open [vercel.com/new](https://vercel.com/new) and import your repository.
3. Keep the detected **Vite** preset (Build Command: `npm run build`, Output Directory: `dist`).
4. Add these **Environment Variables** in Vercel Project Settings:
   - `MAXAGRAM_SESSION_SECRET` — any strong random 32+ character string
   - `MAXAGRAM_ADMIN_EMAIL` — your admin email (default: `admin@maxagram.io`)
   - `MAXAGRAM_ADMIN_PASSWORD` — your strong admin password
5. Click **Deploy**.

## 2. Enable Permanent Serverless Persistence (Recommended on Vercel)
Vercel serverless `/tmp` storage resets between cold starts. To persist registered devices, download counts, and admin edits permanently across all deployments:
1. In your Vercel project, go to **Storage** → **Browse Marketplace** → connect **Upstash Redis** (free tier available).
2. Vercel automatically injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`).
3. Redeploy — MAXAGRAM automatically detects those variables and syncs all registrations, device bindings, files, and download logs to Redis with zero extra code changes.

## 3. Deploy via Vercel CLI
```bash
npm i -g vercel
vercel login
vercel --prod
```
