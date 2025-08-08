# Football League Website (Postgres / Neon)

Public site (Ladder, Draw/Results, Statistics) + password-protected Admin. This version uses **Postgres** (Neon free tier) so data persists on Render **Free**.

## Quick Start (Local)
1) Set DATABASE_URL in your shell (Neon connection string ending with `sslmode=require`)
2) Install & run:
```bash
npm install
npm start
```
3) Open http://localhost:3000
   - Public: /ladder, /draw, /stats
   - Admin: /admin (basic auth)

### Admin login
Set env vars (or defaults are used for dev):
- ADMIN_USER=admin
- ADMIN_PASS=changeme

## Deploy to Render (Free)
1) Push this folder to a GitHub repo.
2) Render → New → Web Service → connect repo.
3) Root Directory: (leave blank if this is repo root)
4) Build: `npm install`
5) Start: `node server.js`
6) Environment → add:
   - DATABASE_URL = (your Neon string, e.g. postgres://user:pass@host/db?sslmode=require)
   - ADMIN_USER
   - ADMIN_PASS
7) Deploy. Visit /admin to add scores.

No disk needed—the DB is Neon.
