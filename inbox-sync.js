/* JABA Inbox Sync — backend logic
 *
 * Pulls recent Gmail messages via the `search_email` external tool
 * (source_id 'gcal'), classifies them, and writes CRM updates to the
 * Firebase Realtime Database at mvp/<store>.
 *
 * This module is pure-ish: it takes injectable I/O (callTool, db) so the
 * test harness can stub the external tool and use an in-memory store.
 *
 * Stores written (matching jaba-crm-mvp.js):
 *   mvp/mvp_activities_v1   — Email received / Email sent activities
 *   mvp/mvp_tasks_v1        — Reply Required tasks for inbound mail
 *   mvp/mvp_contacts_v1     — created when sender has enough info
 *   mvp/mvp_accounts_v1     — created/upserted for new contacts
 *   mvp/mvp_lead_intake_v1  — fallback when not enough info to classify
 *   mvp/mvp_inbox_sync_v1   — sync metadata { lastSync, lastResult, seenEmailIds }
 */
'use strict';

// ---------- constants ----------
// These paths MUST match the keys the SPA in jaba-crm-mvp.js reads/writes
// under window.db.ref('mvp/' + STORE_KEYS[name]). If you rename one here,
// rename it in jaba-crm-mvp.js's STORE_KEYS at the same time.
const STORE = {
  activities: 'mvp/mvp_activities_v1',
  tasks: 'mvp/mvp_tasks_v1',          // jaba-crm-mvp.js STORE_KEYS.mvpTasks
  contacts: 'mvp/mvp_contacts_v1',
  accounts: 'mvp/mvp_accounts_v1',
  leadIntake: 'mvp/mvp_lead_intake_v1',
  opportunities: 'mvp/mvp_opps_v1',
  smartlead: 'mvp/mvp_smartlead_v1',
  syncMeta: 'mvp/mvp_inbox_sync_v1'
};

// 100X Sports and VMG Agency are explicit prospects, NEVER auto-classified
// as Current Client. Guardrail mirrors jaba-crm-mvp.js enforceProspectGuardrails.
const PROSPECT_GUARDRAIL_NAMES = ['100x sports', 'vmg agency', '100x', 'vmg'];

// Senders / patterns we should never import as activities.
const NOREPLY_PATTERNS = [
  /no[-_.]?reply/i,
  /do[-_.]?not[-_.]?reply/i,
  /notifications?@/i,
  /noreply-apps-scripts-notifications@google\.com/i,
  /mailer-daemon@/i,
  /postmaster@/i,
  /bounce/i
];

// Newsletter / promotional / system labels (Gmail CATEGORY_*).
const PROMO_LABELS = new Set([
  'CATEGORY_PROMOTIONS',
  'CATEGORY_UPDATES',
  'CATEGORY_FORUMS',
  'CATEGORY_SOCIAL'
]);

// Subject heuristics that mark an email as not human-actionable.
const NOISE_SUBJECT_RE = /(^|\s)(unsubscribe|newsletter|digest|weekly\s+update|daily\s+update|summary of failures|system notice|verification code|password reset|receipt|invoice|order #|shipped|tracking|webinar|sale|% off|deal of)/i;

// Phrases that strongly suggest the sender wants a reply.
const REPLY_NEEDED_RE = /(\?|please\s+reply|let me know|when can you|are you available|can we (chat|meet|jump|hop)|interested\?|thoughts\?|worth a (quick )?chat|circling back|following up|follow[- ]up|any update|wanted to confirm)/i;

// Defaults
const DEFAULT_LOOKBACK_DAYS = 3;
const MIN_RESYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 min — gate the on-load auto-sync

// ---------- helpers ----------
function nowISO() { return new Date().toISOString(); }
function todayISO() { return new Date().toISOString().split('T')[0]; }

function toLowerSafe(s) { return String(s == null ? '' : s).toLowerCase(); }

function parseFromHeader(from) {
  // "Name <email@x>" or just "email@x"
  if (!from) return { name: '', email: '' };
  const m = String(from).match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  const trimmed = String(from).trim();
  if (trimmed.indexOf('@') >= 0) return { name: '', email: trimmed.toLowerCase() };
  return { name: trimmed, email: '' };
}

function emailDomain(email) {
  const at = email.indexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).toLowerCase();
}

// Heuristic account name from sender domain (e.g. "acme.com" -> "Acme")
function guessAccountName(email, fromName) {
  if (fromName && fromName.indexOf('@') < 0 && fromName.length > 1) {
    // If from-name looks like a real human, prefer their employer-ish bit.
    // Caller may override; we still return a sensible default.
  }
  const d = emailDomain(email);
  if (!d) return '';
  // Strip common public providers — those don't make good account names.
  const PUBLIC = new Set([
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
    'aol.com', 'proton.me', 'protonmail.com', 'live.com', 'msn.com'
  ]);
  if (PUBLIC.has(d)) return '';
  const root = d.split('.').slice(0, -1).join('.') || d;
  return root.charAt(0).toUpperCase() + root.slice(1);
}

function classifyEmail(email, ownerEmail) {
  // Returns { skip: bool, reason: string, kind: 'inbound'|'outbound', needsReply: bool }
  const from = parseFromHeader(email.from_);
  const labels = Array.isArray(email.labels) ? email.labels : [];
  const subject = String(email.subject || '');
  const body = String(email.body || email.snippet || '');

  // Outbound vs inbound
  const isOutbound = ownerEmail && from.email && from.email === ownerEmail.toLowerCase();
  const kind = isOutbound ? 'outbound' : 'inbound';

  // Filter rules — skip these regardless of inbound/outbound.
  for (let i = 0; i < NOREPLY_PATTERNS.length; i++) {
    if (NOREPLY_PATTERNS[i].test(from.email) || NOREPLY_PATTERNS[i].test(email.from_ || '')) {
      return { skip: true, reason: 'noreply-sender', kind: kind };
    }
  }

  // Google Apps Script failure notifications are explicitly noise.
  if (/^Summary of failures for Google Apps Script/i.test(subject)) {
    return { skip: true, reason: 'gas-failure-summary', kind: kind };
  }

  // Promo / update / forum / social — only skip if we have NO inbox label
  // present; if the user actively has it in INBOX we still consider it.
  const labelSet = new Set(labels);
  const inInbox = labelSet.has('INBOX');
  let promoCount = 0;
  PROMO_LABELS.forEach(function (l) { if (labelSet.has(l)) promoCount++; });
  if (promoCount > 0 && !inInbox) {
    return { skip: true, reason: 'promo-label', kind: kind };
  }
  // Even in INBOX, CATEGORY_PROMOTIONS or noisy subjects = skip.
  if (labelSet.has('CATEGORY_PROMOTIONS')) {
    return { skip: true, reason: 'promotions-label', kind: kind };
  }
  if (NOISE_SUBJECT_RE.test(subject)) {
    return { skip: true, reason: 'noise-subject', kind: kind };
  }

  // Common bulk-mail domains — heuristic
  const dom = emailDomain(from.email);
  if (/(^|\.)(beehiiv|substack|mailchimp|sendgrid|sparkpost|hubspotemail|hubspot|mc\.|cmail|constantcontact|mailerlite|convertkit|luma-mail|lumamail|eventbrite|meetup|notion-mail|customer\.io|amazonses|sg\.email|mandrillapp)\b/.test(dom)) {
    return { skip: true, reason: 'bulk-mail-domain', kind: kind };
  }
  // Templated bulk-mail local-parts (e.g. usr-XXXXXXX@user.luma-mail.com,
  // 0123456789@em.example.com). High-entropy local-part on a "user." or
  // "em." style host = transactional/newsletter relay.
  if (/^(usr-|user-|em-|notif-|noreply-)/i.test(from.email.split('@')[0] || '')) {
    return { skip: true, reason: 'templated-relay', kind: kind };
  }

  // Empty body and short snippet = probably auto. Skip.
  if (!body || body.trim().length < 8) {
    return { skip: true, reason: 'empty-body', kind: kind };
  }

  // Reply detection (only meaningful for inbound).
  const needsReply = !isOutbound && (
    REPLY_NEEDED_RE.test(subject) || REPLY_NEEDED_RE.test(body.slice(0, 1500))
  );

  return { skip: false, reason: '', kind: kind, needsReply: needsReply };
}

// ---------- store helpers ----------
function ensureArray(x) { return Array.isArray(x) ? x : []; }

function nextId(arr) {
  let max = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] && typeof arr[i].id === 'number' && arr[i].id > max) max = arr[i].id;
  }
  return max + 1;
}

function findAccountByName(accounts, name) {
  if (!name) return null;
  const target = toLowerSafe(name);
  for (let i = 0; i < accounts.length; i++) {
    if (accounts[i] && toLowerSafe(accounts[i].name) === target) return accounts[i];
  }
  return null;
}

function findContactByEmail(contacts, email) {
  if (!email) return null;
  const target = toLowerSafe(email);
  for (let i = 0; i < contacts.length; i++) {
    if (contacts[i] && toLowerSafe(contacts[i].email) === target) return contacts[i];
  }
  return null;
}

function isProspectGuardrail(name) {
  const lower = toLowerSafe(name);
  for (let i = 0; i < PROSPECT_GUARDRAIL_NAMES.length; i++) {
    if (lower.indexOf(PROSPECT_GUARDRAIL_NAMES[i]) >= 0) return true;
  }
  return false;
}

function upsertAccount(accounts, data) {
  let acct = findAccountByName(accounts, data.name);
  if (acct) {
    if (acct.bucket && data.bucket && acct.bucket !== data.bucket) {
      // keep existing bucket; don't fight existing classification.
    }
    return acct;
  }
  acct = {
    id: nextId(accounts),
    name: data.name,
    bucket: data.bucket || 'brands',
    accountType: isProspectGuardrail(data.name) ? 'Prospect' : (data.accountType || 'Prospect'),
    stage: 'Target',
    owner: 'Jordon',
    primaryContact: data.primaryContact || '',
    lastActivity: todayISO(),
    nextStep: '',
    createdDate: nowISO(),
    source: 'Inbox sync'
  };
  accounts.push(acct);
  return acct;
}

// ---------- query construction ----------
function buildQueries(opts) {
  const lookbackDays = (opts && opts.lookbackDays) || DEFAULT_LOOKBACK_DAYS;
  const includeSent = !!(opts && opts.includeSent);

  // Gmail's `after:` accepts YYYY/MM/DD. We use that for max compatibility.
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const y = since.getUTCFullYear();
  const m = String(since.getUTCMonth() + 1).padStart(2, '0');
  const d = String(since.getUTCDate()).padStart(2, '0');
  const after = y + '/' + m + '/' + d;

  const queries = ['in:inbox after:' + after];
  if (includeSent) queries.push('in:sent after:' + after);
  return queries;
}

// ---------- main ----------
async function syncInbox(deps, opts) {
  // deps: { callTool(name, args), readStore(path), writeStore(path, value) }
  // opts: { lookbackDays, includeSent, ownerEmail, force }
  opts = opts || {};
  const ownerEmail = (opts.ownerEmail || 'jordon@jaba.ai').toLowerCase();
  // Stamp on every record so the SPA Unibox can group by mailbox.
  // Defaults to ownerEmail; pass opts.sourceInbox to override with a
  // friendly label.
  const sourceInbox = String(opts.sourceInbox || ownerEmail || 'unknown');

  const startedAt = nowISO();

  // Load existing stores
  const [
    activities, tasks, contacts, accounts, leadIntake, syncMeta
  ] = await Promise.all([
    deps.readStore(STORE.activities).then(ensureArray),
    deps.readStore(STORE.tasks).then(ensureArray),
    deps.readStore(STORE.contacts).then(ensureArray),
    deps.readStore(STORE.accounts).then(ensureArray),
    deps.readStore(STORE.leadIntake).then(ensureArray),
    deps.readStore(STORE.syncMeta).then(function (v) { return v || {}; })
  ]);

  // Throttle: skip if we synced very recently and force isn't set.
  if (!opts.force && syncMeta && syncMeta.lastSync) {
    const last = Date.parse(syncMeta.lastSync);
    if (!isNaN(last) && (Date.now() - last) < MIN_RESYNC_INTERVAL_MS) {
      return {
        ok: true,
        skipped: true,
        reason: 'recent-sync',
        lastSync: syncMeta.lastSync,
        result: syncMeta.lastResult || null
      };
    }
  }

  // Build dedup set from existing activity sourceIds.
  const seenEmailIds = new Set();
  activities.forEach(function (a) {
    if (a && a.sourceKind === 'gmail' && a.sourceId) seenEmailIds.add(a.sourceId);
  });
  const seenThreadIds = new Set();
  activities.forEach(function (a) {
    if (a && a.sourceKind === 'gmail' && a.threadId) seenThreadIds.add(a.threadId);
  });

  // Call external tool
  const queries = buildQueries({
    lookbackDays: opts.lookbackDays,
    includeSent: opts.includeSent !== false  // default include sent
  });

  let toolResult;
  try {
    toolResult = await deps.callTool('search_email', { queries: queries });
  } catch (err) {
    return { ok: false, error: 'tool-call-failed: ' + (err && err.message ? err.message : String(err)) };
  }

  const emails = (toolResult && toolResult.email_results && toolResult.email_results.emails) || [];

  // Process emails
  const counts = {
    fetched: emails.length,
    imported: 0,
    skipped: 0,
    tasksCreated: 0,
    contactsCreated: 0,
    accountsCreated: 0,
    leadIntakeCreated: 0,
    duplicates: 0,
    skipReasons: {}
  };

  for (let i = 0; i < emails.length; i++) {
    const e = emails[i];
    if (!e || !e.email_id) { counts.skipped++; bumpReason(counts, 'no-id'); continue; }

    if (seenEmailIds.has(e.email_id)) {
      counts.duplicates++;
      continue;
    }

    const cls = classifyEmail(e, ownerEmail);
    if (cls.skip) {
      counts.skipped++;
      bumpReason(counts, cls.reason);
      continue;
    }

    const from = parseFromHeader(e.from_);
    // For outbound emails, the relevant person is the recipient.
    let person = '';
    let personEmail = '';
    if (cls.kind === 'outbound') {
      const toList = Array.isArray(e.to) ? e.to : [];
      personEmail = toLowerSafe(toList[0] || '');
      person = personEmail;
    } else {
      personEmail = from.email;
      person = from.name || from.email;
    }

    // Try to find existing contact, otherwise consider creating one.
    let contact = findContactByEmail(contacts, personEmail);
    let account = null;
    let accountName = '';

    if (contact) {
      accountName = contact.accountName || '';
      account = findAccountByName(accounts, accountName);
    } else {
      const guess = guessAccountName(personEmail, from.name);
      if (guess) {
        accountName = guess;
        account = findAccountByName(accounts, accountName);
        if (!account) {
          const beforeLen = accounts.length;
          account = upsertAccount(accounts, { name: accountName, bucket: 'brands' });
          if (accounts.length > beforeLen) counts.accountsCreated++;
        }
      }
    }

    // Decide: if we have a sender name + email, create/update contact
    const haveEnoughInfo = personEmail && (from.name || cls.kind === 'outbound');
    if (!contact && haveEnoughInfo && cls.kind === 'inbound' && accountName) {
      contact = {
        id: nextId(contacts),
        name: from.name || personEmail,
        accountName: accountName,
        title: '',
        email: personEmail,
        phone: '',
        linkedin: '',
        bucket: account ? account.bucket : 'brands',
        status: 'New',
        owner: 'Jordon',
        source: 'Inbox sync',
        lastActivity: todayISO(),
        nextStep: '',
        createdDate: nowISO(),
        sourceInbox: sourceInbox,
        mailboxOwner: ownerEmail
      };
      contacts.push(contact);
      counts.contactsCreated++;
    } else if (!contact && !accountName && cls.kind === 'inbound' && personEmail) {
      // Not enough info — drop into lead intake instead.
      const li = {
        id: nextId(leadIntake),
        sentBy: 'Inbox sync',
        contactName: from.name || personEmail,
        accountName: '',
        contactInfo: personEmail,
        ask: e.subject || '',
        bucket: 'brands',
        priority: cls.needsReply ? 'high' : 'medium',
        dueDate: todayISO(),
        source: 'Email',
        status: 'open',
        createdDate: nowISO(),
        sourceKind: 'gmail',
        sourceId: e.email_id,
        threadId: e.thread_id || '',
        sourceInbox: sourceInbox,
        mailboxOwner: ownerEmail
      };
      leadIntake.push(li);
      counts.leadIntakeCreated++;
    }

    // Build activity (always, unless we already created a leadIntake stub
    // — in that case still attach an unclassified activity so it shows on
    // the Daily Briefing activity feed).
    const activityType = cls.kind === 'outbound' ? 'Email sent' : 'Email received';
    const summary = (e.subject ? '[' + e.subject + '] ' : '') +
      (e.snippet || '').slice(0, 280);
    const activity = {
      id: nextId(activities),
      activityType: activityType,
      person: person,
      personEmail: personEmail,
      accountName: accountName,
      opportunityName: '',
      source: 'Gmail',
      timestamp: e.date || nowISO(),
      subject: e.subject || '',
      summary: summary,
      owner: 'Jordon',
      followUpRequired: !!cls.needsReply && cls.kind === 'inbound',
      sourceKind: 'gmail',
      sourceId: e.email_id,
      threadId: e.thread_id || '',
      sourceInbox: sourceInbox,
      mailboxOwner: ownerEmail
    };
    activities.push(activity);
    seenEmailIds.add(e.email_id);
    counts.imported++;

    // Touch related account
    if (account) account.lastActivity = todayISO();

    // Reply Required task — only for inbound + needsReply, and dedup by threadId.
    if (activity.followUpRequired) {
      const taskTitle = 'Reply: ' + (e.subject || person || personEmail);
      const dup = tasks.find(function (t) {
        if (!t || t.status === 'done' || t.type !== 'Reply Required') return false;
        if (t.threadId && e.thread_id && t.threadId === e.thread_id) return true;
        if (t.sourceId && t.sourceId === e.email_id) return true;
        // Title+account fallback only when the existing task is from
        // the same source inbox — otherwise the same lead emailing
        // both mailboxes silently swallows the second reply task.
        if (t.title === taskTitle &&
            (t.accountName || '') === (accountName || '') &&
            (!t.sourceInbox || t.sourceInbox === sourceInbox)) {
          return true;
        }
        return false;
      });
      if (!dup) {
        const t = {
          id: nextId(tasks),
          title: taskTitle,
          type: 'Reply Required',
          person: person,
          accountName: accountName,
          opportunityName: '',
          owner: 'Jordon',
          dueDate: todayISO(),
          priority: 'high',
          status: 'todo',
          reason: 'Inbound email appears to need a response',
          createdDate: nowISO(),
          sourceId: e.email_id,
          sourceKind: 'gmail',
          threadId: e.thread_id || '',
          sourceInbox: sourceInbox,
          mailboxOwner: ownerEmail,
          subject: e.subject || '',
          personEmail: personEmail
        };
        tasks.push(t);
        counts.tasksCreated++;
      }
    }
  }

  // Enforce 100X / VMG guardrail one more time on accounts we touched.
  accounts.forEach(function (a) {
    if (a && isProspectGuardrail(a.name) && a.accountType === 'Current Client') {
      a.accountType = 'Prospect';
      a.stage = 'Target';
    }
  });

  // Persist.
  //
  // Firebase Realtime DB silently DELETES a path when it's PUT with an
  // empty array (or null). If we wrote `[]` for a store the SPA had
  // already populated from another session, we'd nuke that data — and the
  // shallow `?shallow=true` view would no longer list the key. So we
  // route every store write through writeArrayIfNonEmpty: it skips writes
  // for empty arrays, preserving whatever's already at that path.
  //
  // We always write every store the SPA's DATA_STORE_NAMES expects so the
  // backend never silently drops a store the dashboard depends on. Stores
  // that the inbox sync doesn't actively manage (opportunities, smartlead)
  // get a no-op skip when they're empty.
  //
  // Error policy: a single write failure must NOT abort the sync — we
  // still want to record what we tried and surface the error in syncMeta
  // so the dashboard / status endpoint can show it. Without per-store
  // error capture, one rejected promise would short-circuit Promise.all
  // and leave the syncMeta unwritten, hiding the failure entirely.
  function writeArrayIfNonEmpty(path, value) {
    if (!Array.isArray(value) || value.length === 0) {
      return Promise.resolve({ skipped: true, path: path });
    }
    return deps.writeStore(path, value).then(function () {
      return { skipped: false, path: path, count: value.length };
    }).catch(function (err) {
      return {
        skipped: false,
        failed: true,
        path: path,
        count: value.length,
        error: err && err.message ? err.message : String(err)
      };
    });
  }

  // Order matches jaba-crm-mvp.js DATA_STORE_NAMES so written/skipped
  // arrays read in the same order the SPA reads stores.
  const writeOutcomes = await Promise.all([
    writeArrayIfNonEmpty(STORE.accounts, accounts),
    writeArrayIfNonEmpty(STORE.contacts, contacts),
    writeArrayIfNonEmpty(STORE.opportunities, []),
    writeArrayIfNonEmpty(STORE.activities, activities),
    writeArrayIfNonEmpty(STORE.leadIntake, leadIntake),
    writeArrayIfNonEmpty(STORE.smartlead, []),
    writeArrayIfNonEmpty(STORE.tasks, tasks)
  ]);

  const finishedAt = nowISO();
  const writes = {
    written: writeOutcomes.filter(function (o) { return !o.skipped && !o.failed; }).map(function (o) {
      return { path: o.path, count: o.count };
    }),
    skipped: writeOutcomes.filter(function (o) { return o.skipped; }).map(function (o) {
      return o.path;
    }),
    failed: writeOutcomes.filter(function (o) { return o.failed; }).map(function (o) {
      return { path: o.path, count: o.count, error: o.error };
    })
  };
  const result = {
    ok: writes.failed.length === 0,
    skipped: false,
    startedAt: startedAt,
    finishedAt: finishedAt,
    queries: queries,
    counts: counts,
    writes: writes
  };

  // Surface invariant violations: if we imported emails but no
  // activities path was written, that's a contract bug — record it so
  // the status endpoint can flag the regression.
  const writtenPaths = writes.written.map(function (w) { return w.path; });
  if (counts.imported > 0 && writtenPaths.indexOf(STORE.activities) < 0) {
    result.warnings = (result.warnings || []).concat(
      'imported>0 but activities path was not written'
    );
  }
  if (counts.tasksCreated > 0 && writtenPaths.indexOf(STORE.tasks) < 0) {
    result.warnings = (result.warnings || []).concat(
      'tasksCreated>0 but tasks path was not written'
    );
  }

  // Persist meta last. If THIS write fails, surface the error rather
  // than swallowing it — the dashboard uses syncMeta to detect staleness.
  try {
    await deps.writeStore(STORE.syncMeta, {
      lastSync: finishedAt,
      lastResult: result
    });
  } catch (err) {
    result.ok = false;
    result.metaWriteError = err && err.message ? err.message : String(err);
  }

  return result;
}

function bumpReason(counts, reason) {
  if (!counts.skipReasons[reason]) counts.skipReasons[reason] = 0;
  counts.skipReasons[reason]++;
}

module.exports = {
  syncInbox: syncInbox,
  classifyEmail: classifyEmail,
  parseFromHeader: parseFromHeader,
  guessAccountName: guessAccountName,
  buildQueries: buildQueries,
  STORE: STORE,
  MIN_RESYNC_INTERVAL_MS: MIN_RESYNC_INTERVAL_MS,
  DEFAULT_LOOKBACK_DAYS: DEFAULT_LOOKBACK_DAYS,
  // exported for tests
  _internals: { isProspectGuardrail: isProspectGuardrail }
};
