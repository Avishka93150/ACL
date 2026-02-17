/**
 * Factures Fournisseurs - Module complet
 * Upload intuitif → vérification split-view → suivi paiements
 */

let invHotels = [];
let invCurrentHotel = null;
let invCategories = [];
let invActiveTab = 'factures';
let invCurrentView = 'list'; // 'list' | 'verify'
let invCurrentInvoice = null;
let invListPage = 1;
let invListStatus = '';
let invListSearch = '';
let invSearchTimer = null;
let _invContainer = null;
let invFintectureConfig = null; // Config Fintecture de l'hôtel courant
let invSelectedIds = []; // IDs des factures sélectionnées pour paiement batch
let invListInvoicesCache = []; // Cache des factures affichées (pour SEPA XML)
let invFilterSupplier = '';
let invFilterCategory = '';
let invFilterAmountMin = '';
let invFilterAmountMax = '';
let invFilterDateFrom = '';
let invFilterDateTo = '';
let invAdvancedFiltersOpen = false;
let invSuppliersList = []; // Cache des fournisseurs pour le filtre

// === HELPERS ===

function invStatusLabel(s) {
    const map = {
        draft: 'Brouillon', approved: 'À payer', paid: 'Payée', rejected: 'Rejetée',
        pending_review: 'À payer', pending_approval: 'À payer',
        pending_payment: 'À payer', payment_initiated: 'Paiement en cours', cancelled: 'Annulée'
    };
    return map[s] || s;
}

function invStatusBadge(s) {
    const colors = {
        draft: 'secondary', approved: 'warning', paid: 'success', rejected: 'danger',
        pending_review: 'warning', pending_approval: 'warning',
        pending_payment: 'warning', payment_initiated: 'info', cancelled: 'secondary'
    };
    return `<span class="badge badge-${colors[s] || 'secondary'}">${invStatusLabel(s)}</span>`;
}

function invPaymentLabel(m) {
    const map = {
        virement: 'Virement', cheque: 'Chèque', prelevement: 'Prélèvement',
        especes: 'Espèces', carte: 'Carte bancaire', fintecture: 'Fintecture', autre: 'Autre'
    };
    return map[m] || m || '-';
}

function invFormatCurrency(amount) {
    if (amount === null || amount === undefined) return '-';
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
}

function invIsPayable(s) {
    return ['approved', 'pending_review', 'pending_approval', 'pending_payment', 'payment_initiated'].includes(s);
}

// === CHARGEMENT PRINCIPAL ===

async function loadInvoices(container) {
    _invContainer = container;
    showLoading(container);

    try {
        const mgmtRes = await API.getManagementInfo();
        invHotels = mgmtRes.manageable_hotels || [];

        if (invHotels.length === 0) {
            container.innerHTML = '<div class="card"><div class="empty-state"><i class="fas fa-file-invoice-dollar"></i><h3>Aucun hôtel disponible</h3></div></div>';
            return;
        }

        invCurrentHotel = invCurrentHotel || invHotels[0].id;

        // Charger catégories + config Fintecture en parallèle
        const [catResult, fintResult] = await Promise.allSettled([
            API.get(`contracts/categories?hotel_id=${invCurrentHotel}`),
            API.get(`invoices/fintecture-config?hotel_id=${invCurrentHotel}`)
        ]);
        invCategories = catResult.status === 'fulfilled' ? (catResult.value.categories || []) : [];
        invFintectureConfig = fintResult.status === 'fulfilled' ? (fintResult.value.config || null) : null;

        // Gérer le callback de paiement Fintecture (retour depuis la banque)
        const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
        const callbackInvoiceId = urlParams.get('payment_callback');
        if (callbackInvoiceId) {
            // Nettoyer l'URL
            window.location.hash = '#invoices';
            invCurrentView = 'verify';
            invCurrentInvoice = parseInt(callbackInvoiceId);
            invRenderVerify(container, invCurrentInvoice);
            // Vérifier le statut du paiement
            setTimeout(() => invCheckPaymentStatus(invCurrentInvoice), 1000);
            return;
        }

        // Si on était sur la vérification, y retourner
        if (invCurrentView === 'verify' && invCurrentInvoice) {
            invRenderVerify(container, invCurrentInvoice);
            return;
        }

        invCurrentView = 'list';
        invRenderMain(container);
    } catch (err) {
        container.innerHTML = '<div class="alert alert-danger">Erreur de chargement</div>';
        console.error(err);
    }
}

function invRenderMain(container) {
    container.innerHTML = `
        <div class="page-header">
            <div>
                <h2><i class="fas fa-file-invoice-dollar"></i> Factures Fournisseurs</h2>
                <p>Gestion et suivi des factures fournisseurs</p>
            </div>
            <div class="header-actions-group">
                ${invHotels.length > 1 ? `
                    <select id="inv-hotel-select" class="form-control" onchange="invChangeHotel(this.value)" style="min-width:200px">
                        ${invHotels.map(h => `<option value="${h.id}" ${h.id == invCurrentHotel ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}
                    </select>
                ` : ''}
            </div>
        </div>

        <div class="closure-tabs" style="margin-bottom:var(--space-4)">
            <div class="closure-tab ${invActiveTab === 'factures' ? 'active' : ''}" onclick="invSwitchTab('factures')"><i class="fas fa-file-invoice-dollar"></i> <span>Factures</span></div>
            <div class="closure-tab ${invActiveTab === 'fournisseurs' ? 'active' : ''}" onclick="invSwitchTab('fournisseurs')"><i class="fas fa-building"></i> <span>Fournisseurs</span></div>
            <div class="closure-tab ${invActiveTab === 'reporting' ? 'active' : ''}" onclick="invSwitchTab('reporting')"><i class="fas fa-chart-bar"></i> <span>Reporting</span></div>
            ${hasPermission('invoices.export') ? `<div class="closure-tab ${invActiveTab === 'export' ? 'active' : ''}" onclick="invSwitchTab('export')"><i class="fas fa-download"></i> <span>Export</span></div>` : ''}
            ${hasPermission('invoices.configure') ? `<div class="closure-tab ${invActiveTab === 'config' ? 'active' : ''}" onclick="invSwitchTab('config')"><i class="fas fa-cog"></i> <span>Configuration</span></div>` : ''}
        </div>

        <div id="inv-tab-content"></div>
    `;

    invSwitchTab(invActiveTab);
}

async function invChangeHotel(hotelId) {
    invCurrentHotel = parseInt(hotelId);
    invSuppliersList = [];
    invFilterSupplier = '';
    invFilterCategory = '';
    invFilterAmountMin = '';
    invFilterAmountMax = '';
    invFilterDateFrom = '';
    invFilterDateTo = '';
    try {
        const [catResult, fintResult] = await Promise.allSettled([
            API.get(`contracts/categories?hotel_id=${invCurrentHotel}`),
            API.get(`invoices/fintecture-config?hotel_id=${invCurrentHotel}`)
        ]);
        invCategories = catResult.status === 'fulfilled' ? (catResult.value.categories || []) : [];
        invFintectureConfig = fintResult.status === 'fulfilled' ? (fintResult.value.config || null) : null;
    } catch (e) { invCategories = []; }
    invSwitchTab(invActiveTab);
}

function invSwitchTab(tab) {
    invActiveTab = tab;
    if (tab !== 'factures') { invSelectedIds = []; invListInvoicesCache = []; }
    document.querySelectorAll('.closure-tab').forEach(t => t.classList.toggle('active', t.textContent.trim().toLowerCase().includes(tab.substring(0, 4))));
    const content = document.getElementById('inv-tab-content');
    if (!content) return;
    switch (tab) {
        case 'factures': invRenderFactures(content); break;
        case 'fournisseurs': invRenderFournisseurs(content); break;
        case 'reporting': invRenderReporting(content); break;
        case 'export': invRenderExport(content); break;
        case 'config': invRenderConfig(content); break;
    }
}

// ============================================================
// ONGLET FACTURES : liste + upload
// ============================================================

async function invRenderFactures(content) {
    showLoading(content);

    // Style pour les lignes sélectionnées
    if (!document.getElementById('inv-batch-style')) {
        const style = document.createElement('style');
        style.id = 'inv-batch-style';
        style.textContent = `
            .table-row-selected { background: var(--primary-50, #eff6ff) !important; }
            .table-row-selected td { background: inherit !important; }
            .inv-batch-cb { width:16px; height:16px; cursor:pointer; }
            #inv-select-all { width:16px; height:16px; cursor:pointer; }
            @media (max-width: 768px) {
                #inv-filter-buttons { grid-template-columns: repeat(2, 1fr) !important; }
            }
            @media (max-width: 480px) {
                #inv-filter-buttons { grid-template-columns: 1fr !important; }
            }
            #inv-adv-filter-btn.active { background: var(--brand-secondary); color: white; }
        `;
        document.head.appendChild(style);
    }

    // Zone d'upload + filtres
    content.innerHTML = `
        <!-- Zone d'upload drag & drop -->
        <div class="card" style="margin-bottom:var(--space-4)">
            <div id="inv-dropzone" style="padding:var(--space-6);text-align:center;border:2px dashed var(--gray-300);border-radius:var(--radius-md);cursor:pointer;transition:all 0.2s"
                 onclick="document.getElementById('inv-file-input').click()"
                 ondragover="event.preventDefault();this.style.borderColor='var(--brand-secondary)';this.style.background='var(--primary-50)'"
                 ondragleave="this.style.borderColor='var(--gray-300)';this.style.background=''"
                 ondrop="event.preventDefault();this.style.borderColor='var(--gray-300)';this.style.background='';invHandleFiles(event.dataTransfer.files)">
                <i class="fas fa-cloud-upload-alt" style="font-size:2.5rem;color:var(--gray-400);margin-bottom:var(--space-2)"></i>
                <h3 style="margin:var(--space-2) 0;color:var(--text-primary)">Déposer une facture ici</h3>
                <p style="color:var(--text-secondary);margin:0">ou <span style="color:var(--brand-secondary);text-decoration:underline">cliquer pour parcourir</span></p>
                <p style="color:var(--text-tertiary);font-size:var(--font-size-xs);margin-top:var(--space-1)">PDF, JPG, PNG — Max 10 Mo</p>
            </div>
            <input type="file" id="inv-file-input" accept=".pdf,.jpg,.jpeg,.png" style="display:none" onchange="invHandleFiles(this.files)">
        </div>

        <!-- Boutons filtres avec stats -->
        <div id="inv-filter-buttons" style="display:grid;grid-template-columns:repeat(5,1fr);gap:var(--space-3);margin-bottom:var(--space-4)">
            <div style="cursor:pointer" onclick="invSetFilter('')">
                <div class="card" id="inv-filter-all" style="padding:var(--space-3) var(--space-4);border-left:4px solid var(--gray-400);transition:all 0.2s;height:100%">
                    <div style="font-size:var(--font-size-xs);color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Toutes</div>
                    <div style="font-size:var(--font-size-xl);font-weight:var(--font-bold);color:var(--text-primary)" id="inv-stat-all-count">-</div>
                    <div style="font-size:var(--font-size-xs);color:var(--text-tertiary)" id="inv-stat-all-total"></div>
                </div>
            </div>
            <div style="cursor:pointer" onclick="invSetFilter('draft')">
                <div class="card" id="inv-filter-draft" style="padding:var(--space-3) var(--space-4);border-left:4px solid var(--gray-500);transition:all 0.2s;height:100%">
                    <div style="font-size:var(--font-size-xs);color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px"><i class="fas fa-pencil-alt"></i> Brouillons</div>
                    <div style="font-size:var(--font-size-xl);font-weight:var(--font-bold);color:var(--text-primary)" id="inv-stat-draft-count">-</div>
                    <div style="font-size:var(--font-size-xs);color:var(--text-tertiary)" id="inv-stat-draft-total"></div>
                </div>
            </div>
            <div style="cursor:pointer" onclick="invSetFilter('overdue')">
                <div class="card" id="inv-filter-overdue" style="padding:var(--space-3) var(--space-4);border-left:4px solid var(--danger-500, #ef4444);transition:all 0.2s;height:100%">
                    <div style="font-size:var(--font-size-xs);color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px"><i class="fas fa-exclamation-triangle"></i> En retard</div>
                    <div style="font-size:var(--font-size-xl);font-weight:var(--font-bold);color:var(--danger-500, #ef4444)" id="inv-stat-overdue-count">-</div>
                    <div style="font-size:var(--font-size-xs);color:var(--text-tertiary)" id="inv-stat-overdue-total"></div>
                </div>
            </div>
            <div style="cursor:pointer" onclick="invSetFilter('approved')">
                <div class="card" id="inv-filter-approved" style="padding:var(--space-3) var(--space-4);border-left:4px solid var(--warning-500, #f59e0b);transition:all 0.2s;height:100%">
                    <div style="font-size:var(--font-size-xs);color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px"><i class="fas fa-clock"></i> À payer</div>
                    <div style="font-size:var(--font-size-xl);font-weight:var(--font-bold);color:var(--text-primary)" id="inv-stat-approved-count">-</div>
                    <div style="font-size:var(--font-size-xs);color:var(--text-tertiary)" id="inv-stat-approved-total"></div>
                </div>
            </div>
            <div style="cursor:pointer" onclick="invSetFilter('paid')">
                <div class="card" id="inv-filter-paid" style="padding:var(--space-3) var(--space-4);border-left:4px solid var(--success-500, #22c55e);transition:all 0.2s;height:100%">
                    <div style="font-size:var(--font-size-xs);color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px"><i class="fas fa-check-circle"></i> Payées</div>
                    <div style="font-size:var(--font-size-xl);font-weight:var(--font-bold);color:var(--text-primary)" id="inv-stat-paid-count">-</div>
                    <div style="font-size:var(--font-size-xs);color:var(--text-tertiary)" id="inv-stat-paid-total"></div>
                </div>
            </div>
        </div>

        <!-- Barre de recherche + filtres avancés -->
        <div class="card" style="margin-bottom:var(--space-4)">
            <div style="padding:var(--space-3) var(--space-4);display:flex;gap:var(--space-3);align-items:center">
                <div style="flex:1">
                    <input type="text" class="form-control" placeholder="Rechercher par fournisseur ou n° facture..."
                           value="${esc(invListSearch)}" oninput="invListSearch=this.value;clearTimeout(invSearchTimer);invSearchTimer=setTimeout(()=>{invListPage=1;invLoadList()},400)">
                </div>
                <button class="btn btn-sm btn-outline" onclick="invToggleAdvancedFilters()" id="inv-adv-filter-btn" title="Filtres avancés">
                    <i class="fas fa-sliders-h"></i> Filtres
                </button>
                <span id="inv-count" style="color:var(--text-secondary);font-size:var(--font-size-sm)"></span>
            </div>
            <div id="inv-advanced-filters" style="display:none;padding:0 var(--space-4) var(--space-4);border-top:1px solid var(--gray-200)">
                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:var(--space-3);padding-top:var(--space-3)">
                    <div class="form-group" style="margin:0">
                        <label class="form-label" style="font-size:var(--font-size-xs)">Fournisseur</label>
                        <select id="inv-filter-supplier" class="form-control" onchange="invApplyAdvancedFilters()">
                            <option value="">Tous</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin:0">
                        <label class="form-label" style="font-size:var(--font-size-xs)">Catégorie</label>
                        <select id="inv-filter-category" class="form-control" onchange="invApplyAdvancedFilters()">
                            <option value="">Toutes</option>
                            ${invCategories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0">
                        <label class="form-label" style="font-size:var(--font-size-xs)">Montant min (€)</label>
                        <input type="number" id="inv-filter-amount-min" class="form-control" placeholder="0" min="0" step="0.01" onchange="invApplyAdvancedFilters()">
                    </div>
                    <div class="form-group" style="margin:0">
                        <label class="form-label" style="font-size:var(--font-size-xs)">Montant max (€)</label>
                        <input type="number" id="inv-filter-amount-max" class="form-control" placeholder="∞" min="0" step="0.01" onchange="invApplyAdvancedFilters()">
                    </div>
                    <div class="form-group" style="margin:0">
                        <label class="form-label" style="font-size:var(--font-size-xs)">Date du</label>
                        <input type="date" id="inv-filter-date-from" class="form-control" onchange="invApplyAdvancedFilters()">
                    </div>
                    <div class="form-group" style="margin:0">
                        <label class="form-label" style="font-size:var(--font-size-xs)">Date au</label>
                        <input type="date" id="inv-filter-date-to" class="form-control" onchange="invApplyAdvancedFilters()">
                    </div>
                </div>
                <div style="display:flex;justify-content:flex-end;margin-top:var(--space-3)">
                    <button class="btn btn-sm btn-outline" onclick="invResetAdvancedFilters()"><i class="fas fa-times"></i> Réinitialiser</button>
                </div>
            </div>
        </div>

        <!-- Barre d'actions batch (masquée par défaut) -->
        ${hasPermission('invoices.pay') ? `
        <div id="inv-batch-bar" style="display:none;position:sticky;top:60px;z-index:50;margin-bottom:var(--space-4);padding:var(--space-3) var(--space-4);background:var(--brand-secondary);color:white;border-radius:var(--radius-md);box-shadow:var(--shadow-lg);display:none;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:var(--space-3)">
                <i class="fas fa-check-square"></i>
                <strong><span id="inv-batch-count">0</span> facture(s) sélectionnée(s)</strong>
                <span id="inv-batch-total" style="opacity:0.9"></span>
            </div>
            <div style="display:flex;gap:var(--space-2)">
                <button class="btn btn-sm" style="background:white;color:var(--brand-secondary)" onclick="invGenerateSepaXml()"><i class="fas fa-file-code"></i> Générer fichier SEPA XML</button>
                <button class="btn btn-sm" style="background:rgba(255,255,255,0.2);color:white;border:1px solid rgba(255,255,255,0.4)" onclick="invClearSelection()"><i class="fas fa-times"></i> Annuler</button>
            </div>
        </div>
        ` : ''}

        <!-- Liste -->
        <div class="card">
            <div id="inv-list-content"><div style="padding:var(--space-6);text-align:center"><i class="fas fa-spinner fa-spin"></i></div></div>
        </div>
    `;

    invLoadStats();
    await invLoadList();
}

function invSetFilter(filter) {
    invListStatus = filter;
    invListPage = 1;
    invHighlightActiveFilter();
    invLoadList();
}

function invHighlightActiveFilter() {
    ['all', 'draft', 'overdue', 'approved', 'paid'].forEach(f => {
        const card = document.getElementById('inv-filter-' + f);
        if (!card) return;
        const key = f === 'all' ? '' : f;
        if (invListStatus === key) {
            card.style.boxShadow = '0 0 0 2px var(--brand-secondary)';
            card.style.transform = 'translateY(-2px)';
        } else {
            card.style.boxShadow = '';
            card.style.transform = '';
        }
    });
}

async function invToggleAdvancedFilters() {
    const panel = document.getElementById('inv-advanced-filters');
    const btn = document.getElementById('inv-adv-filter-btn');
    if (!panel) return;
    invAdvancedFiltersOpen = !invAdvancedFiltersOpen;
    panel.style.display = invAdvancedFiltersOpen ? 'block' : 'none';
    if (btn) btn.classList.toggle('active', invAdvancedFiltersOpen);

    // Charger les fournisseurs la première fois
    if (invAdvancedFiltersOpen && invSuppliersList.length === 0) {
        try {
            const res = await API.get(`suppliers?hotel_id=${invCurrentHotel}&per_page=500`);
            invSuppliersList = res.suppliers || [];
            const sel = document.getElementById('inv-filter-supplier');
            if (sel) {
                sel.innerHTML = '<option value="">Tous</option>' +
                    invSuppliersList.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
                if (invFilterSupplier) sel.value = invFilterSupplier;
            }
        } catch (e) {}
    }
}

function invApplyAdvancedFilters() {
    invFilterSupplier = document.getElementById('inv-filter-supplier')?.value || '';
    invFilterCategory = document.getElementById('inv-filter-category')?.value || '';
    invFilterAmountMin = document.getElementById('inv-filter-amount-min')?.value || '';
    invFilterAmountMax = document.getElementById('inv-filter-amount-max')?.value || '';
    invFilterDateFrom = document.getElementById('inv-filter-date-from')?.value || '';
    invFilterDateTo = document.getElementById('inv-filter-date-to')?.value || '';
    invListPage = 1;
    invLoadList();
}

function invResetAdvancedFilters() {
    invFilterSupplier = '';
    invFilterCategory = '';
    invFilterAmountMin = '';
    invFilterAmountMax = '';
    invFilterDateFrom = '';
    invFilterDateTo = '';
    const ids = ['inv-filter-supplier', 'inv-filter-category', 'inv-filter-amount-min', 'inv-filter-amount-max', 'inv-filter-date-from', 'inv-filter-date-to'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    invListPage = 1;
    invLoadList();
}

async function invLoadStats() {
    try {
        const res = await API.get(`invoices/stats?hotel_id=${invCurrentHotel}`);
        const s = res.stats || {};
        const allCount = (s.draft || 0) + (s.approved || 0) + (s.pending_review || 0) + (s.pending_approval || 0) + (s.pending_payment || 0) + (s.payment_initiated || 0) + (s.paid || 0) + (s.rejected || 0);
        const apayerCount = (s.approved || 0) + (s.pending_review || 0) + (s.pending_approval || 0) + (s.pending_payment || 0) + (s.payment_initiated || 0);

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

        set('inv-stat-all-count', allCount);
        set('inv-stat-all-total', s.total_all ? invFormatCurrency(s.total_all) : '');
        set('inv-stat-draft-count', s.draft || 0);
        set('inv-stat-draft-total', s.total_draft ? invFormatCurrency(s.total_draft) : '');
        set('inv-stat-overdue-count', s.overdue || 0);
        set('inv-stat-overdue-total', s.total_overdue ? invFormatCurrency(s.total_overdue) : '');
        set('inv-stat-approved-count', apayerCount);
        set('inv-stat-approved-total', s.total_due ? invFormatCurrency(s.total_due) : '');
        set('inv-stat-paid-count', s.paid || 0);
        set('inv-stat-paid-total', s.total_paid ? invFormatCurrency(s.total_paid) : '');

        invHighlightActiveFilter();
    } catch (e) {}
}

async function invLoadList() {
    const listEl = document.getElementById('inv-list-content');
    if (!listEl) return;

    try {
        let url = `invoices?hotel_id=${invCurrentHotel}&page=${invListPage}&per_page=20`;
        if (invListStatus) url += `&status=${invListStatus}`;
        if (invListSearch) url += `&search=${encodeURIComponent(invListSearch)}`;
        if (invFilterSupplier) url += `&supplier_id=${invFilterSupplier}`;
        if (invFilterCategory) url += `&category_id=${invFilterCategory}`;
        if (invFilterAmountMin) url += `&amount_min=${invFilterAmountMin}`;
        if (invFilterAmountMax) url += `&amount_max=${invFilterAmountMax}`;
        if (invFilterDateFrom) url += `&period_from=${invFilterDateFrom}`;
        if (invFilterDateTo) url += `&period_to=${invFilterDateTo}`;

        const res = await API.get(url);
        const invoices = res.invoices || [];
        const pagination = res.pagination || {};
        invListInvoicesCache = invoices;

        const countEl = document.getElementById('inv-count');
        if (countEl) countEl.textContent = `${pagination.total || 0} facture(s)`;
        const canPay = hasPermission('invoices.pay');
        const payableStatuses = ['approved', 'pending_review', 'pending_approval', 'pending_payment'];

        if (invoices.length === 0) {
            listEl.innerHTML = `
                <div class="empty-state" style="padding:var(--space-8)">
                    <i class="fas fa-file-invoice" style="font-size:2rem;color:var(--gray-400)"></i>
                    <h3>Aucune facture</h3>
                    <p>Déposez un fichier ci-dessus pour commencer</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = `
            <div class="table-responsive">
                <table class="table">
                    <thead>
                        <tr>
                            ${canPay ? '<th style="width:40px"><input type="checkbox" id="inv-select-all" onchange="invToggleSelectAll(this.checked)" title="Tout sélectionner"></th>' : ''}
                            <th>Fournisseur</th>
                            <th>N° Facture</th>
                            <th>Date</th>
                            <th>Échéance</th>
                            <th style="text-align:right">Total TTC</th>
                            <th>Paiement</th>
                            <th>État</th>
                            <th style="width:80px">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${invoices.map(inv => {
                            const isPayable = payableStatuses.includes(inv.status);
                            return `
                            <tr style="cursor:pointer" onclick="invOpenVerify(${inv.id})" ${invSelectedIds.includes(inv.id) ? 'class="table-row-selected"' : ''}>
                                ${canPay ? `<td onclick="event.stopPropagation()">
                                    ${isPayable ? `<input type="checkbox" class="inv-batch-cb" value="${inv.id}" ${invSelectedIds.includes(inv.id) ? 'checked' : ''} onchange="invToggleSelect(${inv.id}, this.checked)">` : ''}
                                </td>` : ''}
                                <td><strong>${esc(inv.supplier_name || 'Non renseigné')}</strong>
                                    ${inv.category_name ? `<br><small style="color:${inv.category_color || 'var(--text-tertiary)'}">${esc(inv.category_name)}</small>` : ''}
                                </td>
                                <td>${esc(inv.invoice_number || '-')}</td>
                                <td>${inv.invoice_date ? formatDate(inv.invoice_date) : '-'}</td>
                                <td>${inv.due_date ? formatDate(inv.due_date) : '-'}
                                    ${inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== 'paid' ? '<br><small class="text-danger"><i class="fas fa-exclamation-triangle"></i> En retard</small>' : ''}
                                </td>
                                <td style="text-align:right"><strong>${invFormatCurrency(inv.total_ttc)}</strong></td>
                                <td>${invPaymentLabel(inv.payment_method)}</td>
                                <td>${invStatusBadge(inv.status)}</td>
                                <td onclick="event.stopPropagation()">
                                    <button class="btn btn-sm btn-outline" onclick="invOpenVerify(${inv.id})" title="Voir / Modifier"><i class="fas fa-eye"></i></button>
                                    ${inv.status === 'draft' || (API.user && API.user.role === 'admin') ? `<button class="btn btn-sm btn-outline text-danger" onclick="invDeleteInvoice(${inv.id}, '${inv.status}')" title="Supprimer"><i class="fas fa-trash"></i></button>` : ''}
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            ${pagination.total_pages > 1 ? renderPagination(pagination, invGoPage) : ''}
        `;
    } catch (err) {
        listEl.innerHTML = '<div class="alert alert-danger" style="margin:var(--space-4)">Erreur de chargement des factures</div>';
        console.error(err);
    }
}

function invGoPage(page) {
    invListPage = page;
    invLoadList();
}

// === SÉLECTION BATCH & SEPA XML ===

function invToggleSelect(id, checked) {
    if (checked && !invSelectedIds.includes(id)) {
        invSelectedIds.push(id);
    } else if (!checked) {
        invSelectedIds = invSelectedIds.filter(x => x !== id);
    }
    invUpdateBatchBar();
}

function invToggleSelectAll(checked) {
    const payableStatuses = ['approved', 'pending_review', 'pending_approval', 'pending_payment'];
    if (checked) {
        invListInvoicesCache.forEach(inv => {
            if (payableStatuses.includes(inv.status) && !invSelectedIds.includes(inv.id)) {
                invSelectedIds.push(inv.id);
            }
        });
    } else {
        const pageIds = invListInvoicesCache.map(i => i.id);
        invSelectedIds = invSelectedIds.filter(id => !pageIds.includes(id));
    }
    // Mettre à jour les checkboxes
    document.querySelectorAll('.inv-batch-cb').forEach(cb => {
        cb.checked = invSelectedIds.includes(parseInt(cb.value));
    });
    invUpdateBatchBar();
}

function invClearSelection() {
    invSelectedIds = [];
    document.querySelectorAll('.inv-batch-cb').forEach(cb => cb.checked = false);
    const selAll = document.getElementById('inv-select-all');
    if (selAll) selAll.checked = false;
    invUpdateBatchBar();
}

function invUpdateBatchBar() {
    const bar = document.getElementById('inv-batch-bar');
    if (!bar) return;

    if (invSelectedIds.length === 0) {
        bar.style.display = 'none';
        return;
    }

    bar.style.display = 'flex';
    document.getElementById('inv-batch-count').textContent = invSelectedIds.length;

    // Calculer le total
    let total = 0;
    invSelectedIds.forEach(id => {
        const inv = invListInvoicesCache.find(i => i.id === id);
        if (inv) total += parseFloat(inv.total_ttc || 0);
    });
    document.getElementById('inv-batch-total').textContent = '— ' + invFormatCurrency(total);
}

async function invGenerateSepaXml() {
    // Collecter les données des factures sélectionnées
    const selected = invSelectedIds.map(id => invListInvoicesCache.find(i => i.id === id)).filter(Boolean);

    if (selected.length === 0) {
        toast('Aucune facture sélectionnée', 'warning');
        return;
    }

    // Vérifier que toutes ont un IBAN fournisseur
    const sansIban = selected.filter(inv => !inv.supplier_iban);
    if (sansIban.length > 0) {
        const noms = sansIban.map(i => i.supplier_name || 'N/A').join(', ');
        toast(`IBAN manquant pour : ${noms}`, 'error');
        return;
    }

    // Charger les comptes bancaires de l'hôtel
    const hotel = invHotels.find(h => h.id === invCurrentHotel);
    const hotelName = hotel ? hotel.name : 'ACL GESTION';
    const totalAmount = selected.reduce((sum, inv) => sum + parseFloat(inv.total_ttc || 0), 0);

    let bankAccounts = [];
    try {
        const res = await API.get(`hotels/${invCurrentHotel}/bank-accounts`);
        bankAccounts = res.accounts || [];
    } catch (e) {}

    const hasAccounts = bankAccounts.length > 0;
    const defaultAccount = bankAccounts.find(a => a.is_default == 1) || bankAccounts[0];

    openModal('Générer le fichier SEPA XML', `
        <div style="margin-bottom:var(--space-4)">
            <p><strong>${selected.length} facture(s)</strong> sélectionnée(s) pour un total de <strong>${invFormatCurrency(totalAmount)}</strong></p>

            ${hasAccounts ? `
                <div class="form-group">
                    <label class="form-label required">Compte bancaire émetteur</label>
                    <select id="sepa-bank-account" class="form-control" onchange="invSepaAccountChange()">
                        ${bankAccounts.map(a => `<option value="${a.id}" data-iban="${escAttr(a.iban)}" data-bic="${escAttr(a.bic || '')}" ${a.id === (defaultAccount ? defaultAccount.id : 0) ? 'selected' : ''}>${esc(a.label)} — ${esc((a.iban || '').replace(/(.{4})/g, '$1 ').trim())}</option>`).join('')}
                        <option value="__manual__">Saisir manuellement...</option>
                    </select>
                </div>
                <div id="sepa-manual-fields" style="display:none">
            ` : '<div id="sepa-manual-fields">'}
                <div class="form-group">
                    <label class="form-label ${hasAccounts ? '' : 'required'}">IBAN de l'émetteur</label>
                    <input type="text" id="sepa-debtor-iban" class="form-control" placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX"
                           value="${hasAccounts && defaultAccount ? escAttr(defaultAccount.iban) : ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">BIC de l'émetteur</label>
                    <input type="text" id="sepa-debtor-bic" class="form-control" placeholder="BNPAFRPPXXX"
                           value="${hasAccounts && defaultAccount ? escAttr(defaultAccount.bic || '') : ''}">
                </div>
            </div>

            ${!hasAccounts ? '<p style="font-size:var(--font-size-xs);color:var(--text-tertiary);margin-top:var(--space-2)"><i class="fas fa-info-circle"></i> Vous pouvez configurer vos comptes bancaires dans Hôtels > Général pour ne plus saisir l\'IBAN à chaque fois.</p>' : ''}
        </div>
        <div class="modal-footer">
            <button class="btn btn-outline" onclick="closeModal()">Annuler</button>
            <button class="btn btn-primary" onclick="invDoGenerateSepaXml()"><i class="fas fa-file-code"></i> Générer et télécharger</button>
        </div>
    `, 'modal-md');
}

function invSepaAccountChange() {
    const sel = document.getElementById('sepa-bank-account');
    const manualFields = document.getElementById('sepa-manual-fields');
    if (!sel || !manualFields) return;

    if (sel.value === '__manual__') {
        manualFields.style.display = 'block';
        document.getElementById('sepa-debtor-iban').value = '';
        document.getElementById('sepa-debtor-bic').value = '';
        document.getElementById('sepa-debtor-iban').focus();
    } else {
        manualFields.style.display = 'none';
        const opt = sel.selectedOptions[0];
        document.getElementById('sepa-debtor-iban').value = opt.dataset.iban || '';
        document.getElementById('sepa-debtor-bic').value = opt.dataset.bic || '';
    }
}

function invDoGenerateSepaXml() {
    const debtorIban = (document.getElementById('sepa-debtor-iban')?.value || '').replace(/\s/g, '').toUpperCase();
    const debtorBic = (document.getElementById('sepa-debtor-bic')?.value || '').replace(/\s/g, '').toUpperCase();

    if (!debtorIban || debtorIban.length < 15) {
        toast('Veuillez renseigner un IBAN émetteur valide', 'warning');
        return;
    }

    closeModal();

    const selected = invSelectedIds.map(id => invListInvoicesCache.find(i => i.id === id)).filter(Boolean);
    const hotel = invHotels.find(h => h.id === invCurrentHotel);
    const hotelName = hotel ? hotel.name : 'ACL GESTION';

    const now = new Date();
    // MsgId : max 35 chars, alphanumérique + tirets uniquement
    const msgId = ('ACL' + now.toISOString().replace(/[-:T.Z]/g, '').substring(0, 14) + Math.random().toString(36).substring(2, 6)).substring(0, 35).toUpperCase();
    const creationDate = now.toISOString().split('.')[0];
    const executionDate = now.toISOString().split('T')[0];

    // Calculer le total
    let totalAmount = 0;
    selected.forEach(inv => { totalAmount += parseFloat(inv.total_ttc || 0); });

    // Construire le XML SEPA pain.001.001.03 (norme ISO 20022 - banques françaises)
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n';
    xml += '  <CstmrCdtTrfInitn>\n';

    // Group Header
    xml += '    <GrpHdr>\n';
    xml += `      <MsgId>${invEscXml(msgId)}</MsgId>\n`;
    xml += `      <CreDtTm>${creationDate}</CreDtTm>\n`;
    xml += `      <NbOfTxs>${selected.length}</NbOfTxs>\n`;
    xml += `      <CtrlSum>${totalAmount.toFixed(2)}</CtrlSum>\n`;
    xml += '      <InitgPty>\n';
    xml += `        <Nm>${invEscXml(invSepaClean(hotelName).substring(0, 70))}</Nm>\n`;
    xml += '      </InitgPty>\n';
    xml += '    </GrpHdr>\n';

    // Payment Information
    const pmtInfId = ('PMT' + msgId).substring(0, 35);
    xml += '    <PmtInf>\n';
    xml += `      <PmtInfId>${invEscXml(pmtInfId)}</PmtInfId>\n`;
    xml += '      <PmtMtd>TRF</PmtMtd>\n';
    xml += '      <BtchBookg>true</BtchBookg>\n';
    xml += `      <NbOfTxs>${selected.length}</NbOfTxs>\n`;
    xml += `      <CtrlSum>${totalAmount.toFixed(2)}</CtrlSum>\n`;
    xml += '      <PmtTpInf>\n';
    xml += '        <SvcLvl><Cd>SEPA</Cd></SvcLvl>\n';
    xml += '      </PmtTpInf>\n';
    xml += `      <ReqdExctnDt>${executionDate}</ReqdExctnDt>\n`;
    xml += '      <Dbtr>\n';
    xml += `        <Nm>${invEscXml(invSepaClean(hotelName).substring(0, 70))}</Nm>\n`;
    xml += '      </Dbtr>\n';
    xml += '      <DbtrAcct>\n';
    xml += `        <Id><IBAN>${invEscXml(debtorIban)}</IBAN></Id>\n`;
    xml += '      </DbtrAcct>\n';
    xml += '      <DbtrAgt>\n';
    if (debtorBic) {
        xml += `        <FinInstnId><BIC>${invEscXml(debtorBic)}</BIC></FinInstnId>\n`;
    } else {
        xml += '        <FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>\n';
    }
    xml += '      </DbtrAgt>\n';
    xml += '      <ChrgBr>SLEV</ChrgBr>\n';

    // Credit Transfer Transactions
    selected.forEach((inv, idx) => {
        const amount = parseFloat(inv.total_ttc || 0).toFixed(2);
        // EndToEndId : max 35 chars, alphanumérique
        const endToEndId = ('INV' + inv.id + 'T' + now.getTime().toString(36)).substring(0, 35).toUpperCase();
        const supplierName = invSepaClean(inv.supplier_name || 'Fournisseur').substring(0, 70);
        const iban = (inv.supplier_iban || '').replace(/\s/g, '').toUpperCase();
        const bic = (inv.supplier_bic || '').replace(/\s/g, '').toUpperCase();
        const reference = invSepaClean(inv.invoice_number || ('Facture-' + inv.id)).substring(0, 140);

        xml += '      <CdtTrfTxInf>\n';
        xml += '        <PmtId>\n';
        xml += `          <EndToEndId>${invEscXml(endToEndId)}</EndToEndId>\n`;
        xml += '        </PmtId>\n';
        xml += '        <Amt>\n';
        xml += `          <InstdAmt Ccy="EUR">${amount}</InstdAmt>\n`;
        xml += '        </Amt>\n';
        xml += '        <CdtrAgt>\n';
        if (bic) {
            xml += `          <FinInstnId><BIC>${invEscXml(bic)}</BIC></FinInstnId>\n`;
        } else {
            xml += '          <FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>\n';
        }
        xml += '        </CdtrAgt>\n';
        xml += '        <Cdtr>\n';
        xml += `          <Nm>${invEscXml(supplierName)}</Nm>\n`;
        xml += '        </Cdtr>\n';
        xml += '        <CdtrAcct>\n';
        xml += `          <Id><IBAN>${invEscXml(iban)}</IBAN></Id>\n`;
        xml += '        </CdtrAcct>\n';
        xml += '        <RmtInf>\n';
        xml += `          <Ustrd>${invEscXml(reference)}</Ustrd>\n`;
        xml += '        </RmtInf>\n';
        xml += '      </CdtTrfTxInf>\n';
    });

    xml += '    </PmtInf>\n';
    xml += '  </CstmrCdtTrfInitn>\n';
    xml += '</Document>';

    // Télécharger le fichier XML avec BOM UTF-8
    const bom = '\uFEFF';
    const blob = new Blob([bom + xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SEPA_virements_${executionDate}_${selected.length}factures.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast(`Fichier SEPA XML généré (${selected.length} virements, ${invFormatCurrency(totalAmount)})`, 'success');

    // Proposer de marquer comme payées
    setTimeout(() => invProposeBatchMarkPaid(selected, msgId), 500);
}

function invEscXml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Nettoyer les caractères non autorisés en SEPA (Latin basic uniquement)
function invSepaClean(str) {
    return String(str || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9 \/\-?:().,'+]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function invProposeBatchMarkPaid(invoices, xmlRef) {
    const totalAmount = invoices.reduce((sum, inv) => sum + parseFloat(inv.total_ttc || 0), 0);

    openModal('Marquer les factures comme payées', `
        <div style="margin-bottom:var(--space-4)">
            <p>Le fichier SEPA XML a été téléchargé. Souhaitez-vous marquer ces <strong>${invoices.length} facture(s)</strong> comme payées ?</p>
            <div style="background:var(--gray-50);border-radius:var(--radius-md);padding:var(--space-3);margin:var(--space-3) 0">
                <table class="table table-sm" style="margin:0">
                    <thead><tr><th>Fournisseur</th><th>N° Facture</th><th style="text-align:right">Montant TTC</th></tr></thead>
                    <tbody>
                        ${invoices.map(inv => `
                            <tr>
                                <td>${esc(inv.supplier_name || '-')}</td>
                                <td>${esc(inv.invoice_number || '-')}</td>
                                <td style="text-align:right">${invFormatCurrency(inv.total_ttc)}</td>
                            </tr>
                        `).join('')}
                        <tr style="font-weight:var(--font-semibold);border-top:2px solid var(--gray-200)">
                            <td colspan="2" style="text-align:right">Total</td>
                            <td style="text-align:right">${invFormatCurrency(totalAmount)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="form-group">
                <label class="form-label">Référence de paiement</label>
                <input type="text" id="batch-pay-ref" class="form-control" value="Virement SEPA ${xmlRef}" placeholder="Référence du virement">
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-outline" onclick="closeModal()">Plus tard</button>
            <button class="btn btn-success" onclick="invBatchMarkPaid()"><i class="fas fa-check-double"></i> Marquer comme payées</button>
        </div>
    `, 'modal-lg');
}

async function invBatchMarkPaid() {
    const ref = document.getElementById('batch-pay-ref')?.value || 'Virement SEPA';

    try {
        const res = await API.post('invoices/batch-mark-paid', {
            invoice_ids: invSelectedIds,
            payment_reference: ref
        });

        closeModal();
        toast(`${res.updated} facture(s) marquée(s) comme payée(s)`, 'success');

        if (res.errors && res.errors.length > 0) {
            toast(`Attention : ${res.errors.length} erreur(s)`, 'warning');
        }

        invClearSelection();
        invLoadList();
    } catch (err) {
        toast(err.message || 'Erreur lors du marquage', 'error');
    }
}

// === UPLOAD ===

async function invHandleFiles(files) {
    if (!files || files.length === 0) return;
    const file = files[0];

    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type)) {
        toast('Format non supporté. Utilisez PDF, JPG ou PNG.', 'error');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        toast('Fichier trop volumineux (max 10 Mo)', 'error');
        return;
    }

    // Afficher le loading dans la dropzone
    const dz = document.getElementById('inv-dropzone');
    if (dz) {
        dz.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size:2rem;color:var(--brand-secondary)"></i><h3 style="margin-top:var(--space-2)">Upload en cours...</h3>';
        dz.style.pointerEvents = 'none';
    }

    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('hotel_id', invCurrentHotel);

        const res = await API.upload('invoices', formData);

        if (res.success && res.id) {
            toast('Facture déposée — complétez la vérification', 'success');
            invOpenVerify(res.id);
        } else {
            toast('Erreur lors du dépôt', 'error');
            invSwitchTab('factures');
        }
    } catch (err) {
        toast(err.message || 'Erreur lors de l\'upload', 'error');
        invSwitchTab('factures');
    }
}

// ============================================================
// PAGE DE VÉRIFICATION (split-view)
// ============================================================

async function invOpenVerify(invoiceId) {
    invCurrentView = 'verify';
    invCurrentInvoice = invoiceId;
    invRenderVerify(_invContainer, invoiceId);
}

async function invRenderVerify(container, invoiceId) {
    showLoading(container);

    try {
        const res = await API.get(`invoices/${invoiceId}`);
        const inv = res.invoice;
        if (!inv) { toast('Facture introuvable', 'error'); invBackToList(); return; }

        const lines = inv.lines || [];
        const docs = inv.documents || [];
        const fileUrl = inv.original_file || (docs.length > 0 ? docs[0].file_url : '');
        const fileExt = fileUrl.split('.').pop().toLowerCase();
        const isEditable = ['draft', 'rejected'].includes(inv.status);

        container.innerHTML = `
            <div style="margin-bottom:var(--space-4)">
                <button class="btn btn-outline" onclick="invBackToList()"><i class="fas fa-arrow-left"></i> Retour aux factures</button>
                <span style="margin-left:var(--space-3);font-size:var(--font-size-lg);font-weight:var(--font-semibold)">
                    ${inv.invoice_number ? 'Facture ' + esc(inv.invoice_number) : 'Nouvelle facture'}
                </span>
                ${invStatusBadge(inv.status)}
            </div>

            ${inv.closure_id ? `
            <div style="margin-bottom:var(--space-4);padding:var(--space-3) var(--space-4);background:var(--primary-50, #eff6ff);border:1px solid var(--primary-200, #bfdbfe);border-radius:var(--radius-md);display:flex;align-items:center;gap:var(--space-3)">
                <i class="fas fa-cash-register" style="color:var(--brand-secondary);font-size:1.1rem"></i>
                <span style="color:var(--text-primary)">Facture créée automatiquement depuis une <strong>clôture journalière</strong> — Mode de paiement : <strong>Espèces</strong></span>
            </div>` : ''}

            <div style="display:flex;gap:var(--space-4);align-items:flex-start">
                <!-- GAUCHE : Formulaire de vérification -->
                <div style="flex:1;min-width:0">
                    ${invRenderVerifyForm(inv, lines, isEditable)}
                </div>

                <!-- DROITE : Aperçu du document -->
                <div style="flex:0 0 45%;position:sticky;top:var(--space-4)">
                    <div class="card" style="overflow:hidden">
                        <div class="card-header" style="padding:var(--space-2) var(--space-4)">
                            <h3 style="font-size:var(--font-size-sm)"><i class="fas fa-file-alt"></i> Document original</h3>
                            ${fileUrl ? `<a href="${fileUrl}" target="_blank" class="btn btn-sm btn-outline"><i class="fas fa-external-link-alt"></i></a>` : ''}
                        </div>
                        <div style="height:calc(100vh - 240px);background:var(--gray-100)">
                            ${fileUrl ? (
                                fileExt === 'pdf'
                                    ? `<iframe src="${fileUrl}" style="width:100%;height:100%;border:none"></iframe>`
                                    : `<div style="height:100%;overflow:auto;display:flex;align-items:center;justify-content:center;padding:var(--space-2)">
                                         <img src="${fileUrl}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:var(--radius-sm)">
                                       </div>`
                            ) : '<div class="empty-state" style="height:100%;display:flex;align-items:center;justify-content:center"><p>Aucun document</p></div>'}
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (err) {
        container.innerHTML = '<div class="alert alert-danger">Erreur de chargement de la facture</div>';
        console.error(err);
    }
}

function invRenderVerifyForm(inv, lines, isEditable) {
    const statusValue = invIsPayable(inv.status) ? 'approved' : inv.status;

    return `
        <!-- Informations générales -->
        <div class="card" style="margin-bottom:var(--space-4)">
            <div class="card-header"><h3><i class="fas fa-info-circle"></i> Informations générales</h3></div>
            <div class="card-body" style="padding:var(--space-4)">
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Fournisseur</label>
                        <div style="position:relative">
                            <input type="text" id="inv-supplier-search" class="form-control"
                                   value="${esc(inv.supplier_name || '')}"
                                   placeholder="Rechercher un fournisseur..."
                                   ${!isEditable ? 'readonly' : ''}
                                   oninput="invSupplierAutocomplete(this.value)"
                                   onfocus="if(this.value.length>=2)invSupplierAutocomplete(this.value)">
                            <input type="hidden" id="inv-supplier-id" value="${inv.supplier_id || ''}">
                            <div id="inv-supplier-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:100;background:white;border:1px solid var(--gray-200);border-radius:var(--radius-md);box-shadow:var(--shadow-lg);max-height:200px;overflow-y:auto"></div>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">N° Facture</label>
                        <input type="text" id="inv-number" class="form-control" value="${esc(inv.invoice_number || '')}" ${!isEditable ? 'readonly' : ''}>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Date de facture</label>
                        <input type="date" id="inv-date" class="form-control" value="${inv.invoice_date || ''}" ${!isEditable ? 'readonly' : ''}>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Date d'échéance</label>
                        <input type="date" id="inv-due-date" class="form-control" value="${inv.due_date || ''}" ${!isEditable ? 'readonly' : ''}>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Mode de paiement</label>
                        <select id="inv-payment-method" class="form-control" ${!isEditable ? 'disabled' : ''}>
                            <option value="virement" ${inv.payment_method === 'virement' ? 'selected' : ''}>Virement</option>
                            <option value="cheque" ${inv.payment_method === 'cheque' ? 'selected' : ''}>Chèque</option>
                            <option value="prelevement" ${inv.payment_method === 'prelevement' ? 'selected' : ''}>Prélèvement</option>
                            <option value="carte" ${inv.payment_method === 'carte' ? 'selected' : ''}>Carte bancaire</option>
                            <option value="especes" ${inv.payment_method === 'especes' ? 'selected' : ''}>Espèces</option>
                            ${invFintectureConfig && invFintectureConfig.is_active ? `<option value="fintecture" ${inv.payment_method === 'fintecture' ? 'selected' : ''}>Fintecture (Open Banking)</option>` : (inv.payment_method === 'fintecture' ? '<option value="fintecture" selected>Fintecture</option>' : '')}
                            <option value="autre" ${inv.payment_method === 'autre' ? 'selected' : ''}>Autre</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">État de la facture</label>
                        <select id="inv-status" class="form-control" ${!isEditable && inv.status === 'paid' ? 'disabled' : ''}>
                            ${isEditable ? '<option value="draft">Brouillon</option>' : ''}
                            <option value="approved" ${statusValue === 'approved' ? 'selected' : ''}>À payer</option>
                            <option value="paid" ${inv.status === 'paid' ? 'selected' : ''}>Payée</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Notes</label>
                    <textarea id="inv-notes" class="form-control" rows="2" ${!isEditable ? 'readonly' : ''}>${esc(inv.notes || '')}</textarea>
                </div>
                ${inv.status === 'payment_initiated' ? `
                    <div style="background:var(--info-50, #eff6ff);border:1px solid var(--info-200, #bfdbfe);border-radius:var(--radius-md);padding:var(--space-3);margin-top:var(--space-3)">
                        <div style="display:flex;align-items:center;gap:var(--space-2)">
                            <i class="fas fa-spinner fa-spin" style="color:var(--info-500, #3b82f6)"></i>
                            <strong style="color:var(--info-700, #1d4ed8)">Paiement Fintecture en cours</strong>
                        </div>
                        <p style="margin:var(--space-1) 0 0;font-size:var(--font-size-sm);color:var(--text-secondary)">
                            Le virement a été initié via Open Banking. Le statut sera mis à jour automatiquement.
                            ${inv.fintecture_session_id ? `<br>Session : <code>${esc(inv.fintecture_session_id)}</code>` : ''}
                        </p>
                    </div>
                ` : ''}
                ${inv.status === 'paid' && inv.payment_method === 'fintecture' ? `
                    <div style="background:var(--success-50, #f0fdf4);border:1px solid var(--success-200, #bbf7d0);border-radius:var(--radius-md);padding:var(--space-3);margin-top:var(--space-3)">
                        <div style="display:flex;align-items:center;gap:var(--space-2)">
                            <i class="fas fa-check-circle" style="color:var(--success-500, #22c55e)"></i>
                            <strong style="color:var(--success-700, #15803d)">Payée via Fintecture</strong>
                        </div>
                        ${inv.payment_reference ? `<p style="margin:var(--space-1) 0 0;font-size:var(--font-size-sm);color:var(--text-secondary)">Réf : ${esc(inv.payment_reference)}</p>` : ''}
                    </div>
                ` : ''}
            </div>
        </div>

        <!-- Ventilation par catégorie -->
        <div class="card" style="margin-bottom:var(--space-4)">
            <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
                <h3><i class="fas fa-layer-group"></i> Ventilation par catégorie</h3>
                ${isEditable ? `<button class="btn btn-sm btn-primary" onclick="invAddLine()"><i class="fas fa-plus"></i> Ajouter une ligne</button>` : ''}
            </div>
            <div class="table-responsive">
                <table class="table" id="inv-lines-table">
                    <thead>
                        <tr>
                            <th style="min-width:180px">Catégorie</th>
                            <th style="width:120px;text-align:right">Montant HT</th>
                            <th style="width:100px">Taux TVA</th>
                            <th style="width:110px;text-align:right">Montant TVA</th>
                            <th style="width:120px;text-align:right">Total TTC</th>
                            ${isEditable ? '<th style="width:50px"></th>' : ''}
                        </tr>
                    </thead>
                    <tbody id="inv-lines-body">
                        ${lines.length > 0 ? lines.map((l, i) => invBuildLineRow(i, l, isEditable)).join('') :
                          (isEditable ? invBuildLineRow(0, {}, true) : '<tr><td colspan="6" class="text-center">Aucune ligne</td></tr>')}
                    </tbody>
                    <tfoot>
                        <tr style="font-weight:var(--font-semibold);background:var(--gray-50)">
                            <td style="text-align:right">Totaux</td>
                            <td style="text-align:right" id="inv-total-ht">${invFormatCurrency(inv.total_ht || 0)}</td>
                            <td></td>
                            <td style="text-align:right" id="inv-total-tva">${invFormatCurrency(inv.total_tva || 0)}</td>
                            <td style="text-align:right;font-size:var(--font-size-base)" id="inv-total-ttc"><strong>${invFormatCurrency(inv.total_ttc || 0)}</strong></td>
                            ${isEditable ? '<td></td>' : ''}
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>

        <!-- Boutons d'action -->
        <div class="card">
            <div style="padding:var(--space-4);display:flex;gap:var(--space-3);justify-content:space-between;align-items:center">
                <div style="display:flex;gap:var(--space-2)">
                    ${isEditable ? `
                        <button class="btn btn-primary" onclick="invSaveInvoice('approved')"><i class="fas fa-check"></i> Valider à payer</button>
                        <button class="btn btn-outline" onclick="invSaveInvoice('draft')"><i class="fas fa-save"></i> Enregistrer brouillon</button>
                    ` : ''}
                    ${invIsPayable(inv.status) && inv.status !== 'payment_initiated' ? `
                        ${invFintectureConfig && invFintectureConfig.is_active && inv.supplier_iban ? `
                            <button class="btn btn-primary" onclick="invPayFintecture(${inv.id})"><i class="fas fa-university"></i> Payer via Fintecture</button>
                        ` : ''}
                        <button class="btn btn-success" onclick="invSaveInvoice('paid')"><i class="fas fa-money-check-alt"></i> Marquer comme payée</button>
                    ` : ''}
                    ${inv.status === 'payment_initiated' ? `
                        <button class="btn btn-info" onclick="invCheckPaymentStatus(${inv.id})"><i class="fas fa-sync-alt"></i> Vérifier le paiement</button>
                        <button class="btn btn-success" onclick="invSaveInvoice('paid')"><i class="fas fa-money-check-alt"></i> Marquer comme payée</button>
                    ` : ''}
                    ${inv.status === 'paid' && hasPermission('invoices.edit') ? `
                        <button class="btn btn-outline" onclick="invSaveInvoice('approved')"><i class="fas fa-undo"></i> Remettre à payer</button>
                    ` : ''}
                </div>
                <div>
                    ${(inv.status === 'draft' && hasPermission('invoices.delete')) || (API.user && API.user.role === 'admin') ? `
                        <button class="btn btn-outline text-danger" onclick="invDeleteInvoice(${inv.id}, '${inv.status}')"><i class="fas fa-trash"></i> Supprimer</button>
                    ` : ''}
                </div>
            </div>
        </div>

        ${inv.approvals && inv.approvals.length > 0 ? `
            <div class="card" style="margin-top:var(--space-4)">
                <div class="card-header"><h3><i class="fas fa-history"></i> Historique</h3></div>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead><tr><th>Action</th><th>Par</th><th>Date</th><th>Commentaire</th></tr></thead>
                        <tbody>
                            ${inv.approvals.map(a => `
                                <tr>
                                    <td><span class="badge badge-${a.action === 'approve' ? 'success' : a.action === 'reject' ? 'danger' : 'info'}">${a.action}</span></td>
                                    <td>${esc(a.user_name || '-')}</td>
                                    <td>${formatDateTime(a.created_at)}</td>
                                    <td>${esc(a.comment || '-')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        ` : ''}
    `;
}

function invBuildLineRow(idx, line, editable) {
    const ht = parseFloat(line.total_ht || line.amount_ht || 0);
    const rate = parseFloat(line.tva_rate || 20);
    const tva = parseFloat(line.tva_amount || (ht * rate / 100));
    const ttc = ht + tva;

    if (!editable) {
        return `<tr>
            <td>${esc(line.category_name || '-')}</td>
            <td style="text-align:right">${invFormatCurrency(ht)}</td>
            <td>${rate}%</td>
            <td style="text-align:right">${invFormatCurrency(tva)}</td>
            <td style="text-align:right"><strong>${invFormatCurrency(ttc)}</strong></td>
        </tr>`;
    }

    return `<tr class="inv-line-row" data-idx="${idx}">
        <td>
            <select class="form-control form-control-sm" name="line-cat-${idx}" onchange="invOnCategoryChange(this, ${idx})">
                <option value="">— Sélectionner —</option>
                ${invCategories.map(c => `<option value="${c.id}" ${line.category_id == c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
                ${hasPermission('categories.manage') ? '<option value="__create__">+ Créer une catégorie</option>' : ''}
            </select>
        </td>
        <td><input type="number" class="form-control form-control-sm" name="line-ht-${idx}" value="${ht || ''}" step="0.01" min="0" style="text-align:right" oninput="invRecalcTotals()" placeholder="0.00"></td>
        <td>
            <select class="form-control form-control-sm" name="line-tva-${idx}" onchange="invRecalcTotals()">
                <option value="20" ${rate == 20 ? 'selected' : ''}>20%</option>
                <option value="10" ${rate == 10 ? 'selected' : ''}>10%</option>
                <option value="5.5" ${rate == 5.5 ? 'selected' : ''}>5,5%</option>
                <option value="2.1" ${rate == 2.1 ? 'selected' : ''}>2,1%</option>
                <option value="0" ${rate == 0 ? 'selected' : ''}>0%</option>
            </select>
        </td>
        <td style="text-align:right;color:var(--text-secondary)" id="line-tva-amount-${idx}">${invFormatCurrency(tva)}</td>
        <td style="text-align:right;font-weight:var(--font-semibold)" id="line-ttc-${idx}">${invFormatCurrency(ttc)}</td>
        <td><button type="button" class="btn btn-sm btn-outline text-danger" onclick="invRemoveLine(this)" title="Supprimer"><i class="fas fa-times"></i></button></td>
    </tr>`;
}

function invAddLine() {
    const tbody = document.getElementById('inv-lines-body');
    if (!tbody) return;
    const rows = tbody.querySelectorAll('.inv-line-row');
    const newIdx = rows.length;
    tbody.insertAdjacentHTML('beforeend', invBuildLineRow(newIdx, {}, true));
}

function invRemoveLine(btn) {
    const row = btn.closest('tr');
    if (row) row.remove();
    invRecalcTotals();
}

function invOnCategoryChange(select, idx) {
    if (select.value === '__create__') {
        select.value = ''; // Reset la sélection
        invQuickCreateCategory(idx);
    } else {
        invRecalcTotals();
    }
}

function invQuickCreateCategory(lineIdx) {
    openModal('Nouvelle catégorie', `
        <form onsubmit="invSaveQuickCategory(event, ${lineIdx})">
            <div class="form-row">
                <div class="form-group" style="flex:2"><label class="form-label required">Nom de la catégorie</label>
                    <input type="text" id="qcat-name" class="form-control" required placeholder="Ex: Alimentation, Entretien..."></div>
                <div class="form-group" style="flex:1"><label class="form-label">Couleur</label>
                    <input type="color" id="qcat-color" class="form-control" value="#6366f1" style="height:38px;padding:4px"></div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Créer et sélectionner</button>
            </div>
        </form>
    `, 'modal-md');
}

async function invSaveQuickCategory(event, lineIdx) {
    event.preventDefault();
    const name = document.getElementById('qcat-name').value.trim();
    const color = document.getElementById('qcat-color').value;
    if (!name) { toast('Le nom est requis', 'warning'); return; }

    try {
        const res = await API.post('contracts/categories', {
            name: name,
            color: color,
            hotel_id: invCurrentHotel
        });
        toast('Catégorie créée', 'success');
        closeModal();

        // Ajouter la catégorie au cache local
        const newCat = { id: res.id, name: name, color: color };
        invCategories.push(newCat);

        // Mettre à jour tous les selects de catégorie dans le tableau
        document.querySelectorAll('.inv-line-row').forEach(row => {
            const sel = row.querySelector('select[name^="line-cat-"]');
            if (!sel) return;
            const createOpt = sel.querySelector('option[value="__create__"]');
            const newOpt = document.createElement('option');
            newOpt.value = res.id;
            newOpt.textContent = name;
            if (createOpt) {
                sel.insertBefore(newOpt, createOpt);
            } else {
                sel.appendChild(newOpt);
            }
        });

        // Sélectionner dans la ligne qui a déclenché la création
        const targetSelect = document.querySelector(`select[name="line-cat-${lineIdx}"]`);
        if (targetSelect) targetSelect.value = res.id;
    } catch (err) {
        toast(err.message || 'Erreur lors de la création', 'error');
    }
}

function invRecalcTotals() {
    const rows = document.querySelectorAll('.inv-line-row');
    let totalHt = 0, totalTva = 0, totalTtc = 0;

    rows.forEach((row, i) => {
        const idx = row.dataset.idx || i;
        const htInput = row.querySelector(`[name="line-ht-${idx}"]`);
        const tvaSelect = row.querySelector(`[name="line-tva-${idx}"]`);

        if (!htInput || !tvaSelect) return;
        const ht = parseFloat(htInput.value) || 0;
        const rate = parseFloat(tvaSelect.value) || 0;
        const tva = Math.round(ht * rate) / 100;
        const ttc = ht + tva;

        const tvaEl = document.getElementById(`line-tva-amount-${idx}`);
        const ttcEl = document.getElementById(`line-ttc-${idx}`);
        if (tvaEl) tvaEl.textContent = invFormatCurrency(tva);
        if (ttcEl) ttcEl.innerHTML = `<strong>${invFormatCurrency(ttc)}</strong>`;

        totalHt += ht;
        totalTva += tva;
        totalTtc += ttc;
    });

    const htEl = document.getElementById('inv-total-ht');
    const tvaEl = document.getElementById('inv-total-tva');
    const ttcEl = document.getElementById('inv-total-ttc');
    if (htEl) htEl.textContent = invFormatCurrency(totalHt);
    if (tvaEl) tvaEl.textContent = invFormatCurrency(totalTva);
    if (ttcEl) ttcEl.innerHTML = `<strong>${invFormatCurrency(totalTtc)}</strong>`;
}

// === SUPPLIER AUTOCOMPLETE ===

function invSupplierAutocomplete(query) {
    clearTimeout(invSearchTimer);
    const dropdown = document.getElementById('inv-supplier-dropdown');
    if (!dropdown) return;

    if (query.length < 2) { dropdown.style.display = 'none'; return; }

    invSearchTimer = setTimeout(async () => {
        try {
            const res = await API.get(`suppliers/search?q=${encodeURIComponent(query)}&hotel_id=${invCurrentHotel}`);
            const suppliers = res.suppliers || [];

            let html = '';
            if (suppliers.length === 0) {
                html = '<div style="padding:var(--space-3);color:var(--text-secondary);font-size:var(--font-size-sm)">Aucun fournisseur trouvé</div>';
            } else {
                html = suppliers.map(s => `
                    <div style="padding:var(--space-2) var(--space-3);cursor:pointer;border-bottom:1px solid var(--gray-100);font-size:var(--font-size-sm)"
                         onmouseover="this.style.background='var(--gray-50)'"
                         onmouseout="this.style.background=''"
                         onclick="invSelectSupplier(${s.id}, '${escAttr(s.name)}')">
                        <strong>${esc(s.name)}</strong>
                        ${s.siret ? `<span style="color:var(--text-tertiary);margin-left:var(--space-2)">SIRET: ${esc(s.siret)}</span>` : ''}
                    </div>
                `).join('');
            }

            // Bouton "Créer un fournisseur" si permission
            if (hasPermission('suppliers.manage')) {
                html += `
                    <div style="padding:var(--space-2) var(--space-3);cursor:pointer;border-top:2px solid var(--gray-200);font-size:var(--font-size-sm);color:var(--brand-secondary);font-weight:var(--font-semibold)"
                         onmouseover="this.style.background='var(--primary-50)'"
                         onmouseout="this.style.background=''"
                         onclick="invQuickCreateSupplier('${escAttr(query)}')">
                        <i class="fas fa-plus-circle"></i> Créer « ${esc(query)} »
                    </div>
                `;
            }

            dropdown.innerHTML = html;
            dropdown.style.display = 'block';
        } catch (e) {
            dropdown.style.display = 'none';
        }
    }, 300);
}

function invSelectSupplier(id, name) {
    document.getElementById('inv-supplier-id').value = id;
    document.getElementById('inv-supplier-search').value = name;
    document.getElementById('inv-supplier-dropdown').style.display = 'none';
}

function invQuickCreateSupplier(prefillName) {
    const dd = document.getElementById('inv-supplier-dropdown');
    if (dd) dd.style.display = 'none';

    openModal('Nouveau fournisseur', `
        <form onsubmit="invSaveQuickSupplier(event)">
            <div class="form-row">
                <div class="form-group"><label class="form-label required">Raison sociale</label>
                    <input type="text" id="qsup-name" class="form-control" value="${esc(prefillName || '')}" required></div>
                <div class="form-group"><label class="form-label">SIRET</label>
                    <input type="text" id="qsup-siret" class="form-control" maxlength="14"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">Email contact</label>
                    <input type="email" id="qsup-email" class="form-control"></div>
                <div class="form-group"><label class="form-label">Téléphone</label>
                    <input type="text" id="qsup-phone" class="form-control"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">Mode de paiement</label>
                    <select id="qsup-payment" class="form-control">
                        <option value="virement_manuel">Virement</option>
                        <option value="cheque">Chèque</option>
                        <option value="prelevement">Prélèvement</option>
                        <option value="autre">Autre</option>
                    </select></div>
                <div class="form-group"><label class="form-label">Catégorie</label>
                    <select id="qsup-category" class="form-control">
                        <option value="">— Aucune —</option>
                        ${invCategories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                    </select></div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Créer et sélectionner</button>
            </div>
        </form>
    `, 'modal-lg');
}

async function invSaveQuickSupplier(event) {
    event.preventDefault();
    const data = {
        name: document.getElementById('qsup-name').value,
        siret: document.getElementById('qsup-siret').value || null,
        contact_email: document.getElementById('qsup-email').value || null,
        contact_phone: document.getElementById('qsup-phone').value || null,
        payment_method: document.getElementById('qsup-payment').value,
        category_id: document.getElementById('qsup-category').value || null,
        payment_delay_days: 30,
        hotel_ids: [invCurrentHotel]
    };

    try {
        const res = await API.post('suppliers', data);
        toast('Fournisseur créé', 'success');
        closeModal();

        // Auto-sélectionner le fournisseur créé
        const newId = res.id || res.supplier_id;
        if (newId) {
            invSelectSupplier(newId, data.name);
        }
    } catch (err) {
        toast(err.message || 'Erreur lors de la création', 'error');
    }
}

// === PAIEMENT FINTECTURE ===

async function invPayFintecture(invoiceId) {
    if (!confirm('Initier le paiement via Fintecture (Open Banking) ?\n\nVous serez redirigé vers votre banque pour confirmer le virement.')) return;

    try {
        const res = await API.post(`invoices/${invoiceId}/pay`, { payment_method: 'fintecture' });

        if (res.redirect_url) {
            // Rediriger vers la banque
            toast('Redirection vers votre banque...', 'info');
            window.location.href = res.redirect_url;
        } else {
            toast('Paiement initié', 'success');
            invRenderVerify(_invContainer, invoiceId);
        }
    } catch (err) {
        toast(err.message || 'Erreur lors de l\'initiation du paiement', 'error');
    }
}

async function invCheckPaymentStatus(invoiceId) {
    try {
        toast('Vérification du paiement...', 'info');
        const res = await API.get(`invoices/${invoiceId}`);
        const inv = res.invoice;

        if (inv.status === 'paid') {
            toast('Paiement confirmé !', 'success');
        } else if (inv.status === 'payment_initiated') {
            toast('Paiement en cours de traitement — le statut sera mis à jour automatiquement', 'info');
        } else if (inv.status === 'approved') {
            toast('Le paiement a échoué ou a été annulé — vous pouvez réessayer', 'warning');
        }

        invRenderVerify(_invContainer, invoiceId);
    } catch (err) {
        toast('Erreur lors de la vérification', 'error');
    }
}

// === SAVE ===

async function invSaveInvoice(targetStatus) {
    // Collecter les données du formulaire
    const supplierId = document.getElementById('inv-supplier-id')?.value;
    const invoiceNumber = document.getElementById('inv-number')?.value;
    const invoiceDate = document.getElementById('inv-date')?.value;
    const dueDate = document.getElementById('inv-due-date')?.value;
    const paymentMethod = document.getElementById('inv-payment-method')?.value;
    const notes = document.getElementById('inv-notes')?.value;

    // Collecter les lignes
    const rows = document.querySelectorAll('.inv-line-row');
    const lines = [];
    let totalHt = 0, totalTva = 0, totalTtc = 0;

    rows.forEach((row, i) => {
        const idx = row.dataset.idx || i;
        const catSelect = row.querySelector(`[name="line-cat-${idx}"]`);
        const htInput = row.querySelector(`[name="line-ht-${idx}"]`);
        const tvaSelect = row.querySelector(`[name="line-tva-${idx}"]`);

        const ht = parseFloat(htInput?.value) || 0;
        const rate = parseFloat(tvaSelect?.value) || 0;
        if (ht === 0) return; // Ignorer les lignes vides

        const tva = Math.round(ht * rate) / 100;
        const ttc = ht + tva;
        totalHt += ht;
        totalTva += tva;
        totalTtc += ttc;

        lines.push({
            category_id: catSelect?.value || null,
            amount_ht: ht,
            tva_rate: rate,
            tva_amount: tva,
            total_ttc: ttc
        });
    });

    // Validation
    if (targetStatus === 'approved') {
        if (!supplierId) { toast('Veuillez sélectionner un fournisseur', 'warning'); return; }
        if (!invoiceDate) { toast('Veuillez renseigner la date de facture', 'warning'); return; }
        if (lines.length === 0) { toast('Ajoutez au moins une ligne de ventilation', 'warning'); return; }
    }

    // Si le formulaire n'est pas éditable (ex: passage à payée), envoyer seulement le statut
    const isFormEditable = rows.length > 0;
    const data = isFormEditable ? {
        supplier_id: supplierId || null,
        invoice_number: invoiceNumber || null,
        invoice_date: invoiceDate || null,
        due_date: dueDate || null,
        total_ht: Math.round(totalHt * 100) / 100,
        total_tva: Math.round(totalTva * 100) / 100,
        total_ttc: Math.round(totalTtc * 100) / 100,
        payment_method: paymentMethod,
        notes: notes,
        status: targetStatus,
        lines: lines
    } : { status: targetStatus };

    try {
        await API.put(`invoices/${invCurrentInvoice}`, data);
        const statusLabels = { draft: 'Brouillon enregistré', approved: 'Facture validée — à payer', paid: 'Facture marquée comme payée' };
        toast(statusLabels[targetStatus] || 'Enregistré', 'success');

        // Rafraîchir les stats
        invLoadStats();

        // Après validation (approved) ou paiement (paid) : passer à la facture suivante
        if (targetStatus === 'approved' || targetStatus === 'paid') {
            const nextId = await invFindNextInvoice(invCurrentInvoice);
            if (nextId) {
                toast('Facture suivante...', 'info');
                invCurrentInvoice = nextId;
                invRenderVerify(_invContainer, nextId);
            } else {
                toast('Plus de factures à traiter dans cette sélection', 'info');
                invBackToList();
            }
        } else {
            invRenderVerify(_invContainer, invCurrentInvoice);
        }
    } catch (err) {
        toast(err.message || 'Erreur lors de la sauvegarde', 'error');
    }
}

async function invDeleteInvoice(id, status) {
    let msg = 'Supprimer cette facture ?';
    if (status && status !== 'draft') {
        const label = invStatusLabel(status);
        msg = `ATTENTION : Cette facture est en statut « ${label} ».\n\nCette action est irréversible. Voulez-vous vraiment la supprimer ?`;
    }
    if (!confirm(msg)) return;

    // Double confirmation pour les factures non-brouillon
    if (status && status !== 'draft') {
        if (!confirm('Confirmez-vous la suppression définitive de cette facture ?')) return;
    }

    try {
        await API.delete(`invoices/${id}`);
        toast('Facture supprimée', 'success');
        invLoadStats();
        invBackToList();
    } catch (err) {
        toast(err.message || 'Erreur', 'error');
    }
}

function invBackToList() {
    invCurrentView = 'list';
    invCurrentInvoice = null;
    invRenderMain(_invContainer);
}

async function invFindNextInvoice(currentId) {
    try {
        // Chercher les factures dans le même filtre, exclure celle qu'on vient de traiter
        let url = `invoices?hotel_id=${invCurrentHotel}&per_page=50`;
        if (invListStatus) url += `&status=${invListStatus}`;
        if (invListSearch) url += `&search=${encodeURIComponent(invListSearch)}`;

        const res = await API.get(url);
        const invoices = res.invoices || [];

        // Trouver la première facture qui n'est pas celle courante et qui est éditable (draft) ou à valider
        const editableStatuses = ['draft', 'pending_review', 'pending_approval'];
        const next = invoices.find(inv => inv.id !== currentId && editableStatuses.includes(inv.status));
        if (next) return next.id;

        // Sinon chercher n'importe quelle facture non payée après la courante
        const idx = invoices.findIndex(inv => inv.id === currentId);
        const remaining = invoices.filter((inv, i) => inv.id !== currentId && inv.status !== 'paid');
        if (remaining.length > 0) return remaining[0].id;

        return null;
    } catch (e) {
        return null;
    }
}

// ============================================================
// ONGLET FOURNISSEURS
// ============================================================

async function invRenderFournisseurs(content) {
    showLoading(content);
    try {
        const res = await API.get(`suppliers?hotel_id=${invCurrentHotel}&per_page=100`);
        const suppliers = res.suppliers || [];

        content.innerHTML = `
            <div class="card">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
                    <h3><i class="fas fa-building"></i> Fournisseurs</h3>
                    ${hasPermission('suppliers.manage') ? `<button class="btn btn-sm btn-primary" onclick="invShowSupplierForm()"><i class="fas fa-plus"></i> Nouveau fournisseur</button>` : ''}
                </div>
                ${suppliers.length === 0 ? '<div class="empty-state" style="padding:var(--space-6)"><i class="fas fa-building"></i><h3>Aucun fournisseur</h3></div>' : `
                    <div class="table-responsive">
                        <table class="table">
                            <thead><tr><th>Nom</th><th>SIRET</th><th>Catégorie</th><th>Contact</th><th>Paiement</th><th>Actions</th></tr></thead>
                            <tbody>
                                ${suppliers.map(s => `
                                    <tr>
                                        <td><strong>${esc(s.name)}</strong></td>
                                        <td>${esc(s.siret || '-')}</td>
                                        <td>${esc(s.category_name || '-')}</td>
                                        <td>${esc(s.contact_email || s.contact_phone || '-')}</td>
                                        <td>${invPaymentLabel(s.payment_method)}</td>
                                        <td>
                                            ${hasPermission('suppliers.manage') ? `<button class="btn btn-sm btn-outline" onclick="invShowSupplierForm(${s.id})"><i class="fas fa-edit"></i></button>` : ''}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        `;
    } catch (err) {
        content.innerHTML = '<div class="alert alert-danger">Erreur de chargement</div>';
    }
}

async function invShowSupplierForm(supplierId) {
    let supplier = { payment_method: 'virement', payment_delay_days: 30 };
    let supplierHotels = [];

    if (supplierId) {
        try {
            const res = await API.get(`suppliers/${supplierId}`);
            supplier = res.supplier || supplier;
            supplierHotels = (supplier.hotels || []).filter(h => h.is_active).map(h => h.hotel_id);
        } catch (e) { toast('Erreur de chargement', 'error'); return; }
    }

    openModal(supplierId ? 'Modifier le fournisseur' : 'Nouveau fournisseur', `
        <form onsubmit="invSaveSupplier(event, ${supplierId || 'null'})">
            <div class="form-row">
                <div class="form-group"><label class="form-label required">Raison sociale</label>
                    <input type="text" id="sup-name" class="form-control" value="${esc(supplier.name || '')}" required></div>
                <div class="form-group"><label class="form-label">SIRET</label>
                    <input type="text" id="sup-siret" class="form-control" value="${esc(supplier.siret || '')}" maxlength="14"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">N° TVA</label>
                    <input type="text" id="sup-tva" class="form-control" value="${esc(supplier.tva_number || '')}"></div>
                <div class="form-group"><label class="form-label">Catégorie</label>
                    <select id="sup-category" class="form-control">
                        <option value="">— Aucune —</option>
                        ${invCategories.map(c => `<option value="${c.id}" ${supplier.category_id == c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
                    </select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">Email contact</label>
                    <input type="email" id="sup-email" class="form-control" value="${esc(supplier.contact_email || '')}"></div>
                <div class="form-group"><label class="form-label">Téléphone</label>
                    <input type="text" id="sup-phone" class="form-control" value="${esc(supplier.contact_phone || '')}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">Mode de paiement</label>
                    <select id="sup-payment" class="form-control">
                        <option value="virement_manuel" ${supplier.payment_method === 'virement_manuel' ? 'selected' : ''}>Virement</option>
                        <option value="cheque" ${supplier.payment_method === 'cheque' ? 'selected' : ''}>Chèque</option>
                        <option value="prelevement" ${supplier.payment_method === 'prelevement' ? 'selected' : ''}>Prélèvement</option>
                        <option value="autre" ${supplier.payment_method === 'autre' ? 'selected' : ''}>Autre</option>
                    </select></div>
                <div class="form-group"><label class="form-label">Délai de paiement (jours)</label>
                    <input type="number" id="sup-delay" class="form-control" value="${supplier.payment_delay_days || 30}" min="0"></div>
            </div>
            <div class="form-group"><label class="form-label">IBAN</label>
                <input type="text" id="sup-iban" class="form-control" value="${esc(supplier.iban || '')}" placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX"></div>
            ${invHotels.length > 1 ? `
                <div class="form-group"><label class="form-label">Hôtels associés</label>
                    <div style="display:flex;flex-wrap:wrap;gap:var(--space-2)">
                        ${invHotels.map(h => `
                            <label style="display:flex;align-items:center;gap:var(--space-1);font-size:var(--font-size-sm)">
                                <input type="checkbox" name="sup-hotels" value="${h.id}" ${(!supplierId || supplierHotels.includes(h.id)) ? 'checked' : ''}>
                                ${esc(h.name)}
                            </label>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
            </div>
        </form>
    `, 'modal-lg');
}

async function invSaveSupplier(event, supplierId) {
    event.preventDefault();

    const hotelCheckboxes = document.querySelectorAll('[name="sup-hotels"]:checked');
    const hotelIds = hotelCheckboxes.length > 0 ? Array.from(hotelCheckboxes).map(cb => parseInt(cb.value)) : [invCurrentHotel];

    const data = {
        name: document.getElementById('sup-name').value,
        siret: document.getElementById('sup-siret').value || null,
        tva_number: document.getElementById('sup-tva').value || null,
        category_id: document.getElementById('sup-category').value || null,
        contact_email: document.getElementById('sup-email').value || null,
        contact_phone: document.getElementById('sup-phone').value || null,
        payment_method: document.getElementById('sup-payment').value,
        payment_delay_days: parseInt(document.getElementById('sup-delay').value) || 30,
        iban: document.getElementById('sup-iban').value || null,
        hotel_ids: hotelIds
    };

    try {
        if (supplierId) {
            await API.put(`suppliers/${supplierId}`, data);
            toast('Fournisseur mis à jour', 'success');
        } else {
            await API.post('suppliers', data);
            toast('Fournisseur créé', 'success');
        }
        closeModal();
        invSwitchTab('fournisseurs');
    } catch (err) {
        toast(err.message || 'Erreur', 'error');
    }
}

// ============================================================
// ONGLET REPORTING
// ============================================================

let invReportYear = new Date().getFullYear();

async function invRenderReporting(content) {
    showLoading(content);
    try {
        const res = await API.get(`invoices/reporting?hotel_id=${invCurrentHotel}&year=${invReportYear}`);
        const data = res.reporting || [];
        const prevYear = res.previous_year || [];

        // Organiser par catégorie et mois
        const categories = {};
        data.forEach(r => {
            const key = r.category_id || 'sans';
            if (!categories[key]) categories[key] = { name: r.category_name || 'Sans catégorie', color: r.color, months: {} };
            categories[key].months[r.month] = parseFloat(r.total);
        });

        const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
        const catKeys = Object.keys(categories);

        content.innerHTML = `
            <div class="card" style="margin-bottom:var(--space-4)">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
                    <h3><i class="fas fa-chart-bar"></i> Dépenses par catégorie — ${invReportYear}</h3>
                    <div style="display:flex;gap:var(--space-2);align-items:center">
                        <button class="btn btn-sm btn-outline" onclick="invReportYear--;invRenderReporting(document.getElementById('inv-tab-content'))"><i class="fas fa-chevron-left"></i></button>
                        <span style="font-weight:var(--font-semibold);min-width:50px;text-align:center">${invReportYear}</span>
                        <button class="btn btn-sm btn-outline" onclick="invReportYear++;invRenderReporting(document.getElementById('inv-tab-content'))"><i class="fas fa-chevron-right"></i></button>
                        ${hasPermission('invoices.export') ? `<button class="btn btn-sm btn-outline" onclick="window.open(CONFIG.API_URL+'/invoices/reporting/export?hotel_id=${invCurrentHotel}&year=${invReportYear}&token='+API.token,'_blank')"><i class="fas fa-download"></i> CSV</button>` : ''}
                    </div>
                </div>
                ${catKeys.length === 0 ? `<div class="empty-state" style="padding:var(--space-6)"><h3>Aucune donnée pour ${invReportYear}</h3></div>` : `
                    <div class="table-responsive">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Catégorie</th>
                                    ${months.map(m => `<th style="text-align:right;font-size:var(--font-size-xs)">${m}</th>`).join('')}
                                    <th style="text-align:right"><strong>Total</strong></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${catKeys.map(key => {
                                    const cat = categories[key];
                                    let rowTotal = 0;
                                    return `<tr>
                                        <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${cat.color || 'var(--gray-400)'};margin-right:var(--space-1)"></span> ${esc(cat.name)}</td>
                                        ${Array.from({length: 12}, (_, m) => {
                                            const val = cat.months[m + 1] || 0;
                                            rowTotal += val;
                                            return `<td style="text-align:right;font-size:var(--font-size-xs)">${val ? invFormatCurrency(val) : '-'}</td>`;
                                        }).join('')}
                                        <td style="text-align:right"><strong>${invFormatCurrency(rowTotal)}</strong></td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                            <tfoot>
                                <tr style="font-weight:var(--font-semibold);background:var(--gray-50)">
                                    <td>Total</td>
                                    ${Array.from({length: 12}, (_, m) => {
                                        let monthTotal = 0;
                                        catKeys.forEach(key => { monthTotal += categories[key].months[m + 1] || 0; });
                                        return `<td style="text-align:right;font-size:var(--font-size-xs)">${monthTotal ? invFormatCurrency(monthTotal) : '-'}</td>`;
                                    }).join('')}
                                    <td style="text-align:right"><strong>${invFormatCurrency(catKeys.reduce((sum, key) => {
                                        return sum + Object.values(categories[key].months).reduce((a, b) => a + b, 0);
                                    }, 0))}</strong></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                `}
            </div>
        `;
    } catch (err) {
        content.innerHTML = '<div class="alert alert-danger">Erreur de chargement du reporting</div>';
    }
}

// ============================================================
// ONGLET EXPORT
// ============================================================

function invRenderExport(content) {
    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.substring(0, 7) + '-01';

    content.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3><i class="fas fa-download"></i> Export de factures</h3>
            </div>
            <div class="card-body" style="padding:var(--space-4)">
                <div class="form-group">
                    <label class="form-label">Filtrer par</label>
                    <select id="inv-export-date-type" class="form-control" style="max-width:300px">
                        <option value="invoice_date">Date de facture</option>
                        <option value="paid">Date de paiement</option>
                        <option value="created">Date d'import</option>
                    </select>
                </div>
                <div class="form-row" style="display:flex;gap:var(--space-3);flex-wrap:wrap">
                    <div class="form-group" style="margin:0">
                        <label class="form-label">Du</label>
                        <input type="date" id="inv-export-from" class="form-control" value="${monthStart}">
                    </div>
                    <div class="form-group" style="margin:0">
                        <label class="form-label">Au</label>
                        <input type="date" id="inv-export-to" class="form-control" value="${today}">
                    </div>
                    <div class="form-group" style="margin:0">
                        <label class="form-label">Statut</label>
                        <select id="inv-export-status" class="form-control">
                            <option value="">Tous</option>
                            <option value="draft">Brouillon</option>
                            <option value="approved">À payer</option>
                            <option value="paid">Payée</option>
                            <option value="rejected">Rejetée</option>
                        </select>
                    </div>
                </div>

                <div style="margin-top:var(--space-4)">
                    <button class="btn btn-outline" onclick="invExportPreview()"><i class="fas fa-search"></i> Aperçu</button>
                </div>

                <div id="inv-export-preview" style="margin-top:var(--space-4)"></div>
            </div>
        </div>
    `;
}

function invExportBuildParams() {
    const dateType = document.getElementById('inv-export-date-type')?.value || 'invoice_date';
    const from = document.getElementById('inv-export-from')?.value || '';
    const to = document.getElementById('inv-export-to')?.value || '';
    const status = document.getElementById('inv-export-status')?.value || '';

    let params = `hotel_id=${invCurrentHotel}`;
    if (from) {
        if (dateType === 'invoice_date') params += `&invoice_date_from=${from}`;
        else if (dateType === 'paid') params += `&paid_from=${from}`;
        else if (dateType === 'created') params += `&created_from=${from}`;
    }
    if (to) {
        if (dateType === 'invoice_date') params += `&invoice_date_to=${to}`;
        else if (dateType === 'paid') params += `&paid_to=${to}`;
        else if (dateType === 'created') params += `&created_to=${to}`;
    }
    if (status) params += `&status=${status}`;
    return params;
}

async function invExportPreview() {
    const preview = document.getElementById('inv-export-preview');
    if (!preview) return;
    preview.innerHTML = '<div style="text-align:center;padding:var(--space-4)"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>';

    try {
        const params = invExportBuildParams();
        const res = await API.get(`invoices/extract?${params}&per_page=500`);
        const invoices = res.invoices || [];

        if (invoices.length === 0) {
            preview.innerHTML = '<div class="empty-state" style="padding:var(--space-4)"><h3>Aucune facture trouvée</h3><p>Modifiez les critères de recherche</p></div>';
            return;
        }

        let totalTtc = 0;
        invoices.forEach(inv => { totalTtc += parseFloat(inv.total_ttc || 0); });

        preview.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-3);flex-wrap:wrap;gap:var(--space-2)">
                <div>
                    <strong>${invoices.length} facture(s)</strong> — Total TTC : <strong>${invFormatCurrency(totalTtc)}</strong>
                </div>
                <div style="display:flex;gap:var(--space-2)">
                    <button class="btn btn-sm btn-outline" onclick="invExportCsv()"><i class="fas fa-file-csv"></i> Export CSV</button>
                    <button class="btn btn-sm btn-primary" onclick="invExportZip()"><i class="fas fa-file-archive"></i> Export ZIP (fichiers)</button>
                </div>
            </div>
            <div class="table-responsive">
                <table class="table">
                    <thead><tr><th>Fournisseur</th><th>N° Facture</th><th>Date</th><th style="text-align:right">TTC</th><th>Statut</th><th>Fichier</th></tr></thead>
                    <tbody>
                        ${invoices.map(inv => `
                            <tr>
                                <td>${esc(inv.supplier_name || '-')}</td>
                                <td>${esc(inv.invoice_number || '-')}</td>
                                <td>${inv.invoice_date ? formatDate(inv.invoice_date) : '-'}</td>
                                <td style="text-align:right">${invFormatCurrency(inv.total_ttc)}</td>
                                <td>${invStatusBadge(inv.status)}</td>
                                <td>${inv.original_file ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-danger"></i>'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        preview.innerHTML = '<div class="alert alert-danger">Erreur lors du chargement</div>';
        console.error(err);
    }
}

function invExportCsv() {
    const params = invExportBuildParams();
    window.open(CONFIG.API_URL + '/invoices/extract/csv?' + params + '&token=' + API.token, '_blank');
}

function invExportZip() {
    const params = invExportBuildParams();
    window.open(CONFIG.API_URL + '/invoices/extract/zip?' + params + '&token=' + API.token, '_blank');
    toast('Génération du fichier ZIP en cours...', 'info');
}

// ============================================================
// ONGLET CONFIGURATION
// ============================================================

async function invRenderConfig(content) {
    showLoading(content);
    try {
        const [rulesResult, ocrResult] = await Promise.allSettled([
            API.get(`invoices/approval-rules?hotel_id=${invCurrentHotel}`),
            API.get('invoices/ocr-status')
        ]);

        const rules = rulesResult.status === 'fulfilled' ? (rulesResult.value.rules || []) : [];
        const prereqs = ocrResult.status === 'fulfilled' ? (ocrResult.value.prerequisites || {}) : {};

        content.innerHTML = `
            <!-- Workflow de validation -->
            <div class="card" style="margin-bottom:var(--space-4)">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
                    <h3><i class="fas fa-tasks"></i> Règles de validation</h3>
                    <button class="btn btn-sm btn-primary" onclick="invShowRuleForm()"><i class="fas fa-plus"></i> Ajouter</button>
                </div>
                ${rules.length === 0 ? '<div style="padding:var(--space-4);text-align:center;color:var(--text-secondary)">Aucune règle — les factures sont validées sans contrôle de montant</div>' : `
                    <div class="table-responsive">
                        <table class="table">
                            <thead><tr><th>Nom</th><th>Montant min</th><th>Montant max</th><th>Rôle requis</th><th>Double validation</th><th>Catégorie</th><th>Actions</th></tr></thead>
                            <tbody>
                                ${rules.map(r => `
                                    <tr>
                                        <td><strong>${esc(r.name)}</strong></td>
                                        <td>${invFormatCurrency(r.min_amount)}</td>
                                        <td>${r.max_amount ? invFormatCurrency(r.max_amount) : '∞'}</td>
                                        <td>${esc(r.required_role)}</td>
                                        <td>${r.requires_double_approval ? '<i class="fas fa-check text-success"></i>' : '-'}</td>
                                        <td>${esc(r.category_name || 'Toutes')}</td>
                                        <td>
                                            <button class="btn btn-sm btn-outline" onclick="invShowRuleForm(${r.id})"><i class="fas fa-edit"></i></button>
                                            <button class="btn btn-sm btn-outline text-danger" onclick="invDeleteRule(${r.id})"><i class="fas fa-trash"></i></button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>

            <!-- Fintecture (Open Banking) -->
            <div class="card" style="margin-bottom:var(--space-4)">
                <div class="card-header"><h3><i class="fas fa-university"></i> Fintecture — Paiement Open Banking</h3></div>
                <div class="card-body" style="padding:var(--space-4)">
                    <p style="color:var(--text-secondary);font-size:var(--font-size-sm);margin-bottom:var(--space-3)">
                        <i class="fas fa-info-circle"></i> Fintecture permet de payer vos fournisseurs par virement instantané via Open Banking (PSD2).
                        Le fournisseur doit avoir un IBAN renseigné.
                    </p>
                    <form onsubmit="invSaveFintectureConfig(event)">
                        <div class="form-row">
                            <div class="form-group" style="flex:1"><label class="form-label">App ID</label>
                                <input type="text" id="fint-app-id" class="form-control" value="${esc(invFintectureConfig?.app_id || '')}" placeholder="Votre App ID Fintecture"></div>
                            <div class="form-group" style="flex:1"><label class="form-label">App Secret</label>
                                <input type="password" id="fint-app-secret" class="form-control" placeholder="${invFintectureConfig?.has_secret ? '••••••••' : 'Votre App Secret'}"></div>
                        </div>
                        <div class="form-row">
                            <div class="form-group" style="flex:1"><label class="form-label">Chemin clé privée RSA (optionnel)</label>
                                <input type="text" id="fint-private-key" class="form-control" value="${esc(invFintectureConfig?.private_key_path || '')}" placeholder="/chemin/vers/private_key.pem"></div>
                            <div class="form-group" style="flex:1"><label class="form-label">Environnement</label>
                                <select id="fint-env" class="form-control">
                                    <option value="sandbox" ${(invFintectureConfig?.environment || 'sandbox') === 'sandbox' ? 'selected' : ''}>Sandbox (test)</option>
                                    <option value="production" ${invFintectureConfig?.environment === 'production' ? 'selected' : ''}>Production</option>
                                </select></div>
                        </div>
                        <div class="form-row">
                            <div class="form-group" style="flex:1"><label class="form-label">Webhook Secret (optionnel)</label>
                                <input type="password" id="fint-webhook" class="form-control" placeholder="${invFintectureConfig?.has_webhook_secret ? '••••••••' : 'Secret webhook'}"></div>
                            <div class="form-group" style="flex:1;display:flex;align-items:flex-end">
                                <label style="display:flex;align-items:center;gap:var(--space-2);cursor:pointer">
                                    <input type="checkbox" id="fint-active" ${invFintectureConfig?.is_active ? 'checked' : ''}>
                                    <strong>Activer Fintecture</strong>
                                </label>
                            </div>
                        </div>
                        <div style="display:flex;gap:var(--space-2);margin-top:var(--space-3)">
                            <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
                            <button type="button" class="btn btn-outline" onclick="invTestFintecture()"><i class="fas fa-plug"></i> Tester la connexion</button>
                        </div>
                    </form>
                    <div id="fint-test-result" style="margin-top:var(--space-3)"></div>
                </div>
            </div>

            <!-- Statut OCR -->
            <div class="card">
                <div class="card-header"><h3><i class="fas fa-robot"></i> Statut OCR / IA</h3></div>
                <div class="card-body" style="padding:var(--space-4)">
                    <table class="table table-sm">
                        <tr><td><strong>Tesseract OCR</strong></td><td>${prereqs.tesseract ? '<span class="badge badge-success">Installé</span>' : '<span class="badge badge-danger">Non installé</span>'}</td></tr>
                        <tr><td><strong>Ghostscript (PDF)</strong></td><td>${prereqs.ghostscript ? '<span class="badge badge-success">Installé</span>' : '<span class="badge badge-danger">Non installé</span>'}</td></tr>
                        ${prereqs.exec_disabled ? '<tr><td colspan="2"><span class="badge badge-warning">exec() désactivé sur le serveur — OCR indisponible</span></td></tr>' : ''}
                    </table>
                    <p style="margin-top:var(--space-3);color:var(--text-secondary);font-size:var(--font-size-sm)">
                        <i class="fas fa-info-circle"></i> La clé API IA se configure dans les paramètres hôtel (Hôtels > Contrats).
                    </p>
                </div>
            </div>
        `;
    } catch (err) {
        content.innerHTML = '<div class="alert alert-danger">Erreur de chargement de la configuration</div>';
        console.error(err);
    }
}

async function invSaveFintectureConfig(event) {
    event.preventDefault();
    const data = {
        hotel_id: invCurrentHotel,
        app_id: document.getElementById('fint-app-id').value || null,
        environment: document.getElementById('fint-env').value,
        private_key_path: document.getElementById('fint-private-key').value || null,
        is_active: document.getElementById('fint-active').checked ? 1 : 0
    };

    const secret = document.getElementById('fint-app-secret').value;
    if (secret) data.app_secret = secret;
    const webhook = document.getElementById('fint-webhook').value;
    if (webhook) data.webhook_secret = webhook;

    try {
        await API.put('invoices/fintecture-config', data);
        toast('Configuration Fintecture enregistrée', 'success');
        // Recharger la config
        const res = await API.get(`invoices/fintecture-config?hotel_id=${invCurrentHotel}`);
        invFintectureConfig = res.config || null;
    } catch (err) {
        toast(err.message || 'Erreur', 'error');
    }
}

async function invTestFintecture() {
    const resultDiv = document.getElementById('fint-test-result');
    if (!resultDiv) return;
    resultDiv.innerHTML = '<span class="badge badge-info"><i class="fas fa-spinner fa-spin"></i> Test en cours...</span>';

    try {
        // Sauvegarder d'abord si besoin
        const data = {
            hotel_id: invCurrentHotel,
            app_id: document.getElementById('fint-app-id').value || null,
            environment: document.getElementById('fint-env').value,
            private_key_path: document.getElementById('fint-private-key').value || null,
            is_active: document.getElementById('fint-active').checked ? 1 : 0,
            test_connection: true
        };
        const secret = document.getElementById('fint-app-secret').value;
        if (secret) data.app_secret = secret;

        const res = await API.put('invoices/fintecture-config', data);
        if (res.test && res.test.success) {
            resultDiv.innerHTML = `<span class="badge badge-success"><i class="fas fa-check-circle"></i> Connexion réussie (${esc(res.test.environment)})</span>`;
        } else {
            resultDiv.innerHTML = `<span class="badge badge-danger"><i class="fas fa-times-circle"></i> Échec : ${esc(res.test?.error || 'Erreur inconnue')}</span>`;
        }
    } catch (err) {
        resultDiv.innerHTML = `<span class="badge badge-danger"><i class="fas fa-times-circle"></i> ${esc(err.message || 'Erreur')}</span>`;
    }
}

async function invShowRuleForm(ruleId) {
    let rule = { min_amount: 0, required_role: 'hotel_manager', is_active: 1 };

    if (ruleId) {
        try {
            const res = await API.get(`invoices/approval-rules?hotel_id=${invCurrentHotel}`);
            rule = (res.rules || []).find(r => r.id === ruleId) || rule;
        } catch (e) {}
    }

    openModal(ruleId ? 'Modifier la règle' : 'Nouvelle règle', `
        <form onsubmit="invSaveRule(event, ${ruleId || 'null'})">
            <div class="form-group"><label class="form-label required">Nom de la règle</label>
                <input type="text" id="rule-name" class="form-control" value="${esc(rule.name || '')}" required></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">Montant TTC minimum (€)</label>
                    <input type="number" id="rule-min" class="form-control" value="${rule.min_amount || 0}" step="0.01" min="0"></div>
                <div class="form-group"><label class="form-label">Montant TTC maximum (€)</label>
                    <input type="number" id="rule-max" class="form-control" value="${rule.max_amount || ''}" step="0.01" min="0" placeholder="Illimité"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label required">Rôle requis</label>
                    <select id="rule-role" class="form-control">
                        <option value="hotel_manager" ${rule.required_role === 'hotel_manager' ? 'selected' : ''}>Resp. Hôtel</option>
                        <option value="groupe_manager" ${rule.required_role === 'groupe_manager' ? 'selected' : ''}>Resp. Groupe</option>
                        <option value="admin" ${rule.required_role === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="comptabilite" ${rule.required_role === 'comptabilite' ? 'selected' : ''}>Comptabilité</option>
                    </select></div>
                <div class="form-group"><label class="form-label">Catégorie</label>
                    <select id="rule-cat" class="form-control">
                        <option value="">Toutes les catégories</option>
                        ${invCategories.map(c => `<option value="${c.id}" ${rule.supplier_category_id == c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
                    </select></div>
            </div>
            <div class="form-check" style="margin-bottom:var(--space-3)">
                <input type="checkbox" id="rule-double" ${rule.requires_double_approval ? 'checked' : ''}>
                <label for="rule-double">Double validation requise</label>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
            </div>
        </form>
    `, 'modal-lg');
}

async function invSaveRule(event, ruleId) {
    event.preventDefault();
    const data = {
        hotel_id: invCurrentHotel,
        name: document.getElementById('rule-name').value,
        min_amount: parseFloat(document.getElementById('rule-min').value) || 0,
        max_amount: document.getElementById('rule-max').value ? parseFloat(document.getElementById('rule-max').value) : null,
        required_role: document.getElementById('rule-role').value,
        supplier_category_id: document.getElementById('rule-cat').value || null,
        requires_double_approval: document.getElementById('rule-double').checked ? 1 : 0,
        is_active: 1
    };
    try {
        if (ruleId) { await API.put(`invoices/approval-rules/${ruleId}`, data); }
        else { await API.post('invoices/approval-rules', data); }
        toast('Règle enregistrée', 'success');
        closeModal();
        invSwitchTab('config');
    } catch (err) { toast(err.message || 'Erreur', 'error'); }
}

async function invDeleteRule(ruleId) {
    if (!confirm('Supprimer cette règle ?')) return;
    try {
        await API.delete(`invoices/approval-rules/${ruleId}`);
        toast('Règle supprimée', 'success');
        invSwitchTab('config');
    } catch (err) { toast(err.message || 'Erreur', 'error'); }
}

// Fermer dropdown supplier quand on clique ailleurs
document.addEventListener('click', function(e) {
    const dd = document.getElementById('inv-supplier-dropdown');
    if (dd && !e.target.closest('#inv-supplier-search') && !e.target.closest('#inv-supplier-dropdown')) {
        dd.style.display = 'none';
    }
});
