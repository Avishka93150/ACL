/**
 * Factures Fournisseurs - Module complet
 * Gestion cycle de vie : dépôt OCR, validation, paiement Fintecture, reporting, extraction
 */

let invHotels = [];
let invCurrentHotel = null;
let invActiveTab = 'dashboard';
let invCurrentPage = 1;
let invCategories = [];

// === HELPERS ===

function invStatusLabel(status) {
    const map = {
        draft: 'Brouillon', pending_review: 'En vérification', pending_approval: 'En approbation',
        approved: 'Approuvée', pending_payment: 'Paiement en attente', payment_initiated: 'Paiement initié',
        paid: 'Payée', rejected: 'Rejetée', cancelled: 'Annulée'
    };
    return map[status] || status;
}

function invStatusColor(status) {
    const map = {
        draft: 'secondary', pending_review: 'info', pending_approval: 'warning',
        approved: 'success', pending_payment: 'warning', payment_initiated: 'info',
        paid: 'success', rejected: 'danger', cancelled: 'secondary'
    };
    return map[status] || 'secondary';
}

function invOcrStatusLabel(status) {
    const map = { pending: 'En attente', processing: 'En cours', completed: 'Terminé', failed: 'Échoué', skipped: 'Ignoré' };
    return map[status] || status;
}

function invFormatCurrency(amount) {
    if (!amount && amount !== 0) return '-';
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
}

// === CHARGEMENT PRINCIPAL ===

async function loadInvoices(container) {
    showLoading(container);

    try {
        const mgmtRes = await API.getManagementInfo();
        invHotels = mgmtRes.manageable_hotels || [];

        if (invHotels.length === 0) {
            container.innerHTML = '<div class="card"><div class="empty-state"><i class="fas fa-file-invoice-dollar"></i><h3>Aucun hôtel disponible</h3></div></div>';
            return;
        }

        invCurrentHotel = invCurrentHotel || invHotels[0].id;

        // Charger les catégories
        try {
            const catRes = await API.get(`contracts/categories?hotel_id=${invCurrentHotel}`);
            invCategories = catRes.categories || [];
        } catch (e) { invCategories = []; }

        container.innerHTML = `
            <div class="page-header">
                <div>
                    <h2><i class="fas fa-file-invoice-dollar"></i> Factures Fournisseurs</h2>
                    <p>Gestion du cycle complet des factures fournisseurs</p>
                </div>
                <div class="header-actions-group">
                    ${invHotels.length > 1 ? `
                        <select id="inv-hotel-select" class="form-control" onchange="invChangeHotel(this.value)" style="min-width:200px">
                            ${invHotels.map(h => `<option value="${h.id}" ${h.id == invCurrentHotel ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}
                        </select>
                    ` : ''}
                </div>
            </div>

            <div class="closure-tabs">
                <div class="closure-tab ${invActiveTab === 'dashboard' ? 'active' : ''}" onclick="invSwitchTab('dashboard')"><i class="fas fa-chart-pie"></i> <span>Tableau de bord</span></div>
                <div class="closure-tab ${invActiveTab === 'deposit' ? 'active' : ''}" onclick="invSwitchTab('deposit')"><i class="fas fa-upload"></i> <span>Dépôt / OCR</span></div>
                <div class="closure-tab ${invActiveTab === 'suppliers' ? 'active' : ''}" onclick="invSwitchTab('suppliers')"><i class="fas fa-building"></i> <span>Fournisseurs</span></div>
                <div class="closure-tab ${invActiveTab === 'payments' ? 'active' : ''}" onclick="invSwitchTab('payments')"><i class="fas fa-credit-card"></i> <span>Paiements</span></div>
                <div class="closure-tab ${invActiveTab === 'reporting' ? 'active' : ''}" onclick="invSwitchTab('reporting')"><i class="fas fa-chart-bar"></i> <span>Reporting</span></div>
                <div class="closure-tab ${invActiveTab === 'extraction' ? 'active' : ''}" onclick="invSwitchTab('extraction')"><i class="fas fa-file-export"></i> <span>Extraction</span></div>
                ${hasPermission('invoices.configure') ? `<div class="closure-tab ${invActiveTab === 'config' ? 'active' : ''}" onclick="invSwitchTab('config')"><i class="fas fa-cog"></i> <span>Configuration</span></div>` : ''}
            </div>

            <div id="inv-tab-content"></div>
        `;

        invSwitchTab(invActiveTab);
    } catch (err) {
        container.innerHTML = '<div class="alert alert-danger">Erreur de chargement</div>';
        console.error(err);
    }
}

function invChangeHotel(hotelId) {
    invCurrentHotel = parseInt(hotelId);
    invCurrentPage = 1;
    // Recharger catégories pour le nouvel hôtel
    API.get(`contracts/categories?hotel_id=${invCurrentHotel}`).then(res => {
        invCategories = res.categories || [];
    }).catch(() => {});
    invSwitchTab(invActiveTab);
}

function invSwitchTab(tab) {
    invActiveTab = tab;
    document.querySelectorAll('.closure-tab').forEach(t => t.classList.toggle('active', t.textContent.trim().includes(
        { dashboard: 'Tableau', deposit: 'Dépôt', suppliers: 'Fournisseurs', payments: 'Paiements', reporting: 'Reporting', extraction: 'Extraction', config: 'Configuration' }[tab] || ''
    )));
    // Fix active tab with onclick
    document.querySelectorAll('.closure-tab').forEach(t => {
        const onclick = t.getAttribute('onclick') || '';
        const match = onclick.match(/invSwitchTab\('(\w+)'\)/);
        if (match) t.classList.toggle('active', match[1] === tab);
    });

    const content = document.getElementById('inv-tab-content');
    if (!content) return;

    switch (tab) {
        case 'dashboard': invRenderDashboard(content); break;
        case 'deposit': invRenderDeposit(content); break;
        case 'suppliers': invRenderSuppliers(content); break;
        case 'payments': invRenderPayments(content); break;
        case 'reporting': invRenderReporting(content); break;
        case 'extraction': invRenderExtraction(content); break;
        case 'config': invRenderConfig(content); break;
    }
}

// ============================================================
// ONGLET 1 : TABLEAU DE BORD
// ============================================================

async function invRenderDashboard(content) {
    showLoading(content);
    try {
        const [statsRes, listRes] = await Promise.all([
            API.get(`invoices/stats?hotel_id=${invCurrentHotel}`),
            API.get(`invoices?hotel_id=${invCurrentHotel}&per_page=10`)
        ]);
        const stats = statsRes.stats || {};
        const invoices = listRes.invoices || [];

        content.innerHTML = `
            <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:var(--space-4);margin-bottom:var(--space-6)">
                <div class="card stat-card"><div class="stat-value">${stats.draft || 0}</div><div class="stat-label">Brouillons</div></div>
                <div class="card stat-card"><div class="stat-value">${stats.pending_review || 0}</div><div class="stat-label">En vérification</div></div>
                <div class="card stat-card"><div class="stat-value">${stats.pending_approval || 0}</div><div class="stat-label">En approbation</div></div>
                <div class="card stat-card" style="border-left:3px solid var(--warning-500)"><div class="stat-value">${stats.overdue || 0}</div><div class="stat-label">En retard</div></div>
                <div class="card stat-card" style="border-left:3px solid var(--success-500)"><div class="stat-value">${invFormatCurrency(stats.total_paid_month)}</div><div class="stat-label">Payé ce mois</div></div>
                <div class="card stat-card" style="border-left:3px solid var(--primary-500)"><div class="stat-value">${invFormatCurrency(stats.total_due)}</div><div class="stat-label">Dû total</div></div>
            </div>

            <div class="card">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
                    <h3><i class="fas fa-list"></i> Dernières factures</h3>
                    <button class="btn btn-sm btn-outline" onclick="invSwitchTab('deposit')"><i class="fas fa-eye"></i> Voir tout</button>
                </div>
                <div class="table-responsive">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>N° Facture</th><th>Fournisseur</th><th>Date</th><th>Échéance</th><th>Montant TTC</th><th>Statut</th><th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${invoices.length === 0 ? '<tr><td colspan="7" class="text-center">Aucune facture</td></tr>' :
                            invoices.map(inv => `
                                <tr>
                                    <td><strong>${esc(inv.invoice_number || '-')}</strong></td>
                                    <td>${esc(inv.supplier_name || '-')}</td>
                                    <td>${inv.invoice_date ? formatDate(inv.invoice_date) : '-'}</td>
                                    <td>${inv.due_date ? formatDate(inv.due_date) : '-'}</td>
                                    <td><strong>${invFormatCurrency(inv.total_ttc)}</strong></td>
                                    <td><span class="badge badge-${invStatusColor(inv.status)}">${invStatusLabel(inv.status)}</span></td>
                                    <td>
                                        <button class="btn btn-sm btn-outline" onclick="invShowDetail(${inv.id})" title="Détail"><i class="fas fa-eye"></i></button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (err) {
        content.innerHTML = '<div class="alert alert-danger">Erreur de chargement du tableau de bord</div>';
        console.error(err);
    }
}

// ============================================================
// ONGLET 2 : DEPOT / OCR
// ============================================================

async function invRenderDeposit(content) {
    showLoading(content);
    try {
        const res = await API.get(`invoices?hotel_id=${invCurrentHotel}&page=${invCurrentPage}&per_page=20`);
        const invoices = res.invoices || [];
        const pagination = res.pagination || {};

        content.innerHTML = `
            <div class="card" style="margin-bottom:var(--space-4)">
                <div class="card-header"><h3><i class="fas fa-upload"></i> Déposer une nouvelle facture</h3></div>
                <div class="card-body" style="padding:var(--space-4)">
                    <form id="inv-upload-form" onsubmit="invUploadInvoice(event)" style="display:flex;gap:var(--space-3);align-items:flex-end;flex-wrap:wrap">
                        <div class="form-group" style="flex:1;min-width:250px;margin-bottom:0">
                            <label>Fichier (PDF, JPG, PNG)</label>
                            <input type="file" id="inv-file" class="form-control" accept=".pdf,.jpg,.jpeg,.png" required>
                        </div>
                        <div class="form-group" style="min-width:200px;margin-bottom:0">
                            <label>Fournisseur (optionnel)</label>
                            <div style="position:relative">
                                <input type="text" id="inv-supplier-search" class="form-control" placeholder="Rechercher un fournisseur..." oninput="invSearchSupplier(this.value)" autocomplete="off">
                                <input type="hidden" id="inv-supplier-id">
                                <div id="inv-supplier-dropdown" class="dropdown-menu" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:100;max-height:200px;overflow-y:auto;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:var(--radius-md);box-shadow:var(--shadow-md)"></div>
                            </div>
                        </div>
                        <button type="submit" class="btn btn-primary" id="inv-upload-btn"><i class="fas fa-upload"></i> Déposer & OCR</button>
                    </form>
                </div>
            </div>

            <div class="card">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
                    <h3><i class="fas fa-file-invoice"></i> Liste des factures</h3>
                    <div style="display:flex;gap:var(--space-2)">
                        <select id="inv-filter-status" class="form-control form-control-sm" onchange="invFilterList()" style="min-width:150px">
                            <option value="">Tous les statuts</option>
                            <option value="draft">Brouillon</option>
                            <option value="pending_review">En vérification</option>
                            <option value="pending_approval">En approbation</option>
                            <option value="approved">Approuvée</option>
                            <option value="pending_payment">Paiement en attente</option>
                            <option value="paid">Payée</option>
                            <option value="rejected">Rejetée</option>
                        </select>
                        <input type="text" id="inv-filter-search" class="form-control form-control-sm" placeholder="Rechercher..." onkeyup="if(event.key==='Enter')invFilterList()" style="min-width:200px">
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>N° Facture</th><th>Fournisseur</th><th>Catégorie</th><th>Date</th><th>Échéance</th>
                                <th>HT</th><th>TTC</th><th>OCR</th><th>Statut</th><th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${invoices.length === 0 ? '<tr><td colspan="10" class="text-center">Aucune facture</td></tr>' :
                            invoices.map(inv => `
                                <tr>
                                    <td><strong>${esc(inv.invoice_number || '-')}</strong></td>
                                    <td>${esc(inv.supplier_name || '-')}</td>
                                    <td>${inv.category_name ? `<span class="badge" style="background:${inv.category_color || '#6c757d'};color:#fff">${esc(inv.category_name)}</span>` : '-'}</td>
                                    <td>${inv.invoice_date ? formatDate(inv.invoice_date) : '-'}</td>
                                    <td>${inv.due_date ? formatDate(inv.due_date) : '-'}</td>
                                    <td>${invFormatCurrency(inv.total_ht)}</td>
                                    <td><strong>${invFormatCurrency(inv.total_ttc)}</strong></td>
                                    <td><span class="badge badge-${inv.ocr_status === 'completed' ? 'success' : inv.ocr_status === 'failed' ? 'danger' : 'secondary'}">${invOcrStatusLabel(inv.ocr_status || 'pending')}</span></td>
                                    <td><span class="badge badge-${invStatusColor(inv.status)}">${invStatusLabel(inv.status)}</span></td>
                                    <td>
                                        <button class="btn btn-sm btn-outline" onclick="invShowDetail(${inv.id})" title="Détail"><i class="fas fa-eye"></i></button>
                                        ${inv.status === 'draft' ? `<button class="btn btn-sm btn-outline" onclick="invEditInvoice(${inv.id})" title="Modifier"><i class="fas fa-edit"></i></button>` : ''}
                                        ${inv.status === 'draft' ? `<button class="btn btn-sm btn-outline text-danger" onclick="invDeleteInvoice(${inv.id})" title="Supprimer"><i class="fas fa-trash"></i></button>` : ''}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ${pagination.total_pages > 1 ? `<div id="inv-pagination" style="padding:var(--space-3)">${invRenderPagination(pagination)}</div>` : ''}
            </div>
        `;
    } catch (err) {
        content.innerHTML = '<div class="alert alert-danger">Erreur de chargement</div>';
        console.error(err);
    }
}

let _invSearchTimeout = null;
async function invSearchSupplier(query) {
    clearTimeout(_invSearchTimeout);
    const dropdown = document.getElementById('inv-supplier-dropdown');
    if (query.length < 2) { dropdown.style.display = 'none'; return; }

    _invSearchTimeout = setTimeout(async () => {
        try {
            const res = await API.get(`suppliers/search?q=${encodeURIComponent(query)}&hotel_id=${invCurrentHotel}`);
            const suppliers = res.suppliers || [];
            if (suppliers.length === 0) {
                dropdown.innerHTML = '<div style="padding:8px 12px;color:var(--text-secondary)">Aucun fournisseur trouvé</div>';
            } else {
                dropdown.innerHTML = suppliers.map(s => `
                    <div class="dropdown-item" style="padding:8px 12px;cursor:pointer" onmousedown="invSelectSupplier(${s.id}, '${esc(s.name)}')"
                         onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
                        <strong>${esc(s.name)}</strong> ${s.siret ? `<small style="color:var(--text-secondary)">SIRET: ${esc(s.siret)}</small>` : ''}
                    </div>
                `).join('');
            }
            dropdown.style.display = 'block';
        } catch (e) { dropdown.style.display = 'none'; }
    }, 300);
}

function invSelectSupplier(id, name) {
    document.getElementById('inv-supplier-search').value = name;
    document.getElementById('inv-supplier-id').value = id;
    document.getElementById('inv-supplier-dropdown').style.display = 'none';
}

async function invUploadInvoice(e) {
    e.preventDefault();
    const fileInput = document.getElementById('inv-file');
    const supplierId = document.getElementById('inv-supplier-id').value;
    const btn = document.getElementById('inv-upload-btn');

    if (!fileInput.files[0]) return toast('Sélectionnez un fichier', 'warning');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Traitement OCR...';

    try {
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        formData.append('hotel_id', invCurrentHotel);
        if (supplierId) formData.append('supplier_id', supplierId);

        const res = await API.upload('invoices', formData);
        if (res.success) {
            toast('Facture déposée avec succès' + (res.ocr && res.ocr.success ? ' — OCR terminé' : ''), 'success');
            fileInput.value = '';
            document.getElementById('inv-supplier-search').value = '';
            document.getElementById('inv-supplier-id').value = '';
            invShowDetail(res.id);
        }
    } catch (err) {
        toast('Erreur lors du dépôt : ' + (err.message || err), 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-upload"></i> Déposer & OCR';
    }
}

function invFilterList() {
    invCurrentPage = 1;
    invRenderDeposit(document.getElementById('inv-tab-content'));
}

async function invShowDetail(invoiceId) {
    try {
        const res = await API.get(`invoices/${invoiceId}`);
        const inv = res.invoice;
        if (!inv) return toast('Facture introuvable', 'error');

        const lines = inv.lines || [];
        const docs = inv.documents || [];
        const approvals = inv.approvals || [];
        const payments = inv.payments || [];

        const modalBody = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
                <div>
                    <h4 style="margin-bottom:var(--space-3)">Informations</h4>
                    <table class="table table-sm">
                        <tr><td><strong>N° Facture</strong></td><td>${esc(inv.invoice_number || '-')}</td></tr>
                        <tr><td><strong>Fournisseur</strong></td><td>${esc(inv.supplier_name || '-')}</td></tr>
                        <tr><td><strong>Date facture</strong></td><td>${inv.invoice_date ? formatDate(inv.invoice_date) : '-'}</td></tr>
                        <tr><td><strong>Date échéance</strong></td><td>${inv.due_date ? formatDate(inv.due_date) : '-'}</td></tr>
                        <tr><td><strong>Statut</strong></td><td><span class="badge badge-${invStatusColor(inv.status)}">${invStatusLabel(inv.status)}</span></td></tr>
                        <tr><td><strong>OCR</strong></td><td><span class="badge badge-${inv.ocr_status === 'completed' ? 'success' : 'secondary'}">${invOcrStatusLabel(inv.ocr_status)}</span> ${inv.ocr_confidence ? `(${Math.round(inv.ocr_confidence)}%)` : ''}</td></tr>
                        <tr><td><strong>N° BC</strong></td><td>${esc(inv.po_number || '-')}</td></tr>
                        <tr><td><strong>Code comptable</strong></td><td>${esc(inv.accounting_code || '-')}</td></tr>
                    </table>
                </div>
                <div>
                    <h4 style="margin-bottom:var(--space-3)">Montants</h4>
                    <table class="table table-sm">
                        <tr><td><strong>Total HT</strong></td><td style="text-align:right">${invFormatCurrency(inv.total_ht)}</td></tr>
                        <tr><td><strong>Total TVA</strong></td><td style="text-align:right">${invFormatCurrency(inv.total_tva)}</td></tr>
                        <tr style="font-size:1.1em"><td><strong>Total TTC</strong></td><td style="text-align:right"><strong>${invFormatCurrency(inv.total_ttc)}</strong></td></tr>
                    </table>
                    ${inv.notes ? `<div style="margin-top:var(--space-3)"><strong>Notes :</strong><br>${esc(inv.notes)}</div>` : ''}
                    ${inv.rejection_reason ? `<div class="alert alert-danger" style="margin-top:var(--space-3)"><strong>Motif de rejet :</strong> ${esc(inv.rejection_reason)}</div>` : ''}
                </div>
            </div>

            ${lines.length > 0 ? `
                <h4 style="margin-top:var(--space-5);margin-bottom:var(--space-3)">Lignes de facture</h4>
                <table class="table table-sm">
                    <thead><tr><th>Description</th><th>Qté</th><th>P.U. HT</th><th>TVA %</th><th>Total HT</th><th>Total TTC</th></tr></thead>
                    <tbody>
                        ${lines.map(l => `
                            <tr>
                                <td>${esc(l.description)}</td>
                                <td>${l.quantity}</td>
                                <td>${invFormatCurrency(l.unit_price_ht)}</td>
                                <td>${l.tva_rate}%</td>
                                <td>${invFormatCurrency(l.total_ht)}</td>
                                <td>${invFormatCurrency(l.total_ttc)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            ` : ''}

            ${docs.length > 0 ? `
                <h4 style="margin-top:var(--space-5);margin-bottom:var(--space-3)">Documents</h4>
                <div style="display:flex;gap:var(--space-2);flex-wrap:wrap">
                    ${docs.map(d => `
                        <a href="${d.file_url}" target="_blank" class="btn btn-sm btn-outline"><i class="fas fa-file-${d.file_type === 'pdf' ? 'pdf' : 'image'}"></i> ${esc(d.file_name)}</a>
                    `).join('')}
                </div>
            ` : ''}

            ${approvals.length > 0 ? `
                <h4 style="margin-top:var(--space-5);margin-bottom:var(--space-3)">Historique de validation</h4>
                <table class="table table-sm">
                    <thead><tr><th>Action</th><th>Par</th><th>Date</th><th>Commentaire</th></tr></thead>
                    <tbody>
                        ${approvals.map(a => `
                            <tr>
                                <td><span class="badge badge-${a.action === 'approve' ? 'success' : a.action === 'reject' ? 'danger' : 'info'}">${a.action}</span></td>
                                <td>${esc(a.user_name || '-')}</td>
                                <td>${formatDateTime(a.created_at)}</td>
                                <td>${esc(a.comment || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            ` : ''}

            ${payments.length > 0 ? `
                <h4 style="margin-top:var(--space-5);margin-bottom:var(--space-3)">Paiements</h4>
                <table class="table table-sm">
                    <thead><tr><th>Montant</th><th>Méthode</th><th>Statut</th><th>Référence</th><th>Date</th></tr></thead>
                    <tbody>
                        ${payments.map(p => `
                            <tr>
                                <td>${invFormatCurrency(p.amount)}</td>
                                <td>${p.payment_method === 'fintecture' ? 'Fintecture' : 'Manuel'}</td>
                                <td><span class="badge badge-${p.status === 'completed' ? 'success' : p.status === 'failed' ? 'danger' : 'warning'}">${p.status}</span></td>
                                <td>${esc(p.payment_reference || p.fintecture_session_id || '-')}</td>
                                <td>${p.completed_at ? formatDateTime(p.completed_at) : (p.initiated_at ? formatDateTime(p.initiated_at) : '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            ` : ''}

            <div style="margin-top:var(--space-5);display:flex;gap:var(--space-2);flex-wrap:wrap">
                ${inv.status === 'draft' ? `
                    <button class="btn btn-primary" onclick="invSubmitInvoice(${inv.id})"><i class="fas fa-paper-plane"></i> Soumettre pour vérification</button>
                    <button class="btn btn-outline" onclick="invEditInvoice(${inv.id})"><i class="fas fa-edit"></i> Modifier</button>
                ` : ''}
                ${inv.status === 'pending_review' && hasPermission('invoices.review') ? `
                    <button class="btn btn-primary" onclick="invReviewInvoice(${inv.id})"><i class="fas fa-check"></i> Valider vérification</button>
                    <button class="btn btn-danger" onclick="invRejectInvoice(${inv.id})"><i class="fas fa-times"></i> Rejeter</button>
                ` : ''}
                ${inv.status === 'pending_approval' && hasPermission('invoices.approve') ? `
                    <button class="btn btn-success" onclick="invApproveInvoice(${inv.id})"><i class="fas fa-check-double"></i> Approuver</button>
                    <button class="btn btn-danger" onclick="invRejectInvoice(${inv.id})"><i class="fas fa-times"></i> Rejeter</button>
                ` : ''}
                ${['approved', 'pending_payment'].includes(inv.status) && hasPermission('invoices.pay') ? `
                    <button class="btn btn-success" onclick="invPayInvoice(${inv.id}, 'fintecture')"><i class="fas fa-university"></i> Payer via Fintecture</button>
                    <button class="btn btn-outline" onclick="invMarkPaid(${inv.id})"><i class="fas fa-hand-holding-usd"></i> Marquer payé manuellement</button>
                ` : ''}
            </div>
        `;

        openModal('Facture ' + (inv.invoice_number || '#' + inv.id), modalBody, 'modal-xl');
    } catch (err) {
        toast('Erreur lors du chargement : ' + (err.message || err), 'error');
    }
}

async function invEditInvoice(invoiceId) {
    try {
        const res = await API.get(`invoices/${invoiceId}`);
        const inv = res.invoice;
        if (!inv) return toast('Facture introuvable', 'error');

        const lines = inv.lines || [];

        const modalBody = `
            <form id="inv-edit-form" onsubmit="invSaveEdit(event, ${invoiceId})">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
                    <div class="form-group">
                        <label>Fournisseur *</label>
                        <div style="position:relative">
                            <input type="text" id="inv-edit-supplier-search" class="form-control" value="${esc(inv.supplier_name || '')}"
                                   oninput="invSearchSupplierEdit(this.value)" autocomplete="off">
                            <input type="hidden" id="inv-edit-supplier-id" value="${inv.supplier_id || ''}">
                            <div id="inv-edit-supplier-dropdown" class="dropdown-menu" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:100;max-height:200px;overflow-y:auto;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:var(--radius-md)"></div>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>N° Facture *</label>
                        <input type="text" id="inv-edit-number" class="form-control" value="${esc(inv.invoice_number || '')}" required>
                    </div>
                    <div class="form-group">
                        <label>Date facture</label>
                        <input type="date" id="inv-edit-date" class="form-control" value="${inv.invoice_date || ''}">
                    </div>
                    <div class="form-group">
                        <label>Date échéance</label>
                        <input type="date" id="inv-edit-due" class="form-control" value="${inv.due_date || ''}">
                    </div>
                    <div class="form-group">
                        <label>Total HT</label>
                        <input type="number" step="0.01" id="inv-edit-ht" class="form-control" value="${inv.total_ht || ''}" oninput="invRecalcTotals()">
                    </div>
                    <div class="form-group">
                        <label>Total TVA</label>
                        <input type="number" step="0.01" id="inv-edit-tva" class="form-control" value="${inv.total_tva || ''}" oninput="invRecalcTotals()">
                    </div>
                    <div class="form-group">
                        <label>Total TTC</label>
                        <input type="number" step="0.01" id="inv-edit-ttc" class="form-control" value="${inv.total_ttc || ''}">
                    </div>
                    <div class="form-group">
                        <label>Devise</label>
                        <select id="inv-edit-currency" class="form-control">
                            <option value="EUR" ${inv.currency === 'EUR' ? 'selected' : ''}>EUR</option>
                            <option value="USD" ${inv.currency === 'USD' ? 'selected' : ''}>USD</option>
                            <option value="GBP" ${inv.currency === 'GBP' ? 'selected' : ''}>GBP</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>N° Bon de commande</label>
                        <input type="text" id="inv-edit-po" class="form-control" value="${esc(inv.po_number || '')}">
                    </div>
                    <div class="form-group">
                        <label>Code comptable</label>
                        <input type="text" id="inv-edit-accounting" class="form-control" value="${esc(inv.accounting_code || '')}">
                    </div>
                </div>
                <div class="form-group" style="margin-top:var(--space-3)">
                    <label>Notes</label>
                    <textarea id="inv-edit-notes" class="form-control" rows="2">${esc(inv.notes || '')}</textarea>
                </div>

                <h4 style="margin-top:var(--space-5)">Lignes de facture</h4>
                <div id="inv-edit-lines">
                    ${lines.map((l, i) => invLineRow(i, l)).join('')}
                </div>
                <button type="button" class="btn btn-sm btn-outline" style="margin-top:var(--space-2)" onclick="invAddLine()"><i class="fas fa-plus"></i> Ajouter une ligne</button>

                <div style="margin-top:var(--space-5);display:flex;gap:var(--space-2)">
                    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
                    <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                </div>
            </form>
        `;

        openModal('Modifier la facture', modalBody, 'modal-xl');
    } catch (err) {
        toast('Erreur : ' + (err.message || err), 'error');
    }
}

let _invLineCount = 0;
function invLineRow(idx, line = {}) {
    _invLineCount = Math.max(_invLineCount, idx + 1);
    return `
        <div class="inv-line-row" data-idx="${idx}" style="display:grid;grid-template-columns:3fr 1fr 1fr 1fr 1fr auto;gap:var(--space-2);margin-top:var(--space-2);align-items:end">
            <div class="form-group" style="margin-bottom:0"><input type="text" class="form-control form-control-sm inv-line-desc" value="${esc(line.description || '')}" placeholder="Description"></div>
            <div class="form-group" style="margin-bottom:0"><input type="number" step="0.01" class="form-control form-control-sm inv-line-qty" value="${line.quantity || 1}" placeholder="Qté"></div>
            <div class="form-group" style="margin-bottom:0"><input type="number" step="0.01" class="form-control form-control-sm inv-line-price" value="${line.unit_price_ht || ''}" placeholder="P.U. HT"></div>
            <div class="form-group" style="margin-bottom:0"><input type="number" step="0.01" class="form-control form-control-sm inv-line-tva" value="${line.tva_rate || 20}" placeholder="TVA%"></div>
            <div class="form-group" style="margin-bottom:0"><input type="number" step="0.01" class="form-control form-control-sm inv-line-total" value="${line.total_ht || ''}" placeholder="Total HT" readonly></div>
            <button type="button" class="btn btn-sm btn-outline text-danger" onclick="this.closest('.inv-line-row').remove()"><i class="fas fa-trash"></i></button>
        </div>
    `;
}

function invAddLine() {
    const container = document.getElementById('inv-edit-lines');
    if (!container) return;
    container.insertAdjacentHTML('beforeend', invLineRow(_invLineCount++));
}

function invRecalcTotals() {
    const ht = parseFloat(document.getElementById('inv-edit-ht')?.value) || 0;
    const tva = parseFloat(document.getElementById('inv-edit-tva')?.value) || 0;
    const ttcField = document.getElementById('inv-edit-ttc');
    if (ttcField) ttcField.value = (ht + tva).toFixed(2);
}

async function invSaveEdit(e, invoiceId) {
    e.preventDefault();

    const lineRows = document.querySelectorAll('.inv-line-row');
    const lines = [];
    lineRows.forEach(row => {
        const desc = row.querySelector('.inv-line-desc')?.value;
        const qty = parseFloat(row.querySelector('.inv-line-qty')?.value) || 1;
        const price = parseFloat(row.querySelector('.inv-line-price')?.value) || 0;
        const tvaRate = parseFloat(row.querySelector('.inv-line-tva')?.value) || 20;
        if (desc || price > 0) {
            lines.push({ description: desc, quantity: qty, unit_price_ht: price, tva_rate: tvaRate, total_ht: qty * price });
        }
    });

    try {
        await API.put(`invoices/${invoiceId}`, {
            supplier_id: document.getElementById('inv-edit-supplier-id')?.value || null,
            invoice_number: document.getElementById('inv-edit-number')?.value,
            invoice_date: document.getElementById('inv-edit-date')?.value || null,
            due_date: document.getElementById('inv-edit-due')?.value || null,
            total_ht: parseFloat(document.getElementById('inv-edit-ht')?.value) || null,
            total_tva: parseFloat(document.getElementById('inv-edit-tva')?.value) || null,
            total_ttc: parseFloat(document.getElementById('inv-edit-ttc')?.value) || null,
            currency: document.getElementById('inv-edit-currency')?.value || 'EUR',
            po_number: document.getElementById('inv-edit-po')?.value || null,
            accounting_code: document.getElementById('inv-edit-accounting')?.value || null,
            notes: document.getElementById('inv-edit-notes')?.value || null,
            lines: lines
        });
        toast('Facture mise à jour', 'success');
        closeModal();
        invSwitchTab(invActiveTab);
    } catch (err) {
        toast('Erreur : ' + (err.message || err), 'error');
    }
}

async function invSearchSupplierEdit(query) {
    clearTimeout(_invSearchTimeout);
    const dropdown = document.getElementById('inv-edit-supplier-dropdown');
    if (query.length < 2) { dropdown.style.display = 'none'; return; }

    _invSearchTimeout = setTimeout(async () => {
        try {
            const res = await API.get(`suppliers/search?q=${encodeURIComponent(query)}&hotel_id=${invCurrentHotel}`);
            const suppliers = res.suppliers || [];
            dropdown.innerHTML = suppliers.length === 0
                ? '<div style="padding:8px 12px;color:var(--text-secondary)">Aucun fournisseur</div>'
                : suppliers.map(s => `<div class="dropdown-item" style="padding:8px 12px;cursor:pointer" onmousedown="invSelectSupplierEdit(${s.id}, '${esc(s.name)}')" onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''"><strong>${esc(s.name)}</strong></div>`).join('');
            dropdown.style.display = 'block';
        } catch (e) { dropdown.style.display = 'none'; }
    }, 300);
}

function invSelectSupplierEdit(id, name) {
    document.getElementById('inv-edit-supplier-search').value = name;
    document.getElementById('inv-edit-supplier-id').value = id;
    document.getElementById('inv-edit-supplier-dropdown').style.display = 'none';
}

async function invSubmitInvoice(invoiceId) {
    if (!confirm('Soumettre cette facture pour vérification ?')) return;
    try {
        await API.put(`invoices/${invoiceId}/submit`);
        toast('Facture soumise', 'success');
        closeModal();
        invSwitchTab(invActiveTab);
    } catch (err) { toast('Erreur : ' + (err.message || err), 'error'); }
}

async function invReviewInvoice(invoiceId) {
    const comment = prompt('Commentaire de vérification (optionnel) :');
    try {
        await API.put(`invoices/${invoiceId}/review`, { comment });
        toast('Vérification validée', 'success');
        closeModal();
        invSwitchTab(invActiveTab);
    } catch (err) { toast('Erreur : ' + (err.message || err), 'error'); }
}

async function invApproveInvoice(invoiceId) {
    const comment = prompt('Commentaire d\'approbation (optionnel) :');
    try {
        const res = await API.put(`invoices/${invoiceId}/approve`, { comment });
        if (res.needs_second_approval) {
            toast(res.message, 'warning');
        } else {
            toast('Facture approuvée', 'success');
        }
        closeModal();
        invSwitchTab(invActiveTab);
    } catch (err) { toast('Erreur : ' + (err.message || err), 'error'); }
}

async function invRejectInvoice(invoiceId) {
    const reason = prompt('Motif de rejet (obligatoire) :');
    if (!reason) return toast('Le motif est obligatoire', 'warning');
    try {
        await API.put(`invoices/${invoiceId}/reject`, { reason });
        toast('Facture rejetée', 'success');
        closeModal();
        invSwitchTab(invActiveTab);
    } catch (err) { toast('Erreur : ' + (err.message || err), 'error'); }
}

async function invPayInvoice(invoiceId, method) {
    if (!confirm('Initier le paiement via Fintecture ?')) return;
    try {
        const res = await API.post(`invoices/${invoiceId}/pay`, { payment_method: method });
        if (res.redirect_url) {
            toast('Paiement initié — Redirection vers la banque...', 'success');
            setTimeout(() => { window.open(res.redirect_url, '_blank'); }, 1000);
        } else {
            toast(res.message || 'Paiement initié', 'success');
        }
        closeModal();
        invSwitchTab(invActiveTab);
    } catch (err) { toast('Erreur : ' + (err.message || err), 'error'); }
}

async function invMarkPaid(invoiceId) {
    const ref = prompt('Référence de paiement (optionnel) :');
    try {
        await API.put(`invoices/${invoiceId}/mark-paid`, { payment_reference: ref });
        toast('Facture marquée comme payée', 'success');
        closeModal();
        invSwitchTab(invActiveTab);
    } catch (err) { toast('Erreur : ' + (err.message || err), 'error'); }
}

async function invDeleteInvoice(invoiceId) {
    if (!confirm('Supprimer ce brouillon ?')) return;
    try {
        await API.delete(`invoices/${invoiceId}`);
        toast('Brouillon supprimé', 'success');
        invSwitchTab(invActiveTab);
    } catch (err) { toast('Erreur : ' + (err.message || err), 'error'); }
}

// ============================================================
// ONGLET 3 : FOURNISSEURS
// ============================================================

async function invRenderSuppliers(content) {
    showLoading(content);
    try {
        const res = await API.get(`suppliers?hotel_id=${invCurrentHotel}&per_page=50`);
        const suppliers = res.suppliers || [];

        content.innerHTML = `
            <div class="card">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
                    <h3><i class="fas fa-building"></i> Fournisseurs</h3>
                    ${hasPermission('suppliers.manage') ? `<button class="btn btn-primary" onclick="invShowCreateSupplier()"><i class="fas fa-plus"></i> Nouveau fournisseur</button>` : ''}
                </div>
                <div class="table-responsive">
                    <table class="table">
                        <thead>
                            <tr><th>Raison sociale</th><th>SIRET</th><th>Catégorie</th><th>Contact</th><th>Mode paiement</th><th>Délai</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                            ${suppliers.length === 0 ? '<tr><td colspan="7" class="text-center">Aucun fournisseur</td></tr>' :
                            suppliers.map(s => `
                                <tr>
                                    <td><strong>${esc(s.name)}</strong></td>
                                    <td>${esc(s.siret || '-')}</td>
                                    <td>${s.category_name ? `<span class="badge" style="background:${s.category_color || '#6c757d'};color:#fff">${esc(s.category_name)}</span>` : '-'}</td>
                                    <td>${esc(s.contact_email || s.contact_phone || '-')}</td>
                                    <td>${invPaymentMethodLabel(s.payment_method)}</td>
                                    <td>${s.payment_delay_days}j</td>
                                    <td>
                                        <button class="btn btn-sm btn-outline" onclick="invShowSupplierDetail(${s.id})" title="Détail"><i class="fas fa-eye"></i></button>
                                        ${hasPermission('suppliers.manage') ? `<button class="btn btn-sm btn-outline" onclick="invEditSupplier(${s.id})" title="Modifier"><i class="fas fa-edit"></i></button>` : ''}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (err) {
        content.innerHTML = '<div class="alert alert-danger">Erreur de chargement</div>';
        console.error(err);
    }
}

function invPaymentMethodLabel(method) {
    const map = { fintecture: 'Fintecture', virement_manuel: 'Virement manuel', cheque: 'Chèque', prelevement: 'Prélèvement', carte: 'Carte bancaire', especes: 'Espèces' };
    return map[method] || method || '-';
}

function invShowCreateSupplier() {
    invShowSupplierForm();
}

async function invEditSupplier(supplierId) {
    try {
        const res = await API.get(`suppliers/${supplierId}`);
        invShowSupplierForm(res.supplier);
    } catch (err) { toast('Erreur : ' + (err.message || err), 'error'); }
}

function invShowSupplierForm(supplier = null) {
    const isEdit = !!supplier;
    const hotels = supplier?.hotels || [];

    const modalBody = `
        <form id="inv-supplier-form" onsubmit="invSaveSupplier(event, ${supplier ? supplier.id : 'null'})">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
                <div class="form-group"><label>Raison sociale *</label><input type="text" id="sup-name" class="form-control" value="${esc(supplier?.name || '')}" required></div>
                <div class="form-group"><label>SIRET</label><input type="text" id="sup-siret" class="form-control" value="${esc(supplier?.siret || '')}" maxlength="14"></div>
                <div class="form-group"><label>N° TVA</label><input type="text" id="sup-tva" class="form-control" value="${esc(supplier?.tva_number || '')}"></div>
                <div class="form-group">
                    <label>Catégorie</label>
                    <select id="sup-category" class="form-control">
                        <option value="">-- Aucune --</option>
                        ${invCategories.map(c => `<option value="${c.id}" ${supplier?.category_id == c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group"><label>Adresse</label><input type="text" id="sup-street" class="form-control" value="${esc(supplier?.address_street || '')}"></div>
                <div class="form-group"><label>Code postal</label><input type="text" id="sup-zip" class="form-control" value="${esc(supplier?.address_zip || '')}"></div>
                <div class="form-group"><label>Ville</label><input type="text" id="sup-city" class="form-control" value="${esc(supplier?.address_city || '')}"></div>
                <div class="form-group"><label>Pays</label><input type="text" id="sup-country" class="form-control" value="${esc(supplier?.address_country || 'FR')}"></div>
                <div class="form-group"><label>Nom contact</label><input type="text" id="sup-contact-name" class="form-control" value="${esc(supplier?.contact_name || '')}"></div>
                <div class="form-group"><label>Email</label><input type="email" id="sup-email" class="form-control" value="${esc(supplier?.contact_email || '')}"></div>
                <div class="form-group"><label>Téléphone</label><input type="text" id="sup-phone" class="form-control" value="${esc(supplier?.contact_phone || '')}"></div>
                <div class="form-group">
                    <label>Mode de paiement</label>
                    <select id="sup-payment-method" class="form-control">
                        <option value="fintecture" ${supplier?.payment_method === 'fintecture' ? 'selected' : ''}>Fintecture (virement Open Banking)</option>
                        <option value="virement_manuel" ${supplier?.payment_method === 'virement_manuel' ? 'selected' : ''}>Virement manuel</option>
                        <option value="cheque" ${supplier?.payment_method === 'cheque' ? 'selected' : ''}>Chèque</option>
                        <option value="prelevement" ${supplier?.payment_method === 'prelevement' ? 'selected' : ''}>Prélèvement</option>
                        <option value="carte" ${supplier?.payment_method === 'carte' ? 'selected' : ''}>Carte bancaire</option>
                        <option value="especes" ${supplier?.payment_method === 'especes' ? 'selected' : ''}>Espèces</option>
                    </select>
                </div>
                <div class="form-group"><label>Délai paiement (jours)</label><input type="number" id="sup-delay" class="form-control" value="${supplier?.payment_delay_days || 30}"></div>
                <div class="form-group"><label>IBAN</label><input type="text" id="sup-iban" class="form-control" value="${esc(supplier?.iban || '')}"></div>
                <div class="form-group"><label>BIC</label><input type="text" id="sup-bic" class="form-control" value="${esc(supplier?.bic || '')}"></div>
            </div>

            <div class="form-group" style="margin-top:var(--space-3)">
                <label>Hôtels affectés</label>
                <div style="display:flex;gap:var(--space-3);flex-wrap:wrap">
                    ${invHotels.map(h => {
                        const checked = isEdit ? hotels.some(hs => hs.hotel_id == h.id && hs.is_active) : h.id == invCurrentHotel;
                        return `<label style="display:flex;align-items:center;gap:4px"><input type="checkbox" class="sup-hotel-cb" value="${h.id}" ${checked ? 'checked' : ''}> ${esc(h.name)}</label>`;
                    }).join('')}
                </div>
            </div>

            <div class="form-group" style="margin-top:var(--space-3)">
                <label>Notes</label>
                <textarea id="sup-notes" class="form-control" rows="2">${esc(supplier?.notes || '')}</textarea>
            </div>

            <div style="margin-top:var(--space-4);display:flex;gap:var(--space-2)">
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ${isEdit ? 'Mettre à jour' : 'Créer'}</button>
                <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
            </div>
        </form>
    `;

    openModal(isEdit ? 'Modifier le fournisseur' : 'Nouveau fournisseur', modalBody, 'modal-lg');
}

async function invSaveSupplier(e, supplierId) {
    e.preventDefault();

    const hotelCheckboxes = document.querySelectorAll('.sup-hotel-cb:checked');
    const hotelIds = Array.from(hotelCheckboxes).map(cb => parseInt(cb.value));
    if (hotelIds.length === 0) return toast('Sélectionnez au moins un hôtel', 'warning');

    const data = {
        name: document.getElementById('sup-name').value,
        siret: document.getElementById('sup-siret').value || null,
        tva_number: document.getElementById('sup-tva').value || null,
        category_id: document.getElementById('sup-category').value || null,
        address_street: document.getElementById('sup-street').value || null,
        address_zip: document.getElementById('sup-zip').value || null,
        address_city: document.getElementById('sup-city').value || null,
        address_country: document.getElementById('sup-country').value || 'FR',
        contact_name: document.getElementById('sup-contact-name').value || null,
        contact_email: document.getElementById('sup-email').value || null,
        contact_phone: document.getElementById('sup-phone').value || null,
        payment_method: document.getElementById('sup-payment-method').value,
        payment_delay_days: parseInt(document.getElementById('sup-delay').value) || 30,
        iban: document.getElementById('sup-iban').value || null,
        bic: document.getElementById('sup-bic').value || null,
        notes: document.getElementById('sup-notes').value || null,
        hotel_ids: hotelIds
    };

    try {
        if (supplierId) {
            await API.put(`suppliers/${supplierId}`, data);
            // Mettre à jour l'affectation hôtels séparément
            await API.put(`suppliers/${supplierId}/hotels`, { hotel_ids: hotelIds });
            toast('Fournisseur mis à jour', 'success');
        } else {
            await API.post('suppliers', data);
            toast('Fournisseur créé', 'success');
        }
        closeModal();
        invSwitchTab('suppliers');
    } catch (err) {
        toast('Erreur : ' + (err.message || err), 'error');
    }
}

async function invShowSupplierDetail(supplierId) {
    try {
        const res = await API.get(`suppliers/${supplierId}`);
        const s = res.supplier;
        const hotels = s.hotels || [];

        const body = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
                <div>
                    <h4>Informations</h4>
                    <table class="table table-sm">
                        <tr><td><strong>Raison sociale</strong></td><td>${esc(s.name)}</td></tr>
                        <tr><td><strong>SIRET</strong></td><td>${esc(s.siret || '-')}</td></tr>
                        <tr><td><strong>N° TVA</strong></td><td>${esc(s.tva_number || '-')}</td></tr>
                        <tr><td><strong>Adresse</strong></td><td>${esc([s.address_street, s.address_zip, s.address_city, s.address_country].filter(Boolean).join(', ') || '-')}</td></tr>
                        <tr><td><strong>Contact</strong></td><td>${esc(s.contact_name || '-')}</td></tr>
                        <tr><td><strong>Email</strong></td><td>${esc(s.contact_email || '-')}</td></tr>
                        <tr><td><strong>Téléphone</strong></td><td>${esc(s.contact_phone || '-')}</td></tr>
                    </table>
                </div>
                <div>
                    <h4>Paiement</h4>
                    <table class="table table-sm">
                        <tr><td><strong>Mode</strong></td><td>${invPaymentMethodLabel(s.payment_method)}</td></tr>
                        <tr><td><strong>Délai</strong></td><td>${s.payment_delay_days} jours</td></tr>
                        <tr><td><strong>IBAN</strong></td><td>${esc(s.iban ? s.iban.substring(0, 8) + '...' : '-')}</td></tr>
                        <tr><td><strong>BIC</strong></td><td>${esc(s.bic || '-')}</td></tr>
                    </table>
                    <h4 style="margin-top:var(--space-4)">Hôtels</h4>
                    <div>${hotels.map(h => `<span class="badge badge-${h.is_active ? 'success' : 'secondary'}" style="margin:2px">${esc(h.hotel_name)}</span>`).join('') || '-'}</div>
                </div>
            </div>
            ${s.notes ? `<div style="margin-top:var(--space-4)"><strong>Notes :</strong> ${esc(s.notes)}</div>` : ''}
        `;

        openModal(s.name, body, 'modal-lg');
    } catch (err) { toast('Erreur : ' + (err.message || err), 'error'); }
}

// ============================================================
// ONGLET 4 : PAIEMENTS
// ============================================================

async function invRenderPayments(content) {
    showLoading(content);
    try {
        const res = await API.get(`invoices?hotel_id=${invCurrentHotel}&per_page=50`);
        const allInv = res.invoices || [];
        const payable = allInv.filter(i => ['approved', 'pending_payment', 'payment_initiated'].includes(i.status));
        const paid = allInv.filter(i => i.status === 'paid');

        content.innerHTML = `
            <div class="card" style="margin-bottom:var(--space-4)">
                <div class="card-header"><h3><i class="fas fa-hourglass-half"></i> Factures en attente de paiement (${payable.length})</h3></div>
                <div class="table-responsive">
                    <table class="table">
                        <thead><tr><th>N° Facture</th><th>Fournisseur</th><th>Échéance</th><th>Montant TTC</th><th>Statut</th><th>Actions</th></tr></thead>
                        <tbody>
                            ${payable.length === 0 ? '<tr><td colspan="6" class="text-center">Aucune facture en attente</td></tr>' :
                            payable.map(inv => `
                                <tr ${inv.due_date && new Date(inv.due_date) < new Date() ? 'style="background:var(--danger-50)"' : ''}>
                                    <td><strong>${esc(inv.invoice_number || '-')}</strong></td>
                                    <td>${esc(inv.supplier_name || '-')}</td>
                                    <td>${inv.due_date ? formatDate(inv.due_date) : '-'}</td>
                                    <td><strong>${invFormatCurrency(inv.total_ttc)}</strong></td>
                                    <td><span class="badge badge-${invStatusColor(inv.status)}">${invStatusLabel(inv.status)}</span></td>
                                    <td>
                                        ${hasPermission('invoices.pay') ? `
                                            <button class="btn btn-sm btn-success" onclick="invPayInvoice(${inv.id}, 'fintecture')"><i class="fas fa-university"></i> Fintecture</button>
                                            <button class="btn btn-sm btn-outline" onclick="invMarkPaid(${inv.id})"><i class="fas fa-hand-holding-usd"></i> Manuel</button>
                                        ` : ''}
                                        <button class="btn btn-sm btn-outline" onclick="invShowDetail(${inv.id})"><i class="fas fa-eye"></i></button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card">
                <div class="card-header"><h3><i class="fas fa-check-circle"></i> Dernières factures payées</h3></div>
                <div class="table-responsive">
                    <table class="table">
                        <thead><tr><th>N° Facture</th><th>Fournisseur</th><th>Montant TTC</th><th>Référence paiement</th><th>Date paiement</th></tr></thead>
                        <tbody>
                            ${paid.length === 0 ? '<tr><td colspan="5" class="text-center">Aucune facture payée</td></tr>' :
                            paid.slice(0, 20).map(inv => `
                                <tr>
                                    <td><strong>${esc(inv.invoice_number || '-')}</strong></td>
                                    <td>${esc(inv.supplier_name || '-')}</td>
                                    <td>${invFormatCurrency(inv.total_ttc)}</td>
                                    <td>${esc(inv.payment_reference || '-')}</td>
                                    <td>${inv.paid_at ? formatDateTime(inv.paid_at) : '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (err) {
        content.innerHTML = '<div class="alert alert-danger">Erreur de chargement</div>';
        console.error(err);
    }
}

// ============================================================
// ONGLET 5 : REPORTING
// ============================================================

let _invReportYear = new Date().getFullYear();

async function invRenderReporting(content) {
    showLoading(content);
    try {
        const res = await API.get(`invoices/reporting?hotel_id=${invCurrentHotel}&year=${_invReportYear}`);
        const data = res.reporting || [];
        const prevYear = res.previous_year || [];

        // Structurer les données par catégorie
        const categories = {};
        data.forEach(row => {
            const catName = row.category_name || 'Non catégorisé';
            if (!categories[catName]) categories[catName] = { color: row.color || '#6c757d', months: Array(12).fill(0) };
            categories[catName].months[parseInt(row.month) - 1] = parseFloat(row.total);
        });

        const prevCategories = {};
        prevYear.forEach(row => {
            const catId = row.category_id || 0;
            if (!prevCategories[catId]) prevCategories[catId] = Array(12).fill(0);
            prevCategories[catId][parseInt(row.month) - 1] = parseFloat(row.total);
        });

        const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

        content.innerHTML = `
            <div class="card">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
                    <h3><i class="fas fa-chart-bar"></i> Reporting dépenses par catégorie</h3>
                    <div style="display:flex;gap:var(--space-2);align-items:center">
                        <button class="btn btn-sm btn-outline" onclick="_invReportYear--;invRenderReporting(document.getElementById('inv-tab-content'))"><i class="fas fa-chevron-left"></i></button>
                        <strong>${_invReportYear}</strong>
                        <button class="btn btn-sm btn-outline" onclick="_invReportYear++;invRenderReporting(document.getElementById('inv-tab-content'))"><i class="fas fa-chevron-right"></i></button>
                        ${hasPermission('invoices.export') ? `<button class="btn btn-sm btn-outline" onclick="invExportReporting()"><i class="fas fa-file-csv"></i> Export CSV</button>` : ''}
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Catégorie</th>
                                ${monthNames.map(m => `<th style="text-align:right">${m}</th>`).join('')}
                                <th style="text-align:right"><strong>Total</strong></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.keys(categories).length === 0 ? '<tr><td colspan="14" class="text-center">Aucune donnée pour cette année</td></tr>' :
                            Object.entries(categories).map(([catName, catData]) => {
                                const total = catData.months.reduce((a, b) => a + b, 0);
                                return `
                                    <tr>
                                        <td><span class="badge" style="background:${catData.color};color:#fff">${esc(catName)}</span></td>
                                        ${catData.months.map(m => `<td style="text-align:right">${m > 0 ? invFormatCurrency(m) : '-'}</td>`).join('')}
                                        <td style="text-align:right"><strong>${invFormatCurrency(total)}</strong></td>
                                    </tr>
                                `;
                            }).join('')}
                            ${Object.keys(categories).length > 0 ? `
                                <tr style="font-weight:bold;border-top:2px solid var(--border-color)">
                                    <td>TOTAL</td>
                                    ${Array.from({length: 12}, (_, m) => {
                                        const monthTotal = Object.values(categories).reduce((sum, cat) => sum + cat.months[m], 0);
                                        return `<td style="text-align:right">${monthTotal > 0 ? invFormatCurrency(monthTotal) : '-'}</td>`;
                                    }).join('')}
                                    <td style="text-align:right">${invFormatCurrency(Object.values(categories).reduce((sum, cat) => sum + cat.months.reduce((a, b) => a + b, 0), 0))}</td>
                                </tr>
                            ` : ''}
                        </tbody>
                    </table>
                </div>
            </div>

            <div id="inv-report-chart" class="card" style="margin-top:var(--space-4);padding:var(--space-4)">
                <canvas id="inv-chart-canvas" height="300"></canvas>
            </div>
        `;

        // Chart.js
        invRenderChart(categories, monthNames);
    } catch (err) {
        content.innerHTML = '<div class="alert alert-danger">Erreur de chargement du reporting</div>';
        console.error(err);
    }
}

function invRenderChart(categories, monthNames) {
    const canvas = document.getElementById('inv-chart-canvas');
    if (!canvas || typeof Chart === 'undefined') return;

    const datasets = Object.entries(categories).map(([name, data]) => ({
        label: name,
        data: data.months,
        backgroundColor: data.color + '80',
        borderColor: data.color,
        borderWidth: 1
    }));

    new Chart(canvas, {
        type: 'bar',
        data: { labels: monthNames, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' }, title: { display: true, text: `Dépenses par catégorie — ${_invReportYear}` } },
            scales: {
                x: { stacked: true },
                y: { stacked: true, ticks: { callback: v => invFormatCurrency(v) } }
            }
        }
    });
}

async function invExportReporting() {
    try {
        window.open(`${CONFIG.API_URL}/invoices/reporting/export?hotel_id=${invCurrentHotel}&year=${_invReportYear}&token=${API.token}`, '_blank');
    } catch (err) { toast('Erreur export', 'error'); }
}

// ============================================================
// ONGLET 6 : EXTRACTION
// ============================================================

async function invRenderExtraction(content) {
    content.innerHTML = `
        <div class="card">
            <div class="card-header"><h3><i class="fas fa-file-export"></i> Extraction de factures</h3></div>
            <div class="card-body" style="padding:var(--space-4)">
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--space-3)">
                    <div class="form-group">
                        <label>Date facture - du</label>
                        <input type="date" id="ext-inv-from" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Date facture - au</label>
                        <input type="date" id="ext-inv-to" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Date import - du</label>
                        <input type="date" id="ext-created-from" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Date import - au</label>
                        <input type="date" id="ext-created-to" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Date paiement - du</label>
                        <input type="date" id="ext-paid-from" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Date paiement - au</label>
                        <input type="date" id="ext-paid-to" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Statut</label>
                        <select id="ext-status" class="form-control">
                            <option value="">Tous</option>
                            <option value="draft">Brouillon</option>
                            <option value="pending_review">En vérification</option>
                            <option value="pending_approval">En approbation</option>
                            <option value="approved">Approuvée</option>
                            <option value="paid">Payée</option>
                            <option value="rejected">Rejetée</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Catégorie</label>
                        <select id="ext-category" class="form-control">
                            <option value="">Toutes</option>
                            ${invCategories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div style="margin-top:var(--space-4);display:flex;gap:var(--space-2)">
                    <button class="btn btn-primary" onclick="invExtractSearch()"><i class="fas fa-search"></i> Rechercher</button>
                    <button class="btn btn-outline" onclick="invExtractCSV()"><i class="fas fa-file-csv"></i> Export CSV</button>
                    <button class="btn btn-outline" onclick="invExtractPDF()"><i class="fas fa-file-pdf"></i> Export PDF</button>
                </div>
            </div>
        </div>

        <div id="ext-results" style="margin-top:var(--space-4)"></div>
    `;
}

function invBuildExtractParams() {
    const params = new URLSearchParams();
    params.append('hotel_id', invCurrentHotel);
    const fields = {
        'invoice_date_from': 'ext-inv-from', 'invoice_date_to': 'ext-inv-to',
        'created_from': 'ext-created-from', 'created_to': 'ext-created-to',
        'paid_from': 'ext-paid-from', 'paid_to': 'ext-paid-to',
        'status': 'ext-status', 'category_id': 'ext-category'
    };
    for (const [param, elId] of Object.entries(fields)) {
        const val = document.getElementById(elId)?.value;
        if (val) params.append(param, val);
    }
    return params.toString();
}

async function invExtractSearch() {
    const resultsDiv = document.getElementById('ext-results');
    if (!resultsDiv) return;
    showLoading(resultsDiv);

    try {
        const res = await API.get(`invoices/extract?${invBuildExtractParams()}&per_page=100`);
        const invoices = res.invoices || [];

        let totalHt = 0, totalTva = 0, totalTtc = 0;
        invoices.forEach(i => { totalHt += parseFloat(i.total_ht || 0); totalTva += parseFloat(i.total_tva || 0); totalTtc += parseFloat(i.total_ttc || 0); });

        resultsDiv.innerHTML = `
            <div class="card">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
                    <h3>${invoices.length} facture(s) trouvée(s)</h3>
                    <div>
                        <strong>HT:</strong> ${invFormatCurrency(totalHt)} |
                        <strong>TVA:</strong> ${invFormatCurrency(totalTva)} |
                        <strong>TTC:</strong> ${invFormatCurrency(totalTtc)}
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead>
                            <tr><th>N° Facture</th><th>Fournisseur</th><th>Catégorie</th><th>Hôtel</th><th>Date</th><th>Échéance</th><th>HT</th><th>TVA</th><th>TTC</th><th>Statut</th></tr>
                        </thead>
                        <tbody>
                            ${invoices.map(inv => `
                                <tr>
                                    <td>${esc(inv.invoice_number || '-')}</td>
                                    <td>${esc(inv.supplier_name || '-')}</td>
                                    <td>${esc(inv.category_name || '-')}</td>
                                    <td>${esc(inv.hotel_name || '-')}</td>
                                    <td>${inv.invoice_date ? formatDate(inv.invoice_date) : '-'}</td>
                                    <td>${inv.due_date ? formatDate(inv.due_date) : '-'}</td>
                                    <td style="text-align:right">${invFormatCurrency(inv.total_ht)}</td>
                                    <td style="text-align:right">${invFormatCurrency(inv.total_tva)}</td>
                                    <td style="text-align:right"><strong>${invFormatCurrency(inv.total_ttc)}</strong></td>
                                    <td><span class="badge badge-${invStatusColor(inv.status)}">${invStatusLabel(inv.status)}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (err) {
        resultsDiv.innerHTML = '<div class="alert alert-danger">Erreur de recherche</div>';
        console.error(err);
    }
}

function invExtractCSV() {
    window.open(`${CONFIG.API_URL}/invoices/extract/csv?${invBuildExtractParams()}&token=${API.token}`, '_blank');
}

function invExtractPDF() {
    // Utiliser l'endpoint qui retourne JSON puis générer en client (si jsPDF disponible) ou ouvrir directement
    window.open(`${CONFIG.API_URL}/invoices/extract/csv?${invBuildExtractParams()}&token=${API.token}`, '_blank');
    toast('Export CSV généré. Pour un PDF, utilisez l\'impression du navigateur.', 'info');
}

// ============================================================
// ONGLET 7 : CONFIGURATION
// ============================================================

async function invRenderConfig(content) {
    showLoading(content);
    try {
        const [rulesRes, fintectureRes, ocrRes] = await Promise.all([
            API.get(`invoices/approval-rules?hotel_id=${invCurrentHotel}`),
            API.get(`invoices/fintecture-config?hotel_id=${invCurrentHotel}`),
            API.get('invoices/ocr-status')
        ]);

        const rules = rulesRes.rules || [];
        const fConfig = fintectureRes.config || {};
        const prereqs = ocrRes.prerequisites || {};

        content.innerHTML = `
            <!-- Workflow de validation -->
            <div class="card" style="margin-bottom:var(--space-4)">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
                    <h3><i class="fas fa-tasks"></i> Workflow de validation</h3>
                    <div style="display:flex;gap:var(--space-2)">
                        <button class="btn btn-sm btn-primary" onclick="invAddRule()"><i class="fas fa-plus"></i> Ajouter une règle</button>
                        ${invHotels.length > 1 ? `<button class="btn btn-sm btn-outline" onclick="invReplicateRules()"><i class="fas fa-copy"></i> Répliquer vers d'autres hôtels</button>` : ''}
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table">
                        <thead><tr><th>Nom</th><th>Montant min</th><th>Montant max</th><th>Rôle requis</th><th>Double validation</th><th>2ème valideur</th><th>Catégorie</th><th>Actif</th><th>Actions</th></tr></thead>
                        <tbody>
                            ${rules.length === 0 ? '<tr><td colspan="9" class="text-center">Aucune règle configurée — les factures seront approuvées sans contrôle de montant</td></tr>' :
                            rules.map(r => `
                                <tr>
                                    <td><strong>${esc(r.name)}</strong></td>
                                    <td>${invFormatCurrency(r.min_amount)}</td>
                                    <td>${r.max_amount ? invFormatCurrency(r.max_amount) : '∞'}</td>
                                    <td>${esc(r.required_role)}</td>
                                    <td>${r.requires_double_approval ? '<i class="fas fa-check text-success"></i>' : '-'}</td>
                                    <td>${esc(r.second_approver_role || '-')}</td>
                                    <td>${esc(r.category_name || 'Toutes')}</td>
                                    <td>${r.is_active ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-danger"></i>'}</td>
                                    <td>
                                        <button class="btn btn-sm btn-outline" onclick="invEditRule(${r.id})"><i class="fas fa-edit"></i></button>
                                        <button class="btn btn-sm btn-outline text-danger" onclick="invDeleteRule(${r.id})"><i class="fas fa-trash"></i></button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Configuration Fintecture -->
            <div class="card" style="margin-bottom:var(--space-4)">
                <div class="card-header"><h3><i class="fas fa-university"></i> Configuration Fintecture</h3></div>
                <div class="card-body" style="padding:var(--space-4)">
                    <form id="inv-fintecture-form" onsubmit="invSaveFintecture(event)">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
                            <div class="form-group">
                                <label>App ID</label>
                                <input type="text" id="fint-app-id" class="form-control" value="${esc(fConfig.app_id || '')}" placeholder="Votre App ID Fintecture">
                            </div>
                            <div class="form-group">
                                <label>App Secret ${fConfig.has_secret ? '(déjà configuré)' : ''}</label>
                                <input type="password" id="fint-app-secret" class="form-control" placeholder="${fConfig.has_secret ? '••••••••' : 'Votre App Secret'}">
                            </div>
                            <div class="form-group">
                                <label>Environnement</label>
                                <select id="fint-env" class="form-control">
                                    <option value="sandbox" ${fConfig.environment === 'sandbox' ? 'selected' : ''}>Sandbox (test)</option>
                                    <option value="production" ${fConfig.environment === 'production' ? 'selected' : ''}>Production</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Webhook Secret ${fConfig.has_webhook_secret ? '(déjà configuré)' : ''}</label>
                                <input type="password" id="fint-webhook-secret" class="form-control" placeholder="${fConfig.has_webhook_secret ? '••••••••' : 'Secret pour vérifier les webhooks'}">
                            </div>
                            <div class="form-group">
                                <label><input type="checkbox" id="fint-active" ${fConfig.is_active ? 'checked' : ''}> Activer Fintecture</label>
                            </div>
                        </div>
                        <div style="margin-top:var(--space-3);display:flex;gap:var(--space-2)">
                            <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Sauvegarder</button>
                            <button type="button" class="btn btn-outline" onclick="invTestFintecture()"><i class="fas fa-plug"></i> Tester la connexion</button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Statut OCR -->
            <div class="card">
                <div class="card-header"><h3><i class="fas fa-robot"></i> Statut OCR / IA</h3></div>
                <div class="card-body" style="padding:var(--space-4)">
                    <table class="table table-sm">
                        <tr><td><strong>Tesseract OCR</strong></td><td>${prereqs.tesseract ? `<span class="badge badge-success">Installé</span> ${esc(prereqs.tesseract_version || '')}` : '<span class="badge badge-danger">Non installé</span>'}</td></tr>
                        <tr><td><strong>Langues Tesseract</strong></td><td>${(prereqs.tesseract_languages || []).join(', ') || '-'}</td></tr>
                        <tr><td><strong>Ghostscript (PDF)</strong></td><td>${prereqs.ghostscript ? '<span class="badge badge-success">Installé</span>' : '<span class="badge badge-danger">Non installé</span>'}</td></tr>
                        <tr><td><strong>pdftotext (fallback)</strong></td><td>${prereqs.pdftotext ? '<span class="badge badge-success">Installé</span>' : '<span class="badge badge-warning">Non installé</span>'}</td></tr>
                    </table>
                    <p style="margin-top:var(--space-3);color:var(--text-secondary)">
                        <i class="fas fa-info-circle"></i> La clé API Anthropic (Claude) se configure dans l'onglet IA des paramètres hôtel (Hôtels > Contrats).
                    </p>
                </div>
            </div>
        `;
    } catch (err) {
        content.innerHTML = '<div class="alert alert-danger">Erreur de chargement de la configuration</div>';
        console.error(err);
    }
}

function invAddRule() {
    invShowRuleForm();
}

async function invEditRule(ruleId) {
    try {
        const res = await API.get(`invoices/approval-rules?hotel_id=${invCurrentHotel}`);
        const rule = (res.rules || []).find(r => r.id == ruleId);
        if (!rule) return toast('Règle non trouvée', 'error');
        invShowRuleForm(rule);
    } catch (err) { toast('Erreur', 'error'); }
}

function invShowRuleForm(rule = null) {
    const isEdit = !!rule;
    const roles = ['hotel_manager', 'groupe_manager', 'admin', 'comptabilite'];

    const body = `
        <form onsubmit="invSaveRule(event, ${rule ? rule.id : 'null'})">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
                <div class="form-group"><label>Nom de la règle *</label><input type="text" id="rule-name" class="form-control" value="${esc(rule?.name || '')}" required></div>
                <div class="form-group"><label>Montant minimum (€)</label><input type="number" step="0.01" id="rule-min" class="form-control" value="${rule?.min_amount || 0}"></div>
                <div class="form-group"><label>Montant maximum (€) <small>(vide = illimité)</small></label><input type="number" step="0.01" id="rule-max" class="form-control" value="${rule?.max_amount || ''}"></div>
                <div class="form-group">
                    <label>Rôle requis *</label>
                    <select id="rule-role" class="form-control">${roles.map(r => `<option value="${r}" ${rule?.required_role === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
                </div>
                <div class="form-group"><label><input type="checkbox" id="rule-double" ${rule?.requires_double_approval ? 'checked' : ''}> Double validation requise</label></div>
                <div class="form-group">
                    <label>2ème valideur (si double)</label>
                    <select id="rule-second" class="form-control"><option value="">--</option>${roles.map(r => `<option value="${r}" ${rule?.second_approver_role === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
                </div>
                <div class="form-group">
                    <label>Catégorie fournisseur (optionnel)</label>
                    <select id="rule-category" class="form-control">
                        <option value="">Toutes</option>
                        ${invCategories.map(c => `<option value="${c.id}" ${rule?.supplier_category_id == c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group"><label>Ordre de tri</label><input type="number" id="rule-sort" class="form-control" value="${rule?.sort_order || 0}"></div>
            </div>
            <div style="margin-top:var(--space-4);display:flex;gap:var(--space-2)">
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ${isEdit ? 'Mettre à jour' : 'Créer'}</button>
                <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
            </div>
        </form>
    `;
    openModal(isEdit ? 'Modifier la règle' : 'Nouvelle règle de validation', body, 'modal-lg');
}

async function invSaveRule(e, ruleId) {
    e.preventDefault();
    const data = {
        hotel_id: invCurrentHotel,
        name: document.getElementById('rule-name').value,
        min_amount: parseFloat(document.getElementById('rule-min').value) || 0,
        max_amount: document.getElementById('rule-max').value || null,
        required_role: document.getElementById('rule-role').value,
        requires_double_approval: document.getElementById('rule-double').checked ? 1 : 0,
        second_approver_role: document.getElementById('rule-second').value || null,
        supplier_category_id: document.getElementById('rule-category').value || null,
        sort_order: parseInt(document.getElementById('rule-sort').value) || 0
    };

    try {
        if (ruleId) {
            await API.put(`invoices/approval-rules/${ruleId}`, data);
        } else {
            await API.post('invoices/approval-rules', data);
        }
        toast('Règle sauvegardée', 'success');
        closeModal();
        invRenderConfig(document.getElementById('inv-tab-content'));
    } catch (err) { toast('Erreur : ' + (err.message || err), 'error'); }
}

async function invDeleteRule(ruleId) {
    if (!confirm('Supprimer cette règle ?')) return;
    try {
        await API.delete(`invoices/approval-rules/${ruleId}`);
        toast('Règle supprimée', 'success');
        invRenderConfig(document.getElementById('inv-tab-content'));
    } catch (err) { toast('Erreur : ' + (err.message || err), 'error'); }
}

async function invReplicateRules() {
    const otherHotels = invHotels.filter(h => h.id != invCurrentHotel);
    if (otherHotels.length === 0) return toast('Aucun autre hôtel disponible', 'warning');

    const body = `
        <form onsubmit="invDoReplicate(event)">
            <p>Répliquer les règles de validation de <strong>${esc(invHotels.find(h => h.id == invCurrentHotel)?.name || '')}</strong> vers :</p>
            <div style="display:flex;flex-direction:column;gap:var(--space-2);margin:var(--space-4) 0">
                ${otherHotels.map(h => `<label><input type="checkbox" class="repl-hotel-cb" value="${h.id}"> ${esc(h.name)}</label>`).join('')}
            </div>
            <p class="text-danger"><i class="fas fa-exclamation-triangle"></i> Les règles existantes des hôtels cibles seront remplacées.</p>
            <button type="submit" class="btn btn-primary"><i class="fas fa-copy"></i> Répliquer</button>
        </form>
    `;
    openModal('Répliquer le workflow', body, 'modal-md');
}

async function invDoReplicate(e) {
    e.preventDefault();
    const checkboxes = document.querySelectorAll('.repl-hotel-cb:checked');
    const targetIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    if (targetIds.length === 0) return toast('Sélectionnez au moins un hôtel', 'warning');

    try {
        const res = await API.post('invoices/approval-rules/replicate', {
            source_hotel_id: invCurrentHotel,
            target_hotel_ids: targetIds
        });
        toast(`Règles répliquées vers ${res.replicated_count} hôtel(s)`, 'success');
        closeModal();
    } catch (err) { toast('Erreur : ' + (err.message || err), 'error'); }
}

async function invSaveFintecture(e) {
    e.preventDefault();
    try {
        await API.put('invoices/fintecture-config', {
            hotel_id: invCurrentHotel,
            app_id: document.getElementById('fint-app-id').value || null,
            app_secret: document.getElementById('fint-app-secret').value || null,
            environment: document.getElementById('fint-env').value,
            webhook_secret: document.getElementById('fint-webhook-secret').value || null,
            is_active: document.getElementById('fint-active').checked ? 1 : 0
        });
        toast('Configuration Fintecture sauvegardée', 'success');
    } catch (err) { toast('Erreur : ' + (err.message || err), 'error'); }
}

async function invTestFintecture() {
    try {
        const res = await API.put('invoices/fintecture-config', {
            hotel_id: invCurrentHotel,
            app_id: document.getElementById('fint-app-id').value || null,
            app_secret: document.getElementById('fint-app-secret').value || null,
            environment: document.getElementById('fint-env').value,
            is_active: document.getElementById('fint-active').checked ? 1 : 0,
            test_connection: true
        });
        if (res.test?.success) {
            toast('Connexion Fintecture OK (' + res.test.environment + ')', 'success');
        } else {
            toast('Erreur connexion : ' + (res.test?.error || 'Inconnue'), 'error');
        }
    } catch (err) { toast('Erreur : ' + (err.message || err), 'error'); }
}

// === PAGINATION ===

function invRenderPagination(pagination) {
    if (!pagination || pagination.total_pages <= 1) return '';
    let html = '<div style="display:flex;justify-content:center;gap:4px">';
    if (pagination.has_prev) html += `<button class="btn btn-sm btn-outline" onclick="invGoPage(${pagination.page - 1})"><i class="fas fa-chevron-left"></i></button>`;
    for (let p = Math.max(1, pagination.page - 2); p <= Math.min(pagination.total_pages, pagination.page + 2); p++) {
        html += `<button class="btn btn-sm ${p === pagination.page ? 'btn-primary' : 'btn-outline'}" onclick="invGoPage(${p})">${p}</button>`;
    }
    if (pagination.has_next) html += `<button class="btn btn-sm btn-outline" onclick="invGoPage(${pagination.page + 1})"><i class="fas fa-chevron-right"></i></button>`;
    html += '</div>';
    return html;
}

function invGoPage(page) {
    invCurrentPage = page;
    invRenderDeposit(document.getElementById('inv-tab-content'));
}
