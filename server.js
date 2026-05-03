/* JABA static-app server with /api/sync-inbox.
 *
 * Serves the static SPA (same files serve.py serves, with the same CSP
 * headers) and exposes:
 *   POST /api/sync-inbox   — pull recent Gmail and write CRM updates
 *   GET  /api/sync-inbox/status — last sync metadata
 *
 * Runtime config (env):
 *   PORT                 default 8080
 *   FIREBASE_DB_URL      e.g. https://jaba-leads-default-rtdb.firebaseio.com
 *   FIREBASE_API_KEY     used for the unauthenticated REST writes (RTDB
 *                        rules govern access; same key the SPA uses)
 *   GOOGLE_APPLICATION_CREDENTIALS  service-account JSON path (preferred)
 *
 *   EXTERNAL_TOOL_CMD    command/binary for the external tool runner.
 *                        Defaults to `external-tool call`. We invoke it as:
 *                          $EXTERNAL_TOOL_CMD '<json-payload>'
 *                        where the JSON payload is:
 *                          { "source_id": "gcal", "tool_name": "<name>",
 *                            "arguments": {...} }
 *                        and expect the tool's JSON output on stdout.
 *   STUB_EXTERNAL_TOOL_PATH  if set, read JSON from this file instead of
 *                        invoking the CLI (used for tests + offline dev).
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { spawn } = require('child_process');

const inboxSync = require('./inbox-sync');

const PORT = parseInt(process.env.PORT || '8080', 10);
const ROOT = __dirname;

// ---------- static file serving ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.google.com https://*.googleapis.com https://*.gstatic.com https://accounts.google.com",
    "script-src-elem 'self' 'unsafe-inline' https://*.google.com https://*.googleapis.com https://*.gstatic.com https://accounts.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.gstatic.com",
    "font-src 'self' data: https://fonts.gstatic.com https://*.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://*.gstatic.com https://*.google.com wss://*.firebaseio.com",
    "frame-src https://accounts.google.com https://*.firebaseapp.com"
  ].join('; ')
};

function applySecurityHeaders(res) {
  Object.keys(SECURITY_HEADERS).forEach(function (k) {
    res.setHeader(k, SECURITY_HEADERS[k]);
  });
}

function sendJson(res, status, body) {
  applySecurityHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (filePath.indexOf(ROOT) !== 0) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }
  fs.stat(filePath, function (err, stat) {
    if (err || !stat.isFile()) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    applySecurityHeaders(res);
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  });
}

// ---------- external-tool adapter ----------
function callExternalTool(toolName, args) {
  // STUB path — read response from a JSON file.
  if (process.env.STUB_EXTERNAL_TOOL_PATH) {
    return new Promise(function (resolve, reject) {
      fs.readFile(process.env.STUB_EXTERNAL_TOOL_PATH, 'utf8', function (err, data) {
        if (err) return reject(err);
        try {
          const parsed = JSON.parse(data);
          // The sample file has shape { tool, result: { email_results: ... } }.
          // Return the inner `result` so the sync logic sees email_results.
          if (parsed && parsed.result && parsed.result.email_results) {
            resolve(parsed.result);
          } else {
            resolve(parsed);
          }
        } catch (e) { reject(e); }
      });
    });
  }

  // Live path — spawn the external-tool CLI with the JSON payload as argv.
  // CLI usage: external-tool call '{"source_id":"...","tool_name":"...","arguments":{...}}'
  const cmd = process.env.EXTERNAL_TOOL_CMD || 'external-tool call';
  const parts = cmd.split(/\s+/).filter(Boolean);
  const payload = JSON.stringify({
    source_id: 'gcal',
    tool_name: toolName,
    arguments: args || {}
  });

  return new Promise(function (resolve, reject) {
    const proc = spawn(parts[0], parts.slice(1).concat([payload]), {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    let errOut = '';
    proc.stdout.on('data', function (d) { out += d.toString(); });
    proc.stderr.on('data', function (d) { errOut += d.toString(); });
    proc.on('error', reject);
    proc.on('close', function (code) {
      if (code !== 0) {
        return reject(new Error('external-tool exited ' + code + ': ' + errOut));
      }
      try {
        const parsed = JSON.parse(out);
        if (parsed && parsed.result && parsed.result.email_results) resolve(parsed.result);
        else if (parsed && parsed.result) resolve(parsed.result);
        else resolve(parsed);
      } catch (e) { reject(new Error('external-tool returned non-JSON: ' + e.message)); }
    });
  });
}

// ---------- Firebase REST adapter ----------
// We use the public Firebase RTDB REST API with the same web API key the
// SPA uses. RTDB security rules are the source of truth for who can
// write — this server inherits whatever access the SPA has.
function buildFirebaseClient() {
  const dbUrl = process.env.FIREBASE_DB_URL || 'https://jaba-leads-default-rtdb.firebaseio.com';
  const apiKey = process.env.FIREBASE_API_KEY || ''; // optional

  function urlFor(refPath) {
    const u = new URL(dbUrl.replace(/\/$/, '') + '/' + refPath + '.json');
    if (apiKey) u.searchParams.set('auth', apiKey);
    return u.toString();
  }

  function read(refPath) {
    return fetchJson(urlFor(refPath), { method: 'GET' });
  }
  function write(refPath, value) {
    return fetchJson(urlFor(refPath), {
      method: 'PUT',
      body: JSON.stringify(value),
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return { read: read, write: write };
}

function fetchJson(url, opts) {
  // Node 18+ has global fetch.
  if (typeof fetch === 'function') {
    return fetch(url, opts).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          throw new Error('firebase ' + r.status + ': ' + t.slice(0, 200));
        });
      }
      return r.text().then(function (t) { return t ? JSON.parse(t) : null; });
    });
  }
  return Promise.reject(new Error('global fetch not available — Node 18+ required'));
}

// In-memory store adapter (used when STUB_FIREBASE=1, e.g. for tests)
function buildMemStore(initial) {
  const store = Object.assign({}, initial || {});
  return {
    read: function (k) { return Promise.resolve(store[k] != null ? JSON.parse(JSON.stringify(store[k])) : null); },
    write: function (k, v) { store[k] = JSON.parse(JSON.stringify(v)); return Promise.resolve(); },
    _dump: function () { return store; }
  };
}

let _stubMem = null;
function buildSyncDeps() {
  if (process.env.STUB_FIREBASE === '1') {
    if (!_stubMem) _stubMem = buildMemStore(global.__STUB_FIREBASE_INITIAL || {});
    global.__STUB_FIREBASE_DUMP = _stubMem._dump;
    return {
      callTool: callExternalTool,
      readStore: _stubMem.read,
      writeStore: _stubMem.write
    };
  }
  const fb = buildFirebaseClient();
  return {
    callTool: callExternalTool,
    readStore: fb.read,
    writeStore: fb.write
  };
}

// ---------- request handlers ----------
function readBody(req) {
  return new Promise(function (resolve, reject) {
    let body = '';
    req.on('data', function (chunk) {
      body += chunk;
      if (body.length > 1024 * 64) reject(new Error('body too large'));
    });
    req.on('end', function () { resolve(body); });
    req.on('error', reject);
  });
}

async function handleSyncInbox(req, res) {
  let opts = {};
  if (req.method === 'POST') {
    try {
      const body = await readBody(req);
      if (body && body.trim()) opts = JSON.parse(body);
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: 'bad-json' });
    }
  } else if (req.method === 'GET') {
    const qs = new URL(req.url, 'http://localhost').searchParams;
    if (qs.get('lookbackDays')) opts.lookbackDays = parseInt(qs.get('lookbackDays'), 10);
    if (qs.get('force') === '1') opts.force = true;
    if (qs.get('includeSent') === '0') opts.includeSent = false;
  } else {
    return sendJson(res, 405, { ok: false, error: 'method-not-allowed' });
  }

  // Clamp lookback to a sensible upper bound — protect Gmail quota.
  if (opts.lookbackDays && (opts.lookbackDays < 1 || opts.lookbackDays > 14)) {
    opts.lookbackDays = inboxSync.DEFAULT_LOOKBACK_DAYS;
  }

  try {
    const deps = buildSyncDeps();
    const result = await inboxSync.syncInbox(deps, opts);
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: err && err.message ? err.message : String(err) });
  }
}

async function handleSyncStatus(req, res) {
  try {
    const deps = buildSyncDeps();
    const meta = await deps.readStore(inboxSync.STORE.syncMeta);
    return sendJson(res, 200, { ok: true, meta: meta || null });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: err.message });
  }
}

const server = http.createServer(function (req, res) {
  const urlPath = req.url.split('?')[0];
  if (urlPath === '/api/sync-inbox') return handleSyncInbox(req, res);
  if (urlPath === '/api/sync-inbox/status') return handleSyncStatus(req, res);
  if (urlPath.startsWith('/api/')) return sendJson(res, 404, { ok: false, error: 'not-found' });
  return serveStatic(req, res);
});

if (require.main === module) {
  server.listen(PORT, function () {
    console.log('JABA server listening on http://localhost:' + PORT);
  });
}

module.exports = { server: server, callExternalTool: callExternalTool, buildSyncDeps: buildSyncDeps };
