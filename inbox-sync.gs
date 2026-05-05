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
  syncMeta:      'mvp/mvp_inbox_sync_v1',
  // Calendar mirror of Google Calendar -> Firebase. Each event is
  // keyed by `${eventId}@${sourceCalendar}` so the jaba.ai and
  // jastercreative.com Apps Script deployments can write into the
  // same collection without overwriting each other when both are
  // invited to the same meeting.
  calendarEvents: 'mvp/mvp_calendar_events_v1',
  calendarMeta:   'mvp/mvp_calendar_sync_v1'
};

// Calendar lookahead window (days). Includes today.
var CAL_LOOKAHEAD_DAYS = 14;
// Lookback so a meeting that ended an hour ago still surfaces (recap nudge).
var CAL_LOOKBACK_DAYS = 1;
var MIN_CAL_RESYNC_INTERVAL_MS = 5 * 60 * 1000;

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
// Runs both inbox + calendar in one trigger so a single Apps Script project
// keeps Gmail + Calendar fresh against Firebase.
function scheduledSync() {
  syncInbox({});
  try { syncCalendar({}); } catch (err) {
    Logger.log('calendar sync error: ' + (err && err.message ? err.message : err));
  }
}

// Optional: a separate trigger if you want calendar on a different cadence.
function scheduledCalendarSync() {
  syncCalendar({});
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

// ---------- calendar sync ----------
//
// Reads upcoming events from the deployer's primary Google Calendar and
// mirrors them to Firebase under STORE.calendarEvents as a flat array.
// Each record has a stable composite key `${eventId}@${sourceCalendar}`
// so two Apps Script deployments (jaba.ai + jastercreative.com) writing
// into the same collection do not overwrite each other when they're both
// invited to the same meeting. Events from OTHER source calendars in the
// existing collection are preserved on every write.
//
// We never delete CRM rows. The only collection rewritten by this
// function is STORE.calendarEvents (and only the slice owned by the
// running script's sourceCalendar).

// Subjects/titles that should never be classified as a pitch meeting.
var CAL_INTERNAL_RE = /\b(stand[- ]?up|standup|1:1|1on1|one on one|sync\s*\(internal\)|team meeting|all hands|allhands|allhands|town\s*hall|bi[- ]?weekly\s+meeting|jaba\s+bi[- ]?weekly|focus\s+time|deep\s+work|lunch|gym|workout|dentist|doctor|haircut|appointment|holiday|out of office|ooo|pto|vacation|hold|blocked|busy|no\s+meetings|fyi)\b/i;

// Subjects/titles that strongly suggest a pitch / intro / sales meeting.
var CAL_PITCH_RE = /(\bintro\b|\bpitch\b|\bdiscovery\b|\bdemo\b|\bonboarding\b|\bkickoff\b|\bsales\s+call\b|\bproposal\b|\bproposal\s+review\b|\bjaba\b|\bjordon\b|\s+x\s+|\s+\/\/\s+|\bcoffee\s+chat\b|\bbrainstorm\b|\bstrategy\s+call\b)/i;

// Domains that always count as "internal" for the purposes of attendee
// classification. (`jastercreative.com` is treated as part of the same
// org as `jaba.ai`.)
var CAL_INTERNAL_DOMAINS = { 'jaba.ai': 1, 'jastercreative.com': 1 };

function syncCalendar(opts) {
  opts = opts || {};
  var startedAt = new Date().toISOString();
  var ownerEmail = resolveOwnerEmail_();
  var sourceCalendar = ownerEmail || resolveSourceInbox_(ownerEmail) || 'unknown';

  var meta = fbRead(STORE.calendarMeta) || {};
  var byCal = (meta && typeof meta.byCalendar === 'object' && meta.byCalendar) ? meta.byCalendar : {};
  var calMeta = byCal[sourceCalendar] || {};
  if (!opts.force && calMeta.lastSync) {
    var last = Date.parse(calMeta.lastSync);
    if (!isNaN(last) && (Date.now() - last) < MIN_CAL_RESYNC_INTERVAL_MS) {
      return {
        ok: true, skipped: true, reason: 'recent-sync',
        sourceCalendar: sourceCalendar, lastSync: calMeta.lastSync,
        result: calMeta.lastResult || null
      };
    }
  }

  var lookaheadDays = (typeof opts.lookaheadDays === 'number') ? opts.lookaheadDays : CAL_LOOKAHEAD_DAYS;
  if (lookaheadDays < 1 || lookaheadDays > 60) lookaheadDays = CAL_LOOKAHEAD_DAYS;
  var lookbackDays = (typeof opts.lookbackDays === 'number') ? opts.lookbackDays : CAL_LOOKBACK_DAYS;

  var rangeStart = new Date(Date.now() - lookbackDays * 86400000);
  var rangeEnd = new Date(Date.now() + lookaheadDays * 86400000);

  var contacts = [];
  try { contacts = fbRead(STORE.contacts) || []; } catch (_) { contacts = []; }
  var accounts = [];
  try { accounts = fbRead(STORE.accounts) || []; } catch (_) { accounts = []; }

  var existing = [];
  try {
    var raw = fbRead(STORE.calendarEvents);
    existing = Array.isArray(raw) ? raw : (raw ? Object.keys(raw).map(function (k) { return raw[k]; }) : []);
  } catch (_) { existing = []; }

  // Drop the slice owned by THIS sourceCalendar so we can re-emit it
  // freshly. Keep everything from other calendars untouched.
  var keptFromOthers = [];
  for (var ei = 0; ei < existing.length; ei++) {
    var ev = existing[ei];
    if (!ev) continue;
    if (String(ev.sourceCalendar || '') !== sourceCalendar) keptFromOthers.push(ev);
  }

  var counts = { fetched: 0, kept: 0, pitch: 0, internal: 0, skipped: 0 };
  var fresh = [];
  var seenComposite = {};

  try {
    var cal = CalendarApp.getDefaultCalendar();
    var events = cal.getEvents(rangeStart, rangeEnd);
    counts.fetched = events.length;

    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      var rec = buildCalendarEventRecord_(e, sourceCalendar, ownerEmail, contacts, accounts);
      if (!rec) { counts.skipped++; continue; }
      if (rec.isInternal) counts.internal++;
      if (rec.isPitch) counts.pitch++;

      var key = rec.eventId + '@' + sourceCalendar;
      if (seenComposite[key]) continue;
      seenComposite[key] = true;
      fresh.push(rec);
      counts.kept++;
    }
  } catch (err) {
    return {
      ok: false,
      sourceCalendar: sourceCalendar,
      startedAt: startedAt, finishedAt: new Date().toISOString(),
      error: String(err && err.message ? err.message : err)
    };
  }

  var combined = keptFromOthers.concat(fresh);
  var writeError = null;
  try {
    fbWrite(STORE.calendarEvents, combined);
  } catch (err) {
    writeError = String(err && err.message ? err.message : err);
  }

  var finishedAt = new Date().toISOString();
  var result = {
    ok: !writeError,
    skipped: false,
    sourceCalendar: sourceCalendar,
    startedAt: startedAt, finishedAt: finishedAt,
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    counts: counts,
    totalAfterMerge: combined.length,
    keptFromOthers: keptFromOthers.length,
    writeError: writeError
  };

  try {
    var freshMeta = fbRead(STORE.calendarMeta) || {};
    var freshByCal = (freshMeta && typeof freshMeta.byCalendar === 'object' && freshMeta.byCalendar) ? freshMeta.byCalendar : {};
    freshByCal[sourceCalendar] = { lastSync: finishedAt, lastResult: result, mailboxOwner: ownerEmail };
    fbWrite(STORE.calendarMeta, {
      lastSync: finishedAt,
      lastSourceCalendar: sourceCalendar,
      byCalendar: freshByCal
    });
  } catch (err) {
    result.metaWriteError = String(err && err.message ? err.message : err);
  }
  return result;
}

function buildCalendarEventRecord_(e, sourceCalendar, ownerEmail, contacts, accounts) {
  var title = '';
  try { title = e.getTitle() || ''; } catch (_) { title = ''; }
  var start, end;
  try { start = e.getStartTime(); } catch (_) { start = null; }
  try { end = e.getEndTime(); } catch (_) { end = null; }
  if (!start) return null;

  var location = '';
  try { location = e.getLocation() || ''; } catch (_) {}
  var description = '';
  try { description = e.getDescription() || ''; } catch (_) {}
  var eventId = '';
  try { eventId = e.getId() || ''; } catch (_) {}
  if (!eventId) return null;

  var isAllDay = false;
  try { isAllDay = !!e.isAllDayEvent(); } catch (_) {}

  var organizerEmail = '';
  try {
    var creators = e.getCreators ? e.getCreators() : [];
    if (creators && creators.length) organizerEmail = String(creators[0] || '').toLowerCase();
  } catch (_) {}

  var guestList = [];
  try { guestList = e.getGuestList(true) || []; } catch (_) { guestList = []; }
  var attendees = [];
  for (var i = 0; i < guestList.length; i++) {
    var g = guestList[i];
    var ge = '', gn = '', gs = '';
    try { ge = (g.getEmail() || '').toLowerCase(); } catch (_) {}
    try { gn = g.getName ? (g.getName() || '') : ''; } catch (_) {}
    try {
      var st = g.getGuestStatus && g.getGuestStatus();
      gs = st ? String(st) : '';
    } catch (_) {}
    if (!ge) continue;
    attendees.push({ email: ge, name: gn || '', status: gs });
  }

  // Meet link extraction — Apps Script doesn't expose conference data
  // directly through CalendarApp, so fall back to scanning description /
  // location for the canonical meet/zoom URL.
  var meetLink = '';
  var combined = (location + ' ' + description);
  var mMeet = combined.match(/https:\/\/meet\.google\.com\/[a-z0-9\-?=&]+/i);
  if (mMeet) meetLink = mMeet[0];
  if (!meetLink) {
    var mZoom = combined.match(/https:\/\/[a-z0-9.-]*zoom\.us\/[a-z0-9\/?=&\-_.]+/i);
    if (mZoom) meetLink = mZoom[0];
  }
  if (!meetLink) {
    var mTeams = combined.match(/https:\/\/teams\.microsoft\.com\/[a-z0-9\/?=&\-_.%]+/i);
    if (mTeams) meetLink = mTeams[0];
  }

  // Classify internal vs external. Owner counts as internal.
  var hasExternal = false;
  for (var ai = 0; ai < attendees.length; ai++) {
    var dom = emailDomain_(attendees[ai].email);
    if (!CAL_INTERNAL_DOMAINS[dom]) hasExternal = true;
  }

  var titleLower = String(title).toLowerCase();
  var isInternalSubject = CAL_INTERNAL_RE.test(titleLower);
  // Big bi-weekly / standup style holds without any external attendee:
  // treat as internal even if they slip past the regex.
  var isInternal = (!hasExternal) || isInternalSubject;

  var pitchSignal = CAL_PITCH_RE.test(title);
  // Even without a strong subject signal: if there are external
  // attendees and the title isn't internal-coded, lean toward pitch.
  var isPitch = false;
  if (pitchSignal && hasExternal) isPitch = true;
  else if (hasExternal && !isInternalSubject) isPitch = true;
  // Internal-titled events never count, even with externals.
  if (isInternalSubject && !pitchSignal) isPitch = false;

  // Try to infer linked person/account from contacts/accounts using
  // the first non-internal guest.
  var inferredAccount = '';
  var inferredPerson = '';
  for (var pi = 0; pi < attendees.length; pi++) {
    var em = attendees[pi].email;
    var dom2 = emailDomain_(em);
    if (CAL_INTERNAL_DOMAINS[dom2]) continue;
    if (em && em === (ownerEmail || '').toLowerCase()) continue;
    var ct = findContactByEmail_(contacts, em);
    if (ct) {
      inferredPerson = ct.name || em;
      inferredAccount = ct.accountName || inferredAccount;
    } else if (!inferredPerson) {
      inferredPerson = attendees[pi].name || em;
      var guess = guessAccountName_(em);
      if (guess) inferredAccount = guess;
    }
    if (inferredAccount) break;
  }

  return {
    eventId: eventId,
    compositeKey: eventId + '@' + sourceCalendar,
    title: title,
    start: start.toISOString(),
    end: end ? end.toISOString() : '',
    isAllDay: isAllDay,
    location: location || '',
    description: (description || '').slice(0, 1000),
    organizer: organizerEmail || '',
    attendees: attendees,
    meetLink: meetLink || '',
    sourceCalendar: sourceCalendar,
    sourceInbox: sourceCalendar,           // alias for UI parity with inbox-sync
    accountName: inferredAccount || '',
    inferredAccount: inferredAccount || '',
    person: inferredPerson || '',
    hasExternal: hasExternal,
    isInternal: !!isInternal,
    isPitch: !!isPitch,
    updatedAt: new Date().toISOString()
  };
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
