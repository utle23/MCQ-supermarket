# Connecting Deputy → MCQ Supermarket (late clock-in monitor)

MCQ watches Deputy clock-ins and turns lateness into formal records automatically:
- clock-in **more than 10 minutes** after the rostered start = a lateness event
- escalation ladder (counted per employee over a **rolling 6 months**):
  1st–3rd → **Verbal Discussion** · 4th → **Written Warning** · 5th → **Final Warning** · 6th+ → **Termination Referral**
- every late event creates a **Violation record** in that store's Violation module,
  an **Inbox notice** to the employee (+ a copy to the store's managers & Super),
  and an **email** to the employee's gmail — including minutes late, clock-in time,
  rostered time and the Deputy department.
- ONLY Deputy employees whose **gmail (or exact name) exists in MCQ Staff Members**
  are processed — everyone else is skipped. Notices are store-scoped.

## Option A (active) — POLLING with a Deputy permanent token
1. In Deputy: your install URL looks like `https://XXXX.au.deputy.com`; create a
   permanent token (Enterprise → API access).
2. As Super, store them on the server (never in the repo):
   `POST /api/deputy/config` with JSON `{"host": "https://XXXX.au.deputy.com", "token": "…"}`
   (the endpoint validates the pair against Deputy `/api/v1/me` before saving).
3. On cron-job.org add a job hitting every 10 minutes:
   `https://mcq-supermarket.onrender.com/api/cron/deputy-late?key=<CRON_SECRET>`
   Each run pulls today's timesheets, processes NEW clock-ins only (deduped by
   timesheet id) and applies the ladder.

## Option B (also supported) — webhooks
Callback URL: `https://mcq-supermarket.onrender.com/api/deputy/webhook`
- Timesheet **Insert** (clock ON) → lateness ladder; Timesheet **Update** (clock OFF) → overtime note.
- Set `DEPUTY_WEBHOOK_SECRET` (Deputy "Private Key for API Signing") in Render env to verify signatures.

## Matching Deputy employees → MCQ staff
Priority: `deputyId` stored on the staff profile → **email** → exact name.
→ Keep each staff member's **email in MCQ = their Deputy email**.

## Rules (server/db.py)
- `LATE_GRACE_MIN = 10` — grace window
- `LATE_WINDOW_DAYS = 183` — the rolling 6-month escalation window
