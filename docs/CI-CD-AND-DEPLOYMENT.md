# CI/CD and deployment (all free)

## 1. CI – already set up
`.github/workflows/ci.yml` runs on every push and pull request:
1. ASP.NET unit tests (`docker build --target test backend`)
2. React unit tests (`docker build --target test frontend`)
3. Starts the full stack with Docker Compose and runs `scripts/smoke-test.sh`

Push the project to a **public** GitHub repository (GitHub Actions is free for public repos) and the workflow runs by itself. A red ✗ means do not deploy.

## 2. CD – release gate
`.github/workflows/release.yml` runs when you push a tag like `v1.0.0`: it repeats all tests and **only if they pass** publishes `card-studio-backend` and `card-studio-frontend` images to GitHub Container Registry (free).

```bash
git tag v1.0.0 && git push origin v1.0.0
```

## 3. Pre-deploy checklist ("safe to deploy")
- [ ] CI is green on `main`.
- [ ] `JWT_KEY` is a new random 32+ byte secret, never committed (`.env` is git-ignored).
- [ ] Site is served over HTTPS only.
- [ ] MongoDB is not reachable from the internet (compose publishes no Mongo port; on Atlas use an IP allow-list + strong user).
- [ ] `Cors__Origins` equals your real site URL.
- [ ] You tried: register, under-14 sign-up refused, save, reopen, delete, GIF export, on a phone and a laptop.
- [ ] Privacy policy + terms page (you collect email and birth date; see the age note below).
- [ ] Backups: `docker compose exec mongo mongodump --archive > backup.archive` weekly (or Atlas backups).

## 4. Where to run it for free
Free tiers change, so check each provider's current terms before relying on them.

**Option A – one free VM running the same Docker Compose (simplest, closest to local).**
Oracle Cloud "Always Free" VM (needs a card for identity verification, not charged for free resources) or any VM you already have:
```bash
git clone <your repo> && cd birthday-card-app
cp .env.example .env && nano .env        # set JWT_KEY
docker compose up -d --build
```
Put Caddy (free, automatic HTTPS) in front, with a free domain/subdomain (e.g. DuckDNS):
```
yourname.duckdns.org { reverse_proxy localhost:3000 }
```
Change the compose `ports` of `web` to `127.0.0.1:3000:80` so only Caddy is public.

**Option B – split free tiers.**
- Database: MongoDB Atlas free cluster (M0).
- API: a free container host such as Render (free web services sleep when idle, so the first request is slow). Set `Mongo__ConnectionString`, `Jwt__Key`, `Cors__Origins`.
- Frontend: Netlify / Cloudflare Pages / Vercel free tier. Build with `VITE_API_URL=https://your-api.example.com/api npm run build`.

## 5. Age requirement note
The brief says accounts need age 14+. Under GDPR the age of digital consent is set per country (16 by default, member states may lower it to as low as 13). I believe Romania uses 16 – **please confirm with your instructor or a lawyer** before a public launch. If it is 16, change `AgeRules.MinimumAge` in `backend/CardApi/Rules.cs`, the form text in `ui/Modals.jsx`, and the tests.
