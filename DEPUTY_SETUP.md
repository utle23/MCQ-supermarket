# Connecting Deputy → MCQ Supermarket (clock-in/out attendance)

MCQ receives Deputy **timesheet webhooks** and turns them into per-employee
punctuality: late minutes, verbal/written warnings, overtime past finish — all
posted to the employee's Inbox and shown in Staff Members ▸ Attendance.

## 1. One-time server config (PythonAnywhere → Web tab → Environment variables)
- `DEPUTY_WEBHOOK_SECRET` = your Deputy "Private Key for API Signing"
  (Deputy: Enterprise → Advanced Settings). MCQ verifies every webhook's
  `X-Deputy-Secret` HMAC against this. **Without it the endpoint still works but
  is unverified — set it before go-live.**
- (Optional, for exact rostered times) `DEPUTY_HOST` = `https://<your>.deputy.com`
  and `DEPUTY_TOKEN` = a Deputy OAuth token. If set, MCQ fetches the linked
  Roster to know the scheduled start/finish when the webhook doesn't include it.

## 2. Create the webhooks in Deputy (point them at MCQ)
Callback URL:  `https://mcqsupermarket.pythonanywhere.com/api/deputy/webhook`
Create one webhook for each timesheet event you want:
- Timesheet **Insert** (employee clocks ON)  → lateness + warnings
- Timesheet **Update** (employee clocks OFF) → overtime past finish
Payload format: default Deputy JSON `{topic, data}` (what MCQ expects).

## 3. Matching Deputy employees → MCQ staff
MCQ matches each Deputy employee to a staff member by, in order:
1. `deputyId` stored on the staff profile (most reliable), else
2. **email** (the same Gmail used for account activation), else
3. exact name.
→ Make sure each staff member's **email in MCQ = their Deputy email**.

## 4. Rules (change in server/db.py if needed)
- `LATE_GRACE_MIN = 10`  → clock-in more than 10 min late = a lateness event
- `VERBAL_TO_WRITTEN = 3` → the 3rd lateness escalates to a WRITTEN warning
- Warnings + an on-time summary are sent to the employee's Inbox; managers +
  Super get a copy of each warning.

## Notes
- Field names differ across Deputy installs; MCQ already accepts common aliases
  (StartTime/RosterStartTime/EmployeeEmail…). Send one real sample webhook and
  we can map any custom field in `_deputy_norm()` in ~5 minutes.
