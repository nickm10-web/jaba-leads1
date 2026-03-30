/* JABA Custom Sidebar - moves top tabs to left sidebar, adds custom sections */
document.addEventListener('DOMContentLoaded', function() {

  /* -- 1. Create sidebar -- */
  var sidebar = document.createElement('div');
  sidebar.id = 'jaba-sidebar';
  sidebar.innerHTML = '\
    <div class="sidebar-logo">JABA</div>\
    <div class="sidebar-section-label">MENU</div>\
    <div class="sidebar-item active" data-section="dashboard">Dashboard</div>\
    <div class="sidebar-item" data-section="leads">\
      Leads <span class="sidebar-badge" id="sidebarLeadsBadge"></span>\
    </div>\
    <div class="sidebar-sub-items" id="leadsSubItems">\
      <div class="sidebar-sub-item active" data-bucket="all">All</div>\
      <div class="sidebar-sub-item" data-bucket="Schools">Schools</div>\
      <div class="sidebar-sub-item" data-bucket="Teams/Leagues">Teams/Leagues</div>\
      <div class="sidebar-sub-item" data-bucket="Athlete Agencies">Athlete Agencies</div>\
      <div class="sidebar-sub-item" data-bucket="Agencies of Record">Agencies of Record</div>\
      <div class="sidebar-sub-item" data-bucket="Brands">Brands</div>\
    </div>\
    <div class="sidebar-item" data-section="schools">Schools</div>\
    <div class="sidebar-item" data-section="inbox">\
      Inbox <span class="sidebar-badge" id="sidebarInboxBadge"></span>\
    </div>\
    <div class="sidebar-item" data-section="meetings">\
      Meetings <span class="sidebar-badge" id="sidebarMeetingsBadge"></span>\
    </div>\
    <div class="sidebar-item" data-section="tasks">\
      Tasks <span class="sidebar-badge" id="sidebarTasksBadge"></span>\
    </div>\
    <div class="sidebar-item" data-section="playbooks">Playbooks</div>\
    <div class="sidebar-section-label">CRM</div>\
    <div class="sidebar-item" data-section="clients">\
      Clients <span class="sidebar-badge" id="sidebarClientsBadge">0</span>\
    </div>\
    <div class="sidebar-item" data-section="clientDash">Client Dashboard</div>\
    <div class="sidebar-item" data-section="damar">\
      Damar CRM <span class="sidebar-badge" id="sidebarDamarBadge">0</span>\
    </div>\
    <div class="sidebar-section-label">ACTIVITY</div>\
    <div class="sidebar-item" data-section="approvals">\
      Approvals <span class="sidebar-badge" id="sidebarApprovalsBadge">0</span>\
    </div>\
  ';

  /* -- 2. Create custom section containers -- */
  var customSections = {
    clients: '<div id="clientsSection" class="custom-section" style="display:none;"><h2 class="custom-title">Clients</h2><button class="action-btn" onclick="jabaCustom.addClient()">Add Client</button><div class="custom-table-wrap"><table class="custom-table" id="clientsTable"><thead><tr><th>Name</th><th>Company</th><th>Email</th><th>Phone</th><th>Status</th><th>Last Contact</th><th>Actions</th></tr></thead><tbody id="clientsBody"></tbody></table></div></div>',
    clientDash: '<div id="clientDashSection" class="custom-section" style="display:none;"><h2 class="custom-title">Client Dashboard</h2><div class="stat-cards" id="clientDashStats"></div><h3 style="color:#e6edf3;margin:20px 0 10px;">Recent Clients</h3><div class="custom-table-wrap"><table class="custom-table" id="clientDashTable"><thead><tr><th>Name</th><th>Company</th><th>Status</th><th>Last Contact</th></tr></thead><tbody id="clientDashBody"></tbody></table></div></div>',
    damar: '<div id="damarSection" class="custom-section" style="display:none;"><h2 class="custom-title">Damar CRM</h2><button class="action-btn" onclick="jabaCustom.addDamarEntry()">Add Entry</button><div class="custom-table-wrap"><table class="custom-table" id="damarTable"><thead><tr><th>Name</th><th>Company</th><th>Status</th><th>Notes</th><th>Last Updated</th><th>Actions</th></tr></thead><tbody id="damarBody"></tbody></table></div></div>',
    approvals: '<div id="approvalsSection" class="custom-section" style="display:none;"><h2 class="custom-title">Approvals</h2><button class="action-btn" onclick="jabaCustom.addApproval()">Add Approval</button><div id="approvalsContainer"></div></div>'
  };

  /* -- 3. Inject sidebar + styles -- */
  var style = document.createElement('style');
  style.textContent = '#jaba-sidebar{position:fixed;left:0;top:0;bottom:0;width:210px;background:#1a1d27;border-right:1px solid #30363d;z-index:1000;overflow-y:auto;padding:15px 0;font-family:DM Sans,sans-serif}.sidebar-logo{font-family:Anton,sans-serif;font-size:28px;color:#00e5ff;padding:10px 20px 20px;letter-spacing:2px}.sidebar-section-label{font-size:10px;color:#8b949e;padding:15px 20px 5px;letter-spacing:1.5px;font-weight:600}.sidebar-item{padding:10px 20px;color:#e6edf3;cursor:pointer;font-size:14px;transition:all .2s;display:flex;align-items:center;justify-content:space-between}.sidebar-item:hover{background:#232733}.sidebar-item.active{background:#00e5ff;color:#0f1117;font-weight:600;border-radius:0 8px 8px 0;margin-right:10px}.sidebar-badge{background:#00e5ff;color:#0f1117;border-radius:50%;min-width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;padding:0 4px}.sidebar-item.active .sidebar-badge{background:#0f1117;color:#00e5ff}.sidebar-sub-items{max-height:0;overflow:hidden;transition:max-height .3s ease}.sidebar-sub-items.open{max-height:300px}.sidebar-sub-item{padding:7px 20px 7px 36px;color:#8b949e;cursor:pointer;font-size:13px;transition:all .15s}.sidebar-sub-item:hover{color:#e6edf3;background:#232733}.sidebar-sub-item.active{color:#00e5ff;font-weight:600}.container{margin-left:210px!important}.top-tabs{display:none!important}.detail-panel{margin-left:210px!important}.custom-section{padding:0 20px 30px}.custom-title{font-family:Saira Extra Condensed,sans-serif;font-size:28px;font-weight:700;color:#E2F500;text-transform:uppercase;letter-spacing:1px;margin-bottom:20px}.action-btn{background:#00e5ff;color:#0f1117;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-weight:600;font-size:14px;margin-bottom:15px}.action-btn:hover{opacity:.85}.custom-table-wrap{overflow-x:auto}.custom-table{width:100%;border-collapse:collapse;background:rgba(26,29,39,.6);border-radius:8px;overflow:hidden}.custom-table th{background:#232733;color:#8b949e;padding:12px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.8px;font-weight:600}.custom-table td{padding:11px 14px;color:#e6edf3;border-bottom:1px solid #30363d;font-size:13px}.custom-table tr:hover td{background:rgba(255,255,255,.03)}.stat-cards{display:flex;gap:15px;flex-wrap:wrap;margin-bottom:20px}.stat-card{background:rgba(26,29,39,.6);border:1px solid #30363d;border-radius:12px;padding:20px 25px;min-width:180px;flex:1}.stat-card .num{font-family:Anton,sans-serif;font-size:36px;font-weight:700;color:#00e5ff}.stat-card .label{font-size:11px;color:#8b949e;text-transform:uppercase;letter-spacing:.8px;margin-top:5px}.approval-card{background:rgba(26,29,39,.6);border:1px solid #30363d;border-radius:10px;padding:18px 22px;margin-bottom:12px}.approval-card .from{font-weight:700;color:#e6edf3;font-size:15px}.approval-card .subject{font-weight:600;color:#e6edf3;margin:4px 0;font-size:14px}.approval-card .body-text{color:#8b949e;margin:8px 0 14px;white-space:pre-line;font-size:13px}.approval-btns{display:flex;gap:8px}.approval-btns button{border:none;padding:7px 16px;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;color:#fff}.btn-approve{background:#00e5ff;color:#0f1117!important}.btn-reject{background:#ff6b6b}.btn-edit{background:#0984e3}.btn-delete{background:#e17055}.edit-btn{background:#0984e3;color:#fff;border:none;padding:5px 12px;border-radius:5px;cursor:pointer;margin-right:4px;font-size:12px;font-weight:600}.del-btn{background:#ff6b6b;color:#fff;border:none;padding:5px 12px;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600}';
  document.head.appendChild(style);
  document.body.prepend(sidebar);

  var container = document.querySelector('.container');
  if (container) {
    Object.keys(customSections).forEach(function(key) {
      var div = document.createElement('div');
      div.innerHTML = customSections[key];
      container.appendChild(div.firstChild);
    });
  }

  /* -- 4. Sync badges -- */
  function syncBadges() {
    var origTabs = document.querySelectorAll('.top-tab');
    origTabs.forEach(function(tab) {
      var badge = tab.querySelector('.tab-badge');
      if (!badge) return;
      var text = badge.textContent.trim();
      var oc = tab.getAttribute('onclick') || '';
      if (oc.indexOf('leads') !== -1) { var el = document.getElementById('sidebarLeadsBadge'); if (el) el.textContent = text; }
      if (oc.indexOf('inbox') !== -1) { var el = document.getElementById('sidebarInboxBadge'); if (el) el.textContent = text; }
      if (oc.indexOf('meetings') !== -1) { var el = document.getElementById('sidebarMeetingsBadge'); if (el) el.textContent = text; }
      if (oc.indexOf('tasks') !== -1) { var el = document.getElementById('sidebarTasksBadge'); if (el) el.textContent = text; }
    });
  }
  syncBadges();
  setInterval(syncBadges, 3000);

  /* -- 5. Sidebar click handlers -- */
  var allItems = sidebar.querySelectorAll('.sidebar-item');
  var leadsSubItems = document.getElementById('leadsSubItems');
  var customSectionIds = ['clients','clientDash','damar','approvals'];
  var builtInSections = ['dashboard','leads','schools','inbox','meetings','tasks','playbooks'];

  function hideAllCustomSections() {
    customSectionIds.forEach(function(id) {
      var el = document.getElementById(id + 'Section');
      if (el) el.style.display = 'none';
    });
  }

  allItems.forEach(function(item) {
    item.addEventListener('click', function() {
      var section = this.getAttribute('data-section');
      allItems.forEach(function(i) { i.classList.remove('active'); });
      this.classList.add('active');
      if (section === 'leads') { leadsSubItems.classList.add('open'); } else { leadsSubItems.classList.remove('open'); }
      if (builtInSections.indexOf(section) !== -1) {
        hideAllCustomSections();
        if (typeof switchSection === 'function') switchSection(section);
      } else {
        builtInSections.forEach(function(s) { var el = document.getElementById(s + 'Section'); if (el) el.style.display = 'none'; });
        hideAllCustomSections();
        var target = document.getElementById(section + 'Section');
        if (target) target.style.display = 'block';
        if (section === 'clients') jabaCustom.renderClients();
        if (section === 'damar') jabaCustom.renderDamar();
        if (section === 'approvals') jabaCustom.renderApprovals();
        if (section === 'clientDash') jabaCustom.renderClientDash();
      }
    });
  });

  var subItems = leadsSubItems.querySelectorAll('.sidebar-sub-item');
  subItems.forEach(function(sub) {
    sub.addEventListener('click', function(e) {
      e.stopPropagation();
      subItems.forEach(function(s) { s.classList.remove('active'); });
      this.classList.add('active');
      var bucket = this.getAttribute('data-bucket');
      allItems.forEach(function(i) { i.classList.remove('active'); });
      var leadsItem = sidebar.querySelector('[data-section="leads"]');
      if (leadsItem) leadsItem.classList.add('active');
      hideAllCustomSections();
      if (typeof switchSection === 'function') switchSection('leads');
      setTimeout(function() {
        var filterBtns = document.querySelectorAll('#leadsSection .filter-btn');
        filterBtns.forEach(function(btn) {
          if ((bucket === 'all' && btn.textContent.trim() === 'All') || btn.textContent.trim() === bucket) btn.click();
        });
      }, 100);
    });
  });

  /* -- 6. Firebase CRUD -- */
  var db = typeof firebase !== 'undefined' && firebase.database ? firebase.database() : null;

  window.jabaCustom = {
    renderClients: function() {
      if (!db) return;
      db.ref('jabaClients').on('value', function(snap) {
        var data = snap.val() || {};
        var body = document.getElementById('clientsBody');
        if (!body) return;
        body.innerHTML = '';
        var count = 0;
        Object.keys(data).forEach(function(key) {
          var c = data[key]; count++;
          body.innerHTML += '<tr><td>'+(c.name||'')+'<\/td><td>'+(c.company||'')+'<\/td><td>'+(c.email||'')+'<\/td><td>'+(c.phone||'')+'<\/td><td>'+(c.status||'')+'<\/td><td>'+(c.lastContact||'')+'<\/td><td><button class="edit-btn" onclick="jabaCustom.editClient(\''+key+'\')">Edit<\/button><button class="del-btn" onclick="jabaCustom.delClient(\''+key+'\')">Del<\/button><\/td><\/tr>';
        });
        var badge = document.getElementById('sidebarClientsBadge');
        if (badge) badge.textContent = count;
      });
    },
    addClient: function() {
      var name = prompt('Client name:'); if (!name) return;
      var company = prompt('Company:') || '';
      var email = prompt('Email:') || '';
      var phone = prompt('Phone:') || '';
      db.ref('jabaClients').push({name:name,company:company,email:email,phone:phone,status:'Active',lastContact:new Date().toISOString().split('T')[0]});
    },
    editClient: function(key) {
      db.ref('jabaClients/'+key).once('value', function(snap) {
        var c = snap.val();
        var name = prompt('Name:',c.name); if(name===null)return;
        var company = prompt('Company:',c.company); if(company===null)return;
        var email = prompt('Email:',c.email); if(email===null)return;
        var phone = prompt('Phone:',c.phone); if(phone===null)return;
        var status = prompt('Status:',c.status); if(status===null)return;
        db.ref('jabaClients/'+key).update({name:name||c.name,company:company||c.company,email:email||c.email,phone:phone||c.phone,status:status||c.status,lastContact:new Date().toISOString().split('T')[0]});
      });
    },
    delClient: function(key) { if(confirm('Delete?')) db.ref('jabaClients/'+key).remove(); },

    renderDamar: function() {
      if (!db) return;
      db.ref('damarEntries').on('value', function(snap) {
        var data = snap.val() || {};
        var body = document.getElementById('damarBody');
        if (!body) return;
        body.innerHTML = ''; var count = 0;
        Object.keys(data).forEach(function(key) {
          var d = data[key]; count++;
          body.innerHTML += '<tr><td>'+(d.name||'')+'<\/td><td>'+(d.company||'')+'<\/td><td>'+(d.status||'Unknown')+'<\/td><td>'+(d.notes||'')+'<\/td><td>'+(d.lastUpdated||'N/A')+'<\/td><td><button class="edit-btn" onclick="jabaCustom.editDamar(\''+key+'\')">Edit<\/button><button class="del-btn" onclick="jabaCustom.delDamar(\''+key+'\')">Del<\/button><\/td><\/tr>';
        });
        var badge = document.getElementById('sidebarDamarBadge'); if (badge) badge.textContent = count;
      });
    },
    addDamarEntry: function() {
      var name = prompt('Name:'); if (!name) return;
      var notes = prompt('Notes:') || '';
      db.ref('damarEntries').push({name:name,company:'',status:'Unknown',notes:notes,lastUpdated:new Date().toISOString().split('T')[0]});
    },
    editDamar: function(key) {
      db.ref('damarEntries/'+key).once('value', function(snap) {
        var d = snap.val();
        var name = prompt('Name:',d.name); if(name===null)return;
        var company = prompt('Company:',d.company); if(company===null)return;
        var status = prompt('Status:',d.status); if(status===null)return;
        var notes = prompt('Notes:',d.notes); if(notes===null)return;
        db.ref('damarEntries/'+key).update({name:name||d.name,company:company||d.company,status:status||d.status,notes:notes||d.notes,lastUpdated:new Date().toISOString().split('T')[0]});
      });
    },
    delDamar: function(key) { if(confirm('Delete?')) db.ref('damarEntries/'+key).remove(); },

    renderApprovals: function() {
      if (!db) return;
      db.ref('approvals').on('value', function(snap) {
        var data = snap.val() || {};
        var cont = document.getElementById('approvalsContainer');
        if (!cont) return;
        cont.innerHTML = ''; var count = 0;
        Object.keys(data).forEach(function(key) {
          var a = data[key]; count++;
          cont.innerHTML += '<div class="approval-card"><div class="from">'+(a.from||'Unknown')+'<\/div><div class="subject">Subject: '+(a.subject||'')+'<\/div><div class="body-text">'+(a.body||'')+'<\/div><div class="approval-btns"><button class="btn-approve" onclick="jabaCustom.approveItem(\''+key+'\')">Approve<\/button><button class="btn-reject" onclick="jabaCustom.rejectItem(\''+key+'\')">Reject<\/button><button class="btn-edit" onclick="jabaCustom.editApproval(\''+key+'\')">Edit<\/button><button class="btn-delete" onclick="jabaCustom.delApproval(\''+key+'\')">Delete<\/button><\/div><\/div>';
        });
        var badge = document.getElementById('sidebarApprovalsBadge'); if (badge) badge.textContent = count;
      });
    },
    addApproval: function() {
      var from = prompt('From:'); if (!from) return;
      var subject = prompt('Subject:') || '';
      var body = prompt('Body:') || '';
      db.ref('approvals').push({from:from,subject:subject,body:body,status:'pending'});
    },
    approveItem: function(key) { db.ref('approvals/'+key).update({status:'approved'}); },
    rejectItem: function(key) { db.ref('approvals/'+key).update({status:'rejected'}); },
    editApproval: function(key) {
      db.ref('approvals/'+key).once('value', function(snap) {
        var a = snap.val();
        var body = prompt('Edit body:',a.body);
        if (body !== null) db.ref('approvals/'+key).update({body:body});
      });
    },
    delApproval: function(key) { if(confirm('Delete?')) db.ref('approvals/'+key).remove(); },

    renderClientDash: function() {
      if (!db) return;
      db.ref('jabaClients').once('value', function(snap) {
        var data = snap.val() || {};
        var clients = Object.values(data);
        var total = clients.length;
        var active = clients.filter(function(c){return c.status==='Active';}).length;
        var prospect = clients.filter(function(c){return c.status==='Prospect';}).length;
        var statsEl = document.getElementById('clientDashStats');
        if (statsEl) {
          statsEl.innerHTML = '<div class="stat-card"><div class="num">'+total+'<\/div><div class="label">Total Clients<\/div><\/div><div class="stat-card"><div class="num">'+active+'<\/div><div class="label">Active<\/div><\/div><div class="stat-card"><div class="num">'+prospect+'<\/div><div class="label">Prospects<\/div><\/div>';
        }
        var body = document.getElementById('clientDashBody');
        if (body) {
          body.innerHTML = '';
          clients.slice(0,10).forEach(function(c) {
            body.innerHTML += '<tr><td>'+(c.name||'')+'<\/td><td>'+(c.company||'')+'<\/td><td>'+(c.status||'')+'<\/td><td>'+(c.lastContact||'')+'<\/td><\/tr>';
          });
        }
      });
    }
  };

  setTimeout(syncBadges, 1000);
});
