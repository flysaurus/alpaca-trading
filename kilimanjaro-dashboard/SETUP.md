# Kilimanjaro Dashboard — Health Auto Export Setup

## 1. Deploy

```bash
npm install
npm run build
```

Deploy to Vercel (or any Next.js host).

## 2. Environment Variables

| Variable | Required? | Purpose |
|----------|-----------|---------|
| `SUPABASE_URL` | Optional | Persistent DB; falls back to in-memory |
| `SUPABASE_SERVICE_KEY` | Optional | Service role key for DB writes |
| `WEBHOOK_TOKEN` | **Recommended** | Secures `/api/webhook/health` |

Copy `.env.example` → `.env.local` and fill in your values.

## 3. Supabase (optional but recommended)

Run `supabase/schema.sql` in the **Supabase SQL Editor** to create tables + indexes.

## 4. Configure Health Auto Export (iOS)

Open **Health Auto Export** → **Automated Exports** → **New Automation** → **REST API**

**URL:** `https://your-domain.com/api/webhook/health`

**Headers:**
- `Authorization: Bearer <WEBHOOK_TOKEN>`
- `Content-Type: application/json` (auto-set if JSON format chosen)

**Export Format:** **JSON** (required — CSV not supported)

**Export Version:** Version 2 (recommended)

**Date Range:** Since Last Sync (avoids duplicates)

**Batch Requests:** ON (if you have a lot of historical data)

> ⚠️ **Important about Data Interval:** Health Auto Export's `days` interval only works with CSV format. For JSON (which this app requires), HAE sends per-minute data for most metrics and per-second for Heart Rate. The dashboard aggregates this automatically.

**Data Types to export:**
- Health Metrics → Steps, Heart Rate, Distance, Active Energy, Resting Heart Rate, Weight, Sleep
- Workouts → enable "Include Workout Metrics"

**Sync Cadence:** Every 6–12 hours (balance freshness vs battery)

## 5. Migration (existing local data)

If you have data in `src/lib/data.json` you want in Supabase:

Send a POST to `/api/migrate` with the same Bearer token.
