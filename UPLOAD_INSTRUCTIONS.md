# Upload: Hide old Inbox sidebar item

## Files to upload
- `jaba-custom.js` — replaces existing file in repo root

## How to upload
1. Go to https://github.com/Nickm10-web/jaba-leads1
2. Click `jaba-custom.js`
3. Click the pencil (Edit) icon
4. Delete its contents and paste in the contents of `jaba-custom.js` from this package (or use "Upload files" at the repo root and replace it)
5. Commit message suggestion: `Hide old Inbox sidebar item (Unibox is primary)`

## What changed
Single change near line 657 of `jaba-custom.js`. The old Inbox entry in the left sidebar nav is commented out so it no longer renders. The Unibox entry directly below it is preserved.

## Behavior
- Old "Inbox" item no longer appears in the sidebar.
- "Unibox" remains and works as before.
- The underlying `inboxSection`, all Inbox rendering code, sync logic, and data are untouched.
- `inboxSection` is still referenced in the section-hiding helper (line 732) — harmless, keeps state consistent if any code path reactivates it.
- To restore: uncomment the single `Inbox` line in the sections array.
