# Inbox Sync — Production Setup (Vercel)

This doc explains how to fix the `Inbox sync error: Unexpected token 'T', "The page c"... is not valid JSON` message on the live Vercel site, and how to optionally wire up a real Gmail → Firebase sync without paying for Vercel/GitHub connectors.

## What changed in this commit

The frontend in `index.html` (the inline `Inbox sync client` block at the bottom of the file) was rewritten so that:

1. It no longer crashes when `/api/sync-inbox` returns HTML instead of JSON. The Vercel 404 page begins with `The page c…`, which is exactly the string in the original error. The new code reads the response as text, only parses it as JSON when the body actually looks like JSON, and falls through to a friendly status pill otherwise.
2. On a static deploy (Vercel) with no backend, the header pill now reads:
   `Inbox sync not configured — click to set up`
   Clicking the pill prompts you for a Google Apps Script webhook URL and stores it in `localStorage` under the key `jaba.inboxSyncWebhookUrl`.
3. The Sync Inbox button now POSTs to that webhook URL when configured. The webhook does the Gmail read + Firebase write itself (see template below). The dashboard reloads existing Firebase data exactly as before.
4. The local `/api/sync-inbox` flow (Node `server.js` calling the external-tool CLI) is preserved unchanged. If the endpoint returns valid JSON, the frontend uses it as before.

The result: the live site stops showing the JSON parse error immediately, even before you set up the webhook. Existing CRM data continues to load from Firebase.

## How to deploy this fix (no GitHub connector needed)

1. Download the modified file `index.html` from this workspace.
2. In GitHub, navigate to your repo `Nickm10-web/jaba-leads1` in a browser.
3. Open the existing `index.html`, click the pencil/edit icon, paste the new contents over it, and commit to `main` with a message like `Fix Vercel inbox sync JSON error; add Apps Script webhook path`.
4. Vercel will redeploy automatically. Refresh the live site — the header pill should read `Inbox sync not configured — click to set up` instead of the JSON error.

If you'd rather upload the whole modified set, the only file that changed for this fix is `index.html`. The new file `INBOX_SYNC_SETUP.md` (this doc) is optional but recommended.

## Optional — wire up a real Gmail → Firebase webhook

This is a manual one-time setup. It runs entirely on Google's infrastructure and is free.

### Step 1 — create the Apps Script

1. Go to <https://script.google.com> while signed in to the Gmail account whose inbox you want to sync (e.g. `jordon@jaba.ai`).
2. Click **New project**, name it `JABA Inbox Sync`.
3. Replace the default `Code.gs` with the script in `apps-script/inbox-sync.gs` from this repo (also pasted at the bottom of this doc).
4. Update the two constants near the top of the script:
   - `FIREBASE_DB_URL` — your RTDB URL, e.g. `https://jaba-leads-default-rtdb.firebaseio.com`.
   - `FIREBASE_AUTH_TOKEN` — leave blank to use unauthenticated writes that obey your existing RTDB rules, or paste a database secret / ID token if your rules require auth.
5. **Deploy → New deployment → Web app**:
   - Description: `JABA inbox sync v1`
   - Execute as: **Me** (the Gmail account)
   - Who has access: **Anyone** (the URL is unguessable; this is the standard Apps Script pattern for browser-callable webhooks)
6. Authorize the script when prompted (Gmail read + external request scopes).
7. Copy the resulting Web App URL — it looks like `https://script.google.com/macros/s/AKfy.../exec`.

### Step 2 — connect the dashboard

1. Open the live site, click the orange `Inbox sync not configured — click to set up` pill in the header.
2. Paste the Web App URL into the prompt and click OK.
3. Click **Sync Inbox**. The pill should turn grey and read `Inbox synced HH:MM · N imported, …`.

The URL is stored only in your browser's `localStorage`. To roll it out to other users, set
```html
<script>window.JABA_INBOX_SYNC_WEBHOOK_URL = 'https://script.google.com/macros/s/.../exec';</script>
```
in `index.html` immediately before the closing `</body>` (or any place earlier than the inbox-sync `<script>` block).

### Step 3 — schedule it (optional)

In the Apps Script editor, **Triggers → Add Trigger** → run `scheduledSync` on a time-based trigger (e.g. every 15 minutes). The dashboard's Sync button still works for on-demand pulls.

## Multi-mailbox setup (jordon@jaba.ai + jordon@jastercreative.com)

The Unibox tab in the SPA can show emails from multiple Gmail accounts side-by-side. Apps Script can only read the inbox of the Google account that authorized it, so you need **one separate deployment per mailbox**. They both write to the same Firebase RTDB; the Unibox uses the `sourceInbox` field stamped on each record to filter.

### Step A — create a deployment for each mailbox

For each mailbox (`jordon@jaba.ai`, `jordon@jastercreative.com`):

1. Sign in to <https://script.google.com> **as that Google account**.
2. **New project** → name it `JABA Inbox Sync (jaba.ai)` or `JABA Inbox Sync (jastercreative.com)`.
3. Replace `Code.gs` with the contents of `inbox-sync.gs` from this repo.
4. At the top of the script:
   - Leave `OWNER_EMAIL` blank to auto-detect the deployer (recommended) — the script falls back to `Session.getActiveUser().getEmail()`.
   - **OR** hard-code it: `var OWNER_EMAIL = 'jordon@jaba.ai';` in the jaba.ai copy and `var OWNER_EMAIL = 'jordon@jastercreative.com';` in the jastercreative copy.
   - Optionally set `SOURCE_INBOX` to a friendly label (e.g. `'jaba'` or `'jaster'`); leave blank to use the email address.
5. Set the same `FIREBASE_DB_URL` (and same `FIREBASE_AUTH_TOKEN`, if you use one) in both copies.
6. **Deploy → New deployment → Web app**: Execute as **Me**, Who has access **Anyone**. Authorize when prompted.
7. Copy the resulting `/exec` URL.

You will end up with **two** distinct Web App URLs, one per mailbox. Both write into the same Firebase RTDB paths (`mvp/mvp_activities_v1`, `mvp/mvp_tasks_v1`, …) and stamp `sourceInbox` so the SPA can tell them apart.

### Step B — register both URLs in the dashboard

The frontend now supports a **list** of webhook URLs. Open the live site, click the **Unibox** tab, then **Configure Webhooks**. You'll be prompted once per mailbox; paste the matching `/exec` URL for each. The list persists in `localStorage` under `jaba.inboxSyncWebhookUrls`.

If you'd rather bake the URLs into the deploy (so every browser sees them without prompts), add this above the inbox-sync `<script>` block in `index.html`:

```html
<script>
  window.JABA_INBOX_SYNC_WEBHOOK_URLS = [
    { url: 'https://script.google.com/macros/s/AKfy.../exec', label: 'jordon@jaba.ai' },
    { url: 'https://script.google.com/macros/s/AKfz.../exec', label: 'jordon@jastercreative.com' }
  ];
</script>
```

This array overrides `localStorage`. The legacy single-URL globals (`window.JABA_INBOX_SYNC_WEBHOOK_URL` / `localStorage['jaba.inboxSyncWebhookUrl']`) are still honored as a fallback so existing single-mailbox setups keep working.

### Step C — schedule each script independently

Each Apps Script has its own Triggers panel. Set a 15-minute time-based trigger on `scheduledSync` in **both** copies. The 5-minute throttle inside `syncInbox` is keyed by `sourceInbox`, so the two scripts never block each other.

### What gets stamped where

The Apps Script writes the following extra fields onto every record it creates:

- `sourceInbox` — the mailbox label (e.g. `jordon@jaba.ai`).
- `mailboxOwner` — the resolved owner email.

Records created before this change don't have these fields. The Unibox shows them under the **Unknown / legacy** filter chip and labels their pill as `Legacy sync` (or, if the SPA can infer it, the historical mailbox).

### How the Unibox filters map to records

| Filter chip | Matches |
|---|---|
| All | every record |
| Needs reply | activities with `followUpRequired = true` and matching task not done |
| jordon@jaba.ai | `sourceInbox` contains `jaba.ai` (or label `jaba`) |
| jordon@jastercreative.com | `sourceInbox` contains `jastercreative.com` (or label `jaster`) |
| Unknown / legacy | no `sourceInbox` set |

The search box matches across person, email, account name, subject, and the body summary.

### Marking a Reply Required task done

The Unibox renders a **Mark replied** button on rows that have a linked Reply Required task. Clicking it calls `jabaMvp.completeTask(id)` which sets `status: 'done'` and writes the tasks array back to Firebase under `mvp/mvp_tasks_v1`. The next sync from either Apps Script will leave the closed task alone (the Reply Required dedup loop skips `status === 'done'`).

## Apps Script template

A starter implementation lives at `apps-script/inbox-sync.gs` in this repo. It mirrors the classification + dedup logic in `inbox-sync.js` (the Node implementation) but uses `GmailApp` and `UrlFetchApp` instead of the external-tool CLI. It writes to the same Firebase paths the SPA reads:

- `mvp/mvp_accounts_v1`
- `mvp/mvp_contacts_v1`
- `mvp/mvp_activities_v1`
- `mvp/mvp_tasks_v1`
- `mvp/mvp_lead_intake_v1`
- `mvp/mvp_inbox_sync_v1`

The `mvp/mvp_opps_v1` and `mvp/mvp_smartlead_v1` paths are not written by the inbox sync (matches the Node behavior).

## Troubleshooting

- **Pill still says "Inbox sync not configured"** after clicking it: make sure you entered a URL beginning with `https://`.
- **Pill says "webhook unreachable"**: confirm the Apps Script deployment access is set to **Anyone**, and that the URL ends in `/exec`.
- **Pill says "webhook HTTP 401" or 403**: the Apps Script needs to be re-deployed as **Execute as: Me** with **Anyone** access.
- **Dashboard data is empty**: the inbox sync writes to Firebase RTDB; the SPA reads it there. If the writes succeeded but the dashboard is empty, check the RTDB Console for content under `mvp/mvp_activities_v1`.
- **You want to clear the configured URL**: in the browser DevTools console run
  `window.jabaInboxSync.setWebhookUrl(''); location.reload();`

## Local development (unchanged)

`npm start` still runs `server.js` on port 8080 with the `/api/sync-inbox` endpoint backed by the external-tool CLI, exactly as before. The new frontend prefers the webhook URL when present, but if you haven't set one and you're running locally (`localhost`/`127.0.0.1`) it falls through to the local backend automatically.
