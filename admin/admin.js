(function () {
  'use strict';

  var CATEGORY_LABELS = {
    exposant: 'Exposant',
    journaliste: 'Journaliste',
    partenaire: 'Partenaire',
    bailleur: 'Bailleur/Sponsor',
    organisateur: 'Organisateur'
  };
  var STATUS_CLASS = {
    "En attente d'approbation": 'status-pending',
    'Approuvé': 'status-approved',
    'Refusé': 'status-refused',
    'Accrédité': 'status-active'
  };

  var loginScreen = document.getElementById('login-screen');
  var dashboardScreen = document.getElementById('dashboard-screen');
  var loginForm = document.getElementById('login-form');
  var loginError = document.getElementById('login-error');
  var tableBody = document.getElementById('table-body');
  var emptyState = document.getElementById('empty-state');
  var statRow = document.getElementById('stat-row');
  var toast = document.getElementById('toast');

  var allRows = [];

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(function () { toast.classList.remove('show'); }, 3200);
  }

  function api(url, opts) {
    opts = opts || {};
    opts.credentials = 'same-origin';
    return fetch(url, opts).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Erreur serveur');
        return data;
      });
    });
  }

  // ---------- Auth ----------

  function checkSession() {
    api('/.netlify/functions/admin-session')
      .then(function () { showDashboard(); })
      .catch(function () { showLogin(); });
  }

  function showLogin() {
    loginScreen.style.display = 'flex';
    dashboardScreen.style.display = 'none';
  }

  function showDashboard() {
    loginScreen.style.display = 'none';
    dashboardScreen.style.display = 'block';
    loadList();
  }

  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    loginError.style.display = 'none';
    var username = document.getElementById('login-username').value;
    var password = document.getElementById('login-password').value;
    api('/.netlify/functions/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    })
      .then(function () { showDashboard(); })
      .catch(function (err) {
        loginError.textContent = err.message;
        loginError.style.display = 'block';
      });
  });

  document.getElementById('logout-btn').addEventListener('click', function () {
    api('/.netlify/functions/admin-logout', { method: 'POST' }).then(showLogin).catch(showLogin);
  });

  // ---------- List / filters ----------

  function loadList() {
    var status = document.getElementById('filter-status').value;
    var category = document.getElementById('filter-category').value;
    var params = new URLSearchParams();
    if (status) params.set('status', status);
    if (category) params.set('category', category);

    api('/.netlify/functions/admin-list?' + params.toString())
      .then(function (data) {
        allRows = data.accreditations || [];
        renderStats(allRows);
        renderTable();
      })
      .catch(function (err) { showToast('Erreur de chargement : ' + err.message); });
  }

  document.getElementById('filter-status').addEventListener('change', loadList);
  document.getElementById('filter-category').addEventListener('change', loadList);
  document.getElementById('filter-search').addEventListener('input', renderTable);

  function renderStats(rows) {
    var counts = { total: rows.length };
    ["En attente d'approbation", 'Approuvé', 'Refusé', 'Accrédité'].forEach(function (s) { counts[s] = 0; });
    rows.forEach(function (r) { if (counts[r.status] !== undefined) counts[r.status] += 1; });

    statRow.innerHTML = '';
    [
      { label: 'TOTAL', num: counts.total },
      { label: "EN ATTENTE D'APPROBATION", num: counts["En attente d'approbation"] },
      { label: 'APPROUVÉ', num: counts['Approuvé'] },
      { label: 'ACCRÉDITÉ', num: counts['Accrédité'] }
    ].forEach(function (s) {
      var card = document.createElement('div');
      card.className = 'stat-card';
      card.innerHTML = '<div class="num">' + s.num + '</div><div class="label">' + s.label + '</div>';
      statRow.appendChild(card);
    });
  }

  function renderTable() {
    var search = document.getElementById('filter-search').value.trim().toLowerCase();
    var rows = allRows.filter(function (r) {
      if (!search) return true;
      return (r.nom_complet || '').toLowerCase().indexOf(search) !== -1 ||
        (r.email || '').toLowerCase().indexOf(search) !== -1;
    });

    tableBody.innerHTML = '';
    emptyState.style.display = rows.length === 0 ? 'block' : 'none';

    rows.forEach(function (row) {
      var tr = document.createElement('tr');

      var date = new Date(row.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

      tr.innerHTML =
        '<td>' + date + '</td>' +
        '<td><span class="cat-badge">' + (CATEGORY_LABELS[row.category] || row.category) + '</span></td>' +
        '<td>' + escapeHtml(row.nom_complet) + '</td>' +
        '<td>' + escapeHtml(row.email || '—') + '</td>' +
        '<td class="status-cell"></td>' +
        '<td>' + escapeHtml(row.matricule || '—') + '</td>' +
        '<td class="row-actions"></td>';

      var statusCell = tr.querySelector('.status-cell');
      var select = document.createElement('select');
      select.className = 'status-select ' + (STATUS_CLASS[row.status] || '');
      ["En attente d'approbation", 'Approuvé', 'Refusé', 'Accrédité'].forEach(function (s) {
        var opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        if (s === row.status) opt.selected = true;
        select.appendChild(opt);
      });
      select.addEventListener('change', function () { changeStatus(row.id, select.value, select); });
      statusCell.appendChild(select);

      var actionsCell = tr.querySelector('.row-actions');

      var detailsBtn = document.createElement('button');
      detailsBtn.className = 'btn btn-outline';
      detailsBtn.textContent = 'Détails';
      detailsBtn.addEventListener('click', function () { openDetails(row); });
      actionsCell.appendChild(detailsBtn);

      if (row.status === 'Accrédité') {
        var resendBtn = document.createElement('button');
        resendBtn.className = 'btn btn-outline';
        resendBtn.textContent = 'Renvoyer les documents';
        resendBtn.addEventListener('click', function () { resendDocuments(row.id, resendBtn); });
        actionsCell.appendChild(resendBtn);
      }

      tableBody.appendChild(tr);
    });
  }

  function changeStatus(id, status, selectEl) {
    selectEl.disabled = true;
    api('/.netlify/functions/admin-update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, status: status })
    })
      .then(function (data) {
        if (status === 'Approuvé') {
          showToast('Approuvé — badge et attestation générés, courriel envoyé.');
        } else {
          showToast('Statut mis à jour.');
        }
        loadList();
      })
      .catch(function (err) { showToast('Erreur : ' + err.message); selectEl.disabled = false; })
      .then(function () { selectEl.disabled = false; });
  }

  function resendDocuments(id, btn) {
    btn.disabled = true;
    btn.textContent = 'Envoi…';
    api('/.netlify/functions/admin-resend-documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id })
    })
      .then(function () { showToast('Documents renvoyés.'); })
      .catch(function (err) { showToast('Erreur : ' + err.message); })
      .then(function () { btn.disabled = false; btn.textContent = 'Renvoyer les documents'; });
  }

  document.getElementById('bulk-generate-btn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Génération en cours…';
    api('/.netlify/functions/admin-bulk-generate', { method: 'POST' })
      .then(function (data) {
        showToast(data.succeeded + '/' + data.processed + ' candidature(s) traitée(s).');
        loadList();
      })
      .catch(function (err) { showToast('Erreur : ' + err.message); })
      .then(function () { btn.disabled = false; btn.textContent = 'Générer badge + attestation (approuvées)'; });
  });

  document.getElementById('export-btn').addEventListener('click', function () {
    var status = document.getElementById('filter-status').value;
    var category = document.getElementById('filter-category').value;
    var params = new URLSearchParams();
    if (status) params.set('status', status);
    if (category) params.set('category', category);
    window.location.href = '/.netlify/functions/admin-export?' + params.toString();
  });

  // ---------- Details modal ----------

  var detailModal = document.getElementById('detail-modal');
  document.getElementById('modal-close').addEventListener('click', function () { detailModal.classList.remove('open'); });
  detailModal.addEventListener('click', function (e) { if (e.target === detailModal) detailModal.classList.remove('open'); });

  function openDetails(row) {
    document.getElementById('modal-title').textContent = row.nom_complet;
    document.getElementById('modal-sub').textContent = (CATEGORY_LABELS[row.category] || row.category) + ' · ' + row.role_label;

    var grid = document.getElementById('modal-detail-grid');
    grid.innerHTML = '';
    [
      ['Email', row.email], ['Téléphone', row.telephone],
      ['Statut', row.status], ['Matricule', row.matricule || '—'],
      ['Badge généré', row.badge_path ? 'Oui' : 'Non'], ['Attestation générée', row.attestation_path ? 'Oui' : 'Non'],
      ['Soumis le', new Date(row.created_at).toLocaleString('fr-FR')],
      ['Documents générés le', row.generated_at ? new Date(row.generated_at).toLocaleString('fr-FR') : '—']
    ].forEach(function (pair) {
      var k = document.createElement('div'); k.className = 'k'; k.textContent = pair[0];
      var v = document.createElement('div'); v.className = 'v'; v.textContent = pair[1] || '—';
      grid.appendChild(k); grid.appendChild(v);
    });

    document.getElementById('modal-raw-json').textContent = JSON.stringify(row.data || {}, null, 2);
    detailModal.classList.add('open');
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  checkSession();
})();
