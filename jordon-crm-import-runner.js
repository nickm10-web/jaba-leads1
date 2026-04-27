// One-shot importer for Jordon's CRM (120 records from Notion export, 2026-04-27).
// Paste this into the browser console while on http://localhost:8080.
// It fetches /jordon-crm-import.json and pushes each record under Firebase
// path `jordonCRM/<auto-key>`. Idempotent guard via importSource: re-running
// will skip records already imported with the same source tag.

(async () => {
  if (typeof firebase === 'undefined' || !firebase.database) {
    console.error('Firebase not loaded. Open the LEADS app first, then run this.');
    return;
  }
  console.log('Fetching jordon-crm-import.json...');
  const res = await fetch('/jordon-crm-import.json');
  if (!res.ok) { console.error('Failed to fetch JSON:', res.status); return; }
  const records = await res.json();
  console.log(`Loaded ${records.length} records.`);

  // Skip duplicates by importSource + name
  const existing = (await firebase.database().ref('jordonCRM').once('value')).val() || {};
  const existingKey = (item) => `${item.importSource || ''}::${(item.name || '').toLowerCase()}`;
  const existingSet = new Set(Object.values(existing).map(existingKey));
  console.log(`${Object.keys(existing).length} records already in jordonCRM. Will skip duplicates.`);

  let written = 0, skipped = 0;
  for (const r of records) {
    if (existingSet.has(existingKey(r))) { skipped++; continue; }
    await firebase.database().ref('jordonCRM').push().set(r);
    written++;
  }
  console.log(`Done. Wrote ${written}, skipped ${skipped} (already imported).`);
  console.log('Refresh the Jordon CRM section to see them.');
})();
