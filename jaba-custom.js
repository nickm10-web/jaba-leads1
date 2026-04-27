// JABA Custom CRM Sidebar & Tabs Module v4
// Adds left sidebar navigation and custom tabs
// Agencies, Brands, Teams & Leagues now render as card grids from the leads array
// v4: Apple liquid glass sidebar + fixed pill badges

(function() {
  'use strict';

  var jabaCustom = window.jabaCustom || {};
  window.jabaCustom = jabaCustom;

  var CONFIG = {
    sidebarWidth: '240px',
    animationDuration: '200ms',
    firebasePaths: {
      investors: 'investors',
      athleteInvestors: 'athlete_investors',
      damarCRM: 'damarCRM',
      jordonCRM: 'jordonCRM'
    }
  };

  var dataCache = {
    investors: {},
    athleteInvestors: {},
    damarCRM: {},
    jordonCRM: {}
  };

  var activeCustomSection = null;

  // ===== AGENCY/BRAND/TEAM CATEGORY MAPS =====
  var AGENCY_CATEGORIES = {
    'AOR / Sports Property': [
      'playfly', 'learfield', 'isl', 'jmi sports', 'caa', 'img', 'octagon',
      'wasserman', 'wme', 'excel sports', 'gseworkwide', 'gse worldwide',
      'league assists', 'genesco', 'brunswick'
    ],
    'Athlete Agency': [
      'athletes first', 'priority sports', 'klutch', 'newport sports',
      'eag sports', 'young money', 'aces inc', 'endurance sports'
    ],
    'NIL / College Sports': [
      'altius', 'rally nil', 'nocap', 'inflcr', 'brandr', 'athliance',
      'icon source', 'nil network', 'sponsor united', 'scoreplay',
      'athletiverse', 'opendorse'
    ],
    'Marketing / Creative': [
      'milk and honey', 'vayner', 'magz', 'rubicon', 'article41',
      'tsmgi', 'emrg', 'skypop'
    ]
  };

  var BRAND_CATEGORIES = {
    'Sports & Athletics': [
      'fanatics', 'gatorade', 'oakley', 'q collar', 'made hoops',
      'athletes unlimited', 'greenfly', 'state and liberty'
    ],
    'Media & Content': [
      'barstool', 'front office sports', 'boardroom', 'religion of sport',
      'postgame', 'thropic'
    ],
    'Health & Wellness': [
      'ag1', 'ocean spray', 'dry water'
    ],
    'Financial & Services': [
      'morgan and morgan', 'gld', 'authentic brand'
    ]
  };

  // ===== HELPERS =====
  function getLeadsArray() {
    if (typeof leads !== 'undefined' && Array.isArray(leads) && leads.length > 0) {
      return leads;
    }
    if (window.__leads && window.__leads.length > 0) {
      return window.__leads;
    }
    try {
      var stored = JSON.parse(localStorage.getItem('bd_leads_v26') || '[]');
      if (stored.length > 0) return stored;
    } catch(e) {}
    return [];
  }

  function getLeadsByBucket(bucket) {
    var allLeads = getLeadsArray();
    return allLeads.filter(function(l) { return l.bucket === bucket; });
  }

  // Use global versions from index.html (deduplicated)
  var escapeHtml = window.escapeHtml || function(t) { return String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); };
  var getStageStyle = window.getStageStyle || function() { return ''; };

  function getInitials(name) {
    return String(name || '')
      .split(' ')
      .slice(0, 2)
      .map(function(w) { return w[0]; })
      .join('')
      .toUpperCase();
  }

  // Abbreviated stage labels for compact pills
  function getStageLabel(stage) {
    var labels = {
      lead: 'Lead', contacted: 'Contacted', meeting_scheduled: 'Mtg Sched',
      scrape: 'Scrape', building: 'Building', auditing: 'Auditing',
      ready: 'Ready', meeting_complete: 'Mtg Done', report_sent: 'Report Sent',
      contract_sent: 'Contract', client: 'Client', onhold: 'On Hold',
      announcement_working: 'Ann. WIP', announcement_sent: 'Ann. Sent',
      announcement_approved: 'Ann. OK'
    };
    return labels[stage] || stage || 'Unworked';
  }

  function getHeat(lead) {
    if (!lead) return { key: 'red', label: 'Red' };
    if (lead.stage === 'client') return { key: 'green', label: 'Green' };
    if (['meeting_scheduled', 'meeting_complete', 'contract_sent', 'ready', 'report_sent', 'building', 'auditing'].indexOf(lead.stage) !== -1) {
      return { key: 'green', label: 'Green' };
    }
    if (lead.followUp || ['contacted', 'lead', 'scrape'].indexOf(lead.stage) !== -1) {
      return { key: 'yellow', label: 'Yellow' };
    }
    return { key: 'red', label: 'Red' };
  }

  function getHeatDotColor(key) {
    if (key === 'green') return '#00b894';
    if (key === 'yellow') return '#fdcb6e';
    return '#ff6b6b';
  }

  function categorize(name, categoryMap) {
    var lower = (name || '').toLowerCase();
    for (var cat in categoryMap) {
      if (categoryMap.hasOwnProperty(cat)) {
        var keywords = categoryMap[cat];
        for (var i = 0; i < keywords.length; i++) {
          if (lower.indexOf(keywords[i]) !== -1) return cat;
        }
      }
    }
    return 'Other';
  }

  function getBrandColors(company) {
    if (window.BRAND_COLORS && window.BRAND_COLORS[company]) {
      return window.BRAND_COLORS[company];
    }
    return ['#a29bfe', '#fff'];
  }

  // ===== STYLES =====
  var injectStyles = function() {
    var styleId = 'jaba-custom-styles-v4';
    // Remove old style tags
    var oldStyle = document.getElementById('jaba-custom-styles-v2');
    if (oldStyle) oldStyle.remove();
    if (document.getElementById(styleId)) return;

    var style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .top-tabs { display: none !important; }

      /* ===== APPLE LIQUID GLASS SIDEBAR ===== */
      .jaba-sidebar {
        position: fixed; left: 0; top: 0;
        width: ${CONFIG.sidebarWidth}; height: 100vh;
        background: rgba(15, 17, 23, 0.55);
        backdrop-filter: blur(40px) saturate(180%);
        -webkit-backdrop-filter: blur(40px) saturate(180%);
        border-right: 1px solid rgba(255, 255, 255, 0.08);
        overflow-y: auto; overflow-x: hidden;
        z-index: 999;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "DM Sans", sans-serif;
        padding: 20px 0;
      }

      /* Glass noise overlay for depth */
      .jaba-sidebar::before {
        content: '';
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        background: linear-gradient(
          180deg,
          rgba(255, 255, 255, 0.04) 0%,
          rgba(255, 255, 255, 0.01) 40%,
          rgba(0, 0, 0, 0.02) 100%
        );
        pointer-events: none;
        z-index: 0;
      }

      .jaba-sidebar > * { position: relative; z-index: 1; }

      .jaba-sidebar::-webkit-scrollbar { width: 4px; }
      .jaba-sidebar::-webkit-scrollbar-track { background: transparent; }
      .jaba-sidebar::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
      }
      .jaba-sidebar::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.18);
      }

      .jaba-sidebar-section { padding: 6px 0; }
      .jaba-sidebar-section:not(:first-child) {
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        margin-top: 4px; padding-top: 10px;
      }

      .jaba-sidebar-divider {
        padding: 10px 20px 6px;
        font-size: 10px; font-weight: 600;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.35);
        letter-spacing: 1.2px;
      }

      .jaba-sidebar-item {
        display: flex; align-items: center;
        padding: 8px 14px; margin: 1px 10px;
        cursor: pointer;
        color: rgba(255, 255, 255, 0.72);
        transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
        font-size: 13px; font-weight: 500;
        gap: 10px;
        border-radius: 10px;
        border-left: none;
        position: relative;
        letter-spacing: -0.01em;
      }

      .jaba-sidebar-item:hover {
        background: rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.92);
      }

      .jaba-sidebar-item.active {
        background: rgba(226, 245, 0, 0.12);
        color: #E2F500;
        font-weight: 600;
        border-left: none;
        box-shadow: 0 0 20px rgba(226, 245, 0, 0.06);
      }

      .jaba-sidebar-item.active::before {
        content: '';
        position: absolute;
        left: -10px; top: 50%;
        transform: translateY(-50%);
        width: 3px; height: 18px;
        background: #E2F500;
        border-radius: 0 3px 3px 0;
        box-shadow: 0 0 8px rgba(226, 245, 0, 0.4);
      }

      .jaba-badge {
        margin-left: auto;
        padding: 2px 7px;
        border-radius: 8px;
        font-size: 10px; font-weight: 600;
        min-width: 20px; text-align: center;
        letter-spacing: 0.02em;
        transition: all 0.22s ease;
      }

      /* Glass-style badges */
      .jaba-badge.schools {
        background: rgba(0, 184, 148, 0.18);
        color: #7ef0cc;
      }
      .jaba-badge.teams {
        background: rgba(9, 132, 227, 0.18);
        color: #74b9ff;
      }
      .jaba-badge.athlete {
        background: rgba(225, 112, 85, 0.18);
        color: #ffb4a2;
      }
      .jaba-badge.agencies {
        background: rgba(253, 203, 110, 0.18);
        color: #ffe08f;
      }
      .jaba-badge.brands {
        background: rgba(162, 155, 254, 0.18);
        color: #c4bfff;
      }
      .jaba-badge.investors {
        background: rgba(108, 92, 231, 0.18);
        color: #b8b0ff;
      }
      .jaba-badge.generic {
        background: rgba(139, 148, 158, 0.15);
        color: rgba(255, 255, 255, 0.5);
      }

      .container { margin-left: ${CONFIG.sidebarWidth}; transition: margin-left ${CONFIG.animationDuration} ease; }
      .detail-panel { margin-left: ${CONFIG.sidebarWidth}; transition: margin-left ${CONFIG.animationDuration} ease; }

      .jaba-custom-section {
        display: none; padding: 24px; min-height: 100vh;
        background: var(--bg-primary, #0f1117);
      }
      .jaba-custom-section.active { display: block; animation: fadeIn ${CONFIG.animationDuration} ease; }

      @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

      .jaba-section-header {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 24px; gap: 16px;
      }
      .jaba-section-title {
        font-family: "Saira Extra Condensed", sans-serif;
        font-size: 28px; font-weight: 700; color: var(--text-primary, #e6edf3); margin: 0;
      }
      .jaba-section-search {
        flex: 1; max-width: 400px; padding: 8px 12px;
        background: var(--bg-secondary, #1a1d27); border: 1px solid var(--border, #30363d);
        border-radius: 6px; color: var(--text-primary, #e6edf3); font-size: 13px;
      }
      .jaba-section-search::placeholder { color: var(--text-secondary, #8b949e); }
      .jaba-section-search:focus { outline: none; border-color: var(--accent, #E2F500); box-shadow: 0 0 0 2px rgba(226, 245, 0, 0.1); }

      .jaba-stats-container {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 12px; margin-bottom: 24px;
      }
      .jaba-stat-card {
        background: var(--glass-bg, rgba(26, 29, 39, 0.8));
        border: 1px solid var(--border, #30363d); border-radius: 8px; padding: 16px; text-align: center;
      }
      .jaba-stat-number { font-size: 24px; font-weight: 700; color: var(--accent, #E2F500); margin-bottom: 4px; }
      .jaba-stat-label { font-size: 12px; color: var(--text-secondary, #8b949e); text-transform: uppercase; letter-spacing: 0.5px; }

      /* ===== CARD GRID STYLES ===== */
      .opp-board-stats {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 12px; margin-bottom: 20px;
      }
      .opp-board-stat {
        background: linear-gradient(180deg, rgba(35, 39, 51, 0.95), rgba(20, 22, 29, 0.95));
        border: 1px solid var(--border, #30363d); border-radius: 12px; padding: 16px; min-width: 0;
      }
      .opp-board-stat-value {
        font-family: 'Anton', sans-serif; font-size: 28px; color: var(--accent, #E2F500);
        line-height: 1; margin-bottom: 8px;
      }
      .opp-board-stat-label {
        font-size: 11px; color: var(--text-secondary, #8b949e);
        text-transform: uppercase; letter-spacing: 0.6px;
      }

      .opp-control-bar {
        display: flex; flex-wrap: wrap; justify-content: space-between;
        gap: 16px; margin-bottom: 24px;
      }
      .opp-search {
        min-width: 240px; flex: 1; max-width: 320px; padding: 10px 14px;
        background: var(--bg-secondary, #1a1d27); border: 1px solid var(--border, #30363d);
        border-radius: 999px; color: var(--text-primary, #e6edf3); font-size: 13px;
      }
      .opp-search:focus {
        outline: none; border-color: var(--accent, #E2F500);
        box-shadow: 0 0 0 3px rgba(226, 245, 0, 0.08);
      }
      .opp-filter-chips { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      .opp-filter-chip {
        padding: 8px 14px; border-radius: 999px; border: 1px solid var(--border, #30363d);
        background: var(--bg-secondary, #1a1d27); color: var(--text-secondary, #8b949e);
        font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;
      }
      .opp-filter-chip.active { background: var(--accent, #E2F500); color: #000; border-color: var(--accent, #E2F500); }

      .opp-group { margin-bottom: 28px; }
      .opp-group-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .opp-group-title {
        font-family: 'Saira Extra Condensed', sans-serif; font-size: 24px;
        letter-spacing: 0.8px; text-transform: uppercase; color: var(--text-primary, #e6edf3);
      }
      .opp-group-meta { color: var(--text-secondary, #8b949e); font-size: 12px; }

      .opp-category-section {
        margin-bottom: 24px; padding: 18px;
        background: rgba(15, 17, 23, 0.7); border: 1px solid rgba(255,255,255,0.07); border-radius: 16px;
      }
      .opp-category-header {
        display: flex; justify-content: space-between; align-items: center;
        gap: 16px; margin-bottom: 14px;
      }
      .opp-category-title-block { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .opp-category-name {
        font-family: 'Saira Extra Condensed', sans-serif; font-size: 22px;
        text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-primary, #e6edf3);
      }
      .opp-category-badge {
        padding: 4px 10px; border-radius: 999px;
        background: rgba(226, 245, 0, 0.12); color: var(--accent, #E2F500);
        font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px;
      }
      .opp-category-metrics { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      .opp-category-metric {
        padding: 6px 10px; border-radius: 999px; background: var(--bg-secondary, #1a1d27);
        color: var(--text-secondary, #8b949e); font-size: 11px; border: 1px solid rgba(255,255,255,0.06);
      }

      .opp-card-grid {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px;
      }
      .opp-card {
        border-radius: 16px; padding: 14px; min-height: 165px;
        background: linear-gradient(180deg, rgba(30, 34, 45, 0.95), rgba(20, 22, 29, 0.95));
        border: 1px solid rgba(255,255,255,0.07);
        display: flex; flex-direction: column; gap: 8px;
        cursor: pointer; transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        position: relative; overflow: hidden;
      }
      .opp-card:hover {
        transform: translateY(-2px); border-color: rgba(226, 245, 0, 0.35);
        box-shadow: 0 16px 32px rgba(0, 0, 0, 0.24);
      }
      .opp-card.unworked { opacity: 0.82; background: linear-gradient(180deg, rgba(26, 29, 39, 0.9), rgba(17, 19, 26, 0.9)); }
      .opp-card.client { border-color: rgba(226, 245, 0, 0.45); box-shadow: inset 0 0 0 1px rgba(226, 245, 0, 0.18); }

      .opp-card-header { display: flex; justify-content: space-between; gap: 6px; align-items: flex-start; }
      .opp-card-logo {
        width: 42px; height: 42px; border-radius: 12px;
        background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center;
        font-size: 12px; font-weight: 700; color: var(--text-primary, #e6edf3);
        overflow: hidden; flex-shrink: 0;
      }
      .opp-card-logo img { width: 100%; height: 100%; object-fit: contain; background: rgba(255,255,255,0.02); }

      /* Fixed type pill — compact, never stretches */
      .opp-card-type-pill {
        font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px;
        color: rgba(255, 255, 255, 0.45);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 6px;
        padding: 3px 6px;
        background: rgba(255,255,255,0.03);
        white-space: nowrap;
        max-width: 90px;
        overflow: hidden;
        text-overflow: ellipsis;
        flex-shrink: 0;
        line-height: 1.2;
      }

      .opp-card-name {
        font-size: 13px; font-weight: 700; line-height: 1.25;
        color: var(--text-primary, #e6edf3);
        min-height: 0;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }

      /* Compact pill row — heat + stage side by side */
      .opp-card-pills {
        display: flex; gap: 6px; align-items: center; flex-wrap: nowrap;
      }

      .opp-card-heat {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 3px 8px; border-radius: 6px;
        font-size: 9px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.5px;
        white-space: nowrap; flex-shrink: 0;
      }
      .opp-card-heat.green { background: rgba(0, 184, 148, 0.16); color: #7ef0cc; }
      .opp-card-heat.yellow { background: rgba(253, 203, 110, 0.16); color: #ffe08f; }
      .opp-card-heat.red { background: rgba(255, 107, 107, 0.16); color: #ff9d9d; }
      .opp-card-heat-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }

      /* Fixed stage pill — compact, never stretches */
      .opp-card-status {
        display: inline-flex; align-items: center;
        padding: 3px 8px; border-radius: 6px;
        font-size: 9px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.5px;
        white-space: nowrap;
        max-width: 100px;
        overflow: hidden;
        text-overflow: ellipsis;
        flex-shrink: 1;
      }

      .opp-card-context {
        color: var(--text-secondary, #8b949e); font-size: 11px; line-height: 1.45;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        overflow: hidden; flex: 1;
      }
      .opp-card-footer {
        display: flex; justify-content: space-between; align-items: center;
        gap: 6px; margin-top: auto; font-size: 10px; color: var(--text-secondary, #8b949e);
      }
      .opp-card-footer .last-contact-tag { display: inline-flex; gap: 4px; align-items: center; }
      .opp-card-note-btn {
        background: rgba(226, 245, 0, 0.1); color: var(--accent, #E2F500);
        border: 1px solid rgba(226, 245, 0, 0.3);
        padding: 3px 8px; border-radius: 999px;
        font-size: 10px; font-weight: 600; cursor: pointer;
        transition: all 0.15s ease;
      }
      .opp-card-note-btn:hover { background: rgba(226, 245, 0, 0.22); transform: translateY(-1px); }
      .opp-empty {
        padding: 24px; border-radius: 14px; background: rgba(255,255,255,0.03);
        border: 1px dashed rgba(255,255,255,0.08); color: var(--text-secondary, #8b949e);
        text-align: center; font-size: 13px;
      }

      /* Table styles for Firebase sections */
      .jaba-table {
        width: 100%; border-collapse: collapse;
        background: var(--glass-bg, rgba(26, 29, 39, 0.8));
        border: 1px solid var(--border, #30363d); border-radius: 8px; overflow: hidden;
      }
      .jaba-table thead { background: var(--bg-secondary, #1a1d27); border-bottom: 1px solid var(--border, #30363d); }
      .jaba-table th {
        padding: 12px; text-align: left; font-size: 12px; font-weight: 600;
        color: var(--text-secondary, #8b949e); text-transform: uppercase; letter-spacing: 0.5px;
      }
      .jaba-table td { padding: 12px; border-bottom: 1px solid var(--border, #30363d); font-size: 13px; color: var(--text-primary, #e6edf3); }
      .jaba-table tbody tr:hover { background: rgba(226, 245, 0, 0.03); }
      .jaba-table tbody tr:last-child td { border-bottom: none; }

      .jaba-status-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: capitalize; }
      .jaba-status-unworked { background: var(--text-secondary, #8b949e); color: white; }
      .jaba-status-contacted { background: var(--color-agencies, #fdcb6e); color: #0f1117; }
      .jaba-status-meeting { background: var(--color-teams, #0984e3); color: white; }
      .jaba-status-pitched { background: var(--color-brands, #a29bfe); color: white; }
      .jaba-status-client { background: var(--color-schools, #00b894); color: white; }

      .jaba-btn {
        padding: 6px 12px; margin: 0 4px; border: none; border-radius: 4px;
        font-size: 12px; font-weight: 600; cursor: pointer; transition: all ${CONFIG.animationDuration} ease;
      }
      .jaba-btn-edit { background: var(--accent, #E2F500); color: var(--bg-primary, #0f1117); }
      .jaba-btn-edit:hover { opacity: 0.8; transform: translateY(-1px); }
      .jaba-btn-delete { background: var(--color-athlete, #e17055); color: white; }
      .jaba-btn-delete:hover { opacity: 0.8; transform: translateY(-1px); }
      .jaba-btn-add {
        background: var(--accent, #E2F500); color: var(--bg-primary, #0f1117);
        padding: 10px 16px; font-size: 13px; margin-bottom: 16px;
      }
      .jaba-btn-add:hover { opacity: 0.8; }
      .jaba-btn-approve { background: var(--color-schools, #00b894); color: white; }
      .jaba-btn-reject { background: var(--color-athlete, #e17055); color: white; }

      /* Date-cell highlights for follow-up tracking */
      .jaba-date-overdue { color: #ff6b6b; font-weight: 600; }
      .jaba-date-soon { color: #ffd166; font-weight: 600; }
      .jaba-date-empty { color: var(--text-secondary, #8b949e); opacity: 0.5; }
      .jaba-table tbody tr.jaba-row-overdue { background: rgba(255, 107, 107, 0.06); }

      .jaba-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
      .jaba-card {
        background: var(--glass-bg, rgba(26, 29, 39, 0.8)); border: 1px solid var(--border, #30363d);
        border-radius: 12px; padding: 20px; transition: all ${CONFIG.animationDuration} ease;
      }
      .jaba-card:hover { border-color: var(--accent, #E2F500); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); }
      .jaba-card-title { font-size: 16px; font-weight: 700; color: var(--text-primary, #e6edf3); margin-bottom: 12px; }
      .jaba-card-content { font-size: 13px; color: var(--text-secondary, #8b949e); line-height: 1.6; margin-bottom: 12px; }
      .jaba-card-actions { display: flex; gap: 8px; flex-wrap: wrap; }

      @media (max-width: 768px) {
        .jaba-sidebar { width: 200px; font-size: 12px; }
        .container, .detail-panel { margin-left: 200px; }
        .jaba-stats-container { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); }
      }
    `;

    document.head.appendChild(style);
  };

  // ===== SIDEBAR CREATION =====
  var createSidebar = function() {
    var sidebar = document.createElement('div');
    sidebar.className = 'jaba-sidebar';
    sidebar.id = 'jaba-sidebar';

    var sections = [
      {
        label: null,
        items: [
          { name: 'Dashboard', id: 'dashboard', section: 'dashboardSection', type: 'builtin' },
          { name: 'Leads', id: 'leads', section: 'leadsSection', type: 'builtin', badge: true }
        ]
      },
      {
        label: 'OPPORTUNITIES',
        items: [
          { name: 'Schools', id: 'schools', section: 'schoolsSection', type: 'builtin', badge: 'schools' },
          { name: 'Agencies', id: 'agencies', section: 'agenciesSection', type: 'custom', badge: 'agencies', cardGrid: true },
          { name: 'Brands', id: 'brands', section: 'brandsSection', type: 'custom', badge: 'brands', cardGrid: true },
          { name: 'Teams & Leagues', id: 'leagues_teams', section: 'leaguesTeamsSection', type: 'custom', badge: 'teams', cardGrid: true },
          { name: 'Investors', id: 'investors', section: 'investorsSection', type: 'custom', badge: 'investors' },
          { name: 'Athlete Investors', id: 'athlete_investors', section: 'athleteInvestorsSection', type: 'custom', badge: 'athlete' }
        ]
      },
      {
        label: null,
        items: [
          { name: 'Inbox', id: 'inbox', section: 'inboxSection', type: 'builtin', badge: true },
          { name: 'Meetings', id: 'meetings', section: 'meetingsSection', type: 'builtin', badge: true },
          { name: 'Tasks', id: 'tasks', section: 'tasksSection', type: 'builtin', badge: true },
          { name: 'Playbooks', id: 'playbooks', section: 'playbooksSection', type: 'builtin' }
        ]
      },
      {
        label: 'CRM',
        items: [
          { name: 'Jordon CRM', id: 'jordonCRM', section: 'jordonCRMSection', type: 'custom', badge: 'generic' },
          { name: 'Damar CRM', id: 'damarCRM', section: 'damarCRMSection', type: 'custom', badge: 'generic' }
        ]
      }
    ];

    sections.forEach(function(sectionGroup) {
      var sectionDiv = document.createElement('div');
      sectionDiv.className = 'jaba-sidebar-section';

      if (sectionGroup.label) {
        var divider = document.createElement('div');
        divider.className = 'jaba-sidebar-divider';
        divider.textContent = sectionGroup.label;
        sectionDiv.appendChild(divider);
      }

      sectionGroup.items.forEach(function(item) {
        var itemDiv = document.createElement('div');
        itemDiv.className = 'jaba-sidebar-item';
        itemDiv.dataset.itemId = item.id;
        itemDiv.dataset.section = item.section;
        itemDiv.dataset.type = item.type;

        var label = document.createElement('span');
        label.textContent = item.name;
        itemDiv.appendChild(label);

        // Sidebar badges intentionally not rendered — count pills were noisy
        // and most read 0. The `badge` field is left in the section config in
        // case we want to bring them back, and the updateBadge / sync helpers
        // are harmless no-ops when no badge elements exist in the DOM.

        itemDiv.addEventListener('click', function() {
          handleSidebarClick(item, itemDiv);
        });

        sectionDiv.appendChild(itemDiv);
      });

      sidebar.appendChild(sectionDiv);
    });

    document.body.insertBefore(sidebar, document.body.firstChild);
  };

  // ===== SIDEBAR CLICK HANDLER =====
  var handleSidebarClick = function(item, itemElement) {
    document.querySelectorAll('.jaba-sidebar-item').forEach(function(el) {
      el.classList.remove('active');
    });
    itemElement.classList.add('active');

    if (item.type === 'builtin') {
      document.querySelectorAll('.jaba-custom-section').forEach(function(section) {
        section.classList.remove('active');
      });
      activeCustomSection = null;

      if (typeof window.switchSection === 'function') {
        window.switchSection(item.id);
      }
    } else {
      var builtinSections = [
        'dashboardSection', 'leadsSection', 'schoolsSection',
        'inboxSection', 'meetingsSection', 'tasksSection', 'playbooksSection'
      ];
      builtinSections.forEach(function(sectionId) {
        var el = document.getElementById(sectionId);
        if (el) el.style.display = 'none';
      });
      document.querySelector('.header-actions').style.display = 'none';

      document.querySelectorAll('.jaba-custom-section').forEach(function(section) {
        section.classList.remove('active');
      });

      activeCustomSection = item.section;
      var customSection = document.getElementById(item.section);
      if (customSection) {
        customSection.classList.add('active');
      }

      // Render card grid sections from leads data
      if (item.cardGrid) {
        if (item.id === 'agencies') renderAgencyBoard();
        else if (item.id === 'brands') renderBrandBoard();
        else if (item.id === 'leagues_teams') renderTeamBoard();
      }
    }
  };

  // ===== FIREBASE DATA LOADING (for non-card-grid sections) =====
  var loadFirebaseData = function(path, callback) {
    if (typeof firebase === 'undefined' || !firebase.database) {
      console.warn('Firebase not loaded yet');
      setTimeout(function() { loadFirebaseData(path, callback); }, 500);
      return;
    }
    var dbRef = firebase.database().ref(path);
    dbRef.once('value', function(snapshot) {
      var data = snapshot.val() || {};
      callback(data);
    }).catch(function(error) {
      console.error('Error loading ' + path, error);
    });
  };

  var syncFirebaseData = function() {
    loadFirebaseData(CONFIG.firebasePaths.investors, function(data) {
      dataCache.investors = data;
      updateBadge('investors', Object.keys(data).length);
    });
    loadFirebaseData(CONFIG.firebasePaths.athleteInvestors, function(data) {
      dataCache.athleteInvestors = data;
      updateBadge('athlete_investors', Object.keys(data).length);
    });
    loadFirebaseData(CONFIG.firebasePaths.damarCRM, function(data) {
      dataCache.damarCRM = data;
      updateBadge('damarCRM', Object.keys(data).length);
    });
    loadFirebaseData(CONFIG.firebasePaths.jordonCRM, function(data) {
      dataCache.jordonCRM = data;
      updateBadge('jordonCRM', Object.keys(data).length);
    });
  };

  var updateBadge = function(itemId, count) {
    var badge = document.querySelector('[data-badge-key="' + itemId + '"]');
    if (badge) badge.textContent = count;
  };

  var syncBadgesFromTopTabs = function() {
    var topTabs = document.querySelectorAll('.top-tab');
    topTabs.forEach(function(tab) {
      var badgeEl = tab.querySelector('[class*="badge"]');
      if (badgeEl) {
        var count = badgeEl.textContent.trim();
        var sectionId = tab.getAttribute('onclick');
        var match = sectionId ? sectionId.match(/switchSection\('(\w+)'\)/) : null;
        if (match && match[1]) {
          var badge = document.querySelector('[data-badge-key="' + match[1] + '"]');
          if (badge) badge.textContent = count;
        }
      }
    });

    updateCardGridBadges();
  };

  var updateCardGridBadges = function() {
    var allLeads = getLeadsArray();
    var agencyBuckets = ['agencies', 'athlete'];
    var agencyCount = allLeads.filter(function(l) { return agencyBuckets.indexOf(l.bucket) !== -1; }).length;
    var brandCount = allLeads.filter(function(l) { return l.bucket === 'brands'; }).length;
    var teamCount = allLeads.filter(function(l) { return l.bucket === 'teams'; }).length;

    updateBadge('agencies', agencyCount);
    updateBadge('brands', brandCount);
    updateBadge('leagues_teams', teamCount);
  };

  // ===== CARD GRID RENDERING: AGENCIES =====
  var agencySearchQuery = '';
  var agencyFilter = 'All';

  function renderAgencyBoard() {
    var section = document.getElementById('agenciesSection');
    if (!section) return;

    var agencyLeads = getLeadsArray().filter(function(l) {
      return l.bucket === 'agencies' || l.bucket === 'athlete';
    });

    if (agencySearchQuery) {
      var q = agencySearchQuery.toLowerCase();
      agencyLeads = agencyLeads.filter(function(l) {
        return (l.company || '').toLowerCase().indexOf(q) !== -1 ||
               (l.context || '').toLowerCase().indexOf(q) !== -1 ||
               (l.contacts || []).some(function(c) { return (c.name || '').toLowerCase().indexOf(q) !== -1; });
      });
    }

    agencyLeads.forEach(function(l) {
      l._category = categorize(l.company, AGENCY_CATEGORIES);
    });

    var total = agencyLeads.length;
    var active = agencyLeads.filter(function(l) { return l.stage !== 'lead'; }).length;
    var clients = agencyLeads.filter(function(l) { return l.stage === 'client'; }).length;
    var meetings = agencyLeads.filter(function(l) { return l.stage === 'meeting_scheduled' || l.stage === 'meeting_complete'; }).length;

    var categories = {};
    agencyLeads.forEach(function(l) {
      if (!categories[l._category]) categories[l._category] = [];
      categories[l._category].push(l);
    });

    var categoryNames = ['All'];
    var orderedCats = ['AOR / Sports Property', 'Athlete Agency', 'NIL / College Sports', 'Marketing / Creative', 'Other'];
    orderedCats.forEach(function(cat) {
      if (categories[cat]) categoryNames.push(cat);
    });

    var chipsHtml = categoryNames.map(function(cat) {
      return '<button class="opp-filter-chip ' + (agencyFilter === cat ? 'active' : '') + '" onclick="jabaCustom.setAgencyFilter(\'' + escapeHtml(cat) + '\')">' + escapeHtml(cat) + '</button>';
    }).join('');

    var statsHtml = [
      ['Total Agencies', total],
      ['Active', active],
      ['Clients', clients],
      ['Meetings', meetings]
    ].map(function(pair) {
      return '<div class="opp-board-stat"><div class="opp-board-stat-value">' + pair[1] + '</div><div class="opp-board-stat-label">' + pair[0] + '</div></div>';
    }).join('');

    var boardHtml = '';
    orderedCats.forEach(function(cat) {
      var catLeads = categories[cat];
      if (!catLeads || catLeads.length === 0) return;
      if (agencyFilter !== 'All' && agencyFilter !== cat) return;

      var catActive = catLeads.filter(function(l) { return l.stage !== 'lead'; }).length;
      var catClients = catLeads.filter(function(l) { return l.stage === 'client'; }).length;

      boardHtml += '<div class="opp-category-section">';
      boardHtml += '<div class="opp-category-header">';
      boardHtml += '<div class="opp-category-title-block">';
      boardHtml += '<div class="opp-category-name">' + escapeHtml(cat) + '</div>';
      boardHtml += '<span class="opp-category-badge">' + catLeads.length + ' agencies</span>';
      boardHtml += '</div>';
      boardHtml += '<div class="opp-category-metrics">';
      boardHtml += '<span class="opp-category-metric">' + catActive + ' active</span>';
      boardHtml += '<span class="opp-category-metric">' + catClients + ' clients</span>';
      boardHtml += '</div></div>';
      boardHtml += '<div class="opp-card-grid">';
      boardHtml += catLeads.map(function(lead) { return renderOppCard(lead, cat); }).join('');
      boardHtml += '</div></div>';
    });

    if (!boardHtml) {
      boardHtml = '<div class="opp-empty">No agencies match the current filters.</div>';
    }

    section.innerHTML =
      '<div class="schools-header"><div><h2>Agencies</h2><div class="schools-subtitle">Agency pipeline board for live reviews</div></div></div>' +
      '<div class="opp-board-stats">' + statsHtml + '</div>' +
      '<div class="opp-control-bar">' +
        '<div class="opp-filter-chips">' + chipsHtml + '</div>' +
        '<input type="text" class="opp-search" placeholder="Search agencies..." value="' + escapeHtml(agencySearchQuery) + '" oninput="jabaCustom.handleAgencySearch(this.value)">' +
      '</div>' +
      boardHtml;
  }

  jabaCustom.setAgencyFilter = function(filter) {
    agencyFilter = filter;
    renderAgencyBoard();
  };

  jabaCustom.handleAgencySearch = function(value) {
    agencySearchQuery = value.trim();
    renderAgencyBoard();
  };

  // ===== CARD GRID RENDERING: BRANDS =====
  var brandSearchQuery = '';
  var brandFilter = 'All';

  function renderBrandBoard() {
    var section = document.getElementById('brandsSection');
    if (!section) return;

    var brandLeads = getLeadsByBucket('brands');

    if (brandSearchQuery) {
      var q = brandSearchQuery.toLowerCase();
      brandLeads = brandLeads.filter(function(l) {
        return (l.company || '').toLowerCase().indexOf(q) !== -1 ||
               (l.context || '').toLowerCase().indexOf(q) !== -1;
      });
    }

    brandLeads.forEach(function(l) {
      l._category = categorize(l.company, BRAND_CATEGORIES);
    });

    var total = brandLeads.length;
    var active = brandLeads.filter(function(l) { return l.stage !== 'lead'; }).length;
    var clients = brandLeads.filter(function(l) { return l.stage === 'client'; }).length;

    var categories = {};
    brandLeads.forEach(function(l) {
      if (!categories[l._category]) categories[l._category] = [];
      categories[l._category].push(l);
    });

    var orderedCats = ['Sports & Athletics', 'Media & Content', 'Health & Wellness', 'Financial & Services', 'Other'];
    var categoryNames = ['All'];
    orderedCats.forEach(function(cat) {
      if (categories[cat]) categoryNames.push(cat);
    });

    var chipsHtml = categoryNames.map(function(cat) {
      return '<button class="opp-filter-chip ' + (brandFilter === cat ? 'active' : '') + '" onclick="jabaCustom.setBrandFilter(\'' + escapeHtml(cat) + '\')">' + escapeHtml(cat) + '</button>';
    }).join('');

    var statsHtml = [
      ['Total Brands', total],
      ['Active', active],
      ['Clients', clients]
    ].map(function(pair) {
      return '<div class="opp-board-stat"><div class="opp-board-stat-value">' + pair[1] + '</div><div class="opp-board-stat-label">' + pair[0] + '</div></div>';
    }).join('');

    var boardHtml = '';
    orderedCats.forEach(function(cat) {
      var catLeads = categories[cat];
      if (!catLeads || catLeads.length === 0) return;
      if (brandFilter !== 'All' && brandFilter !== cat) return;

      var catActive = catLeads.filter(function(l) { return l.stage !== 'lead'; }).length;
      var catClients = catLeads.filter(function(l) { return l.stage === 'client'; }).length;

      boardHtml += '<div class="opp-category-section">';
      boardHtml += '<div class="opp-category-header">';
      boardHtml += '<div class="opp-category-title-block">';
      boardHtml += '<div class="opp-category-name">' + escapeHtml(cat) + '</div>';
      boardHtml += '<span class="opp-category-badge">' + catLeads.length + ' brands</span>';
      boardHtml += '</div>';
      boardHtml += '<div class="opp-category-metrics">';
      boardHtml += '<span class="opp-category-metric">' + catActive + ' active</span>';
      boardHtml += '<span class="opp-category-metric">' + catClients + ' clients</span>';
      boardHtml += '</div></div>';
      boardHtml += '<div class="opp-card-grid">';
      boardHtml += catLeads.map(function(lead) { return renderOppCard(lead, cat); }).join('');
      boardHtml += '</div></div>';
    });

    if (!boardHtml) {
      boardHtml = '<div class="opp-empty">No brands match the current filters.</div>';
    }

    section.innerHTML =
      '<div class="schools-header"><div><h2>Brands</h2><div class="schools-subtitle">Brand pipeline board for live reviews</div></div></div>' +
      '<div class="opp-board-stats">' + statsHtml + '</div>' +
      '<div class="opp-control-bar">' +
        '<div class="opp-filter-chips">' + chipsHtml + '</div>' +
        '<input type="text" class="opp-search" placeholder="Search brands..." value="' + escapeHtml(brandSearchQuery) + '" oninput="jabaCustom.handleBrandSearch(this.value)">' +
      '</div>' +
      boardHtml;
  }

  jabaCustom.setBrandFilter = function(filter) {
    brandFilter = filter;
    renderBrandBoard();
  };

  jabaCustom.handleBrandSearch = function(value) {
    brandSearchQuery = value.trim();
    renderBrandBoard();
  };

  // ===== CARD GRID RENDERING: TEAMS & LEAGUES =====
  var teamSearchQuery = '';

  function renderTeamBoard() {
    var section = document.getElementById('leaguesTeamsSection');
    if (!section) return;

    var teamLeads = getLeadsByBucket('teams');

    if (teamSearchQuery) {
      var q = teamSearchQuery.toLowerCase();
      teamLeads = teamLeads.filter(function(l) {
        return (l.company || '').toLowerCase().indexOf(q) !== -1 ||
               (l.context || '').toLowerCase().indexOf(q) !== -1;
      });
    }

    var total = teamLeads.length;
    var active = teamLeads.filter(function(l) { return l.stage !== 'lead'; }).length;
    var clients = teamLeads.filter(function(l) { return l.stage === 'client'; }).length;

    var statsHtml = [
      ['Total Teams & Leagues', total],
      ['Active', active],
      ['Clients', clients]
    ].map(function(pair) {
      return '<div class="opp-board-stat"><div class="opp-board-stat-value">' + pair[1] + '</div><div class="opp-board-stat-label">' + pair[0] + '</div></div>';
    }).join('');

    var boardHtml = '<div class="opp-category-section">';
    boardHtml += '<div class="opp-category-header">';
    boardHtml += '<div class="opp-category-title-block">';
    boardHtml += '<div class="opp-category-name">Teams & Leagues</div>';
    boardHtml += '<span class="opp-category-badge">' + total + ' total</span>';
    boardHtml += '</div></div>';
    boardHtml += '<div class="opp-card-grid">';
    boardHtml += teamLeads.map(function(lead) { return renderOppCard(lead, 'Teams'); }).join('');
    boardHtml += '</div></div>';

    if (total === 0) {
      boardHtml = '<div class="opp-empty">No teams or leagues match the current filters.</div>';
    }

    section.innerHTML =
      '<div class="schools-header"><div><h2>Teams & Leagues</h2><div class="schools-subtitle">Teams and leagues pipeline board</div></div></div>' +
      '<div class="opp-board-stats">' + statsHtml + '</div>' +
      '<div class="opp-control-bar">' +
        '<input type="text" class="opp-search" placeholder="Search teams & leagues..." value="' + escapeHtml(teamSearchQuery) + '" oninput="jabaCustom.handleTeamSearch(this.value)">' +
      '</div>' +
      boardHtml;
  }

  jabaCustom.handleTeamSearch = function(value) {
    teamSearchQuery = value.trim();
    renderTeamBoard();
  };

  // ===== SHARED CARD RENDERER =====
  function renderOppCard(lead, categoryLabel) {
    var heat = getHeat(lead);
    var isUnworked = !lead.stage || lead.stage === 'lead';
    var isClient = lead.stage === 'client';
    var cardClass = (isUnworked ? 'unworked' : '') + (isClient ? ' client' : '');
    var stageLabel = getStageLabel(lead.stage);
    var stageStyleStr = getStageStyle(lead.stage, isUnworked);

    var logoHtml;
    if (lead.domain) {
      logoHtml = '<img src="' + escapeHtml(lead.domain) + '" alt="' + escapeHtml(lead.company) + '" onerror="this.parentElement.innerHTML=\'' + getInitials(lead.company) + '\'">';
    } else {
      logoHtml = getInitials(lead.company);
    }

    var today = new Date().toISOString().split('T')[0];
    var followUpText = lead.followUp ? (lead.followUp < today ? 'OVERDUE \u2022 ' + lead.followUp : 'FU ' + lead.followUp) : 'No follow-up';
    var contactCount = (lead.contacts || []).length;

    // Short category label for the pill
    var shortCategory = categoryLabel;
    if (shortCategory.length > 12) {
      var shortMap = {
        'AOR / Sports Property': 'AOR',
        'Athlete Agency': 'Athlete',
        'NIL / College Sports': 'NIL',
        'Marketing / Creative': 'Marketing',
        'Sports & Athletics': 'Sports',
        'Media & Content': 'Media',
        'Health & Wellness': 'Health',
        'Financial & Services': 'Finance'
      };
      shortCategory = shortMap[categoryLabel] || categoryLabel.split(' ')[0];
    }

    var lastContactRaw = getLastContactDate(lead);
    var lastContactText = 'Last: ' + formatLastContact(lastContactRaw);

    return '<div class="opp-card ' + cardClass + '" onclick="openDetailPanel(' + lead.id + ')">' +
      '<div class="opp-card-header">' +
        '<div class="opp-card-logo">' + logoHtml + '</div>' +
        '<span class="opp-card-type-pill">' + escapeHtml(shortCategory) + '</span>' +
      '</div>' +
      '<div class="opp-card-name">' + escapeHtml(lead.company) + '</div>' +
      '<div class="opp-card-pills">' +
        '<span class="opp-card-heat ' + heat.key + '">' +
          '<span class="opp-card-heat-dot" style="background:' + getHeatDotColor(heat.key) + '"></span>' +
          escapeHtml(heat.label) +
        '</span>' +
        '<span class="opp-card-status" style="' + stageStyleStr + '">' + escapeHtml(stageLabel) + '</span>' +
      '</div>' +
      '<div class="opp-card-context">' + escapeHtml(lead.context || '') + '</div>' +
      '<div class="opp-card-footer">' +
        '<span>' + followUpText + ' \u00b7 <span class="last-contact-tag">' + lastContactText + '</span></span>' +
        '<button class="opp-card-note-btn" onclick="jabaCustom.addQuickNoteToLead(' + lead.id + ', event)" title="Add a quick note">+ Note</button>' +
      '</div>' +
    '</div>';
  }

  // ===== CUSTOM SECTION CREATION =====
  var createCustomSections = function() {
    var container = document.querySelector('.container') || document.body;

    var agenciesSection = document.createElement('div');
    agenciesSection.id = 'agenciesSection';
    agenciesSection.className = 'jaba-custom-section';
    agenciesSection.innerHTML = '<div class="opp-empty">Loading agencies...</div>';
    container.appendChild(agenciesSection);

    var brandsSection = document.createElement('div');
    brandsSection.id = 'brandsSection';
    brandsSection.className = 'jaba-custom-section';
    brandsSection.innerHTML = '<div class="opp-empty">Loading brands...</div>';
    container.appendChild(brandsSection);

    var leaguesSection = document.createElement('div');
    leaguesSection.id = 'leaguesTeamsSection';
    leaguesSection.className = 'jaba-custom-section';
    leaguesSection.innerHTML = '<div class="opp-empty">Loading teams & leagues...</div>';
    container.appendChild(leaguesSection);

    var investorsSection = document.createElement('div');
    investorsSection.id = 'investorsSection';
    investorsSection.className = 'jaba-custom-section';
    investorsSection.innerHTML = createTableSectionHTML('Investors', 'investors', ['name', 'contact', 'title', 'status', 'notes']);
    container.appendChild(investorsSection);

    var athleteSection = document.createElement('div');
    athleteSection.id = 'athleteInvestorsSection';
    athleteSection.className = 'jaba-custom-section';
    athleteSection.innerHTML = createTableSectionHTML('Athlete Investors', 'athlete_investors', ['name', 'sport', 'status', 'notes']);
    container.appendChild(athleteSection);

    // Jordon CRM Section. Schema lives in RELATIONSHIP_COLUMNS (single source
    // of truth, also used by getColumnsForDataKey for table rendering).
    var jordonSection = document.createElement('div');
    jordonSection.id = 'jordonCRMSection';
    jordonSection.className = 'jaba-custom-section';
    // Banner at the top with a one-click importer for the Notion CSV export.
    // The handler is idempotent (skips records already imported), so clicking
    // it twice is safe.
    var jordonImportBanner =
      '<div id="jordonImportBanner" style="background:rgba(226,245,0,0.08);border:1px solid rgba(226,245,0,0.25);border-radius:8px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;">' +
        '<div style="font-size:13px;color:var(--text-primary, #e6edf3);">' +
          '<strong>One-time import:</strong> 120 contacts from Jordon\'s Notion CRM export are ready to load.' +
        '</div>' +
        '<button id="jordonImportBtn" class="jaba-btn jaba-btn-add" style="margin-bottom:0;" onclick="jabaCustom.importJordonCrmFromFile()">' +
          'Import 120 Contacts' +
        '</button>' +
      '</div>';
    jordonSection.innerHTML = jordonImportBanner + createTableSectionHTML('Jordon CRM', 'jordonCRM', RELATIONSHIP_COLUMNS);
    container.appendChild(jordonSection);

    // Damar CRM Section
    var damarSection = document.createElement('div');
    damarSection.id = 'damarCRMSection';
    damarSection.className = 'jaba-custom-section';
    damarSection.innerHTML = createTableSectionHTML('Damar CRM', 'damarCRM', RELATIONSHIP_COLUMNS);
    container.appendChild(damarSection);
  };

  // Turn 'lastContact' -> 'Last Contact', 'nextFollowUp' -> 'Next Follow-Up'.
  // Hyphenates 'follow' + 'up' as a special case so the header matches how
  // people actually write it.
  var formatColumnHeader = function(col) {
    var spaced = col.replace(/([A-Z])/g, ' $1').replace(/-/g, ' ');
    var titled = spaced.replace(/\w\S*/g, function(w) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).trim();
    return titled.replace(/Follow Up/g, 'Follow-Up');
  };

  var createTableSectionHTML = function(title, dataKey, columns) {
    var html = '<div class="jaba-section-header">';
    html += '<h1 class="jaba-section-title">' + title + '</h1>';
    html += '<input type="text" class="jaba-section-search" placeholder="Search..." data-search-for="' + dataKey + '">';
    html += '</div>';
    html += '<button class="jaba-btn jaba-btn-add" onclick="jabaCustom.handleAddNew(\'' + dataKey + '\')">+ Add New</button>';
    html += '<div class="jaba-stats-container">';
    html += '<div class="jaba-stat-card"><div class="jaba-stat-number" id="stat-' + dataKey + '">0</div><div class="jaba-stat-label">Total</div></div>';
    html += '</div>';
    html += '<table class="jaba-table" id="table-' + dataKey + '">';
    html += '<thead><tr>';
    columns.forEach(function(col) {
      html += '<th>' + formatColumnHeader(col) + '</th>';
    });
    html += '<th>Actions</th></tr></thead>';
    html += '<tbody id="tbody-' + dataKey + '"></tbody>';
    html += '</table>';
    return html;
  };

  // ===== RENDERING FUNCTIONS (Firebase tables) =====
  // Returns YYYY-MM-DD for "today" in local time. Used to compare against
  // date-input values (which are also YYYY-MM-DD strings).
  var todayISO = function() {
    var d = new Date();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  };

  // Days from `today` to `dateStr`. Negative = overdue, 0 = today,
  // positive = future. Returns null if dateStr is empty or invalid.
  var daysFromToday = function(dateStr) {
    if (!dateStr) return null;
    var parts = String(dateStr).split('-');
    if (parts.length !== 3) return null;
    var target = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(target.getTime())) return null;
    var now = new Date();
    var t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target - t0) / (1000 * 60 * 60 * 24));
  };

  // Bucket a date column for styling: 'overdue', 'soon' (today..+3),
  // 'future', or 'empty'. Only applied to nextFollowUp.
  var classifyFollowUp = function(dateStr) {
    var d = daysFromToday(dateStr);
    if (d === null) return 'empty';
    if (d < 0) return 'overdue';
    if (d <= 3) return 'soon';
    return 'future';
  };

  var renderTableData = function(dataKey, searchTerm) {
    var data = dataCache[dataKey] || {};
    var tbody = document.getElementById('tbody-' + dataKey);
    var statEl = document.getElementById('stat-' + dataKey);
    if (!tbody) return;

    var columns = getColumnsForDataKey(dataKey);
    var rows = [];

    for (var key in data) {
      if (data.hasOwnProperty(key)) {
        var item = data[key];
        item.id = key;
        if (searchTerm) {
          var matches = false;
          for (var ci = 0; ci < columns.length; ci++) {
            var sval = item[columns[ci]];
            if (sval && sval.toString().toLowerCase().indexOf(searchTerm.toLowerCase()) !== -1) {
              matches = true;
              break;
            }
          }
          if (!matches) continue;
        }
        rows.push(item);
      }
    }

    // Sort by Next Follow-Up ascending when the column is present:
    // overdue dates float to the top; empty / no-date rows sink to the bottom.
    if (columns.indexOf('nextFollowUp') !== -1) {
      rows.sort(function(a, b) {
        var av = a.nextFollowUp || '';
        var bv = b.nextFollowUp || '';
        if (!av && !bv) return (a.name || '').localeCompare(b.name || '');
        if (!av) return 1;
        if (!bv) return -1;
        return av.localeCompare(bv);
      });
    }

    tbody.innerHTML = '';
    rows.forEach(function(item) {
      var tr = document.createElement('tr');
      var followUpClass = classifyFollowUp(item.nextFollowUp);
      if (columns.indexOf('nextFollowUp') !== -1 && followUpClass === 'overdue') {
        tr.classList.add('jaba-row-overdue');
      }

      columns.forEach(function(col) {
        var td = document.createElement('td');
        var val = item[col] || '';
        if (col === 'status') {
          var statusClass = 'jaba-status-' + (val.toLowerCase() || 'unworked');
          td.innerHTML = '<span class="jaba-status-badge ' + statusClass + '">' + val + '</span>';
        } else if (col === 'strength') {
          td.textContent = renderStars(val);
        } else if (col === 'nextFollowUp') {
          if (!val) {
            td.textContent = '\u2014';
            td.classList.add('jaba-date-empty');
          } else {
            td.textContent = val;
            if (followUpClass === 'overdue') td.classList.add('jaba-date-overdue');
            else if (followUpClass === 'soon') td.classList.add('jaba-date-soon');
          }
        } else if (col === 'lastContact') {
          if (!val) {
            td.textContent = '\u2014';
            td.classList.add('jaba-date-empty');
          } else {
            td.textContent = val;
          }
        } else {
          td.textContent = val;
        }
        tr.appendChild(td);
      });

      var actionsTd = document.createElement('td');
      // Show + Note button on the relationship-tracking CRMs only.
      var isCrmRelationship = (dataKey === 'jordonCRM' || dataKey === 'damarCRM');
      var noteBtn = isCrmRelationship
        ? '<button class="jaba-btn jaba-btn-edit" style="background:rgba(226,245,0,0.18);color:#000;" onclick="jabaCustom.addQuickNoteToCrm(\'' + dataKey + '\', \'' + item.id + '\')">+ Note</button>'
        : '';
      actionsTd.innerHTML = noteBtn +
                            '<button class="jaba-btn jaba-btn-edit" onclick="jabaCustom.handleEdit(\'' + dataKey + '\', \'' + item.id + '\')">Edit</button>' +
                            '<button class="jaba-btn jaba-btn-delete" onclick="jabaCustom.handleDelete(\'' + dataKey + '\', \'' + item.id + '\')">Delete</button>';
      tr.appendChild(actionsTd);
      tbody.appendChild(tr);
    });

    if (statEl) statEl.textContent = rows.length;
  };

  var renderStars = function(strength) {
    var num = parseInt(strength) || 0;
    var stars = '';
    for (var i = 0; i < num; i++) stars += '\u2605';
    return stars || '\u2014';
  };

  // Both Jordon CRM and Damar CRM use the same relationship-tracking schema.
  var RELATIONSHIP_COLUMNS = ['name', 'relationship', 'org', 'lastContact', 'nextFollowUp', 'context'];

  var getColumnsForDataKey = function(dataKey) {
    var columnsMap = {
      'investors': ['name', 'contact', 'title', 'status', 'notes'],
      'athlete_investors': ['name', 'sport', 'status', 'notes'],
      'damarCRM': RELATIONSHIP_COLUMNS,
      'jordonCRM': RELATIONSHIP_COLUMNS
    };
    return columnsMap[dataKey] || [];
  };

  // ===== RECORD EDITOR MODAL =====
  // Reuses .modal / .modal-content / .form-group styles from index.html so
  // the editor visually matches the rest of the app. The modal is created
  // once on first use and reused for all dataKeys.

  var RELATIONSHIP_OPTIONS = [
    'Friend', 'Investor', 'Potential Client', 'Client',
    'Partner', 'Vendor', 'Press', 'Other'
  ];
  var DATE_COLUMNS = ['lastContact', 'nextFollowUp', 'followUp'];
  var TEXTAREA_COLUMNS = ['context', 'notes'];

  var escapeAttr = function(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  };

  var getInputType = function(col) {
    if (DATE_COLUMNS.indexOf(col) !== -1) return 'date';
    if (TEXTAREA_COLUMNS.indexOf(col) !== -1) return 'textarea';
    if (col === 'relationship') return 'select-relationship';
    return 'text';
  };

  var ensureCrmModal = function() {
    if (document.getElementById('crmRecordModal')) return;
    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'crmRecordModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'crmRecordModalTitle');
    modal.innerHTML =
      '<div class="modal-content">' +
        '<div class="modal-header">' +
          '<h2 id="crmRecordModalTitle">Edit Contact</h2>' +
          '<button class="modal-close" type="button" data-crm-modal-action="close" aria-label="Close dialog">&times;</button>' +
        '</div>' +
        '<div class="modal-body">' +
          '<form id="crmRecordForm" onsubmit="return false;"></form>' +
        '</div>' +
        '<div class="modal-footer">' +
          '<button type="button" class="btn btn-secondary" id="crmRecordDelete" style="margin-right:auto;">Delete</button>' +
          '<button type="button" class="btn btn-secondary" data-crm-modal-action="close">Cancel</button>' +
          '<button type="button" class="btn btn-primary" id="crmRecordSave">Save</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    // Close on backdrop click or any element marked data-crm-modal-action="close"
    modal.addEventListener('click', function(e) {
      var t = e.target;
      if (t === modal) { closeCrmModal(); return; }
      if (t.dataset && t.dataset.crmModalAction === 'close') { closeCrmModal(); }
    });
    // ESC to close (attached once, no-op when modal isn't open)
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && modal.classList.contains('active')) {
        closeCrmModal();
      }
    });
  };

  var closeCrmModal = function() {
    var modal = document.getElementById('crmRecordModal');
    if (modal) modal.classList.remove('active');
  };

  var openCrmRecordModal = function(dataKey, itemId) {
    ensureCrmModal();
    var modal = document.getElementById('crmRecordModal');
    var form = document.getElementById('crmRecordForm');
    var titleEl = document.getElementById('crmRecordModalTitle');
    var deleteBtn = document.getElementById('crmRecordDelete');
    var saveBtn = document.getElementById('crmRecordSave');

    var columns = getColumnsForDataKey(dataKey);
    var existing = (itemId && dataCache[dataKey] && dataCache[dataKey][itemId])
      ? dataCache[dataKey][itemId] : null;
    var isEdit = !!existing;

    titleEl.textContent = isEdit ? 'Edit Contact' : 'Add Contact';
    deleteBtn.style.display = isEdit ? '' : 'none';

    // Build form fields per column
    var html = '';
    columns.forEach(function(col) {
      var label = formatColumnHeader(col);
      var val = existing ? (existing[col] != null ? existing[col] : '') : '';
      var requiredAttr = col === 'name' ? ' required' : '';
      var requiredMark = col === 'name' ? ' *' : '';
      var type = getInputType(col);
      var fieldId = 'crm-field-' + col;
      html += '<div class="form-group">';
      html += '<label for="' + fieldId + '">' + label + requiredMark + '</label>';
      if (type === 'date') {
        html += '<input type="date" id="' + fieldId + '" data-crm-field="' + col + '" value="' + escapeAttr(val) + '">';
      } else if (type === 'textarea') {
        html += '<textarea id="' + fieldId + '" data-crm-field="' + col + '" rows="4" placeholder="Long-form notes, history, why they matter...">' + escapeAttr(val) + '</textarea>';
      } else if (type === 'select-relationship') {
        html += '<select id="' + fieldId + '" data-crm-field="' + col + '">';
        html += '<option value="">— Select —</option>';
        var hasMatch = false;
        RELATIONSHIP_OPTIONS.forEach(function(opt) {
          var selected = (opt === val) ? ' selected' : '';
          if (opt === val) hasMatch = true;
          html += '<option value="' + escapeAttr(opt) + '"' + selected + '>' + escapeAttr(opt) + '</option>';
        });
        // Preserve any existing custom value not in our preset list
        if (val && !hasMatch) {
          html += '<option value="' + escapeAttr(val) + '" selected>' + escapeAttr(val) + '</option>';
        }
        html += '</select>';
      } else {
        html += '<input type="text" id="' + fieldId + '" data-crm-field="' + col + '" value="' + escapeAttr(val) + '"' + requiredAttr + '>';
      }
      html += '</div>';
    });
    form.innerHTML = html;

    // Save: gather fields, preserve unmapped legacy keys (e.g. old Damar
    // pipeline/introStatus/strength), write to Firebase.
    saveBtn.onclick = function() {
      var record = isEdit ? cloneRecord(existing) : {};
      var fields = form.querySelectorAll('[data-crm-field]');
      var nameField = '';
      Array.prototype.forEach.call(fields, function(f) {
        var col = f.dataset.crmField;
        var v = f.value || '';
        if (col === 'name') nameField = v.trim();
        record[col] = v;
      });
      if (!nameField) {
        alert('Name is required.');
        return;
      }
      record.updated = new Date().toISOString();
      if (!isEdit) record.created = new Date().toISOString();
      saveCrmRecord(dataKey, itemId, record);
    };

    // Delete (edit mode only)
    deleteBtn.onclick = function() {
      if (!isEdit) return;
      if (!confirm('Delete this record?')) return;
      deleteCrmRecord(dataKey, itemId);
    };

    modal.classList.add('active');
    // Focus first field after the modal becomes visible
    setTimeout(function() {
      var first = form.querySelector('[data-crm-field]');
      if (first) first.focus();
    }, 50);
  };

  // Shallow clone so we don't mutate the cached object before the write succeeds.
  var cloneRecord = function(obj) {
    var out = {};
    for (var k in obj) {
      if (obj.hasOwnProperty(k)) out[k] = obj[k];
    }
    return out;
  };

  var saveCrmRecord = function(dataKey, itemId, record) {
    var path = CONFIG.firebasePaths[getFirebasePath(dataKey)];
    var finalize = function(savedKey) {
      dataCache[dataKey] = dataCache[dataKey] || {};
      dataCache[dataKey][savedKey] = record;
      closeCrmModal();
      renderTableData(dataKey, '');
      updateBadge(dataKey, Object.keys(dataCache[dataKey]).length);
    };
    if (typeof firebase === 'undefined') {
      // Offline fallback: keep editing usable even when Firebase isn't loaded.
      finalize(itemId || ('local-' + Date.now()));
      return;
    }
    var ref = itemId
      ? firebase.database().ref(path + '/' + itemId)
      : firebase.database().ref(path).push();
    ref.set(record, function(error) {
      if (error) { alert('Error saving: ' + error.message); return; }
      finalize(itemId || ref.key);
    });
  };

  var deleteCrmRecord = function(dataKey, itemId) {
    var path = CONFIG.firebasePaths[getFirebasePath(dataKey)];
    var finalize = function() {
      if (dataCache[dataKey]) delete dataCache[dataKey][itemId];
      closeCrmModal();
      renderTableData(dataKey, '');
      updateBadge(dataKey, Object.keys(dataCache[dataKey] || {}).length);
    };
    if (typeof firebase === 'undefined') { finalize(); return; }
    firebase.database().ref(path + '/' + itemId).remove(function(error) {
      if (error) { alert('Error deleting: ' + error.message); return; }
      finalize();
    });
  };

  // ===== QUICK NOTE SYSTEM =====
  // One-line timestamped notes that prepend to a record's `context` field.
  // Last Contact is computed live as max(lastNoteAt, latest matching email
  // in INBOX_EMAILS) so it auto-updates when Gmail data flows in.

  var MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // "Apr 26" style stamp used to prefix quick notes inside the context blob.
  var formatNoteDateStamp = function(d) {
    return MONTH_ABBR[d.getMonth()] + ' ' + d.getDate();
  };

  // Normalize any of (ISO datetime / YYYY-MM-DD / null) to YYYY-MM-DD or null.
  // Used to compare disparate date fields against each other.
  var toDateOnly = function(s) {
    if (!s) return null;
    var str = String(s);
    return str.length >= 10 ? str.substring(0, 10) : null;
  };

  // Returns the most recent "we were in touch" date for a lead, derived from:
  //   - lead.lastNoteAt (set by addQuickNoteToLead)
  //   - sentDate of any INBOX_EMAILS entry whose company matches the lead
  // Returns YYYY-MM-DD or null when no signal exists.
  var getLastContactDate = function(lead) {
    if (!lead) return null;
    var candidates = [];
    var n = toDateOnly(lead.lastNoteAt);
    if (n) candidates.push(n);
    if (typeof window.INBOX_EMAILS !== 'undefined' && Array.isArray(window.INBOX_EMAILS)) {
      var company = (lead.company || '').toLowerCase();
      if (company) {
        window.INBOX_EMAILS.forEach(function(e) {
          if (!e || !e.company || !e.sentDate) return;
          if (e.company.toLowerCase() !== company) return;
          var d = toDateOnly(e.sentDate);
          if (d) candidates.push(d);
        });
      }
    }
    if (!candidates.length) return null;
    return candidates.reduce(function(max, x) { return x > max ? x : max; });
  };

  // Friendly relative-time display: "today", "3d ago", "Apr 24", "never".
  var formatLastContact = function(dateStr) {
    if (!dateStr) return 'never';
    var parts = String(dateStr).split('-');
    if (parts.length < 3) return 'never';
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(d.getTime())) return 'never';
    var now = new Date();
    var t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var days = Math.round((t0 - d) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'in ' + (-days) + 'd';
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 14) return days + 'd ago';
    return formatNoteDateStamp(d);
  };

  // Lightweight modal reused for all Quick Note flows. State lives in the
  // closure below; only one note is in flight at a time.
  var quickNoteState = { onSave: null };

  var ensureQuickNoteModal = function() {
    if (document.getElementById('quickNoteModal')) return;
    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'quickNoteModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML =
      '<div class="modal-content" style="max-width:440px;">' +
        '<div class="modal-header">' +
          '<h2 id="quickNoteTitle">Quick Note</h2>' +
          '<button class="modal-close" type="button" data-qn-action="close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="modal-body">' +
          '<div class="form-group">' +
            '<label for="quickNoteInput">Adds a date-stamped line to the top of context.</label>' +
            '<textarea id="quickNoteInput" rows="3" placeholder="e.g. Joe replied, sending the dashboard Friday"></textarea>' +
          '</div>' +
          '<div style="font-size:11px;color:var(--text-secondary, #8b949e);margin-top:-8px;">' +
            'Tip: hit Enter to save, Shift+Enter for a new line.' +
          '</div>' +
        '</div>' +
        '<div class="modal-footer">' +
          '<button type="button" class="btn btn-secondary" data-qn-action="close">Cancel</button>' +
          '<button type="button" class="btn btn-primary" id="quickNoteSave">Add Note</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    modal.addEventListener('click', function(e) {
      var t = e.target;
      if (t === modal) { modal.classList.remove('active'); return; }
      if (t.dataset && t.dataset.qnAction === 'close') { modal.classList.remove('active'); }
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && modal.classList.contains('active')) {
        modal.classList.remove('active');
      }
    });
    document.getElementById('quickNoteSave').addEventListener('click', function() {
      var text = document.getElementById('quickNoteInput').value.trim();
      if (!text) { alert('Type a note first.'); return; }
      if (typeof quickNoteState.onSave === 'function') quickNoteState.onSave(text);
      modal.classList.remove('active');
    });
    document.getElementById('quickNoteInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('quickNoteSave').click();
      }
    });
  };

  var openQuickNote = function(title, onSave) {
    ensureQuickNoteModal();
    document.getElementById('quickNoteTitle').textContent = title || 'Quick Note';
    document.getElementById('quickNoteInput').value = '';
    quickNoteState.onSave = onSave;
    document.getElementById('quickNoteModal').classList.add('active');
    setTimeout(function() {
      var input = document.getElementById('quickNoteInput');
      if (input) input.focus();
    }, 50);
  };

  // Prepend "[Apr 26] text" to context. Notes are newest-first, one per line.
  var prependNoteToContext = function(existing, text) {
    var line = '[' + formatNoteDateStamp(new Date()) + '] ' + text;
    if (!existing) return line;
    return line + '\n' + existing;
  };

  // ----- Lead-side quick note (opp cards) -----
  jabaCustom.addQuickNoteToLead = function(leadId, event) {
    if (event) {
      event.stopPropagation && event.stopPropagation();
      event.preventDefault && event.preventDefault();
    }
    var leads = getLeadsArray();
    var lead = leads.find(function(l) { return l.id === leadId; });
    if (!lead) return;
    openQuickNote('Quick Note: ' + (lead.company || 'lead'), function(text) {
      lead.context = prependNoteToContext(lead.context, text);
      lead.lastNoteAt = new Date().toISOString();
      if (typeof window.saveleads === 'function') window.saveleads();
      // Re-render whichever card grids are visible
      if (typeof renderAgencyBoard === 'function') renderAgencyBoard();
      if (typeof renderBrandBoard === 'function') renderBrandBoard();
      if (typeof renderTeamBoard === 'function') renderTeamBoard();
    });
  };

  // ----- CRM-side quick note (Jordon CRM, Damar CRM table rows) -----
  jabaCustom.addQuickNoteToCrm = function(dataKey, itemId) {
    var item = dataCache[dataKey] && dataCache[dataKey][itemId];
    if (!item) return;
    openQuickNote('Quick Note: ' + (item.name || ''), function(text) {
      var updated = {};
      for (var k in item) { if (item.hasOwnProperty(k)) updated[k] = item[k]; }
      updated.context = prependNoteToContext(item.context, text);
      // Auto-bump Last Contact when the user logs a touch via Quick Note.
      updated.lastContact = todayISO();
      updated.updated = new Date().toISOString();
      var path = CONFIG.firebasePaths[getFirebasePath(dataKey)];
      var finalize = function() {
        dataCache[dataKey][itemId] = updated;
        renderTableData(dataKey, '');
      };
      if (typeof firebase === 'undefined') { finalize(); return; }
      firebase.database().ref(path + '/' + itemId).set(updated, function(err) {
        if (err) { alert('Error saving note: ' + err.message); return; }
        finalize();
      });
    });
  };

  // Expose the lead-side last-contact helper so renderOppCard can call it.
  jabaCustom.getLastContactDate = getLastContactDate;
  jabaCustom.formatLastContact = formatLastContact;

  // ===== ONE-CLICK IMPORTER FOR JORDON CRM (Notion CSV export) =====
  // Reads /jordon-crm-import.json (saved alongside index.html) and pushes
  // each record to Firebase under jordonCRM. Skips duplicates by name +
  // importSource so re-clicking is safe.
  jabaCustom.importJordonCrmFromFile = function() {
    var btn = document.getElementById('jordonImportBtn');
    var banner = document.getElementById('jordonImportBanner');
    var setStatus = function(text, isError) {
      if (!btn) return;
      btn.textContent = text;
      btn.disabled = !!isError ? false : true;
      btn.style.opacity = isError ? '1' : '0.7';
      if (isError) btn.style.background = '#ff6b6b';
    };

    if (typeof firebase === 'undefined' || !firebase.database) {
      alert('Firebase not loaded. Refresh the page and try again.');
      return;
    }

    // Wraps a promise with a hard timeout so a Firebase outage doesn't leave
    // the button hanging forever.
    var withTimeout = function(promise, ms, label) {
      return Promise.race([
        promise,
        new Promise(function(_, reject) {
          setTimeout(function() {
            reject(new Error(label + ' timed out (' + Math.round(ms / 1000) + 's). Firebase may be down — check the Firebase Console.'));
          }, ms);
        })
      ]);
    };

    setStatus('Loading file...');
    fetch('/jordon-crm-import.json')
      .then(function(res) {
        if (!res.ok) throw new Error('jordon-crm-import.json not found (HTTP ' + res.status + ')');
        return res.json();
      })
      .then(function(records) {
        setStatus('Checking for duplicates...');
        return withTimeout(
          firebase.database().ref('jordonCRM').once('value'),
          10000,
          'Firebase read'
        ).then(function(snap) {
          var existing = snap.val() || {};
          var existingKeys = new Set(Object.values(existing).map(function(it) {
            return (it.importSource || '') + '::' + ((it.name || '').toLowerCase());
          }));
          return { records: records, existingKeys: existingKeys };
        });
      })
      .then(function(ctx) {
        var pending = ctx.records.filter(function(r) {
          return !ctx.existingKeys.has((r.importSource || '') + '::' + ((r.name || '').toLowerCase()));
        });
        if (pending.length === 0) {
          setStatus('Already imported \u2713');
          if (banner) banner.style.background = 'rgba(0,184,148,0.08)';
          return;
        }
        setStatus('Importing 0 / ' + pending.length + '...');
        var ref = firebase.database().ref('jordonCRM');
        // Push records in sequence so we can show progress.
        var i = 0;
        var pushNext = function() {
          if (i >= pending.length) {
            setStatus('Imported ' + pending.length + ' \u2713');
            if (banner) banner.style.background = 'rgba(0,184,148,0.08)';
            // Trigger a fresh sync so the table updates.
            if (typeof syncFirebaseData === 'function') syncFirebaseData();
            setTimeout(function() { renderTableData('jordonCRM', ''); }, 800);
            return;
          }
          ref.push().set(pending[i], function(err) {
            if (err) {
              setStatus('Error at ' + i + ': ' + err.message, true);
              return;
            }
            i++;
            setStatus('Importing ' + i + ' / ' + pending.length + '...');
            // Yield to the event loop so the UI updates between writes.
            setTimeout(pushNext, 10);
          });
        };
        pushNext();
      })
      .catch(function(err) {
        console.error('Jordon CRM import failed:', err);
        setStatus('Import failed: ' + err.message, true);
      });
  };

  // ===== CRUD OPERATIONS =====
  jabaCustom.handleAddNew = function(dataKey) {
    openCrmRecordModal(dataKey, null);
  };

  jabaCustom.handleEdit = function(dataKey, itemId) {
    openCrmRecordModal(dataKey, itemId);
  };

  jabaCustom.handleDelete = function(dataKey, itemId) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    deleteCrmRecord(dataKey, itemId);
  };

  var getFirebasePath = function(dataKey) {
    var pathMap = {
      'investors': 'investors',
      'athlete_investors': 'athleteInvestors',
      'damarCRM': 'damarCRM',
      'jordonCRM': 'jordonCRM'
    };
    return pathMap[dataKey] || dataKey;
  };

  // ===== SECTION SPECIFIC RENDERS =====
  jabaCustom.renderInvestors = function() {
    renderTableData('investors', '');
  };

  jabaCustom.renderAthleteInvestors = function() {
    renderTableData('athlete_investors', '');
  };

  jabaCustom.renderDamarCRM = function() {
    renderTableData('damarCRM', '');
  };

  jabaCustom.renderJordonCRM = function() {
    renderTableData('jordonCRM', '');
  };

  // ===== SEARCH FUNCTIONALITY =====
  var setupSearch = function() {
    document.addEventListener('input', function(e) {
      if (e.target.classList.contains('jaba-section-search')) {
        var dataKey = e.target.dataset.searchFor;
        renderTableData(dataKey, e.target.value);
      }
    });
  };

  // ===== EXPOSE LEADS ARRAY =====
  function hookLeadsArray() {
    if (typeof leads !== 'undefined' && Array.isArray(leads) && leads.length > 0) {
      window.__leads = leads;
      updateCardGridBadges();
      return;
    }
    try {
      var stored = JSON.parse(localStorage.getItem('bd_leads_v26') || '[]');
      if (stored.length > 0) {
        window.__leads = stored;
        updateCardGridBadges();
        return;
      }
    } catch(e) {}

    setTimeout(hookLeadsArray, 1000);
  }

  // ===== INITIALIZATION =====
  var init = function() {
    injectStyles();
    createSidebar();
    createCustomSections();
    setupSearch();

    setTimeout(syncFirebaseData, 1000);
    setTimeout(syncBadgesFromTopTabs, 2000);

    hookLeadsArray();

    window.addEventListener('storage', function(e) {
      if (e.key === 'bd_leads_v26') {
        try {
          window.__leads = JSON.parse(e.newValue || '[]');
          updateCardGridBadges();
        } catch(err) {}
      }
    });

    if (typeof window.switchSection === 'function') {
      var originalSwitchSection = window.switchSection;
      window.switchSection = function(sectionName) {
        var item = document.querySelector('[data-item-id="' + sectionName + '"]');
        if (item) {
          document.querySelectorAll('.jaba-sidebar-item').forEach(function(el) {
            el.classList.remove('active');
          });
          item.classList.add('active');

          document.querySelectorAll('.jaba-custom-section').forEach(function(section) {
            section.classList.remove('active');
          });
          activeCustomSection = null;
        }

        return originalSwitchSection(sectionName);
      };
    }

    console.log('JABA Custom v4 initialized — liquid glass sidebar + compact pills');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ===== CROSS-MODULE ACCESSORS (for the briefing/dashboard) =====
  // Returns a flat array of follow-ups across all CRM dataKeys, sorted by
  // most overdue first. Items without a nextFollowUp are excluded.
  // Shape: [{ name, source, dataKey, itemId, date, daysFromToday }]
  jabaCustom.getCrmFollowUps = function() {
    var sources = [
      { dataKey: 'jordonCRM', source: 'Jordon CRM' },
      { dataKey: 'damarCRM', source: 'Damar CRM' }
    ];
    var out = [];
    sources.forEach(function(s) {
      var data = dataCache[s.dataKey] || {};
      for (var key in data) {
        if (!data.hasOwnProperty(key)) continue;
        var item = data[key];
        if (!item || !item.nextFollowUp) continue;
        var d = daysFromToday(item.nextFollowUp);
        if (d === null) continue;
        out.push({
          name: item.name || '(unnamed)',
          source: s.source,
          dataKey: s.dataKey,
          itemId: key,
          date: item.nextFollowUp,
          daysFromToday: d,
          relationship: item.relationship || '',
          context: item.context || ''
        });
      }
    });
    out.sort(function(a, b) { return a.daysFromToday - b.daysFromToday; });
    return out;
  };

  // Expose the helpers used by the briefing for date math, so the dashboard
  // doesn't need to reimplement them.
  jabaCustom.daysFromToday = daysFromToday;
  jabaCustom.classifyFollowUp = classifyFollowUp;
  jabaCustom.todayISO = todayISO;

  // Programmatic open of a CRM record from the briefing (used by click-throughs).
  jabaCustom.openRecord = function(dataKey, itemId) {
    if (typeof window.switchSection === 'function') {
      // Briefing lives outside the custom sections; the sidebar item handler
      // hides builtins and shows the right custom section. Simulate by
      // clicking the matching sidebar item.
      var sidebarItem = document.querySelector('[data-item-id="' + dataKey + '"]');
      if (sidebarItem) sidebarItem.click();
    }
    // Once the section is visible, open the editor.
    setTimeout(function() {
      openCrmRecordModal(dataKey, itemId);
    }, 50);
  };

  jabaCustom.init = init;
  jabaCustom.syncFirebaseData = syncFirebaseData;

})();
