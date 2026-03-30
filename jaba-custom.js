// JABA Custom CRM Sidebar & Tabs Module v2
// Adds left sidebar navigation and custom tabs for Firebase-backed sections

(function() {
  'use strict';

  // Expose namespace for external access
  var jabaCustom = window.jabaCustom || {};
  window.jabaCustom = jabaCustom;

  // Constants
  var CONFIG = {
    sidebarWidth: '240px',
    animationDuration: '200ms',
    firebasePaths: {
      agencies: 'agencies',
      brands: 'brands',
      leaguesTeams: 'leagues_teams',
      investors: 'investors',
      athleteInvestors: 'athlete_investors',
      damarCRM: 'damarCRM',
      clientData: 'clientData',
      approvals: 'approvals'
    }
  };

  // Cache for Firebase data
  var dataCache = {
    agencies: {},
    brands: {},
    leaguesTeams: {},
    investors: {},
    athleteInvestors: {},
    damarCRM: {},
    clientData: {},
    approvals: {}
  };

  // Current active custom section
  var activeCustomSection = null;

  // ===== STYLES =====
  var injectStyles = function() {
    var styleId = 'jaba-custom-styles-v2';
    if (document.getElementById(styleId)) return;

    var style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* Hide original top tabs */
      .top-tabs {
        display: none !important;
      }

      /* Sidebar container */
      .jaba-sidebar {
        position: fixed;
        left: 0;
        top: 0;
        width: ${CONFIG.sidebarWidth};
        height: 100vh;
        background: var(--bg-secondary, #1a1d27);
        border-right: 1px solid var(--border, #30363d);
        overflow-y: auto;
        overflow-x: hidden;
        z-index: 999;
        font-family: "DM Sans", sans-serif;
        padding: 16px 0;
      }

      .jaba-sidebar::-webkit-scrollbar {
        width: 6px;
      }

      .jaba-sidebar::-webkit-scrollbar-track {
        background: transparent;
      }

      .jaba-sidebar::-webkit-scrollbar-thumb {
        background: var(--border, #30363d);
        border-radius: 3px;
      }

      .jaba-sidebar::-webkit-scrollbar-thumb:hover {
        background: var(--text-secondary, #8b949e);
      }

      /* Sidebar section group */
      .jaba-sidebar-section {
        padding: 12px 0;
      }

      .jaba-sidebar-section:not(:first-child) {
        border-top: 1px solid var(--border, #30363d);
        margin-top: 8px;
      }

      /* Section divider label */
      .jaba-sidebar-divider {
        padding: 12px 16px 8px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--text-secondary, #8b949e);
        letter-spacing: 0.5px;
      }

      /* Sidebar item */
      .jaba-sidebar-item {
        display: flex;
        align-items: center;
        padding: 10px 16px;
        cursor: pointer;
        color: var(--text-primary, #e6edf3);
        transition: background-color ${CONFIG.animationDuration} ease;
        font-size: 13px;
        gap: 8px;
        border-left: 3px solid transparent;
        margin: 0 4px;
      }

      .jaba-sidebar-item:hover {
        background-color: var(--bg-tertiary, #232733);
      }

      .jaba-sidebar-item.active {
        background-color: var(--accent, #E2F500);
        color: var(--bg-primary, #0f1117);
        font-weight: 600;
        border-left-color: var(--accent, #E2F500);
      }

      /* Badge styles */
      .jaba-badge {
        margin-left: auto;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        background-color: var(--bg-tertiary, #232733);
        color: var(--text-primary, #e6edf3);
        min-width: 24px;
        text-align: center;
      }

      .jaba-badge.schools { background-color: var(--color-schools, #00b894); color: white; }
      .jaba-badge.teams { background-color: var(--color-teams, #0984e3); color: white; }
      .jaba-badge.athlete { background-color: var(--color-athlete, #e17055); color: white; }
      .jaba-badge.agencies { background-color: var(--color-agencies, #fdcb6e); color: #0f1117; }
      .jaba-badge.brands { background-color: var(--color-brands, #a29bfe); color: white; }
      .jaba-badge.investors { background-color: #6c5ce7; color: white; }
      .jaba-badge.generic { background-color: var(--text-secondary, #8b949e); color: white; }

      /* Content area adjustments */
      .container {
        margin-left: ${CONFIG.sidebarWidth};
        transition: margin-left ${CONFIG.animationDuration} ease;
      }

      .detail-panel {
        margin-left: ${CONFIG.sidebarWidth};
        transition: margin-left ${CONFIG.animationDuration} ease;
      }

      /* Custom section divs */
      .jaba-custom-section {
        display: none;
        padding: 24px;
        min-height: 100vh;
        background: var(--bg-primary, #0f1117);
      }

      .jaba-custom-section.active {
        display: block;
        animation: fadeIn ${CONFIG.animationDuration} ease;
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      /* Section header */
      .jaba-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 24px;
        gap: 16px;
      }

      .jaba-section-title {
        font-family: "Saira Extra Condensed", sans-serif;
        font-size: 28px;
        font-weight: 700;
        color: var(--text-primary, #e6edf3);
        margin: 0;
      }

      .jaba-section-search {
        flex: 1;
        max-width: 400px;
        padding: 8px 12px;
        background: var(--bg-secondary, #1a1d27);
        border: 1px solid var(--border, #30363d);
        border-radius: 6px;
        color: var(--text-primary, #e6edf3);
        font-size: 13px;
      }

      .jaba-section-search::placeholder {
        color: var(--text-secondary, #8b949e);
      }

      .jaba-section-search:focus {
        outline: none;
        border-color: var(--accent, #E2F500);
        box-shadow: 0 0 0 2px rgba(226, 245, 0, 0.1);
      }

      /* Stats container */
      .jaba-stats-container {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 12px;
        margin-bottom: 24px;
      }

      .jaba-stat-card {
        background: var(--glass-bg, rgba(26, 29, 39, 0.8));
        border: 1px solid var(--border, #30363d);
        border-radius: 8px;
        padding: 16px;
        text-align: center;
      }

      .jaba-stat-number {
        font-size: 24px;
        font-weight: 700;
        color: var(--accent, #E2F500);
        margin-bottom: 4px;
      }

      .jaba-stat-label {
        font-size: 12px;
        color: var(--text-secondary, #8b949e);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      /* Table styles */
      .jaba-table {
        width: 100%;
        border-collapse: collapse;
        background: var(--glass-bg, rgba(26, 29, 39, 0.8));
        border: 1px solid var(--border, #30363d);
        border-radius: 8px;
        overflow: hidden;
      }

      .jaba-table thead {
        background: var(--bg-secondary, #1a1d27);
        border-bottom: 1px solid var(--border, #30363d);
      }

      .jaba-table th {
        padding: 12px;
        text-align: left;
        font-size: 12px;
        font-weight: 600;
        color: var(--text-secondary, #8b949e);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .jaba-table td {
        padding: 12px;
        border-bottom: 1px solid var(--border, #30363d);
        font-size: 13px;
        color: var(--text-primary, #e6edf3);
      }

      .jaba-table tbody tr:hover {
        background: rgba(226, 245, 0, 0.03);
      }

      .jaba-table tbody tr:last-child td {
        border-bottom: none;
      }

      /* Status badge in table */
      .jaba-status-badge {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        text-transform: capitalize;
      }

      .jaba-status-unworked { background: var(--text-secondary, #8b949e); color: white; }
      .jaba-status-contacted { background: var(--color-agencies, #fdcb6e); color: #0f1117; }
      .jaba-status-meeting { background: var(--color-teams, #0984e3); color: white; }
      .jaba-status-pitched { background: var(--color-brands, #a29bfe); color: white; }
      .jaba-status-client { background: var(--color-schools, #00b894); color: white; }

      /* Action buttons */
      .jaba-btn {
        padding: 6px 12px;
        margin: 0 4px;
        border: none;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all ${CONFIG.animationDuration} ease;
      }

      .jaba-btn-edit {
        background: var(--accent, #E2F500);
        color: var(--bg-primary, #0f1117);
      }

      .jaba-btn-edit:hover {
        opacity: 0.8;
        transform: translateY(-1px);
      }

      .jaba-btn-delete {
        background: var(--color-athlete, #e17055);
        color: white;
      }

      .jaba-btn-delete:hover {
        opacity: 0.8;
        transform: translateY(-1px);
      }

      .jaba-btn-add {
        background: var(--accent, #E2F500);
        color: var(--bg-primary, #0f1117);
        padding: 10px 16px;
        font-size: 13px;
        margin-bottom: 16px;
      }

      .jaba-btn-add:hover {
        opacity: 0.8;
      }

      .jaba-btn-approve {
        background: var(--color-schools, #00b894);
        color: white;
      }

      .jaba-btn-reject {
        background: var(--color-athlete, #e17055);
        color: white;
      }

      /* Card grid for approvals */
      .jaba-card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 16px;
        margin-top: 16px;
      }

      .jaba-card {
        background: var(--glass-bg, rgba(26, 29, 39, 0.8));
        border: 1px solid var(--border, #30363d);
        border-radius: 8px;
        padding: 16px;
      }

      .jaba-card-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--accent, #E2F500);
        margin-bottom: 8px;
      }

      .jaba-card-content {
        font-size: 13px;
        color: var(--text-primary, #e6edf3);
        margin-bottom: 12px;
        line-height: 1.5;
      }

      .jaba-card-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      /* Stars for rating */
      .jaba-star {
        color: var(--accent, #E2F500);
        font-size: 12px;
      }

      /* Responsive adjustments */
      @media (max-width: 768px) {
        .jaba-sidebar {
          width: 200px;
          font-size: 12px;
        }

        .container,
        .detail-panel {
          margin-left: 200px;
        }

        .jaba-stats-container {
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        }
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
          { name: 'Agencies', id: 'agencies', section: 'agenciesSection', type: 'custom', badge: 'agencies' },
          { name: 'Brands', id: 'brands', section: 'brandsSection', type: 'custom', badge: 'brands' },
          { name: 'Teams & Leagues', id: 'leagues_teams', section: 'leaguesTeamsSection', type: 'custom', badge: 'teams' },
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
    // Update active state
    document.querySelectorAll('.jaba-sidebar-item').forEach(function(el) {
      el.classList.remove('active');
    });
    itemElement.classList.add('active');

    if (item.type === 'builtin') {
      // Hide all custom sections
      document.querySelectorAll('.jaba-custom-section').forEach(function(section) {
        section.classList.remove('active');
      });
      activeCustomSection = null;

      // Call built-in section switcher
      if (typeof window.switchSection === 'function') {
        window.switchSection(item.id);
      }
    } else {
      // Hide built-in sections
      var builtinSections = [
        'dashboardSection',
        'leadsSection',
        'schoolsSection',
        'inboxSection',
        'meetingsSection',
        'tasksSection',
        'playbooksSection'
      ];
      builtinSections.forEach(function(sectionId) {
        var el = document.getElementById(sectionId);
        if (el) el.style.display = 'none';
      });

      // Show custom section
      activeCustomSection = item.section;
      var customSection = document.getElementById(item.section);
      if (customSection) {
        customSection.classList.add('active');
      }
    }
  };

  // ===== FIREBASE DATA LOADING =====
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
    loadFirebaseData(CONFIG.firebasePaths.agencies, function(data) {
      dataCache.agencies = data;
      updateBadge('agencies', Object.keys(data).length);
    });

    loadFirebaseData(CONFIG.firebasePaths.brands, function(data) {
      dataCache.brands = data;
      updateBadge('brands', Object.keys(data).length);
    });

    loadFirebaseData(CONFIG.firebasePaths.leaguesTeams, function(data) {
      dataCache.leaguesTeams = data;
      updateBadge('leagues_teams', Object.keys(data).length);
    });

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
    if (badge) {
      badge.textContent = count;
    }
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
          if (badge) {
            badge.textContent = count;
          }
        }
      }
    });
  };

  // ===== CUSTOM SECTION CREATION =====
  var createCustomSections = function() {
    var container = document.querySelector('.container') || document.body;

    // Agencies Section
    var agenciesSection = document.createElement('div');
    agenciesSection.id = 'agenciesSection';
    agenciesSection.className = 'jaba-custom-section';
    agenciesSection.innerHTML = createTableSectionHTML('Agencies', 'agencies', ['name', 'contact', 'title', 'status', 'notes']);
    container.appendChild(agenciesSection);

    // Brands Section
    var brandsSection = document.createElement('div');
    brandsSection.id = 'brandsSection';
    brandsSection.className = 'jaba-custom-section';
    brandsSection.innerHTML = createTableSectionHTML('Brands', 'brands', ['name', 'contact', 'title', 'status', 'notes']);
    container.appendChild(brandsSection);

    // Teams & Leagues Section
    var leaguesSection = document.createElement('div');
    leaguesSection.id = 'leaguesTeamsSection';
    leaguesSection.className = 'jaba-custom-section';
    leaguesSection.innerHTML = createTableSectionHTML('Teams & Leagues', 'leagues_teams', ['name', 'contact', 'title', 'status', 'notes']);
    container.appendChild(leaguesSection);

    // Investors Section
    var investorsSection = document.createElement('div');
    investorsSection.id = 'investorsSection';
    investorsSection.className = 'jaba-custom-section';
    investorsSection.innerHTML = createTableSectionHTML('Investors', 'investors', ['name', 'contact', 'title', 'status', 'notes']);
    container.appendChild(investorsSection);

    // Athlete Investors Section
    var athleteSection = document.createElement('div');
    athleteSection.id = 'athleteInvestorsSection';
    athleteSection.className = 'jaba-custom-section';
    athleteSection.innerHTML = createTableSectionHTML('Athlete Investors', 'athlete_investors', ['name', 'sport', 'status', 'notes']);
    container.appendChild(athleteSection);

    // Damar CRM Section
    var damarSection = document.createElement('div');
    damarSection.id = 'damarCRMSection';
    damarSection.className = 'jaba-custom-section';
    damarSection.innerHTML = createTableSectionHTML('Damar CRM', 'damarCRM', ['name', 'org', 'pipeline', 'introStatus', 'strength', 'notes']);
    container.appendChild(damarSection);

    // Clients Section
    var clientsSection = document.createElement('div');
    clientsSection.id = 'clientDataSection';
    clientsSection.className = 'jaba-custom-section';
    clientsSection.innerHTML = createTableSectionHTML('Clients', 'clientData', ['name', 'status']);
    container.appendChild(clientsSection);

    // Client Dashboard Section
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

    // Approvals Section
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

  // ===== RENDERING FUNCTIONS =====
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

        // Check if item matches search
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
    for (var i = 0; i < num; i++) {
      stars += '★';
    }
    return stars || '—';
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
    document.getElementById('stat-total-clients').textContent = Object.keys(dataCache.clientData).length;
    document.getElementById('stat-total-crm').textContent = Object.keys(dataCache.damarCRM).length;
    document.getElementById('stat-total-approvals').textContent = Object.keys(dataCache.approvals).length;
  };

  var getColumnsForDataKey = function(dataKey) {
    var columnsMap = {
      'agencies': ['name', 'contact', 'title', 'status', 'notes'],
      'brands': ['name', 'contact', 'title', 'status', 'notes'],
      'leagues_teams': ['name', 'contact', 'title', 'status', 'notes'],
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
        if (error) {
          alert('Error adding item: ' + error.message);
        } else {
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
        if (error) {
          alert('Error updating item: ' + error.message);
        } else {
          renderTableData(dataKey, '');
        }
      });
    }
  };

  jabaCustom.handleDelete = function(dataKey, itemId) {
    if (!confirm('Are you sure you want to delete this item?')) return;

    if (typeof firebase !== 'undefined') {
      var path = CONFIG.firebasePaths[getFirebasePath(dataKey)];
      firebase.database().ref(path + '/' + itemId).remove(function(error) {
        if (error) {
          alert('Error deleting item: ' + error.message);
        } else {
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
        if (error) {
          alert('Error approving item: ' + error.message);
        } else {
          renderApprovalsSection();
        }
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
        if (error) {
          alert('Error rejecting item: ' + error.message);
        } else {
          renderApprovalsSection();
        }
      });
    }
  };

  jabaCustom.renderApprovalsSection = function() {
    syncFirebaseData();
    setTimeout(renderApprovalsSection, 500);
  };

  var getFirebasePath = function(dataKey) {
    var pathMap = {
      'agencies': 'agencies',
      'brands': 'brands',
      'leagues_teams': 'leaguesTeams',
      'investors': 'investors',
      'athlete_investors': 'athleteInvestors',
      'damarCRM': 'damarCRM',
      'clientData': 'clientData',
      'approvals': 'approvals'
    };
    return pathMap[dataKey] || dataKey;
  };

  // ===== SECTION SPECIFIC RENDERS =====
  jabaCustom.renderAgencies = function() {
    renderTableData('agencies', '');
    updateClientDashboard();
  };

  jabaCustom.renderBrands = function() {
    renderTableData('brands', '');
    updateClientDashboard();
  };

  jabaCustom.renderLeaguesTeams = function() {
    renderTableData('leagues_teams', '');
  };

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

  // ===== INITIALIZATION =====
  var init = function() {
    injectStyles();
    createSidebar();
    createCustomSections();
    setupSearch();

    // Sync Firebase data
    setTimeout(syncFirebaseData, 1000);

    // Set up observer for badge updates from top tabs
    setTimeout(syncBadgesFromTopTabs, 2000);

    // Intercept section changes
    if (typeof window.switchSection === 'function') {
      var originalSwitchSection = window.switchSection;
      window.switchSection = function(sectionName) {
        var item = document.querySelector('[data-item-id="' + sectionName + '"]');
        if (item) {
          document.querySelectorAll('.jaba-sidebar-item').forEach(function(el) {
            el.classList.remove('active');
          });
          item.classList.add('active');

          // Hide custom sections
          document.querySelectorAll('.jaba-custom-section').forEach(function(section) {
            section.classList.remove('active');
          });
          activeCustomSection = null;
        }

        return originalSwitchSection(sectionName);
      };
    }

    console.log('JABA Custom v2 initialized successfully');
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API
  jabaCustom.init = init;
  jabaCustom.renderApprovalsSection = renderApprovalsSection;
  jabaCustom.syncFirebaseData = syncFirebaseData;

})();
