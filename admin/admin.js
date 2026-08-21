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
    'Accrédité': 'status-active',
    "Liste d'attente": 'status-waitlist'
  };
  var ALL_STATUSES = ["En attente d'approbation", 'Approuvé', 'Refusé', 'Accrédité', "Liste d'attente"];

  var loginScreen = document.getElementById('login-screen');
  var dashboardScreen = document.getElementById('dashboard-screen');
  var loginForm = document.getElementById('login-form');
  var loginError = document.getElementById('login-error');
  var tableBody = document.getElementById('table-body');
  var emptyState = document.getElementById('empty-state');
  var statRow = document.getElementById('stat-row');
  var toast = document.getElementById('toast');

  var allRows = [];
  var currentPage = 1;
  var PAGE_SIZE = 50;

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
    loadSectorStatus();
    loadUrgence();
  }

  // ---------- Mode "Dernière ligne droite" ----------

  var RAISON_LABEL = { date: 'date limite proche', taux: 'taux de remplissage atteint', manuel: 'interrupteur manuel' };

  function loadUrgence() {
    api('/.netlify/functions/admin-urgence')
      .then(function (data) { renderUrgencePanel(data); })
      .catch(function (err) {
        document.getElementById('urgence-etat').textContent = 'Indisponible : ' + err.message;
      });
  }

  function renderUrgencePanel(data) {
    document.getElementById('urgence-mode').value = data.config.mode;
    document.getElementById('urgence-date').value = data.config.dateLimiteInscription;
    document.getElementById('urgence-jours').value = data.config.joursAvantDeclenchement;
    document.getElementById('urgence-seuil').value = data.config.seuilPourcentage;

    var pourcentage = data.objectifTotal ? Math.round((data.totalConfirme / data.objectifTotal) * 1000) / 10 : 0;
    var etatEl = document.getElementById('urgence-etat');
    if (data.etat.actif) {
      var raison = RAISON_LABEL[data.etat.raison] || data.etat.raison;
      etatEl.innerHTML = '<span style="color:#c2410c; font-weight:700;">● Mode actif</span> (' + raison + ') — ' +
        data.totalConfirme + ' / ' + data.objectifTotal + ' confirmées (' + pourcentage + '%)' +
        (data.etat.joursRestants !== null ? ' · ' + data.etat.joursRestants + ' jour(s) avant la date limite' : '');
    } else {
      etatEl.innerHTML = '<span style="color:var(--muted); font-weight:700;">○ Mode inactif</span> — ' +
        data.totalConfirme + ' / ' + data.objectifTotal + ' confirmées (' + pourcentage + '%)' +
        (data.etat.joursRestants !== null ? ' · ' + data.etat.joursRestants + ' jour(s) avant la date limite' : '');
    }
  }

  document.getElementById('urgence-save-btn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    var originalLabel = btn.textContent;
    btn.textContent = 'Enregistrement…';
    api('/.netlify/functions/admin-urgence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: document.getElementById('urgence-mode').value,
        dateLimiteInscription: document.getElementById('urgence-date').value,
        joursAvantDeclenchement: Number(document.getElementById('urgence-jours').value),
        seuilPourcentage: Number(document.getElementById('urgence-seuil').value)
      })
    })
      .then(function (data) { renderUrgencePanel(data); showToast('Configuration enregistrée.'); })
      .catch(function (err) { showToast('Erreur : ' + err.message); })
      .then(function () { btn.disabled = false; btn.textContent = originalLabel; });
  });

  // ---------- Suivi par secteur (Organisations Exposantes) ----------

  function loadSectorStatus() {
    api('/.netlify/functions/admin-sectors-status')
      .then(function (data) { renderSectorStatus(data); })
      .catch(function () {
        document.getElementById('sector-table-body').innerHTML = '<tr><td colspan="3" style="color:var(--muted);">Suivi par secteur indisponible pour le moment.</td></tr>';
      });
  }

  function renderSectorStatus(data) {
    var summary = document.getElementById('sector-summary');
    summary.innerHTML =
      '<span><span class="dot" style="background:#16a34a;"></span>' + data.resume.vert + ' secteur(s) complet(s)</span>' +
      '<span><span class="dot" style="background:#eab308;"></span>' + data.resume.jaune + ' secteur(s) partiel(s)</span>' +
      '<span><span class="dot" style="background:#dc2626;"></span>' + data.resume.rouge + ' secteur(s) vide(s)</span>' +
      '<span>' + data.resume.totalConfirme + ' / ' + data.resume.objectifTotal + ' organisations confirmées</span>';

    var body = document.getElementById('sector-table-body');
    body.innerHTML = '';
    data.secteurs.forEach(function (s) {
      var tr = document.createElement('tr');
      var orgsList = s.organisations.length ? s.organisations.map(escapeHtml).join(', ') : '—';
      tr.innerHTML =
        '<td><span style="display:inline-flex; align-items:center; gap:8px;">' + feuTricoloreHtml(s.couleur, s.message) + escapeHtml(s.secteur) + '</span></td>' +
        '<td>' + s.count + ' / ' + s.quota + ' <span style="color:var(--muted);">(' + escapeHtml(s.message) + ')</span></td>' +
        '<td class="sector-orgs">' + orgsList + '</td>';
      body.appendChild(tr);
    });
  }

  // Feu de circulation : rouge/jaune/vert empilés, une seule pastille allumée selon `couleur`.
  // Vert et jaune clignotent (CSS, voir admin.css) ; le rouge reste fixe (secteur fermé).
  function feuTricoloreHtml(couleur, message) {
    function lampe(nom) {
      var on = nom === couleur ? ' on' : '';
      return '<span class="lampe ' + nom + on + '"></span>';
    }
    return '<span class="feu-tricolore" title="' + escapeHtml(message || '') + '" aria-label="' + escapeHtml(message || '') + '">' +
      lampe('rouge') + lampe('jaune') + lampe('vert') +
      '</span>';
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
        currentPage = 1;
        renderTable();
      })
      .catch(function (err) { showToast('Erreur de chargement : ' + err.message); });
  }

  document.getElementById('filter-status').addEventListener('change', loadList);
  document.getElementById('filter-category').addEventListener('change', loadList);
  document.getElementById('filter-search').addEventListener('input', function () {
    currentPage = 1;
    renderTable();
  });

  function renderStats(rows) {
    var counts = { total: rows.length };
    ALL_STATUSES.forEach(function (s) { counts[s] = 0; });
    rows.forEach(function (r) { if (counts[r.status] !== undefined) counts[r.status] += 1; });

    statRow.innerHTML = '';
    [
      { label: 'TOTAL', num: counts.total },
      { label: "EN ATTENTE D'APPROBATION", num: counts["En attente d'approbation"] },
      { label: 'APPROUVÉ', num: counts['Approuvé'] },
      { label: 'ACCRÉDITÉ', num: counts['Accrédité'] },
      { label: "LISTE D'ATTENTE", num: counts["Liste d'attente"] }
    ].forEach(function (s) {
      var card = document.createElement('div');
      card.className = 'stat-card';
      card.innerHTML = '<div class="num">' + s.num + '</div><div class="label">' + s.label + '</div>';
      statRow.appendChild(card);
    });
  }

  function renderTable() {
    var search = document.getElementById('filter-search').value.trim().toLowerCase();
    var filtered = allRows.filter(function (r) {
      if (!search) return true;
      return (r.nom_complet || '').toLowerCase().indexOf(search) !== -1 ||
        (r.email || '').toLowerCase().indexOf(search) !== -1;
    });

    var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    var startIdx = (currentPage - 1) * PAGE_SIZE;
    var rows = filtered.slice(startIdx, startIdx + PAGE_SIZE);

    tableBody.innerHTML = '';
    emptyState.style.display = filtered.length === 0 ? 'block' : 'none';

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
      ALL_STATUSES.forEach(function (s) {
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

    renderPagination(filtered.length, totalPages);
  }

  function renderPagination(totalCount, totalPages) {
    var container = document.getElementById('pagination');
    if (!container) return;
    container.innerHTML = '';
    if (totalCount === 0) return;

    var startIdx = (currentPage - 1) * PAGE_SIZE;
    var endIdx = Math.min(totalCount, startIdx + PAGE_SIZE);

    var info = document.createElement('span');
    info.textContent = (startIdx + 1) + '–' + endIdx + ' sur ' + totalCount;
    container.appendChild(info);

    var prevBtn = document.createElement('button');
    prevBtn.textContent = '← Précédent';
    prevBtn.disabled = currentPage <= 1;
    prevBtn.addEventListener('click', function () { currentPage -= 1; renderTable(); });
    container.appendChild(prevBtn);

    var pageInfo = document.createElement('span');
    pageInfo.textContent = 'Page ' + currentPage + ' / ' + totalPages;
    container.appendChild(pageInfo);

    var nextBtn = document.createElement('button');
    nextBtn.textContent = 'Suivant →';
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.addEventListener('click', function () { currentPage += 1; renderTable(); });
    container.appendChild(nextBtn);
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
        loadSectorStatus();
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
    var originalLabel = btn.textContent;
    btn.disabled = true;

    // La fonction serveur traite un petit paquet à la fois (voir admin-bulk-generate.js) — on la
    // rappelle en boucle jusqu'à ce qu'il ne reste plus rien, pour pouvoir traiter un gros volume
    // (ex. 500 candidatures approuvées d'un coup) sans risquer l'expiration d'une seule invocation.
    var totalProcessed = 0;
    var totalSucceeded = 0;

    function runBatch() {
      btn.textContent = 'Génération en cours… (' + totalProcessed + ' traité' + (totalProcessed > 1 ? 's' : '') + ')';
      api('/.netlify/functions/admin-bulk-generate', { method: 'POST' })
        .then(function (data) {
          totalProcessed += data.processed;
          totalSucceeded += data.succeeded;
          if (data.processed === 0) {
            showToast(totalProcessed === 0 ? 'Aucune candidature à traiter.' : totalSucceeded + '/' + totalProcessed + ' candidature(s) traitée(s) au total.');
            btn.disabled = false;
            btn.textContent = originalLabel;
            loadList();
            return;
          }
          loadList();
          if (data.remaining > 0) {
            runBatch();
          } else {
            showToast(totalSucceeded + '/' + totalProcessed + ' candidature(s) traitée(s) au total.');
            btn.disabled = false;
            btn.textContent = originalLabel;
          }
        })
        .catch(function (err) {
          showToast('Erreur après ' + totalProcessed + ' traité(s) : ' + err.message);
          btn.disabled = false;
          btn.textContent = originalLabel;
        });
    }

    runBatch();
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
