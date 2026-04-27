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
      clientData: 'clientData',
      approvals: 'approvals'
    }
  };

  var dataCache = {
    investors: {},
    athleteInvestors: {},
    damarCRM: {},
    clientData: {},
    approvals: {}
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

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

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

  function getStageStyle(stage, isUnworked) {
    if (isUnworked) return 'background:rgba(139,148,158,0.14);color:var(--text-secondary);';
    var stageColors = {
      lead: '#a29bfe', contacted: '#74b9ff', meeting_scheduled: '#81ecec',
      scrape: '#ffeaa7', building: '#fab1a0', auditing: '#d6c5ff',
      ready: '#55efc4', meeting_complete: '#00b894', report_sent: '#74b9ff',
      contract_sent: '#fd79a8', client: '#E2F500', onhold: '#8b949e'
    };
    var bg = stageColors[stage] || '#30363d';
    var fg = (stage === 'client' || stage === 'scrape') ? '#000' : '#fff';
    return 'background:' + bg + ';color:' + fg + ';';
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
          { name: 'Leads', id: 'leads', section: 'leadsSection', type: 'builtin', badge: true },
          { name: 'Schools', id: 'schools', section: 'schoolsSection', type: 'builtin', badge: 'schools' }
        ]
      },
      {
        label: 'OPPORTUNITIES',
        items: [
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
          { name: 'Damar CRM', id: 'damarCRM', section: 'damarCRMSection', type: 'custom', badge: 'generic' },
          { name: 'Clients', id: 'clientData', section: 'clientDataSection', type: 'custom', badge: 'generic' },
          { name: 'Client Dashboard', id: 'clientDash', section: 'clientDashSection', type: 'custom' }
        ]
      },
      {
        label: 'ACTIVITY',
        items: [
          { name: 'Approvals', id: 'approvals', section: 'approvalsSection', type: 'custom', badge: 'generic' }
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

        if (item.badge) {
          var badge = document.createElement('div');
          badge.className = 'jaba-badge';
          if (typeof item.badge === 'string' && item.badge !== true) {
            badge.classList.add(item.badge);
          }
          badge.dataset.badgeKey = item.id;
          badge.textContent = '0';
          itemDiv.appendChild(badge);
        }

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
    loadFirebaseData(CONFIG.firebasePaths.clientData, function(data) {
      dataCache.clientData = data;
      updateBadge('clientData', Object.keys(data).length);
    });
    loadFirebaseData(CONFIG.firebasePaths.approvals, function(data) {
      dataCache.approvals = data;
      updateBadge('approvals', Object.keys(data).length);
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
        '<span>' + followUpText + '</span>' +
        '<span>' + contactCount + ' contact' + (contactCount !== 1 ? 's' : '') + '</span>' +
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

    var damarSection = document.createElement('div');
    damarSection.id = 'damarCRMSection';
    damarSection.className = 'jaba-custom-section';
    damarSection.innerHTML = createTableSectionHTML('Damar CRM', 'damarCRM', ['name', 'org', 'pipeline', 'introStatus', 'strength', 'notes']);
    container.appendChild(damarSection);

    var clientsSection = document.createElement('div');
    clientsSection.id = 'clientDataSection';
    clientsSection.className = 'jaba-custom-section';
    clientsSection.innerHTML = createTableSectionHTML('Clients', 'clientData', ['name', 'status']);
    container.appendChild(clientsSection);

    var dashboardSection = document.createElement('div');
    dashboardSection.id = 'clientDashSection';
    dashboardSection.className = 'jaba-custom-section';
    var dashboardHTML = '<div class="jaba-section-header"><h1 class="jaba-section-title">Client Dashboard</h1></div>';
    dashboardHTML += '<div class="jaba-stats-container">';
    dashboardHTML += '<div class="jaba-stat-card"><div class="jaba-stat-number" id="stat-total-clients">0</div><div class="jaba-stat-label">Total Clients</div></div>';
    dashboardHTML += '<div class="jaba-stat-card"><div class="jaba-stat-number" id="stat-total-crm">0</div><div class="jaba-stat-label">CRM Contacts</div></div>';
    dashboardHTML += '<div class="jaba-stat-card"><div class="jaba-stat-number" id="stat-total-approvals">0</div><div class="jaba-stat-label">Pending Approvals</div></div>';
    dashboardHTML += '</div>';
    dashboardSection.innerHTML = dashboardHTML;
    container.appendChild(dashboardSection);

    var approvalsSection = document.createElement('div');
    approvalsSection.id = 'approvalsSection';
    approvalsSection.className = 'jaba-custom-section';
    var approvalsHTML = '<div class="jaba-section-header"><h1 class="jaba-section-title">Approvals</h1></div>';
    approvalsHTML += '<button class="jaba-btn jaba-btn-add" onclick="jabaCustom.renderApprovalsSection()">Refresh</button>';
    approvalsHTML += '<div id="approvals-container" class="jaba-card-grid"></div>';
    approvalsSection.innerHTML = approvalsHTML;
    container.appendChild(approvalsSection);
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
      html += '<th>' + col.charAt(0).toUpperCase() + col.slice(1) + '</th>';
    });
    html += '<th>Actions</th></tr></thead>';
    html += '<tbody id="tbody-' + dataKey + '"></tbody>';
    html += '</table>';
    return html;
  };

  // ===== RENDERING FUNCTIONS (Firebase tables) =====
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
          for (var col in columns) {
            if (columns.hasOwnProperty(col)) {
              var val = item[columns[col]];
              if (val && val.toString().toLowerCase().indexOf(searchTerm.toLowerCase()) !== -1) {
                matches = true;
                break;
              }
            }
          }
          if (!matches) continue;
        }
        rows.push(item);
      }
    }

    tbody.innerHTML = '';
    rows.forEach(function(item) {
      var tr = document.createElement('tr');
      columns.forEach(function(col) {
        var td = document.createElement('td');
        var val = item[col] || '';
        if (col === 'status') {
          var statusClass = 'jaba-status-' + (val.toLowerCase() || 'unworked');
          td.innerHTML = '<span class="jaba-status-badge ' + statusClass + '">' + val + '</span>';
        } else if (col === 'strength') {
          td.textContent = renderStars(val);
        } else {
          td.textContent = val;
        }
        tr.appendChild(td);
      });

      var actionsTd = document.createElement('td');
      actionsTd.innerHTML = '<button class="jaba-btn jaba-btn-edit" onclick="jabaCustom.handleEdit(\'' + dataKey + '\', \'' + item.id + '\')">Edit</button>' +
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

  var renderApprovalsSection = function() {
    var data = dataCache.approvals || {};
    var container = document.getElementById('approvals-container');
    if (!container) return;

    container.innerHTML = '';
    for (var key in data) {
      if (data.hasOwnProperty(key)) {
        var item = data[key];
        var card = document.createElement('div');
        card.className = 'jaba-card';
        var name = item.name || 'Unnamed Item';
        var status = item.status || 'pending';
        card.innerHTML = '<div class="jaba-card-title">' + name + '</div>' +
                         '<div class="jaba-card-content"><strong>Status:</strong> ' + status + '<br>' +
                         (item.notes ? '<strong>Notes:</strong> ' + item.notes : '') + '</div>' +
                         '<div class="jaba-card-actions">' +
                         '<button class="jaba-btn jaba-btn-approve" onclick="jabaCustom.handleApprove(\'' + key + '\')">Approve</button>' +
                         '<button class="jaba-btn jaba-btn-reject" onclick="jabaCustom.handleReject(\'' + key + '\')">Reject</button>' +
                         '<button class="jaba-btn jaba-btn-edit" onclick="jabaCustom.handleEdit(\'approvals\', \'' + key + '\')">Edit</button>' +
                         '<button class="jaba-btn jaba-btn-delete" onclick="jabaCustom.handleDelete(\'approvals\', \'' + key + '\')">Delete</button>' +
                         '</div>';
        container.appendChild(card);
      }
    }
  };

  var updateClientDashboard = function() {
    var el1 = document.getElementById('stat-total-clients');
    var el2 = document.getElementById('stat-total-crm');
    var el3 = document.getElementById('stat-total-approvals');
    if (el1) el1.textContent = Object.keys(dataCache.clientData).length;
    if (el2) el2.textContent = Object.keys(dataCache.damarCRM).length;
    if (el3) el3.textContent = Object.keys(dataCache.approvals).length;
  };

  var getColumnsForDataKey = function(dataKey) {
    var columnsMap = {
      'investors': ['name', 'contact', 'title', 'status', 'notes'],
      'athlete_investors': ['name', 'sport', 'status', 'notes'],
      'damarCRM': ['name', 'org', 'pipeline', 'introStatus', 'strength', 'notes'],
      'clientData': ['name', 'status']
    };
    return columnsMap[dataKey] || [];
  };

  // ===== CRUD OPERATIONS =====
  jabaCustom.handleAddNew = function(dataKey) {
    var itemName = prompt('Enter ' + dataKey + ' name:');
    if (!itemName) return;
    var newItem = { name: itemName, status: 'unworked', created: new Date().toISOString() };
    if (typeof firebase !== 'undefined') {
      var newRef = firebase.database().ref(CONFIG.firebasePaths[getFirebasePath(dataKey)]).push();
      newRef.set(newItem, function(error) {
        if (error) { alert('Error adding item: ' + error.message); }
        else {
          dataCache[dataKey][newRef.key] = newItem;
          renderTableData(dataKey, '');
          updateBadge(dataKey, Object.keys(dataCache[dataKey]).length);
        }
      });
    }
  };

  jabaCustom.handleEdit = function(dataKey, itemId) {
    var item = dataCache[dataKey] && dataCache[dataKey][itemId];
    if (!item) return;
    var newName = prompt('Edit name:', item.name || '');
    if (newName === null) return;
    item.name = newName;
    item.updated = new Date().toISOString();
    if (typeof firebase !== 'undefined') {
      var path = CONFIG.firebasePaths[getFirebasePath(dataKey)];
      firebase.database().ref(path + '/' + itemId).set(item, function(error) {
        if (error) { alert('Error updating item: ' + error.message); }
        else { renderTableData(dataKey, ''); }
      });
    }
  };

  jabaCustom.handleDelete = function(dataKey, itemId) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    if (typeof firebase !== 'undefined') {
      var path = CONFIG.firebasePaths[getFirebasePath(dataKey)];
      firebase.database().ref(path + '/' + itemId).remove(function(error) {
        if (error) { alert('Error deleting item: ' + error.message); }
        else {
          delete dataCache[dataKey][itemId];
          renderTableData(dataKey, '');
          updateBadge(dataKey, Object.keys(dataCache[dataKey]).length);
        }
      });
    }
  };

  jabaCustom.handleApprove = function(itemId) {
    var item = dataCache.approvals[itemId];
    if (!item) return;
    item.status = 'approved';
    item.updated = new Date().toISOString();
    if (typeof firebase !== 'undefined') {
      firebase.database().ref('approvals/' + itemId).set(item, function(error) {
        if (error) { alert('Error approving item: ' + error.message); }
        else { renderApprovalsSection(); }
      });
    }
  };

  jabaCustom.handleReject = function(itemId) {
    var item = dataCache.approvals[itemId];
    if (!item) return;
    item.status = 'rejected';
    item.updated = new Date().toISOString();
    if (typeof firebase !== 'undefined') {
      firebase.database().ref('approvals/' + itemId).set(item, function(error) {
        if (error) { alert('Error rejecting item: ' + error.message); }
        else { renderApprovalsSection(); }
      });
    }
  };

  jabaCustom.renderApprovalsSection = function() {
    syncFirebaseData();
    setTimeout(renderApprovalsSection, 500);
  };

  var getFirebasePath = function(dataKey) {
    var pathMap = {
      'investors': 'investors',
      'athlete_investors': 'athleteInvestors',
      'damarCRM': 'damarCRM',
      'clientData': 'clientData',
      'approvals': 'approvals'
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
    updateClientDashboard();
  };

  jabaCustom.renderClientData = function() {
    renderTableData('clientData', '');
    updateClientDashboard();
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

  jabaCustom.init = init;
  jabaCustom.renderApprovalsSection = renderApprovalsSection;
  jabaCustom.syncFirebaseData = syncFirebaseData;

})();
