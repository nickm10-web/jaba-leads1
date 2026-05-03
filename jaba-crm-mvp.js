/* JABA Low-Cost CRM MVP module
 * Adds: Accounts, Contacts, Opportunities, Activities, Lead Intake,
 * Smartlead Replies, Meeting Notes, Daily Command Center sections,
 * manual capture forms, and automation rules.
 *
 * Persistence model:
 *   - Primary: Firebase Realtime Database under `mvp/<store>` (shared across users).
 *   - Fallback: in-memory store (__memStore) so the app still works in the
 *     Perplexity preview iframe / offline / when Firebase init failed.
 *   - The Perplexity deploy preview blocks localStorage / sessionStorage /
 *     IndexedDB, so this module MUST NOT call those APIs.
 *
 * On startup we load all 7 stores from Firebase, then seed the default
 * university clients only if every remote store is empty. We then attach
 * real-time listeners so concurrent users see each other's changes live.
 *
 * This module is additive: it does not modify the existing leads/tasks logic.
 */
(function () {
  'use strict';

  var MVP = window.jabaMvp || {};
  window.jabaMvp = MVP;

  // ---------- Storage ----------
  var STORE_KEYS = {
    accounts: 'mvp_accounts_v1',
    contacts: 'mvp_contacts_v1',
    opportunities: 'mvp_opps_v1',
    activities: 'mvp_activities_v1',
    leadIntake: 'mvp_lead_intake_v1',
    smartlead: 'mvp_smartlead_v1',
    mvpTasks: 'mvp_tasks_v1',
    seeded: 'mvp_seeded_v3'
  };

  // Logical store -> in-memory data array.
  // Order matters for save batching but not correctness.
  var DATA_STORE_NAMES = [
    'accounts', 'contacts', 'opportunities', 'activities',
    'leadIntake', 'smartlead', 'mvpTasks'
  ];

  // Persistence mode: 'pending' until init resolves, then 'firebase' or 'memory'.
  MVP.persistence = 'pending';

  function getDb() {
    var db = (typeof window !== 'undefined') ? window.db : null;
    if (db && typeof db.ref === 'function') return db;
    return null;
  }

  function setStatus(mode, detail) {
    MVP.persistence = mode;
    try {
      var label = document.getElementById('mvpPersistenceLabel');
      var dot = document.getElementById('mvpPersistenceDot');
      if (label) {
        if (mode === 'firebase') label.textContent = 'Live sync connected';
        else if (mode === 'memory') label.textContent = 'Local preview only';
        else label.textContent = 'Connecting…';
        if (detail) label.title = detail;
      }
      if (dot) {
        if (mode === 'firebase') dot.style.background = '#00b894';
        else if (mode === 'memory') dot.style.background = '#fdcb6e';
        else dot.style.background = '#999';
      }
    } catch (e) { /* DOM not ready yet — non-fatal */ }
  }

  // In-memory cache mirror so we can re-read without round-tripping Firebase.
  function memCacheGet(key) {
    try {
      var raw = __memStore.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function memCacheSet(key, value) {
    try { __memStore.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function saveStore(key, value) {
    memCacheSet(key, value);
    var db = getDb();
    if (!db) return;
    // Firebase RTDB silently DELETES paths when written with an empty array
    // (or null). That collides with the inbox-sync backend, which writes
    // these same paths from the server. To avoid wiping the backend's
    // freshly-written activities/tasks/contacts/leadIntake when the local
    // in-memory copy hasn't been hydrated yet, we never write an empty
    // array (or null/undefined) to Firebase from the SPA. Empty data is
    // still cached locally via memCacheSet above, so the UI stays
    // consistent in-session.
    if (value == null) return;
    if (Array.isArray(value) && value.length === 0) return;
    try {
      db.ref('mvp/' + key).set(value).catch(function (err) {
        console.warn('[mvp] Firebase save error for', key, err && err.message);
      });
    } catch (e) {
      console.warn('[mvp] Firebase save threw for', key, e && e.message);
    }
  }

  // Initial DATA: empty arrays. Real values get filled in by init() which
  // either reads from Firebase or seeds defaults (and then writes back).
  // For the in-memory fallback path, we hydrate from __memStore at startup.
  var DATA = {
    accounts: memCacheGet(STORE_KEYS.accounts) || [],
    contacts: memCacheGet(STORE_KEYS.contacts) || [],
    opportunities: memCacheGet(STORE_KEYS.opportunities) || [],
    activities: memCacheGet(STORE_KEYS.activities) || [],
    leadIntake: memCacheGet(STORE_KEYS.leadIntake) || [],
    smartlead: memCacheGet(STORE_KEYS.smartlead) || [],
    mvpTasks: memCacheGet(STORE_KEYS.mvpTasks) || []
  };

  MVP.data = DATA;

  function saveAll() {
    saveStore(STORE_KEYS.accounts, DATA.accounts);
    saveStore(STORE_KEYS.contacts, DATA.contacts);
    saveStore(STORE_KEYS.opportunities, DATA.opportunities);
    saveStore(STORE_KEYS.activities, DATA.activities);
    saveStore(STORE_KEYS.leadIntake, DATA.leadIntake);
    saveStore(STORE_KEYS.smartlead, DATA.smartlead);
    saveStore(STORE_KEYS.mvpTasks, DATA.mvpTasks);
  }
  MVP.saveAll = saveAll;

  function nextId(arr) {
    var max = 0;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && typeof arr[i].id === 'number' && arr[i].id > max) max = arr[i].id;
    }
    return max + 1;
  }

  function todayISO() {
    return new Date().toISOString().split('T')[0];
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function daysBetween(aISO, bISO) {
    var a = new Date(aISO + 'T00:00:00');
    var b = new Date(bISO + 'T00:00:00');
    return Math.floor((b - a) / (1000 * 60 * 60 * 24));
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  MVP.escapeHtml = escapeHtml;

  // ---------- Constants ----------
  var ACCOUNT_TYPES = ['Current Client', 'Prospect', 'Partner', 'Vendor', 'Other'];
  var ACCOUNT_BUCKETS = ['schools', 'teams', 'athlete', 'agencies', 'brands'];
  var BUCKET_LABELS = {
    schools: 'Schools',
    teams: 'Teams/Leagues',
    athlete: 'Athlete Agencies',
    agencies: 'Agencies of Record',
    brands: 'Brands'
  };
  var CONTACT_STATUSES = [
    'New', 'Contacted', 'Replied', 'Meeting Set', 'Active Opportunity',
    'Client Contact', 'Dormant', 'Do Not Contact'
  ];
  var OPP_STAGES = [
    'Target', 'Working', 'Discovery', 'Proposal', 'Contracting',
    'Active Client', 'Expansion', 'Lost', 'Dormant'
  ];
  var ACTIVITY_TYPES = [
    'Email sent', 'Email received', 'Smartlead email sent', 'Smartlead reply',
    'Slack lead', 'Text message', 'Meeting', 'Call', 'Manual note',
    'Task completed', 'Stage changed'
  ];
  var TASK_TYPES = [
    'Reply Required', 'Follow-up Due', 'Re-engage', 'Add Contact Details',
    'Review Slack Lead', 'Log Text Conversation', 'Meeting Prep',
    'Send Meeting Recap', 'Update Stage', 'Validate Email',
    'Current Client Touch'
  ];
  var SMARTLEAD_SENTIMENTS = ['Positive', 'Neutral', 'Objection', 'Not Interested', 'Unsubscribe', 'Bounce'];

  MVP.constants = {
    ACCOUNT_TYPES: ACCOUNT_TYPES,
    ACCOUNT_BUCKETS: ACCOUNT_BUCKETS,
    BUCKET_LABELS: BUCKET_LABELS,
    CONTACT_STATUSES: CONTACT_STATUSES,
    OPP_STAGES: OPP_STAGES,
    ACTIVITY_TYPES: ACTIVITY_TYPES,
    TASK_TYPES: TASK_TYPES,
    SMARTLEAD_SENTIMENTS: SMARTLEAD_SENTIMENTS
  };

  // ---------- Preload (current university clients + non-client guardrails) ----------
  var UNIVERSITY_CLIENTS = [
    'Notre Dame', 'Baylor', 'Cincinnati', 'Purdue', 'University of San Diego',
    'Robert Morris', 'Arizona State', 'Alabama', 'Ohio State', 'DePaul',
    'University of Washington', 'Cal Berkeley', 'Mizzou'
  ];
  // Common alias map so we don't double-create accounts when names already exist in the leads list
  var CLIENT_ALIASES = {
    'rmu': 'Robert Morris',
    'asu': 'Arizona State',
    'depaul': 'DePaul',
    'mizzou': 'Mizzou',
    'university of washington': 'University of Washington',
    'cal / berkeley': 'Cal Berkeley',
    'cal berkeley': 'Cal Berkeley',
    'university of san diego': 'University of San Diego',
    'usd': 'University of San Diego',
    'notre dame': 'Notre Dame',
    'baylor': 'Baylor',
    'cincinnati': 'Cincinnati',
    'purdue': 'Purdue',
    'alabama': 'Alabama',
    'ohio state': 'Ohio State',
    'robert morris': 'Robert Morris'
  };
  function canonicalClientName(name) {
    var key = String(name || '').trim().toLowerCase();
    return CLIENT_ALIASES[key] || name;
  }

  // 100X Sports and VMG Agency are explicitly NOT clients. Seed as prospects.
  var FORCED_PROSPECTS = [
    { name: '100X Sports', bucket: 'agencies' },
    { name: 'VMG Agency', bucket: 'agencies' }
  ];

  function findAccountByName(name) {
    var canonical = canonicalClientName(name);
    var lower = String(canonical).trim().toLowerCase();
    for (var i = 0; i < DATA.accounts.length; i++) {
      var a = DATA.accounts[i];
      if (a && String(a.name || '').trim().toLowerCase() === lower) return a;
    }
    return null;
  }

  function upsertAccount(partial) {
    var existing = findAccountByName(partial.name);
    if (existing) {
      Object.keys(partial).forEach(function (k) {
        if (partial[k] !== undefined && partial[k] !== null && partial[k] !== '') {
          existing[k] = partial[k];
        }
      });
      return existing;
    }
    var account = {
      id: nextId(DATA.accounts),
      name: canonicalClientName(partial.name),
      bucket: partial.bucket || 'schools',
      accountType: partial.accountType || 'Prospect',
      stage: partial.stage || 'Target',
      owner: partial.owner || 'Jordon',
      priority: partial.priority || 'medium',
      lastActivity: partial.lastActivity || todayISO(),
      nextStep: partial.nextStep || '',
      notes: partial.notes || '',
      createdDate: nowISO()
    };
    DATA.accounts.push(account);
    return account;
  }
  MVP.upsertAccount = upsertAccount;
  MVP.findAccountByName = findAccountByName;

  function allStoresEmpty() {
    for (var i = 0; i < DATA_STORE_NAMES.length; i++) {
      var n = DATA_STORE_NAMES[i];
      if (Array.isArray(DATA[n]) && DATA[n].length > 0) return false;
    }
    return true;
  }

  function seedIfNeeded() {
    // Seed only when remote (and local) stores are completely empty. Once any
    // user has populated data, future loads must NEVER overwrite it with seeds.
    if (!allStoresEmpty()) return;
    if (__memStore.getItem(STORE_KEYS.seeded) === 'true' && DATA.accounts.length > 0) return;

    UNIVERSITY_CLIENTS.forEach(function (name) {
      upsertAccount({
        name: name,
        bucket: 'schools',
        accountType: 'Current Client',
        stage: 'Active Client',
        owner: 'Jordon',
        priority: 'high',
        lastActivity: todayISO(),
        nextStep: 'Schedule next touch',
        notes: 'Preloaded current university client.'
      });
    });

    FORCED_PROSPECTS.forEach(function (p) {
      var a = findAccountByName(p.name);
      if (a) {
        a.accountType = 'Prospect';
        if (a.stage === 'Active Client') a.stage = 'Target';
        a.notes = (a.notes || '') + ' [System: NOT a current client — prospect/opportunity only.]';
      } else {
        upsertAccount({
          name: p.name,
          bucket: p.bucket,
          accountType: 'Prospect',
          stage: 'Target',
          owner: 'Jordon',
          priority: 'medium',
          lastActivity: todayISO(),
          nextStep: 'Qualify',
          notes: 'NOT a current client — prospect/opportunity only.'
        });
      }
    });

    // Force-correct: even on subsequent loads ensure 100X / VMG never become clients.
    DATA.accounts.forEach(function (a) {
      if (!a || !a.name) return;
      var lower = a.name.toLowerCase();
      if (lower.indexOf('100x') >= 0 || lower.indexOf('vmg') >= 0) {
        if (a.accountType === 'Current Client') {
          a.accountType = 'Prospect';
        }
        if (a.stage === 'Active Client') {
          a.stage = 'Target';
        }
      }
    });

    saveAll();
    __memStore.setItem(STORE_KEYS.seeded, 'true');
  }

  MVP.enforceProspectGuardrails = function () {
    var changed = false;
    DATA.accounts.forEach(function (a) {
      if (!a || !a.name) return;
      var lower = a.name.toLowerCase();
      if ((lower.indexOf('100x') >= 0 || lower.indexOf('vmg') >= 0) && a.accountType === 'Current Client') {
        a.accountType = 'Prospect';
        a.stage = 'Target';
        changed = true;
      }
    });
    if (changed) saveAll();
  };

  // ---------- Creators ----------
  MVP.createAccount = function (data) {
    var a = upsertAccount(data);
    saveAll();
    MVP.runRules();
    MVP.renderDashboardSections();
    return a;
  };

  MVP.createContact = function (data) {
    var c = {
      id: nextId(DATA.contacts),
      name: data.name || '',
      accountName: data.accountName || '',
      title: data.title || '',
      email: data.email || '',
      phone: data.phone || '',
      linkedin: data.linkedin || '',
      bucket: data.bucket || 'schools',
      status: data.status || 'New',
      owner: data.owner || 'Jordon',
      source: data.source || 'Manual',
      lastActivity: data.lastActivity || todayISO(),
      nextStep: data.nextStep || '',
      createdDate: nowISO()
    };
    DATA.contacts.push(c);
    if (c.accountName && !findAccountByName(c.accountName)) {
      upsertAccount({ name: c.accountName, bucket: c.bucket });
    }
    saveAll();
    MVP.runRules();
    MVP.renderDashboardSections();
    return c;
  };

  MVP.createOpportunity = function (data) {
    var o = {
      id: nextId(DATA.opportunities),
      name: data.name || '',
      accountName: data.accountName || '',
      primaryContact: data.primaryContact || '',
      bucket: data.bucket || 'schools',
      stage: data.stage || 'Target',
      estValue: data.estValue || '',
      closeTarget: data.closeTarget || '',
      owner: data.owner || 'Jordon',
      lastActivity: data.lastActivity || todayISO(),
      nextStep: data.nextStep || '',
      source: data.source || 'Manual',
      createdDate: nowISO()
    };
    DATA.opportunities.push(o);
    if (o.accountName && !findAccountByName(o.accountName)) {
      upsertAccount({ name: o.accountName, bucket: o.bucket });
    }
    saveAll();
    MVP.runRules();
    MVP.renderDashboardSections();
    return o;
  };

  MVP.createActivity = function (data) {
    var a = {
      id: nextId(DATA.activities),
      activityType: data.activityType || 'Manual note',
      person: data.person || '',
      accountName: data.accountName || '',
      opportunityName: data.opportunityName || '',
      source: data.source || 'Manual',
      timestamp: data.timestamp || nowISO(),
      summary: data.summary || '',
      owner: data.owner || 'Jordon',
      followUpRequired: !!data.followUpRequired
    };
    DATA.activities.push(a);
    // Touch related account/opp
    var acct = findAccountByName(a.accountName);
    if (acct) {
      acct.lastActivity = todayISO();
    }
    if (a.opportunityName) {
      DATA.opportunities.forEach(function (o) {
        if (o.name === a.opportunityName) o.lastActivity = todayISO();
      });
    }
    saveAll();
    if (a.followUpRequired) {
      MVP.createTask({
        title: 'Reply: ' + (a.summary || a.activityType),
        type: 'Reply Required',
        person: a.person,
        accountName: a.accountName,
        opportunityName: a.opportunityName,
        owner: a.owner,
        dueDate: todayISO(),
        priority: 'high',
        reason: 'Inbound activity flagged as needing response'
      });
    }
    MVP.runRules();
    MVP.renderDashboardSections();
    return a;
  };

  MVP.createTask = function (data) {
    // Avoid duplicates: same type + accountName + open status
    var dup = DATA.mvpTasks.find(function (t) {
      return t && t.status !== 'done' &&
        t.type === data.type &&
        (t.accountName || '') === (data.accountName || '') &&
        (t.title || '') === (data.title || '');
    });
    if (dup) return dup;

    var t = {
      id: nextId(DATA.mvpTasks),
      title: data.title || '',
      type: data.type || 'Follow-up Due',
      person: data.person || '',
      accountName: data.accountName || '',
      opportunityName: data.opportunityName || '',
      owner: data.owner || 'Jordon',
      dueDate: data.dueDate || todayISO(),
      priority: data.priority || 'medium',
      status: data.status || 'todo',
      reason: data.reason || '',
      createdDate: nowISO(),
      sourceId: data.sourceId || null,
      sourceKind: data.sourceKind || null
    };
    DATA.mvpTasks.push(t);
    saveAll();
    return t;
  };

  MVP.completeTask = function (id) {
    var t = DATA.mvpTasks.find(function (x) { return x && x.id === id; });
    if (!t) return;
    t.status = 'done';
    t.completedDate = nowISO();
    saveAll();
    MVP.renderDashboardSections();
  };

  MVP.createLeadIntake = function (data) {
    var li = {
      id: nextId(DATA.leadIntake),
      sentBy: data.sentBy || '',
      contactName: data.contactName || '',
      accountName: data.accountName || '',
      contactInfo: data.contactInfo || '',
      ask: data.ask || '',
      bucket: data.bucket || 'schools',
      priority: data.priority || 'medium',
      dueDate: data.dueDate || todayISO(),
      source: data.source || 'Slack',
      status: 'open',
      createdDate: nowISO()
    };
    DATA.leadIntake.push(li);
    saveAll();
    // Always create a task so it shows up on dashboard
    MVP.createTask({
      title: 'Review Slack/Text Lead: ' + (li.contactName || li.accountName || '(unknown)'),
      type: 'Review Slack Lead',
      person: li.contactName,
      accountName: li.accountName,
      dueDate: li.dueDate,
      priority: li.priority,
      reason: 'Manual lead intake from ' + li.source,
      sourceId: li.id,
      sourceKind: 'leadIntake'
    });
    MVP.runRules();
    MVP.renderDashboardSections();
    return li;
  };

  MVP.resolveLeadIntake = function (id, action) {
    var li = DATA.leadIntake.find(function (x) { return x && x.id === id; });
    if (!li) return;
    li.status = action === 'reject' ? 'rejected' : 'converted';
    li.resolvedDate = nowISO();
    // Close the related Review task
    DATA.mvpTasks.forEach(function (t) {
      if (t && t.sourceKind === 'leadIntake' && t.sourceId === id) {
        t.status = 'done';
        t.completedDate = nowISO();
      }
    });
    if (action === 'convert') {
      var acct = upsertAccount({
        name: li.accountName || (li.contactName + ' (account)'),
        bucket: li.bucket,
        accountType: 'Prospect',
        stage: 'Working'
      });
      if (li.contactName) {
        MVP.createContact({
          name: li.contactName,
          accountName: acct.name,
          bucket: li.bucket,
          status: 'New',
          source: li.source
        });
      }
      MVP.createActivity({
        activityType: li.source === 'Text' ? 'Text message' : 'Slack lead',
        person: li.contactName,
        accountName: acct.name,
        source: li.source,
        summary: 'Intake from ' + li.sentBy + ': ' + li.ask
      });
    }
    saveAll();
    MVP.renderDashboardSections();
  };

  MVP.createSmartleadReply = function (data) {
    var s = {
      id: nextId(DATA.smartlead),
      campaign: data.campaign || '',
      contactName: data.contactName || '',
      accountName: data.accountName || '',
      email: data.email || '',
      replyType: data.replyType || 'Inbound reply',
      sentiment: data.sentiment || 'Neutral',
      needsFollowUp: data.needsFollowUp !== false,
      owner: data.owner || 'Jordon',
      summary: data.summary || '',
      reviewed: false,
      createdDate: nowISO()
    };
    DATA.smartlead.push(s);
    saveAll();
    MVP.createActivity({
      activityType: 'Smartlead reply',
      person: s.contactName,
      accountName: s.accountName,
      source: 'Smartlead',
      summary: '[' + s.sentiment + '] ' + s.summary,
      followUpRequired: s.needsFollowUp && s.sentiment !== 'Unsubscribe' && s.sentiment !== 'Bounce'
    });
    MVP.runRules();
    MVP.renderDashboardSections();
    return s;
  };

  MVP.markSmartleadReviewed = function (id) {
    var s = DATA.smartlead.find(function (x) { return x && x.id === id; });
    if (!s) return;
    s.reviewed = true;
    saveAll();
    MVP.renderDashboardSections();
  };

  MVP.createMeetingNote = function (data) {
    MVP.createActivity({
      activityType: 'Meeting',
      person: data.person,
      accountName: data.accountName,
      opportunityName: data.opportunityName,
      summary: data.summary,
      followUpRequired: false
    });
    MVP.createTask({
      title: 'Send Meeting Recap: ' + (data.accountName || data.person || 'meeting'),
      type: 'Send Meeting Recap',
      person: data.person,
      accountName: data.accountName,
      opportunityName: data.opportunityName,
      dueDate: data.recapDate || todayISO(),
      priority: 'high',
      reason: 'Meeting completed — recap due same day'
    });
    if (data.nextStep) {
      var acct = findAccountByName(data.accountName);
      if (acct) acct.nextStep = data.nextStep;
      saveAll();
    }
    MVP.renderDashboardSections();
  };

  MVP.createFollowUp = function (data) {
    MVP.createTask({
      title: 'Follow-up: ' + (data.accountName || data.person || ''),
      type: 'Follow-up Due',
      person: data.person,
      accountName: data.accountName,
      opportunityName: data.opportunityName,
      dueDate: data.dueDate || todayISO(),
      priority: data.priority || 'medium',
      reason: data.reason || 'Manual follow-up'
    });
    MVP.renderDashboardSections();
  };

  // ---------- Automation Rules ----------
  MVP.runRules = function () {
    var today = todayISO();

    // Rule: stale opportunity — no activity in 7 days while not closed
    DATA.opportunities.forEach(function (o) {
      if (!o || !o.lastActivity) return;
      if (['Lost', 'Dormant', 'Active Client'].indexOf(o.stage) >= 0) return;
      var days = daysBetween(o.lastActivity, today);
      if (days >= 7) {
        MVP.createTask({
          title: 'Re-engage opportunity: ' + o.name,
          type: 'Re-engage',
          accountName: o.accountName,
          opportunityName: o.name,
          dueDate: today,
          priority: 'medium',
          reason: 'Opportunity stale ' + days + ' days'
        });
      }
    });

    // Rule: current client touch — no meaningful activity in 14 days
    DATA.accounts.forEach(function (a) {
      if (!a || a.accountType !== 'Current Client') return;
      var last = a.lastActivity || a.createdDate || today;
      var days = daysBetween(String(last).split('T')[0], today);
      if (days >= 14) {
        MVP.createTask({
          title: 'Current client touch: ' + a.name,
          type: 'Current Client Touch',
          accountName: a.name,
          dueDate: today,
          priority: 'high',
          reason: 'No activity logged in ' + days + ' days'
        });
      }
    });

    // Rule: no next step exception — surfaced at render time, no task created
    saveAll();
  };

  // ---------- Dashboard queries ----------
  function getRepliesRequired() {
    return DATA.mvpTasks.filter(function (t) {
      return t && t.status !== 'done' && t.type === 'Reply Required';
    });
  }
  function getFollowUpsDue() {
    var today = todayISO();
    return DATA.mvpTasks.filter(function (t) {
      return t && t.status !== 'done' && t.type === 'Follow-up Due' && t.dueDate <= today;
    });
  }
  function getNewLeadIntake() {
    return DATA.leadIntake.filter(function (l) { return l && l.status === 'open'; });
  }
  function getSmartleadToReview() {
    return DATA.smartlead.filter(function (s) { return s && !s.reviewed; });
  }
  function getMeetingsToday() {
    var today = todayISO();
    var meetings = window.meetings;
    if (!Array.isArray(meetings)) return [];
    return meetings.filter(function (m) { return m && m.date === today; });
  }
  function getRecapsDue() {
    return DATA.mvpTasks.filter(function (t) {
      return t && t.status !== 'done' && t.type === 'Send Meeting Recap';
    });
  }
  function getCurrentClientTouches() {
    return DATA.mvpTasks.filter(function (t) {
      return t && t.status !== 'done' && t.type === 'Current Client Touch';
    });
  }
  function getOverdueTasks() {
    var today = todayISO();
    return DATA.mvpTasks.filter(function (t) {
      return t && t.status !== 'done' && t.dueDate && t.dueDate < today;
    });
  }
  function getNoNextStepExceptions() {
    var out = [];
    DATA.accounts.forEach(function (a) {
      if (!a) return;
      if (a.accountType === 'Current Client' || a.accountType === 'Prospect') {
        if (!a.nextStep || !String(a.nextStep).trim()) {
          out.push({ kind: 'account', name: a.name, sub: a.accountType + ' · ' + (BUCKET_LABELS[a.bucket] || a.bucket), id: a.id });
        }
      }
    });
    DATA.opportunities.forEach(function (o) {
      if (!o) return;
      if (['Lost', 'Dormant'].indexOf(o.stage) >= 0) return;
      if (!o.nextStep || !String(o.nextStep).trim()) {
        out.push({ kind: 'opportunity', name: o.name, sub: o.stage + ' · ' + (o.accountName || ''), id: o.id });
      }
    });
    return out;
  }

  MVP.queries = {
    repliesRequired: getRepliesRequired,
    followUpsDue: getFollowUpsDue,
    newLeadIntake: getNewLeadIntake,
    smartleadToReview: getSmartleadToReview,
    meetingsToday: getMeetingsToday,
    recapsDue: getRecapsDue,
    currentClientTouches: getCurrentClientTouches,
    overdueTasks: getOverdueTasks,
    noNextStepExceptions: getNoNextStepExceptions
  };

  // ---------- Rendering ----------
  function renderItemList(items, mapper, emptyMsg) {
    if (!items.length) return '<div class="briefing-empty">' + emptyMsg + '</div>';
    return items.slice(0, 8).map(mapper).join('');
  }

  function badge(text, color) {
    return '<span class="cmd-badge" style="background:' + color + ';">' + escapeHtml(text) + '</span>';
  }

  function rowHtml(opts) {
    var person = opts.person ? escapeHtml(opts.person) : '';
    var account = opts.account ? escapeHtml(opts.account) : '';
    var bucket = opts.bucket ? escapeHtml(opts.bucket) : '';
    var taskType = opts.taskType ? escapeHtml(opts.taskType) : '';
    var reason = opts.reason ? escapeHtml(opts.reason) : '';
    var due = opts.due ? escapeHtml(opts.due) : '';
    var owner = opts.owner ? escapeHtml(opts.owner) : '';
    var lastAct = opts.lastActivity ? escapeHtml(opts.lastActivity) : '';
    var actionBtn = opts.action || '';
    var className = opts.overdue ? 'briefing-item overdue' : 'briefing-item';
    return '<div class="' + className + '">' +
      '<div class="briefing-item-main">' +
      '<div class="briefing-item-title">' + (person || account || taskType || '(item)') + (account && person ? ' · ' + account : '') + '</div>' +
      '<div class="briefing-item-sub">' +
      (bucket ? bucket + ' · ' : '') +
      (taskType ? taskType + ' · ' : '') +
      (reason ? reason : '') +
      (lastAct ? ' · last: ' + lastAct : '') +
      '</div>' +
      '</div>' +
      '<div class="briefing-item-meta">' +
      (owner ? owner + ' · ' : '') +
      (due ? 'due ' + due : '') +
      '</div>' +
      (actionBtn ? '<div class="briefing-item-action">' + actionBtn + '</div>' : '') +
      '</div>';
  }

  function setSection(elId, countId, html, count) {
    var el = document.getElementById(elId);
    if (el) el.innerHTML = html;
    var ce = document.getElementById(countId);
    if (ce) ce.textContent = count;
  }

  MVP.renderDashboardSections = function () {
    if (!document.getElementById('cmdReplyRequired')) return;
    MVP.runRules();

    var replies = getRepliesRequired();
    setSection('cmdReplyRequired', 'cmdReplyRequiredCount',
      renderItemList(replies, function (t) {
        return rowHtml({
          person: t.person, account: t.accountName,
          taskType: t.type, reason: t.reason,
          due: t.dueDate, owner: t.owner,
          overdue: t.dueDate < todayISO(),
          action: '<button class="btn btn-secondary btn-sm" onclick="jabaMvp.completeTask(' + t.id + ')">Done</button>'
        });
      }, 'No replies required.'),
      replies.length);

    var fups = getFollowUpsDue();
    setSection('cmdFollowUpDue', 'cmdFollowUpDueCount',
      renderItemList(fups, function (t) {
        return rowHtml({
          person: t.person, account: t.accountName,
          taskType: t.type, reason: t.reason,
          due: t.dueDate, owner: t.owner,
          overdue: t.dueDate < todayISO(),
          action: '<button class="btn btn-secondary btn-sm" onclick="jabaMvp.completeTask(' + t.id + ')">Done</button>'
        });
      }, 'No follow-ups due.'),
      fups.length);

    var intake = getNewLeadIntake();
    setSection('cmdLeadIntake', 'cmdLeadIntakeCount',
      renderItemList(intake, function (l) {
        return rowHtml({
          person: l.contactName, account: l.accountName,
          bucket: BUCKET_LABELS[l.bucket] || l.bucket,
          taskType: 'New Lead Intake (' + l.source + ')',
          reason: l.ask, due: l.dueDate,
          action:
            '<button class="btn btn-primary btn-sm" onclick="jabaMvp.resolveLeadIntake(' + l.id + ',\'convert\')">Convert</button>' +
            '<button class="btn btn-secondary btn-sm" onclick="jabaMvp.resolveLeadIntake(' + l.id + ',\'reject\')">Reject</button>'
        });
      }, 'No new lead intake.'),
      intake.length);

    var sl = getSmartleadToReview();
    setSection('cmdSmartlead', 'cmdSmartleadCount',
      renderItemList(sl, function (s) {
        return rowHtml({
          person: s.contactName, account: s.accountName,
          taskType: 'Smartlead [' + s.sentiment + ']',
          reason: s.summary || s.replyType,
          due: '', owner: s.owner,
          action: '<button class="btn btn-secondary btn-sm" onclick="jabaMvp.markSmartleadReviewed(' + s.id + ')">Reviewed</button>'
        });
      }, 'No Smartlead replies awaiting review.'),
      sl.length);

    var meetings = getMeetingsToday();
    setSection('cmdMeetingsToday', 'cmdMeetingsTodayCount',
      renderItemList(meetings, function (m) {
        return rowHtml({
          person: (m.attendees || []).join(', '), account: m.company,
          taskType: 'Meeting',
          reason: (m.time || '') + (m.title ? ' · ' + m.title : ''),
          due: m.date
        });
      }, 'No meetings today.'),
      meetings.length);

    var recaps = getRecapsDue();
    setSection('cmdRecapsDue', 'cmdRecapsDueCount',
      renderItemList(recaps, function (t) {
        return rowHtml({
          account: t.accountName, taskType: t.type,
          reason: t.reason, due: t.dueDate,
          overdue: t.dueDate < todayISO(),
          action: '<button class="btn btn-secondary btn-sm" onclick="jabaMvp.completeTask(' + t.id + ')">Done</button>'
        });
      }, 'No recaps pending.'),
      recaps.length);

    var ccTouch = getCurrentClientTouches();
    setSection('cmdClientTouches', 'cmdClientTouchesCount',
      renderItemList(ccTouch, function (t) {
        return rowHtml({
          account: t.accountName, taskType: t.type,
          reason: t.reason, due: t.dueDate,
          overdue: t.dueDate < todayISO(),
          action: '<button class="btn btn-secondary btn-sm" onclick="jabaMvp.completeTask(' + t.id + ')">Logged</button>'
        });
      }, 'All current clients touched recently.'),
      ccTouch.length);

    var overdue = getOverdueTasks();
    setSection('cmdOverdueTasks', 'cmdOverdueTasksCount',
      renderItemList(overdue, function (t) {
        return rowHtml({
          person: t.person, account: t.accountName,
          taskType: t.type, reason: t.reason,
          due: t.dueDate, overdue: true,
          action: '<button class="btn btn-secondary btn-sm" onclick="jabaMvp.completeTask(' + t.id + ')">Done</button>'
        });
      }, 'No overdue tasks.'),
      overdue.length);

    var nns = getNoNextStepExceptions();
    setSection('cmdNoNextStep', 'cmdNoNextStepCount',
      renderItemList(nns, function (x) {
        return rowHtml({
          account: x.name, taskType: x.kind,
          reason: x.sub, due: ''
        });
      }, 'Every active record has a next step. Nice.'),
      nns.length);
  };

  // ---------- Forms ----------
  function html(strs) {
    var s = ''; for (var i = 0; i < arguments.length; i++) s += arguments[i]; return s;
  }

  function modalShell(title, bodyHtml) {
    return '<div class="mvp-modal-backdrop" onclick="jabaMvp.closeModal(event)">' +
      '<div class="mvp-modal" onclick="event.stopPropagation()">' +
      '<div class="mvp-modal-header"><h3>' + escapeHtml(title) + '</h3>' +
      '<button class="btn btn-secondary btn-sm" onclick="jabaMvp.closeModal()">Close</button></div>' +
      '<div class="mvp-modal-body">' + bodyHtml + '</div></div></div>';
  }

  MVP.closeModal = function (e) {
    if (e && e.target && !e.target.classList.contains('mvp-modal-backdrop')) return;
    var c = document.getElementById('mvpModalContainer');
    if (c) c.innerHTML = '';
  };

  function showModal(title, body) {
    var c = document.getElementById('mvpModalContainer');
    if (!c) {
      c = document.createElement('div');
      c.id = 'mvpModalContainer';
      document.body.appendChild(c);
    }
    c.innerHTML = modalShell(title, body);
  }

  function inp(label, id, type, value) {
    return '<label class="mvp-field"><span>' + escapeHtml(label) + '</span>' +
      '<input id="' + id + '" type="' + (type || 'text') + '" value="' + escapeHtml(value || '') + '"/></label>';
  }
  function sel(label, id, options, value) {
    var opts = options.map(function (o) {
      return '<option value="' + escapeHtml(o) + '"' + (o === value ? ' selected' : '') + '>' + escapeHtml(o) + '</option>';
    }).join('');
    return '<label class="mvp-field"><span>' + escapeHtml(label) + '</span><select id="' + id + '">' + opts + '</select></label>';
  }
  function txt(label, id, value, placeholder) {
    return '<label class="mvp-field"><span>' + escapeHtml(label) + '</span><textarea id="' + id + '" placeholder="' + escapeHtml(placeholder || '') + '" rows="3">' + escapeHtml(value || '') + '</textarea></label>';
  }

  MVP.openSlackLeadForm = function () {
    var body =
      '<div class="mvp-form">' +
      inp('Who sent this lead?', 'sl_sentBy') +
      inp('Contact name', 'sl_contact') +
      inp('Company / account', 'sl_account') +
      inp('Email / phone / LinkedIn', 'sl_info') +
      txt('What did they say to do?', 'sl_ask') +
      sel('Bucket', 'sl_bucket', ACCOUNT_BUCKETS, 'schools') +
      sel('Priority', 'sl_priority', ['high', 'medium', 'low'], 'medium') +
      inp('Due date', 'sl_due', 'date', todayISO()) +
      sel('Source', 'sl_source', ['Slack', 'Text', 'Other'], 'Slack') +
      '<button class="btn btn-primary" onclick="jabaMvp.submitSlackLead()">Save Lead Intake</button>' +
      '</div>';
    showModal('Add Slack/Text Lead', body);
  };
  MVP.submitSlackLead = function () {
    MVP.createLeadIntake({
      sentBy: document.getElementById('sl_sentBy').value,
      contactName: document.getElementById('sl_contact').value,
      accountName: document.getElementById('sl_account').value,
      contactInfo: document.getElementById('sl_info').value,
      ask: document.getElementById('sl_ask').value,
      bucket: document.getElementById('sl_bucket').value,
      priority: document.getElementById('sl_priority').value,
      dueDate: document.getElementById('sl_due').value,
      source: document.getElementById('sl_source').value
    });
    MVP.closeModal();
  };

  MVP.openTextNoteForm = function () {
    var body =
      '<div class="mvp-form">' +
      inp('Contact', 'tx_contact') +
      inp('Account', 'tx_account') +
      inp('Phone number', 'tx_phone') +
      txt('Message summary / pasted text', 'tx_msg') +
      '<label class="mvp-field"><span>Requires response?</span><select id="tx_resp"><option value="yes">Yes</option><option value="no">No</option></select></label>' +
      inp('Due date', 'tx_due', 'date', todayISO()) +
      '<button class="btn btn-primary" onclick="jabaMvp.submitTextNote()">Save Text Note</button>' +
      '</div>';
    showModal('Add Text Note', body);
  };
  MVP.submitTextNote = function () {
    var resp = document.getElementById('tx_resp').value === 'yes';
    MVP.createActivity({
      activityType: 'Text message',
      person: document.getElementById('tx_contact').value,
      accountName: document.getElementById('tx_account').value,
      source: 'Text',
      summary: document.getElementById('tx_msg').value + ' [phone: ' + document.getElementById('tx_phone').value + ']',
      followUpRequired: resp
    });
    if (resp) {
      MVP.createTask({
        title: 'Reply text: ' + (document.getElementById('tx_contact').value || ''),
        type: 'Reply Required',
        accountName: document.getElementById('tx_account').value,
        person: document.getElementById('tx_contact').value,
        dueDate: document.getElementById('tx_due').value,
        priority: 'high',
        reason: 'Text message requires a response'
      });
    }
    MVP.closeModal();
  };

  MVP.openSmartleadForm = function () {
    var body =
      '<div class="mvp-form">' +
      inp('Campaign', 'sm_campaign') +
      inp('Contact name', 'sm_contact') +
      inp('Account', 'sm_account') +
      inp('Email', 'sm_email', 'email') +
      inp('Reply type', 'sm_replyType', 'text', 'Inbound reply') +
      sel('Sentiment', 'sm_sentiment', SMARTLEAD_SENTIMENTS, 'Neutral') +
      '<label class="mvp-field"><span>Needs follow-up</span><select id="sm_followup"><option value="yes">Yes</option><option value="no">No</option></select></label>' +
      txt('Summary', 'sm_summary') +
      '<button class="btn btn-primary" onclick="jabaMvp.submitSmartlead()">Save Smartlead Reply</button>' +
      '</div>';
    showModal('Add Smartlead Reply', body);
  };
  MVP.submitSmartlead = function () {
    MVP.createSmartleadReply({
      campaign: document.getElementById('sm_campaign').value,
      contactName: document.getElementById('sm_contact').value,
      accountName: document.getElementById('sm_account').value,
      email: document.getElementById('sm_email').value,
      replyType: document.getElementById('sm_replyType').value,
      sentiment: document.getElementById('sm_sentiment').value,
      needsFollowUp: document.getElementById('sm_followup').value === 'yes',
      summary: document.getElementById('sm_summary').value
    });
    MVP.closeModal();
  };

  MVP.openFollowUpForm = function () {
    var body =
      '<div class="mvp-form">' +
      inp('Person', 'fu_person') +
      inp('Account', 'fu_account') +
      inp('Opportunity', 'fu_opp') +
      inp('Due date', 'fu_due', 'date', todayISO()) +
      sel('Priority', 'fu_priority', ['high', 'medium', 'low'], 'medium') +
      txt('Reason', 'fu_reason') +
      '<button class="btn btn-primary" onclick="jabaMvp.submitFollowUp()">Save Follow-up</button>' +
      '</div>';
    showModal('Add Follow-up', body);
  };
  MVP.submitFollowUp = function () {
    MVP.createFollowUp({
      person: document.getElementById('fu_person').value,
      accountName: document.getElementById('fu_account').value,
      opportunityName: document.getElementById('fu_opp').value,
      dueDate: document.getElementById('fu_due').value,
      priority: document.getElementById('fu_priority').value,
      reason: document.getElementById('fu_reason').value
    });
    MVP.closeModal();
  };

  MVP.openMeetingNoteForm = function () {
    var body =
      '<div class="mvp-form">' +
      inp('Person(s)', 'mn_person') +
      inp('Account', 'mn_account') +
      inp('Opportunity', 'mn_opp') +
      txt('Meeting summary', 'mn_summary') +
      inp('Recap due date', 'mn_recap', 'date', todayISO()) +
      inp('Next step', 'mn_next') +
      '<button class="btn btn-primary" onclick="jabaMvp.submitMeetingNote()">Save Meeting Note</button>' +
      '</div>';
    showModal('Add Meeting Note', body);
  };
  MVP.submitMeetingNote = function () {
    MVP.createMeetingNote({
      person: document.getElementById('mn_person').value,
      accountName: document.getElementById('mn_account').value,
      opportunityName: document.getElementById('mn_opp').value,
      summary: document.getElementById('mn_summary').value,
      recapDate: document.getElementById('mn_recap').value,
      nextStep: document.getElementById('mn_next').value
    });
    MVP.closeModal();
  };

  MVP.openAddOpportunityForm = function () {
    var accountOptions = [''].concat(DATA.accounts.map(function (a) { return a.name; }));
    var body =
      '<div class="mvp-form">' +
      inp('Opportunity name', 'op_name') +
      sel('Account', 'op_account', accountOptions, '') +
      inp('Primary contact', 'op_contact') +
      sel('Bucket', 'op_bucket', ACCOUNT_BUCKETS, 'schools') +
      sel('Stage', 'op_stage', OPP_STAGES, 'Target') +
      inp('Estimated value', 'op_value') +
      inp('Close target', 'op_close', 'date', '') +
      inp('Next step', 'op_next') +
      inp('Source', 'op_source') +
      '<button class="btn btn-primary" onclick="jabaMvp.submitOpportunity()">Save Opportunity</button>' +
      '</div>';
    showModal('Add Opportunity', body);
  };
  MVP.submitOpportunity = function () {
    MVP.createOpportunity({
      name: document.getElementById('op_name').value,
      accountName: document.getElementById('op_account').value,
      primaryContact: document.getElementById('op_contact').value,
      bucket: document.getElementById('op_bucket').value,
      stage: document.getElementById('op_stage').value,
      estValue: document.getElementById('op_value').value,
      closeTarget: document.getElementById('op_close').value,
      nextStep: document.getElementById('op_next').value,
      source: document.getElementById('op_source').value
    });
    MVP.closeModal();
  };

  MVP.openAddAccountForm = function () {
    var body =
      '<div class="mvp-form">' +
      inp('Account name', 'ac_name') +
      sel('Bucket', 'ac_bucket', ACCOUNT_BUCKETS, 'schools') +
      sel('Account type', 'ac_type', ACCOUNT_TYPES, 'Prospect') +
      sel('Stage', 'ac_stage', OPP_STAGES, 'Target') +
      inp('Owner', 'ac_owner', 'text', 'Jordon') +
      sel('Priority', 'ac_priority', ['high', 'medium', 'low'], 'medium') +
      inp('Next step', 'ac_next') +
      txt('Notes', 'ac_notes') +
      '<button class="btn btn-primary" onclick="jabaMvp.submitAccount()">Save Account</button>' +
      '</div>';
    showModal('Add Account', body);
  };
  MVP.submitAccount = function () {
    MVP.createAccount({
      name: document.getElementById('ac_name').value,
      bucket: document.getElementById('ac_bucket').value,
      accountType: document.getElementById('ac_type').value,
      stage: document.getElementById('ac_stage').value,
      owner: document.getElementById('ac_owner').value,
      priority: document.getElementById('ac_priority').value,
      nextStep: document.getElementById('ac_next').value,
      notes: document.getElementById('ac_notes').value
    });
    MVP.closeModal();
  };

  MVP.openAddContactForm = function () {
    var accountOptions = [''].concat(DATA.accounts.map(function (a) { return a.name; }));
    var body =
      '<div class="mvp-form">' +
      inp('Name', 'co_name') +
      sel('Account', 'co_account', accountOptions, '') +
      inp('Title / role', 'co_title') +
      inp('Email', 'co_email', 'email') +
      inp('Phone', 'co_phone') +
      inp('LinkedIn', 'co_linkedin') +
      sel('Bucket', 'co_bucket', ACCOUNT_BUCKETS, 'schools') +
      sel('Status', 'co_status', CONTACT_STATUSES, 'New') +
      inp('Source', 'co_source') +
      inp('Next step', 'co_next') +
      '<button class="btn btn-primary" onclick="jabaMvp.submitContact()">Save Contact</button>' +
      '</div>';
    showModal('Add Contact', body);
  };
  MVP.submitContact = function () {
    MVP.createContact({
      name: document.getElementById('co_name').value,
      accountName: document.getElementById('co_account').value,
      title: document.getElementById('co_title').value,
      email: document.getElementById('co_email').value,
      phone: document.getElementById('co_phone').value,
      linkedin: document.getElementById('co_linkedin').value,
      bucket: document.getElementById('co_bucket').value,
      status: document.getElementById('co_status').value,
      source: document.getElementById('co_source').value,
      nextStep: document.getElementById('co_next').value
    });
    MVP.closeModal();
  };

  // ---------- CRM tab (browse all accounts/opps/contacts) ----------
  MVP.renderCrmSection = function () {
    var el = document.getElementById('crmMvpSection');
    if (!el) return;
    var clientList = DATA.accounts
      .filter(function (a) { return a.accountType === 'Current Client'; })
      .map(function (a) { return a.name; }).sort();
    var prospectList = DATA.accounts
      .filter(function (a) { return a.accountType === 'Prospect'; })
      .map(function (a) { return a.name; }).sort();
    var oppList = DATA.opportunities.map(function (o) {
      return '<tr><td>' + escapeHtml(o.name) + '</td><td>' + escapeHtml(o.accountName) + '</td><td>' + escapeHtml(o.stage) + '</td><td>' + escapeHtml(o.lastActivity) + '</td><td>' + escapeHtml(o.nextStep || '—') + '</td></tr>';
    }).join('');
    var contactList = DATA.contacts.map(function (c) {
      return '<tr><td>' + escapeHtml(c.name) + '</td><td>' + escapeHtml(c.accountName) + '</td><td>' + escapeHtml(c.email) + '</td><td>' + escapeHtml(c.status) + '</td></tr>';
    }).join('');

    el.innerHTML =
      '<h2 style="margin-bottom:12px;">CRM</h2>' +
      '<div class="cmd-grid">' +
        '<div class="briefing-card">' +
          '<div class="briefing-card-header"><h3>Current Clients</h3><span class="briefing-count">' + clientList.length + '</span></div>' +
          '<div class="briefing-list">' + (clientList.length ? clientList.map(function (n) { return '<div class="briefing-item"><div class="briefing-item-main"><div class="briefing-item-title">' + escapeHtml(n) + '</div></div></div>'; }).join('') : '<div class="briefing-empty">None</div>') + '</div>' +
        '</div>' +
        '<div class="briefing-card">' +
          '<div class="briefing-card-header"><h3>Prospects</h3><span class="briefing-count">' + prospectList.length + '</span></div>' +
          '<div class="briefing-list">' + (prospectList.length ? prospectList.map(function (n) { return '<div class="briefing-item"><div class="briefing-item-main"><div class="briefing-item-title">' + escapeHtml(n) + '</div></div></div>'; }).join('') : '<div class="briefing-empty">None</div>') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="briefing-card" style="margin-top:16px;">' +
        '<div class="briefing-card-header"><h3>Opportunities</h3><span class="briefing-count">' + DATA.opportunities.length + '</span></div>' +
        (oppList ? '<table class="mvp-table"><thead><tr><th>Name</th><th>Account</th><th>Stage</th><th>Last Activity</th><th>Next Step</th></tr></thead><tbody>' + oppList + '</tbody></table>' : '<div class="briefing-empty">No opportunities yet.</div>') +
      '</div>' +
      '<div class="briefing-card" style="margin-top:16px;">' +
        '<div class="briefing-card-header"><h3>Contacts</h3><span class="briefing-count">' + DATA.contacts.length + '</span></div>' +
        (contactList ? '<table class="mvp-table"><thead><tr><th>Name</th><th>Account</th><th>Email</th><th>Status</th></tr></thead><tbody>' + contactList + '</tbody></table>' : '<div class="briefing-empty">No contacts yet.</div>') +
      '</div>';
  };

  // ---------- Init ----------
  function applyRemoteSnapshot(name, value) {
    if (Array.isArray(value)) {
      DATA[name] = value;
    } else if (value && typeof value === 'object') {
      // Firebase RTDB sometimes returns sparse arrays as objects keyed by index.
      // Convert back to a dense array, dropping any holes.
      var out = [];
      Object.keys(value).forEach(function (k) {
        var v = value[k];
        if (v != null) out.push(v);
      });
      DATA[name] = out;
    } else {
      DATA[name] = [];
    }
    memCacheSet(STORE_KEYS[name], DATA[name]);
  }

  function loadAllFromFirebase(db) {
    var promises = DATA_STORE_NAMES.map(function (name) {
      return db.ref('mvp/' + STORE_KEYS[name]).once('value')
        .then(function (snap) {
          applyRemoteSnapshot(name, snap.val());
        })
        .catch(function (err) {
          console.warn('[mvp] Firebase load error for', name, err && err.message);
        });
    });
    return Promise.all(promises);
  }

  function attachRealtimeListeners(db) {
    DATA_STORE_NAMES.forEach(function (name) {
      try {
        db.ref('mvp/' + STORE_KEYS[name]).on('value', function (snap) {
          applyRemoteSnapshot(name, snap.val());
          // Re-render dashboard / CRM tab if they exist; cheap because the
          // queries are recomputed on demand.
          if (MVP.renderDashboardSections) MVP.renderDashboardSections();
          if (MVP.renderCrmSection) MVP.renderCrmSection();
        });
      } catch (e) {
        console.warn('[mvp] failed to attach listener for', name, e && e.message);
      }
    });
  }

  MVP.init = function () {
    var db = getDb();
    if (!db) {
      // No Firebase — operate in pure in-memory mode using whatever was
      // restored from __memStore, then seed defaults if nothing's there.
      setStatus('memory', 'Firebase unavailable; data is not shared between sessions.');
      seedIfNeeded();
      MVP.enforceProspectGuardrails();
      MVP.runRules();
      MVP.renderDashboardSections();
      MVP.renderCrmSection();
      return;
    }

    setStatus('pending');
    loadAllFromFirebase(db).then(function () {
      var seededFlag = false;
      if (allStoresEmpty()) {
        seedIfNeeded();
        seededFlag = true;
      }
      MVP.enforceProspectGuardrails();
      MVP.runRules();
      // If we seeded or the guardrails mutated anything, push to Firebase now.
      if (seededFlag) saveAll();
      setStatus('firebase', 'Connected to Firebase Realtime Database.');
      MVP.renderDashboardSections();
      MVP.renderCrmSection();
      attachRealtimeListeners(db);
    }).catch(function (err) {
      console.warn('[mvp] init load failed, falling back to memory', err && err.message);
      setStatus('memory', 'Could not reach Firebase; running in local preview mode.');
      seedIfNeeded();
      MVP.enforceProspectGuardrails();
      MVP.runRules();
      MVP.renderDashboardSections();
      MVP.renderCrmSection();
    });
  };

  // Expose helpers for tests / external callers
  MVP._internals = {
    STORE_KEYS: STORE_KEYS,
    DATA_STORE_NAMES: DATA_STORE_NAMES,
    saveStore: saveStore,
    loadAllFromFirebase: loadAllFromFirebase,
    applyRemoteSnapshot: applyRemoteSnapshot,
    allStoresEmpty: allStoresEmpty,
    seedIfNeeded: seedIfNeeded,
    setStatus: setStatus
  };

  // Run once DOM is ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        // Defer slightly so existing scripts (Firebase init in index.html) run first
        setTimeout(MVP.init, 250);
      });
    } else {
      setTimeout(MVP.init, 250);
    }
  }
})();
