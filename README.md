# MCQ Supermarket — Operations Platform

A modern, single-page web app for running MCQ International's supermarket chain:
daily checklists, issue reporting, operations registers, staff & HR, and analytics.
HTML + CSS + vanilla JS + Chart.js, with an optional local Node proxy for strong AI Vision temperature reading.

## Run it
- **Easiest:** double-click `run.command` (starts a local server and opens the browser).
- **Manual with strong AI Vision:** `OPENAI_API_KEY=sk-... node server.mjs`, then open <http://localhost:8765>.
- **Static fallback:** `python3 -m http.server 8765` in this folder, then open <http://localhost:8765>.
- Opening `index.html` directly also works, but the live camera / Face ID needs `localhost` or `https`.

## Temperature AI Vision
Temperature checklist photos use the free local OCR flow by default:

- Local red LED reader first, designed for seven-segment fridge/freezer displays.
- Browser Tesseract OCR fallback for normal printed/digital text.
- Decimal comma is normalised to decimal point, and LED decimal points are only used when the dot is actually visible.

The app rejects only when no valid temperature number can be read.

Optional paid strong AI Vision is available through `/api/vision/temperature`. That endpoint uses OpenAI Vision server-side, so the API key never appears in browser code.

1. Copy `.env.example` to `.env`.
2. Put your `OPENAI_API_KEY` in `.env`.
3. Start with `./run.command` or `node server.mjs`.
4. Set `localStorage.mcq_ai_vision_endpoint` to `/api/vision/temperature` if you want the browser to use the paid endpoint.

The strong endpoint saves a temperature whenever the display number is readable, even if confidence is not perfect. It rejects only when no temperature number can be read from the display.

## Login
- **Super Admin** (all stores): password **`99999`**
- **Store Admin** (selected store only): password **`77771`**
- **Staff** — each branch has its own password:

  | Branch | Password | | Branch | Password |
  |---|---|---|---|---|
  | Morley | `1111` | | Armadale | `5555` |
  | Mirrabooka | `2222` | | Beechboro Fresh | `6666` |
  | Malaga | `3333` | | Market West | `7000` |
  | Subiaco | `4444` | | Warehouse | `8000` |

Sessions auto-logout after **30 minutes** idle.

## Store Data Isolation
- Every branch is stored in its own Firestore document: `mcq_store_states/{store-id}`.
- Store Admin and Staff logins load and save only their own store document.
- Staff lists, checklist templates, submitted checklists, cleaning/maintenance schedules, job schedules, and operations records are store-scoped.
- Super Admin loads an aggregate view for comparison and manager verification; aggregate saves split store-owned records back into each branch document.
- Aggregate records are keyed by `store + record id`, so duplicate record IDs in different branches stay separate.
- New modules must keep the same rule: every record needs a `store`, non-super lists must use `scopedRecords(...)`, and non-super writes must use `storeForWrite(...)`.
- Photo evidence is stored separately with store metadata; non-super sessions only resolve photos inside their own store scope.
- The old `mcq/state` document is used only as a one-time migration seed for empty store documents.

## Features
- **Login** — per-branch staff passwords + store admin + super admin, Face ID (WebAuthn/camera demo), 30-min auto-logout.
- **Store Operation Checklist** — real store-wide checklist by department (General/Cashier/FV/Grocery/Butcher), Opening/Closing toggle, per-task photo capture, live progress.
- **Report an Issue** — one unified intake that routes to Maintenance / Incident / Complaint / general Issue (no overlap), with per-category **analytics** and **branch comparison**.
- **Operations registers** — Complaint, Maintenance, Incident, Delivery, People (record lists + admin review).
- **Staff & HR** — Staff Structure, Staff Members, Job Schedule, Training Assessment (score topics by role), **Violation Rules** (Verbal→Written→Final escalation with auto-suggested next step), Monthly Rewards, Raise Salary Review, Birthday Giveaways.
- **Management** — Manager Panel (unified review queue, sortable by date), Analytics, Photo Gallery, WhatsApp Daily Share (with photos), Email Notifications, Data Management.
- **Admin** can edit every field of any record and delete records.

## Tech
- `index.html` — shell · `assets/styles.css` + `assets/styles2.css` — theme & components
- `assets/data.js` — operations modules · `assets/hr-data.js` — checklist + HR/auth/email data
- `assets/app.js` — engine (login, auth, router, modules, drawer) · `assets/pages.js` + `assets/pages2.js` — custom pages
- `server.mjs` — local static server plus `/api/vision/temperature` proxy for strong AI Vision
- Chart.js + Font Awesome + Inter (via CDN)

> Note: browser-side AI/OCR is the default free path. Use `server.mjs` with
> `OPENAI_API_KEY` only if you explicitly want paid strong AI Vision later.
