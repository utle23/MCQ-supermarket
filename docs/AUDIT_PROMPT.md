# Data-Integrity & Sync Audit — reusable Claude prompt

Use this to have Claude hunt the class of bug that kept biting this app: a change that **looks
saved but silently reverts, doesn't persist, or never reaches other devices**. It covers
last-write-wins reverts, fake "saved" toasts, deletes that don't stick / resurrect, two-way sync
clobber, orphaned files/cloud images, config not propagating, mid-work logouts, partial-data bulk
actions, and premature/timing writes.

> The single most important instruction is **"prove it, don't reassure me."** That's what forces
> Claude to reproduce the failing scenario and verify the fix, instead of reading code and saying
> "looks fine."

---

## Full audit prompt (paste as-is)

```
Audit this web app for DATA-INTEGRITY, PERSISTENCE and MULTI-DEVICE SYNC bugs — the class
where a user's change LOOKS saved but silently reverts, doesn't persist, or never reaches other
devices. Do NOT just read code and reassure me. For each risk, TRACE the full write path
end-to-end (UI action → local state → save request → server → storage → reload / other device)
and PROVE whether it holds — ideally by reproducing the failing scenario, then the fix.

Check specifically:
1. Last-write-wins / stale overwrite: can a second device, or the same device with a stale copy
   (after offline/backgrounded), overwrite a NEWER edit? Is there per-record optimistic
   concurrency (version / updatedAt / etag) that REJECTS a stale write? Whole-document/"blob"
   saves are the usual culprit.
2. Fake "saved": does the success toast come from the local optimistic update or a CONFIRMED
   server response? Fire-and-forget saves that swallow errors but report success are a trap.
3. Delete that doesn't stick / resurrection: is delete applied server-side (not just locally)?
   Can a stale device re-upload a deleted item? Tombstones? Does "delete older than X" use the
   date the USER sees, or a server timestamp that gets bumped on edit/verify?
4. Two-way sync clobber: if two sources represent the same entity (e.g. accounts <-> staff), does
   one direction overwrite fields the other owns? Which side is source-of-truth per field?
5. Cascade & orphans: deleting a parent — are children AND external assets (uploaded files,
   cloud images) cleaned up? Do deletes actually free storage/credits, or leave orphans?
6. Config/permission propagation: when an admin changes a setting/recipient/permission, do
   long-open devices pick it up, or only after reload/re-login? Re-fetched periodically / on
   foreground?
7. Session/token expiry mid-work: fixed-TTL token (logs active users out) vs SLIDING (renewed on
   use)? Does a 401 force a logout that loses in-progress work?
8. Partial-data operations: if the app loads a capped/paginated subset, do bulk actions
   (delete-all, export, counts) act on the FULL data or only what's loaded?
9. Timing / premature writes: are records written from a still-"in progress" source (a
   placeholder value) and never re-evaluated when the real value arrives?
10. Offline / reconnect: do queued edits on reconnect overwrite newer server state?

For each finding: give the exact failure scenario (inputs → wrong result), the file:line, and
HOW you verified it. Rank by severity. Propose the minimal robust fix; after I approve,
implement it and PROVE it works by driving the real flow INCLUDING a concurrent/stale-device
scenario — not just a code read.
```

---

## Quick version (per-feature, right after building it)

```
Trace the full save path for <feature> (UI → local → server → storage → reload/other device).
Can a stale or second device overwrite a newer edit (last-write-wins)? Is "saved" confirmed by
the server or just local? Prove it by reproducing a concurrent/stale-device scenario.
```

---

## Tips

- **Demand proof, not reassurance.** Keep the line *"prove it, don't reassure me."*
- **Run per feature**, right after building it (report-issue, checklist, staff…) — don't wait to
  audit the whole app at once.
- **Push the multi-device / offline / concurrent angle** — most of these bugs only appear with two
  devices, or one device that went stale offline.
- For an app with a backend + many shared devices + offline use, add:
  *"assume multiple iPads share one store and go offline often."*
- After a fix ships, re-run the quick version to confirm it holds.

---

## The patterns this app already fixed (reference)

| Symptom | Root cause | Fix pattern |
|---|---|---|
| Manager edit / status "reverts next day" | last-write-wins; stale device overwrites | per-record `updatedAt`; server rejects strictly-older; superseded save forces re-sync |
| Checklist template reverts | version drift; stale base rejected | read-modify-write via a per-store endpoint + monotonic version |
| Deleted records come back | upsert-only merge re-adds them | tombstones (`deleted_records`); merge skips tombstoned ids |
| "Delete older than X" misses items | deleted by server `created_at` (bumped on verify) | delete by the record's own date field |
| Archive un-archives; role/dept edits revert | account→staff sync overwrote staff fields | staff owns those fields (fill-when-empty, never overwrite) |
| Delete leaves cloud photos (billed) | photos not cascaded | delete a submission's Cloudinary photos (orphan-safe) |
| Logged out mid-work | fixed 7-day token TTL | sliding expiry (renew on use) |
| New recipient/setting not applied | config only loaded at app-load | re-fetch periodically + on foreground |
| Late clock-out never recorded | recorded a placeholder, never re-evaluated | re-evaluate when the source value changes |
