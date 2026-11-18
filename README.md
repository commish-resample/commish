# Commish

TikTok Shop affiliate earnings dashboard. Live at https://commish.fyi

- `public/` is the website. Export files are read in the browser and never uploaded.
- `src/worker.js` is the small API for accounts and payments (`/api/*`): email sign-in links (Resend), sessions, Stripe Checkout, billing portal and webhook. Data lives in Cloudflare D1 (email, plan, Stripe ids only).
- Pushing to `main` deploys automatically on Cloudflare.

Secrets (set in Cloudflare, never in the repo): RESEND_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. Stripe price ids live in wrangler.jsonc.

Local testing: `npm install`, create `.dev.vars` with `DEV_SHOW_LINK=1`, then `npx wrangler dev`.
