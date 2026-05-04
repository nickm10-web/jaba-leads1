/* JABA Inbox Sync — Google Apps Script Web App
 *
 * Runs in the Gmail account whose inbox should be synced (e.g. jordon@jaba.ai).
 * Pulls recent Gmail messages with GmailApp and writes CRM updates to the
 * same Firebase Realtime DB paths the SPA reads.
 *
 * Deploy: Extensions/Editor > Deploy > New deployment > type "Web app"
 *   - Execute as: Me
 *   - Who has access: Anyone
 * Copy the /exec URL and paste it into the dashboard's "Inbox sync not
 * configured" pill, OR set window.JABA_INBOX_SYNC_WEBHOOK_URL in index.html.
 *
 * The script intentionally mirrors the JS in inbox-sync.js (the Node
 * version used by server.js for local dev) so the two paths stay
 * compatible. Keep STORE keys + dedup behavior in sync if you change one.
 */

// ---------- config ----------
var FIREBASE_DB_URL = 'https://jaba-leads-default-rtdb.firebaseio.com';
// Leave blank for unauthenticated writes (RTDB rules enforce access).
// Or paste a database secret (legacy) / OAuth bearer token / ID token.
var FIREBASE_AUTH_TOKEN = '';

// The Gmail account this script is reading.
//
// You may either hard-code OWNER_EMAIL (e.g. 'jordon@jaba.ai' or
// 'jordon@jastercreative.com') OR leave it blank and the script will
// fall back to Session.getActiveUser().getEmail() at runtime — that
// returns the deployer's email when the script is "Execute as: Me",
// which is the standard Apps Script deployment shape for this app.
//
// SOURCE_INBOX is the value stamped on every record this script writes.
// It defaults to OWNER_EMAIL but can be overridden if you want a
// friendly label (e.g. 'jaba' or 'jaster'). Keep it stable per
// deployment — the Unibox in the SPA filters on this value.
var OWNER_EMAIL = '';
var SOURCE_INBOX = '';
var DEFAULT_LOOKBACK_DAYS = 3;
var MIN_RESYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 min

function resolveOwnerEmail_() {
  if (OWNER_EMAIL && /@/.test(OWNER_EMAIL)) return String(OWNER_EMAIL).toLowerCase();
  try {
    var who = Session.getActiveUser().getEmail();
    if (who && /@/.test(who)) return String(who).toLowerCase();
  } catch (_) { /* ignore */ }
  try {
    var eff = Session.getEffectiveUser().getEmail();
    if (eff && /@/.test(eff)) return String(eff).toLowerCase();
  } catch (_) { /* ignore */ }
  return '';
}

function resolveSourceInbox_(ownerEmail) {
  if (SOURCE_INBOX) return String(SOURCE_INBOX);
  return ownerEmail || 'unknown';
}

var STORE = {
  activities:    'mvp/mvp_activities_v1',
  tasks:         'mvp/mvp_tasks_v1',
  contacts:      'mvp/mvp_contacts_v1',
  accounts:      'mvp/mvp_accounts_v1',
  leadIntake:    'mvp/mvp_lead_intake_v1',
  opportunities: 'mvp/mvp_opps_v1',
  smartlead:     'mvp/mvp_smartlead_v1',
  syncMeta:      'mvp/mvp_inbox_sync_v1'
};

var PROSPECT_GUARDRAIL_NAMES = ['100x sports', 'vmg agency', '100x', 'vmg'];

var NOREPLY_PATTERNS = [
  /no[-_.]?reply/i, /do[-_.]?not[-_.]?reply/i, /notifications?@/i,
  /noreply-apps-scripts-notifications@google\.com/i,
  /mailer-daemon@/i, /postmaster@/i, /bounce/i
];

var NOISE_SUBJECT_RE = /(^|\s)(unsubscribe|newsletter|digest|weekly\s+update|daily\s+update|summary of failures|system notice|verification code|password reset|receipt|invoice|order #|shipped|tracking|webinar|sale|% off|deal of)/i;

var REPLY_NEEDED_RE = /(\?|please\s+reply|let me know|when can you|are you available|can we (chat|meet|jump|hop)|interested\?|thoughts\?|worth a (quick )?chat|circling back|following up|follow[- ]up|any update|wanted to confirm)/i;

// ---------- entrypoints ----------

// HTTP entry — called by the dashboard via fetch().
function doPost(e) {
  var opts = {};
  try {
    if (e && e.postData && e.postData.contents) {
      opts = JSON.parse(e.postData.contents) || {};
    }
  } catch (_) { opts = {}; }
  var result = syncInbox(opts);
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// Optional GET for status checks.
function doGet(e) {
  var meta = fbRead(STORE.syncMeta) || null;
  return ContentService.createTextOutput(JSON.stringify({ ok: true, meta: meta }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Time-driven trigger entry — schedule this from Apps Script Triggers UI.
function scheduledSync() {
  syncInbox({});
}

// ---------- sync core ----------

function syncInbox(opts) {
  opts = opts || {};
  var startedAt = new Date().toISOString();
  var lookbackDays = opts.lookbackDays || DEFAULT_LOOKBACK_DAYS;
  if (lookbackDays < 1 || lookbackDays > 14) lookbackDays = DEFAULT_LOOKBACK_DAYS;

  var ownerEmail = resolveOwnerEmail_();
  var sourceInbox = resolveSourceInbox_(ownerEmail);

  var syncMeta = fbRead(STORE.syncMeta) || {};
  // Per-inbox throttle slot. We keep a top-level `lastSync` for legacy
  // readers, plus a `byInbox[<sourceInbox>].lastSync` slot so two
  // separate Apps Script deployments (jaba.ai, jastercreative.com)
  // don't cross-throttle each other when they share this metadata blob.
  var byInbox = (syncMeta && typeof syncMeta.byInbox === 'object' && syncMeta.byInbox) ? syncMeta.byInbox : {};
  var inboxMeta = byInbox[sourceInbox] || {};
  if (!opts.force && inboxMeta.lastSync) {
    var last = Date.parse(inboxMeta.lastSync);
    if (!isNaN(last) && (Date.now() - last) < MIN_RESYNC_INTERVAL_MS) {
      return {
        ok: true, skipped: true, reason: 'recent-sync',
        sourceInbox: sourceInbox, mailboxOwner: ownerEmail,
        lastSync: inboxMeta.lastSync, result: inboxMeta.lastResult || null
      };
    }
  }

  var activities = fbRead(STORE.activities) || [];
  var tasks      = fbRead(STORE.tasks) || [];
  var contacts   = fbRead(STORE.contacts) || [];
  var accounts   = fbRead(STORE.accounts) || [];
  var leadIntake = fbRead(STORE.leadIntake) || [];

  var seenEmailIds = {};
  for (var i = 0; i < activities.length; i++) {
    var a = activities[i];
    if (a && a.sourceKind === 'gmail' && a.sourceId) seenEmailIds[a.sourceId] = true;
  }

  var since = new Date(Date.now() - lookbackDays * 86400000);
  var y = since.getFullYear(), m = pad2(since.getMonth() + 1), d = pad2(since.getDate());
  var afterStr = y + '/' + m + '/' + d;

  var counts = {
    fetched: 0, imported: 0, skipped: 0, tasksCreated: 0,
    contactsCreated: 0, accountsCreated: 0, leadIntakeCreated: 0,
    duplicates: 0, skipReasons: {}
  };

  var queries = ['in:inbox after:' + afterStr];
  if (opts.includeSent !== false) queries.push('in:sent after:' + afterStr);

  for (var qi = 0; qi < queries.length; qi++) {
    var threads = GmailApp.search(queries[qi], 0, 100);
    for (var ti = 0; ti < threads.length; ti++) {
      var msgs = threads[ti].getMessages();
      for (var mi = 0; mi < msgs.length; mi++) {
        counts.fetched++;
        processMessage_(msgs[mi], threads[ti].getId(), {
          activities: activities, tasks: tasks, contacts: contacts,
          accounts: accounts, leadIntake: leadIntake,
          seenEmailIds: seenEmailIds, counts: counts,
          ownerEmail: ownerEmail, sourceInbox: sourceInbox
        });
      }
    }
  }

  // Guardrail: 100X / VMG never auto-classified as Current Client.
  for (var ai = 0; ai < accounts.length; ai++) {
    var ac = accounts[ai];
    if (ac && isProspectGuardrail_(ac.name) && ac.accountType === 'Current Client') {
      ac.accountType = 'Prospect';
      ac.stage = 'Target';
    }
  }

  var writes = { written: [], skipped: [], failed: [] };
  writeIfNonEmpty_(STORE.accounts,   accounts,   writes);
  writeIfNonEmpty_(STORE.contacts,   contacts,   writes);
  writeIfNonEmpty_(STORE.activities, activities, writes);
  writeIfNonEmpty_(STORE.leadIntake, leadIntake, writes);
  writeIfNonEmpty_(STORE.tasks,      tasks,      writes);

  var finishedAt = new Date().toISOString();
  var result = {
    ok: writes.failed.length === 0,
    skipped: false,
    sourceInbox: sourceInbox, mailboxOwner: ownerEmail,
    startedAt: startedAt, finishedAt: finishedAt,
    queries: queries, counts: counts, writes: writes
  };

  try {
    // Re-read metadata before the write so we don't clobber the other
    // inbox's slot if it ran concurrently. byInbox is keyed by
    // sourceInbox and only this slot is replaced.
    var freshMeta = fbRead(STORE.syncMeta) || {};
    var freshByInbox = (freshMeta && typeof freshMeta.byInbox === 'object' && freshMeta.byInbox) ? freshMeta.byInbox : {};
    freshByInbox[sourceInbox] = { lastSync: finishedAt, lastResult: result, mailboxOwner: ownerEmail };
    fbWrite(STORE.syncMeta, {
      lastSync: finishedAt,                       // legacy top-level pointer (last-writer-wins)
      lastResult: result,                          // legacy mirror of the most recent run
      lastSourceInbox: sourceInbox,
      byInbox: freshByInbox
    });
  } catch (err) {
    result.ok = false;
    result.metaWriteError = String(err && err.message ? err.message : err);
  }
  return result;
}

function processMessage_(msg, threadId, ctx) {
  var emailId = msg.getId();
  if (ctx.seenEmailIds[emailId]) { ctx.counts.duplicates++; return; }

  var fromRaw = msg.getFrom() || '';
  var to = msg.getTo() || '';
  var subject = msg.getSubject() || '';
  var snippet = (msg.getPlainBody() || '').slice(0, 1500);
  var when = msg.getDate() ? msg.getDate().toISOString() : new Date().toISOString();

  var from = parseFromHeader_(fromRaw);
  var ownerEmail = (ctx.ownerEmail || '').toLowerCase();
  var sourceInbox = ctx.sourceInbox || ownerEmail || 'unknown';
  var isOutbound = !!(from.email && ownerEmail && from.email === ownerEmail);
  var kind = isOutbound ? 'outbound' : 'inbound';

  // Skip filters
  for (var i = 0; i < NOREPLY_PATTERNS.length; i++) {
    if (NOREPLY_PATTERNS[i].test(from.email) || NOREPLY_PATTERNS[i].test(fromRaw)) {
      return bumpSkip_(ctx.counts, 'noreply-sender');
    }
  }
  if (/^Summary of failures for Google Apps Script/i.test(subject)) {
    return bumpSkip_(ctx.counts, 'gas-failure-summary');
  }
  if (NOISE_SUBJECT_RE.test(subject)) return bumpSkip_(ctx.counts, 'noise-subject');
  var dom = emailDomain_(from.email);
  if (/(^|\.)(beehiiv|substack|mailchimp|sendgrid|sparkpost|hubspotemail|hubspot|mc\.|cmail|constantcontact|mailerlite|convertkit|luma-mail|lumamail|eventbrite|meetup|notion-mail|customer\.io|amazonses|sg\.email|mandrillapp)\b/.test(dom)) {
    return bumpSkip_(ctx.counts, 'bulk-mail-domain');
  }
  if (/^(usr-|user-|em-|notif-|noreply-)/i.test((from.email.split('@')[0] || ''))) {
    return bumpSkip_(ctx.counts, 'templated-relay');
  }
  if (!snippet || snippet.trim().length < 8) return bumpSkip_(ctx.counts, 'empty-body');

  var needsReply = !isOutbound && (REPLY_NEEDED_RE.test(subject) || REPLY_NEEDED_RE.test(snippet));

  var personEmail, person;
  if (isOutbound) {
    personEmail = String(to.split(',')[0] || '').trim().toLowerCase();
    person = personEmail;
  } else {
    personEmail = from.email;
    person = from.name || from.email;
  }

  var contact = findContactByEmail_(ctx.contacts, personEmail);
  var accountName = '';
  var account = null;
  if (contact) {
    accountName = contact.accountName || '';
    account = findAccountByName_(ctx.accounts, accountName);
  } else {
    var guess = guessAccountName_(personEmail);
    if (guess) {
      accountName = guess;
      account = findAccountByName_(ctx.accounts, accountName);
      if (!account) {
        account = upsertAccount_(ctx.accounts, { name: accountName, bucket: 'brands' });
        ctx.counts.accountsCreated++;
      }
    }
  }

  var haveEnoughInfo = personEmail && (from.name || isOutbound);
  if (!contact && haveEnoughInfo && !isOutbound && accountName) {
    contact = {
      id: nextId_(ctx.contacts),
      name: from.name || personEmail, accountName: accountName,
      title: '', email: personEmail, phone: '', linkedin: '',
      bucket: account ? account.bucket : 'brands',
      status: 'New', owner: 'Jordon', source: 'Inbox sync',
      lastActivity: todayISO_(), nextStep: '', createdDate: new Date().toISOString(),
      sourceInbox: sourceInbox, mailboxOwner: ownerEmail
    };
    ctx.contacts.push(contact);
    ctx.counts.contactsCreated++;
  } else if (!contact && !accountName && !isOutbound && personEmail) {
    ctx.leadIntake.push({
      id: nextId_(ctx.leadIntake),
      sentBy: 'Inbox sync', contactName: from.name || personEmail,
      accountName: '', contactInfo: personEmail,
      ask: subject, bucket: 'brands',
      priority: needsReply ? 'high' : 'medium',
      dueDate: todayISO_(), source: 'Email', status: 'open',
      createdDate: new Date().toISOString(),
      sourceKind: 'gmail', sourceId: emailId, threadId: threadId || '',
      sourceInbox: sourceInbox, mailboxOwner: ownerEmail
    });
    ctx.counts.leadIntakeCreated++;
  }

  var activity = {
    id: nextId_(ctx.activities),
    activityType: isOutbound ? 'Email sent' : 'Email received',
    person: person, personEmail: personEmail, accountName: accountName,
    opportunityName: '', source: 'Gmail', timestamp: when,
    subject: subject,
    summary: (subject ? '[' + subject + '] ' : '') + snippet.slice(0, 280),
    owner: 'Jordon',
    followUpRequired: !!needsReply && !isOutbound,
    sourceKind: 'gmail', sourceId: emailId, threadId: threadId || '',
    sourceInbox: sourceInbox, mailboxOwner: ownerEmail
  };
  ctx.activities.push(activity);
  ctx.seenEmailIds[emailId] = true;
  ctx.counts.imported++;
  if (account) account.lastActivity = todayISO_();

  if (activity.followUpRequired) {
    var taskTitle = 'Reply: ' + (subject || person || personEmail);
    var dup = false;
    for (var ti = 0; ti < ctx.tasks.length; ti++) {
      var t = ctx.tasks[ti];
      if (!t || t.status === 'done' || t.type !== 'Reply Required') continue;
      // Globally-unique IDs first.
      if ((t.threadId && threadId && t.threadId === threadId) ||
          (t.sourceId && t.sourceId === emailId)) { dup = true; break; }
      // Title+account fallback only when the existing task is from the
      // same source inbox — otherwise the same lead emailing both
      // mailboxes would silently swallow the second reply-required task.
      var tInbox = t.sourceInbox || '';
      if (t.title === taskTitle &&
          (t.accountName || '') === (accountName || '') &&
          (!tInbox || tInbox === sourceInbox)) {
        dup = true; break;
      }
    }
    if (!dup) {
      ctx.tasks.push({
        id: nextId_(ctx.tasks), title: taskTitle, type: 'Reply Required',
        person: person, accountName: accountName, opportunityName: '',
        owner: 'Jordon', dueDate: todayISO_(), priority: 'high', status: 'todo',
        reason: 'Inbound email appears to need a response',
        createdDate: new Date().toISOString(),
        sourceId: emailId, sourceKind: 'gmail', threadId: threadId || '',
        sourceInbox: sourceInbox, mailboxOwner: ownerEmail,
        subject: subject, personEmail: personEmail
      });
      ctx.counts.tasksCreated++;
    }
  }
}

// ---------- helpers ----------
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function todayISO_() { return new Date().toISOString().split('T')[0]; }
function bumpSkip_(counts, reason) {
  counts.skipped++;
  counts.skipReasons[reason] = (counts.skipReasons[reason] || 0) + 1;
}
function parseFromHeader_(from) {
  if (!from) return { name: '', email: '' };
  var m = String(from).match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  var t = String(from).trim();
  if (t.indexOf('@') >= 0) return { name: '', email: t.toLowerCase() };
  return { name: t, email: '' };
}
function emailDomain_(email) {
  var at = (email || '').indexOf('@');
  return at < 0 ? '' : email.slice(at + 1).toLowerCase();
}
function guessAccountName_(email) {
  var d = emailDomain_(email);
  if (!d) return '';
  var PUBLIC = { 'gmail.com':1,'yahoo.com':1,'hotmail.com':1,'outlook.com':1,
    'icloud.com':1,'aol.com':1,'proton.me':1,'protonmail.com':1,'live.com':1,'msn.com':1 };
  if (PUBLIC[d]) return '';
  var root = d.split('.').slice(0, -1).join('.') || d;
  return root.charAt(0).toUpperCase() + root.slice(1);
}
function isProspectGuardrail_(name) {
  var lower = String(name || '').toLowerCase();
  for (var i = 0; i < PROSPECT_GUARDRAIL_NAMES.length; i++) {
    if (lower.indexOf(PROSPECT_GUARDRAIL_NAMES[i]) >= 0) return true;
  }
  return false;
}
function findContactByEmail_(contacts, email) {
  if (!email) return null;
  var t = email.toLowerCase();
  for (var i = 0; i < contacts.length; i++) {
    if (contacts[i] && String(contacts[i].email || '').toLowerCase() === t) return contacts[i];
  }
  return null;
}
function findAccountByName_(accounts, name) {
  if (!name) return null;
  var t = name.toLowerCase();
  for (var i = 0; i < accounts.length; i++) {
    if (accounts[i] && String(accounts[i].name || '').toLowerCase() === t) return accounts[i];
  }
  return null;
}
function upsertAccount_(accounts, data) {
  var acct = findAccountByName_(accounts, data.name);
  if (acct) return acct;
  acct = {
    id: nextId_(accounts), name: data.name,
    bucket: data.bucket || 'brands',
    accountType: isProspectGuardrail_(data.name) ? 'Prospect' : (data.accountType || 'Prospect'),
    stage: 'Target', owner: 'Jordon', primaryContact: data.primaryContact || '',
    lastActivity: todayISO_(), nextStep: '',
    createdDate: new Date().toISOString(), source: 'Inbox sync'
  };
  accounts.push(acct);
  return acct;
}
function nextId_(arr) {
  var max = 0;
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] && typeof arr[i].id === 'number' && arr[i].id > max) max = arr[i].id;
  }
  return max + 1;
}

// ---------- Firebase REST adapter ----------
function fbUrl_(refPath) {
  var u = FIREBASE_DB_URL.replace(/\/$/, '') + '/' + refPath + '.json';
  if (FIREBASE_AUTH_TOKEN) {
    u += (u.indexOf('?') >= 0 ? '&' : '?') + 'auth=' + encodeURIComponent(FIREBASE_AUTH_TOKEN);
  }
  return u;
}
function fbRead(refPath) {
  var resp = UrlFetchApp.fetch(fbUrl_(refPath), { method: 'get', muteHttpExceptions: true });
  if (resp.getResponseCode() >= 400) {
    throw new Error('firebase read ' + resp.getResponseCode() + ': ' +
      String(resp.getContentText()).slice(0, 200));
  }
  var t = resp.getContentText();
  return t ? JSON.parse(t) : null;
}
function fbWrite(refPath, value) {
  var resp = UrlFetchApp.fetch(fbUrl_(refPath), {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(value),
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() >= 400) {
    throw new Error('firebase write ' + resp.getResponseCode() + ': ' +
      String(resp.getContentText()).slice(0, 200));
  }
  return true;
}
function writeIfNonEmpty_(path, value, writes) {
  if (!value || (value.length === 0 && Array.isArray(value))) {
    writes.skipped.push(path);
    return;
  }
  try {
    fbWrite(path, value);
    writes.written.push({ path: path, count: Array.isArray(value) ? value.length : 1 });
  } catch (err) {
    writes.failed.push({ path: path, error: String(err && err.message ? err.message : err) });
  }
}
