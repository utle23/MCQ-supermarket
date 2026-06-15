# MCQ Supermarket — Operations Platform

A modern, single-page web app for running MCQ International's supermarket chain:
daily checklists, issue reporting, operations registers, staff & HR, and analytics.
Pure front-end (HTML + CSS + vanilla JS + Chart.js) — runs by opening a file, no build step.

## Run it
- **Easiest:** double-click `run.command` (starts a local server and opens the browser).
- **Manual:** `python3 -m http.server 8765` in this folder, then open <http://localhost:8765>.
- Opening `index.html` directly also works, but the live camera / Face ID needs `localhost` or `https`.

## Login
- **Admin** (full access, all stores): password **`77771`**
- **Staff** — each branch has its own password:

  | Branch | Password | | Branch | Password |
  |---|---|---|---|---|
  | Morley | `1111` | | Armadale | `5555` |
  | Mirrabooka | `2222` | | Beechboro Fresh | `6666` |
  | Malaga | `3333` | | Market West | `7000` |
  | Subiaco | `4444` | | Warehouse | `8000` |

Sessions auto-logout after **30 minutes** idle.

## Features
- **Login** — per-branch staff passwords + single admin password, Face ID (WebAuthn/camera demo), 30-min auto-logout.
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
- Chart.js + Font Awesome + Inter (via CDN)

> Note: this is a front-end prototype with realistic sample data; changes are kept in the
> browser session only (no backend persistence yet).
