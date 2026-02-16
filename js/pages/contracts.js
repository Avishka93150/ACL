/**
 * Contrats Fournisseurs - Module complet
 * Gestion des contrats, alertes, catégories, charges fixes, export, analyse IA
 */

let ctHotels = [];
let ctCurrentHotel = null;
let ctActiveTab = 'list';
let ctCategories = [];
let ctCurrentPage = 1;

const CT_STATUS_LABELS = {
    active: 'Actif',
    expiring: 'Expire bientôt',
    terminated: 'Résilié',
    archived: 'Archivé'
};

const CT_STATUS_COLORS = {
    active: 'success',
    expiring: 'warning',
    terminated: 'danger',
    archived: 'secondary'
};

const CT_FREQ_LABELS = {
    monthly: 'Mensuel',
    quarterly: 'Trimestriel',
    yearly: 'Annuel',
    one_time: 'Ponctuel'
};

const CT_DOC_TYPES = {
    contract: 'Contrat original',
    annex: 'Annexe',
    termination_letter: 'Courrier de résiliation',
    acknowledgment: 'Accusé de réception',
    invoice: 'Facture',
    other: 'Autre'
};

const CT_ALERT_TYPES = {
    expiry: 'Échéance',
    termination_notice: 'Préavis résiliation',
    custom: 'Personnalisée'
};

// ============ CHARGEMENT PRINCIPAL ============

async function loadContracts(container) {
    showLoading(container);

    try {
        const mgmtRes = await API.getManagementInfo();
        ctHotels = mgmtRes.manageable_hotels || [];

        if (ctHotels.length === 0) {
            container.innerHTML = '<div class="card"><div class="empty-state"><i class="fas fa-file-contract"></i><h3>Aucun hôtel assigné</h3></div></div>';
            return;
        }

        ctCurrentHotel = ctCurrentHotel || ctHotels[0].id;

        container.innerHTML = `
            <div class="page-header">
                <div>
                    <h2><i class="fas fa-file-contract"></i> Contrats Fournisseurs</h2>
                    <p>Gestion et suivi des contrats par établissement</p>
                </div>
                <div class="header-actions-group">
                    ${ctHotels.length > 1 ? `
                        <select id="ct-hotel-select" class="form-control" onchange="ctChangeHotel(this.value)" style="min-width:200px">
                            ${ctHotels.map(h => `<option value="${h.id}" ${h.id == ctCurrentHotel ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}
                        </select>
                    ` : ''}
                    ${hasPermission('contracts.export') ? `<button class="btn btn-outline" onclick="ctExportPDF()"><i class="fas fa-file-csv"></i> Export CSV</button>` : ''}
                    ${hasPermission('contracts.create') ? `<button class="btn btn-primary" onclick="ctShowCreateModal()"><i class="fas fa-plus"></i> Nouveau contrat</button>` : ''}
                </div>
            </div>

            <div id="ct-stats"></div>

            <div class="tabs-container" style="margin-bottom:20px">
                <button class="tab-btn ${ctActiveTab === 'list' ? 'active' : ''}" data-tab="list" onclick="ctSwitchTab('list')"><i class="fas fa-list"></i> Contrats</button>
                <button class="tab-btn ${ctActiveTab === 'charges' ? 'active' : ''}" data-tab="charges" onclick="ctSwitchTab('charges')"><i class="fas fa-table"></i> Charges fixes</button>
                <button class="tab-btn ${ctActiveTab === 'alerts' ? 'active' : ''}" data-tab="alerts" onclick="ctSwitchTab('alerts')"><i class="fas fa-bell"></i> Alertes</button>
                <button class="tab-btn ${ctActiveTab === 'categories' ? 'active' : ''}" data-tab="categories" onclick="ctSwitchTab('categories')"><i class="fas fa-tags"></i> Catégories</button>
                <button class="tab-btn ${ctActiveTab === 'archives' ? 'active' : ''}" data-tab="archives" onclick="ctSwitchTab('archives')"><i class="fas fa-archive"></i> Archives</button>
            </div>

            <div id="ct-tab-content"></div>
        `;

        await ctLoadStats();
        ctSwitchTab(ctActiveTab);
    } catch (err) {
        container.innerHTML = `<div class="card"><p class="text-danger">Erreur: ${err.message}</p></div>`;
    }
}

function ctChangeHotel(hotelId) {
    ctCurrentHotel = parseInt(hotelId);
    ctCurrentPage = 1;
    ctLoadStats();
    ctSwitchTab(ctActiveTab);
}

async function ctLoadStats() {
    try {
        const res = await API.get(`contracts/stats?hotel_id=${ctCurrentHotel}`);
        const s = res.stats;
        document.getElementById('ct-stats').innerHTML = `
            <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px">
                <div class="card stat-card" style="padding:20px;text-align:center">
                    <div style="font-size:2em;font-weight:700;color:var(--success)">${s.active}</div>
                    <div style="color:var(--gray-500)">Contrats actifs</div>
                </div>
                <div class="card stat-card" style="padding:20px;text-align:center">
                    <div style="font-size:2em;font-weight:700;color:var(--primary-500)">${Number(s.total_monthly).toLocaleString('fr-FR', {minimumFractionDigits:2})} €</div>
                    <div style="color:var(--gray-500)">Charges fixes / mois</div>
                </div>
                <div class="card stat-card" style="padding:20px;text-align:center">
                    <div style="font-size:2em;font-weight:700;color:var(--warning)">${s.expiring}</div>
                    <div style="color:var(--gray-500)">Expirent bientôt</div>
                </div>
                <div class="card stat-card" style="padding:20px;text-align:center">
                    <div style="font-size:2em;font-weight:700;color:var(--gray-400)">${s.archived}</div>
                    <div style="color:var(--gray-500)">Archivés / Résiliés</div>
                </div>
            </div>
        `;
    } catch (e) {
        console.error('Stats error:', e);
    }
}

function ctSwitchTab(tab) {
    ctActiveTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    const content = document.getElementById('ct-tab-content');
    switch (tab) {
        case 'list': ctRenderList(content); break;
        case 'charges': ctRenderCharges(content); break;
        case 'alerts': ctRenderAlerts(content); break;
        case 'categories': ctRenderCategories(content); break;
        case 'archives': ctRenderArchives(content); break;
    }
}

// ============ ONGLET LISTE DES CONTRATS ============

async function ctRenderList(content) {
    content.innerHTML = '<div class="loading-spinner"></div>';
    try {
        const [contractsRes, catsRes] = await Promise.all([
            API.get(`contracts?hotel_id=${ctCurrentHotel}&page=${ctCurrentPage}`),
            API.get(`contracts/categories?hotel_id=${ctCurrentHotel}`)
        ]);
        ctCategories = catsRes.categories || [];
        const contracts = contractsRes.contracts || [];
        const pagination = contractsRes.pagination;

        content.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Contrats actifs</h3>
                    <div style="display:flex;gap:10px;align-items:center">
                        <input type="text" id="ct-search" class="form-control" placeholder="Rechercher..." style="width:200px" onkeyup="ctSearchContracts(event)">
                        <select id="ct-filter-cat" class="form-control" onchange="ctFilterByCategory()" style="min-width:150px">
                            <option value="">Toutes catégories</option>
                            ${ctCategories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                ${contracts.length ? `
                    <div style="overflow-x:auto">
                    <table>
                        <thead><tr>
                            <th>Fournisseur</th>
                            <th>Réf.</th>
                            <th>Catégorie</th>
                            <th>Montant</th>
                            <th>Fréquence</th>
                            <th>Début</th>
                            <th>Échéance</th>
                            <th>Statut</th>
                            <th>Actions</th>
                        </tr></thead>
                        <tbody>
                            ${contracts.map(c => ctRenderContractRow(c)).join('')}
                        </tbody>
                    </table>
                    </div>
                    <div id="ct-pagination" style="padding:16px">${pagination ? renderPagination(pagination, ctGoToPage) : ''}</div>
                ` : `<div class="empty-state"><i class="fas fa-file-contract"></i><h3>Aucun contrat</h3><p>Créez votre premier contrat fournisseur</p></div>`}
            </div>
        `;
    } catch (e) {
        content.innerHTML = `<div class="card"><p class="text-danger">Erreur: ${e.message}</p></div>`;
    }
}

function ctRenderContractRow(c) {
    const catBadge = c.category_name
        ? `<span class="badge" style="background:${escAttr(c.category_color || '#6366f1')};color:#fff">${esc(c.category_name)}</span>`
        : '<span class="text-muted">-</span>';
    const statusBadgeHtml = `<span class="badge badge-${CT_STATUS_COLORS[c.status] || 'secondary'}">${CT_STATUS_LABELS[c.status] || c.status}</span>`;
    const endDateDisplay = c.end_date ? formatDate(c.end_date) : '-';
    const startDateDisplay = c.start_date ? formatDate(c.start_date) : '-';
    const amount = Number(c.amount).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';

    return `<tr>
        <td><strong>${esc(c.supplier_name)}</strong></td>
        <td>${esc(c.contract_ref || '-')}</td>
        <td>${catBadge}</td>
        <td style="text-align:right">${amount}</td>
        <td>${CT_FREQ_LABELS[c.amount_frequency] || c.amount_frequency}</td>
        <td>${startDateDisplay}</td>
        <td>${endDateDisplay}</td>
        <td>${statusBadgeHtml}</td>
        <td>
            <div class="table-actions">
                <button onclick="ctViewContract(${c.id})" title="Voir"><i class="fas fa-eye"></i></button>
                ${hasPermission('contracts.manage') ? `<button onclick="ctEditContract(${c.id})" title="Modifier"><i class="fas fa-edit"></i></button>` : ''}
                ${hasPermission('contracts.manage') ? `<button onclick="ctArchiveContract(${c.id})" title="Archiver" style="color:var(--gray-400)"><i class="fas fa-archive"></i></button>` : ''}
                ${hasPermission('contracts.delete') ? `<button onclick="ctDeleteContract(${c.id})" title="Supprimer" style="color:var(--danger)"><i class="fas fa-trash"></i></button>` : ''}
            </div>
        </td>
    </tr>`;
}

function ctGoToPage(page) {
    ctCurrentPage = page;
    ctSwitchTab('list');
}

async function ctSearchContracts(e) {
    if (e.key === 'Enter') {
        const search = document.getElementById('ct-search').value;
        const content = document.getElementById('ct-tab-content');
        content.innerHTML = '<div class="loading-spinner"></div>';
        try {
            const res = await API.get(`contracts?hotel_id=${ctCurrentHotel}&search=${encodeURIComponent(search)}`);
            const contracts = res.contracts || [];
            const tbody = contracts.map(c => ctRenderContractRow(c)).join('');
            content.querySelector('tbody').innerHTML = tbody || '<tr><td colspan="9" class="text-center">Aucun résultat</td></tr>';
        } catch (err) { toast('Erreur de recherche', 'error'); }
    }
}

async function ctFilterByCategory() {
    const catId = document.getElementById('ct-filter-cat').value;
    const content = document.getElementById('ct-tab-content');
    content.innerHTML = '<div class="loading-spinner"></div>';
    try {
        let url = `contracts?hotel_id=${ctCurrentHotel}`;
        if (catId) url += `&category_id=${catId}`;
        const res = await API.get(url);
        ctRenderList(content);
    } catch (err) { toast('Erreur de filtrage', 'error'); }
}

// ============ ONGLET CHARGES FIXES ============

async function ctRenderCharges(content) {
    content.innerHTML = '<div class="loading-spinner"></div>';
    try {
        const year = new Date().getFullYear();
        const res = await API.get(`contracts/charges?hotel_id=${ctCurrentHotel}&year=${year}`);
        const contracts = res.contracts || [];
        const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
        const totals = new Array(12).fill(0);

        content.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title"><i class="fas fa-table"></i> Tableau des charges fixes ${year}</h3>
                    ${hasPermission('contracts.export') ? `<button class="btn btn-outline btn-sm" onclick="ctExportPDF()"><i class="fas fa-file-csv"></i> Export</button>` : ''}
                </div>
                ${contracts.length ? `
                <div style="overflow-x:auto">
                <table>
                    <thead><tr>
                        <th>Fournisseur</th>
                        <th>Catégorie</th>
                        <th>Fréquence</th>
                        ${months.map(m => `<th style="text-align:right">${m}</th>`).join('')}
                        <th style="text-align:right"><strong>Total</strong></th>
                    </tr></thead>
                    <tbody>
                        ${contracts.map(c => {
                            const monthlyAmount = ctCalcMonthly(c);
                            let rowTotal = 0;
                            const cells = months.map((_, i) => {
                                // Check if contract is active during this month
                                const startMonth = c.start_date ? new Date(c.start_date).getMonth() : 0;
                                const startYear = c.start_date ? new Date(c.start_date).getFullYear() : 0;
                                const endMonth = c.end_date ? new Date(c.end_date).getMonth() : 11;
                                const endYear = c.end_date ? new Date(c.end_date).getFullYear() : 9999;
                                const isActive = (year > startYear || (year === startYear && i >= startMonth)) &&
                                                 (year < endYear || (year === endYear && i <= endMonth));
                                const val = isActive ? monthlyAmount : 0;
                                if (isActive) { totals[i] += monthlyAmount; rowTotal += monthlyAmount; }
                                return `<td style="text-align:right">${val > 0 ? val.toLocaleString('fr-FR', {minimumFractionDigits:2}) : '-'}</td>`;
                            }).join('');
                            const catBadge = c.category_name ? `<span class="badge" style="background:${escAttr(c.category_color || '#6366f1')};color:#fff;font-size:0.7em">${esc(c.category_name)}</span>` : '-';
                            return `<tr>
                                <td>${esc(c.supplier_name)}</td>
                                <td>${catBadge}</td>
                                <td>${CT_FREQ_LABELS[c.amount_frequency] || ''}</td>
                                ${cells}
                                <td style="text-align:right"><strong>${rowTotal.toLocaleString('fr-FR', {minimumFractionDigits:2})} €</strong></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="font-weight:700;background:var(--gray-50)">
                            <td colspan="3">TOTAL</td>
                            ${totals.map(t => `<td style="text-align:right">${t.toLocaleString('fr-FR', {minimumFractionDigits:2})}</td>`).join('')}
                            <td style="text-align:right">${totals.reduce((a, b) => a + b, 0).toLocaleString('fr-FR', {minimumFractionDigits:2})} €</td>
                        </tr>
                    </tfoot>
                </table>
                </div>
                ` : '<div class="empty-state"><i class="fas fa-table"></i><h3>Aucun contrat actif</h3></div>'}
            </div>
        `;
    } catch (e) {
        content.innerHTML = `<div class="card"><p class="text-danger">Erreur: ${e.message}</p></div>`;
    }
}

function ctCalcMonthly(c) {
    const amount = parseFloat(c.amount) || 0;
    switch (c.amount_frequency) {
        case 'monthly': return amount;
        case 'quarterly': return amount / 3;
        case 'yearly': return amount / 12;
        case 'one_time': return 0;
        default: return amount;
    }
}

// ============ ONGLET ALERTES ============

async function ctRenderAlerts(content) {
    content.innerHTML = '<div class="loading-spinner"></div>';
    try {
        const res = await API.get(`contracts?hotel_id=${ctCurrentHotel}&per_page=100`);
        const contracts = res.contracts || [];

        // Charger les alertes de tous les contrats
        let allAlerts = [];
        for (const c of contracts) {
            try {
                const alertRes = await API.get(`contracts/${c.id}/alerts`);
                (alertRes.alerts || []).forEach(a => {
                    a.contract_name = c.supplier_name;
                    a.contract_ref = c.contract_ref;
                    a.end_date = c.end_date;
                    allAlerts.push(a);
                });
            } catch (e) {}
        }

        content.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title"><i class="fas fa-bell"></i> Alertes configurées</h3>
                </div>
                ${allAlerts.length ? `
                <table>
                    <thead><tr>
                        <th>Contrat</th>
                        <th>Type</th>
                        <th>Jours avant</th>
                        <th>Date d'échéance</th>
                        <th>Dernière alerte</th>
                        <th>État</th>
                        <th>Actions</th>
                    </tr></thead>
                    <tbody>
                        ${allAlerts.map(a => `<tr>
                            <td><strong>${esc(a.contract_name)}</strong> ${a.contract_ref ? `<small class="text-muted">(${esc(a.contract_ref)})</small>` : ''}</td>
                            <td>${CT_ALERT_TYPES[a.alert_type] || a.alert_type}</td>
                            <td>${a.days_before} j</td>
                            <td>${a.end_date ? formatDate(a.end_date) : '-'}</td>
                            <td>${a.last_triggered_at ? formatDateTime(a.last_triggered_at) : 'Jamais'}</td>
                            <td>
                                <label class="toggle-switch" style="margin:0">
                                    <input type="checkbox" ${a.is_active == 1 ? 'checked' : ''} onchange="ctToggleAlert(${a.contract_id}, ${a.id}, this.checked)">
                                    <span class="toggle-slider"></span>
                                </label>
                            </td>
                            <td>
                                ${hasPermission('contracts.manage') ? `<button class="btn btn-sm btn-outline" onclick="ctDeleteAlert(${a.contract_id}, ${a.id})" style="color:var(--danger)"><i class="fas fa-trash"></i></button>` : ''}
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
                ` : '<div class="empty-state"><i class="fas fa-bell-slash"></i><h3>Aucune alerte configurée</h3><p>Les alertes sont créées automatiquement lors de l\'ajout d\'un contrat</p></div>'}
            </div>
        `;
    } catch (e) {
        content.innerHTML = `<div class="card"><p class="text-danger">Erreur: ${e.message}</p></div>`;
    }
}

async function ctToggleAlert(contractId, alertId, active) {
    try {
        await API.put(`contracts/${contractId}/alerts/${alertId}`, { is_active: active ? 1 : 0 });
        toast(active ? 'Alerte activée' : 'Alerte désactivée', 'success');
    } catch (e) { toast('Erreur', 'error'); }
}

async function ctDeleteAlert(contractId, alertId) {
    if (!confirm('Supprimer cette alerte ?')) return;
    try {
        await API.delete(`contracts/${contractId}/alerts/${alertId}`);
        toast('Alerte supprimée', 'success');
        ctSwitchTab('alerts');
    } catch (e) { toast('Erreur', 'error'); }
}

// ============ ONGLET CATÉGORIES ============

async function ctRenderCategories(content) {
    content.innerHTML = '<div class="loading-spinner"></div>';
    try {
        const res = await API.get(`contracts/categories?hotel_id=${ctCurrentHotel}`);
        ctCategories = res.categories || [];

        content.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title"><i class="fas fa-tags"></i> Catégories de contrats</h3>
                    ${hasPermission('contracts.manage') ? `<button class="btn btn-primary btn-sm" onclick="ctShowCategoryModal()"><i class="fas fa-plus"></i> Nouvelle catégorie</button>` : ''}
                </div>
                ${ctCategories.length ? `
                <table>
                    <thead><tr><th>Couleur</th><th>Nom</th><th>Contrats</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${ctCategories.map(c => `<tr>
                            <td><span style="display:inline-block;width:24px;height:24px;border-radius:4px;background:${escAttr(c.color)}"></span></td>
                            <td><strong>${esc(c.name)}</strong></td>
                            <td><span class="badge badge-primary">${c.contract_count || 0}</span></td>
                            <td>
                                <div class="table-actions">
                                    ${hasPermission('contracts.manage') ? `<button onclick="ctEditCategory(${c.id}, '${escAttr(c.name)}', '${escAttr(c.color)}')" title="Modifier"><i class="fas fa-edit"></i></button>` : ''}
                                    ${hasPermission('contracts.delete') ? `<button onclick="ctDeleteCategory(${c.id})" title="Supprimer" style="color:var(--danger)"><i class="fas fa-trash"></i></button>` : ''}
                                </div>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
                ` : '<div class="empty-state"><i class="fas fa-tags"></i><h3>Aucune catégorie</h3><p>Créez des catégories pour organiser vos contrats</p></div>'}
            </div>
        `;
    } catch (e) {
        content.innerHTML = `<div class="card"><p class="text-danger">Erreur: ${e.message}</p></div>`;
    }
}

function ctShowCategoryModal(id, name, color) {
    const isEdit = !!id;
    openModal(isEdit ? 'Modifier la catégorie' : 'Nouvelle catégorie', `
        <form onsubmit="ctSaveCategory(event, ${id || 'null'})">
            <div class="form-group">
                <label>Nom de la catégorie</label>
                <input type="text" class="form-control" id="ct-cat-name" value="${esc(name || '')}" required>
            </div>
            <div class="form-group">
                <label>Couleur</label>
                <input type="color" id="ct-cat-color" value="${color || '#6366f1'}" style="width:60px;height:40px;border:none;cursor:pointer">
            </div>
            <div style="text-align:right;margin-top:20px">
                <button type="submit" class="btn btn-primary">${isEdit ? 'Modifier' : 'Créer'}</button>
            </div>
        </form>
    `, 'modal-md');
}

function ctEditCategory(id, name, color) {
    ctShowCategoryModal(id, name, color);
}

async function ctSaveCategory(e, id) {
    e.preventDefault();
    const name = document.getElementById('ct-cat-name').value;
    const color = document.getElementById('ct-cat-color').value;
    try {
        if (id) {
            await API.put(`contracts/categories/${id}`, { name, color });
        } else {
            await API.post('contracts/categories', { hotel_id: ctCurrentHotel, name, color });
        }
        toast('Catégorie sauvegardée', 'success');
        closeModal();
        ctSwitchTab('categories');
    } catch (e) { toast('Erreur: ' + e.message, 'error'); }
}

async function ctDeleteCategory(id) {
    if (!confirm('Supprimer cette catégorie ? Les contrats associés seront dissociés.')) return;
    try {
        await API.delete(`contracts/categories/${id}`);
        toast('Catégorie supprimée', 'success');
        ctSwitchTab('categories');
    } catch (e) { toast('Erreur', 'error'); }
}

// ============ ONGLET ARCHIVES ============

async function ctRenderArchives(content) {
    content.innerHTML = '<div class="loading-spinner"></div>';
    try {
        const res = await API.get(`contracts?hotel_id=${ctCurrentHotel}&status=archived&per_page=100`);
        const contracts = res.contracts || [];

        content.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title"><i class="fas fa-archive"></i> Contrats archivés / résiliés</h3>
                </div>
                ${contracts.length ? `
                <div style="overflow-x:auto">
                <table>
                    <thead><tr><th>Fournisseur</th><th>Réf.</th><th>Catégorie</th><th>Montant</th><th>Échéance</th><th>Statut</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${contracts.map(c => {
                            const catBadge = c.category_name ? `<span class="badge" style="background:${escAttr(c.category_color || '#6366f1')};color:#fff">${esc(c.category_name)}</span>` : '-';
                            return `<tr>
                                <td><strong>${esc(c.supplier_name)}</strong></td>
                                <td>${esc(c.contract_ref || '-')}</td>
                                <td>${catBadge}</td>
                                <td style="text-align:right">${Number(c.amount).toLocaleString('fr-FR', {minimumFractionDigits:2})} €</td>
                                <td>${c.end_date ? formatDate(c.end_date) : '-'}</td>
                                <td><span class="badge badge-${CT_STATUS_COLORS[c.status]}">${CT_STATUS_LABELS[c.status]}</span></td>
                                <td>
                                    <div class="table-actions">
                                        <button onclick="ctViewContract(${c.id})" title="Voir"><i class="fas fa-eye"></i></button>
                                        ${hasPermission('contracts.manage') ? `<button onclick="ctReactivateContract(${c.id})" title="Réactiver" style="color:var(--success)"><i class="fas fa-redo"></i></button>` : ''}
                                    </div>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
                </div>
                ` : '<div class="empty-state"><i class="fas fa-archive"></i><h3>Aucun contrat archivé</h3></div>'}
            </div>
        `;
    } catch (e) {
        content.innerHTML = `<div class="card"><p class="text-danger">Erreur: ${e.message}</p></div>`;
    }
}

// ============ CRÉATION / ÉDITION DE CONTRAT ============

async function ctShowCreateModal(contractId) {
    const isEdit = !!contractId;
    let contract = {};

    // Charger catégories si pas encore fait
    if (!ctCategories.length) {
        try {
            const res = await API.get(`contracts/categories?hotel_id=${ctCurrentHotel}`);
            ctCategories = res.categories || [];
        } catch (e) {}
    }

    if (isEdit) {
        try {
            const res = await API.get(`contracts/${contractId}`);
            contract = res.contract || {};
        } catch (e) { toast('Erreur chargement', 'error'); return; }
    }

    openModal(isEdit ? 'Modifier le contrat' : 'Nouveau contrat', `
        <form onsubmit="ctSaveContract(event, ${contractId || 'null'})">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
                <div class="form-group">
                    <label>Fournisseur *</label>
                    <input type="text" class="form-control" id="ct-supplier" value="${esc(contract.supplier_name || '')}" required>
                </div>
                <div class="form-group">
                    <label>Référence du contrat</label>
                    <input type="text" class="form-control" id="ct-ref" value="${esc(contract.contract_ref || '')}">
                </div>
                <div class="form-group">
                    <label>Catégorie</label>
                    <select class="form-control" id="ct-category">
                        <option value="">Sans catégorie</option>
                        ${ctCategories.map(c => `<option value="${c.id}" ${contract.category_id == c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Statut</label>
                    <select class="form-control" id="ct-status">
                        ${Object.entries(CT_STATUS_LABELS).map(([k, v]) => `<option value="${k}" ${contract.status === k ? 'selected' : ''}>${v}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Montant</label>
                    <input type="number" class="form-control" id="ct-amount" step="0.01" min="0" value="${contract.amount || '0'}">
                </div>
                <div class="form-group">
                    <label>Fréquence</label>
                    <select class="form-control" id="ct-frequency">
                        ${Object.entries(CT_FREQ_LABELS).map(([k, v]) => `<option value="${k}" ${contract.amount_frequency === k ? 'selected' : ''}>${v}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Date de début</label>
                    <input type="date" class="form-control" id="ct-start" value="${contract.start_date || ''}">
                </div>
                <div class="form-group">
                    <label>Date d'échéance</label>
                    <input type="date" class="form-control" id="ct-end" value="${contract.end_date || ''}">
                </div>
                <div class="form-group">
                    <label>Préavis de résiliation (jours)</label>
                    <input type="number" class="form-control" id="ct-notice" min="0" value="${contract.termination_notice_days || 90}">
                </div>
                <div class="form-group" style="display:flex;align-items:center;gap:12px;padding-top:28px">
                    <label style="display:flex;align-items:center;gap:8px;margin:0;cursor:pointer">
                        <input type="checkbox" id="ct-autorenewal" ${contract.auto_renewal == 1 ? 'checked' : ''}>
                        Tacite reconduction
                    </label>
                </div>
                <div class="form-group" id="ct-renewal-months-group" style="${contract.auto_renewal == 1 ? '' : 'display:none'}">
                    <label>Durée de reconduction (mois)</label>
                    <input type="number" class="form-control" id="ct-renewal-months" min="1" value="${contract.renewal_duration_months || 12}">
                </div>
            </div>
            <div class="form-group">
                <label>Description / Objet du contrat</label>
                <textarea class="form-control" id="ct-description" rows="3">${esc(contract.description || '')}</textarea>
            </div>
            <div class="form-group">
                <label>Notes</label>
                <textarea class="form-control" id="ct-notes" rows="2">${esc(contract.notes || '')}</textarea>
            </div>
            <div style="text-align:right;margin-top:20px">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                <button type="submit" class="btn btn-primary">${isEdit ? 'Modifier' : 'Créer'}</button>
            </div>
        </form>
        <script>
            document.getElementById('ct-autorenewal').addEventListener('change', function() {
                document.getElementById('ct-renewal-months-group').style.display = this.checked ? '' : 'none';
            });
        </script>
    `, 'modal-lg');
}

function ctEditContract(id) {
    ctShowCreateModal(id);
}

async function ctSaveContract(e, id) {
    e.preventDefault();
    const data = {
        hotel_id: ctCurrentHotel,
        supplier_name: document.getElementById('ct-supplier').value,
        contract_ref: document.getElementById('ct-ref').value || null,
        category_id: document.getElementById('ct-category').value || null,
        status: document.getElementById('ct-status').value,
        amount: parseFloat(document.getElementById('ct-amount').value) || 0,
        amount_frequency: document.getElementById('ct-frequency').value,
        start_date: document.getElementById('ct-start').value || null,
        end_date: document.getElementById('ct-end').value || null,
        termination_notice_days: parseInt(document.getElementById('ct-notice').value) || 90,
        auto_renewal: document.getElementById('ct-autorenewal').checked ? 1 : 0,
        renewal_duration_months: parseInt(document.getElementById('ct-renewal-months').value) || 12,
        description: document.getElementById('ct-description').value || null,
        notes: document.getElementById('ct-notes').value || null
    };

    try {
        if (id) {
            await API.put(`contracts/${id}`, data);
            toast('Contrat modifié', 'success');
        } else {
            await API.post('contracts', data);
            toast('Contrat créé', 'success');
        }
        closeModal();
        ctLoadStats();
        ctSwitchTab(ctActiveTab);
    } catch (err) { toast('Erreur: ' + err.message, 'error'); }
}

// ============ VUE DÉTAILLÉE D'UN CONTRAT ============

async function ctViewContract(id) {
    try {
        const res = await API.get(`contracts/${id}`);
        const c = res.contract;
        const docs = c.documents || [];
        const alerts = c.alerts || [];

        const statusBadgeHtml = `<span class="badge badge-${CT_STATUS_COLORS[c.status]}">${CT_STATUS_LABELS[c.status]}</span>`;
        const catBadge = c.category_name ? `<span class="badge" style="background:${escAttr(c.category_color || '#6366f1')};color:#fff">${esc(c.category_name)}</span>` : 'Non catégorisé';

        openModal(`Contrat - ${esc(c.supplier_name)}`, `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
                <!-- Informations -->
                <div>
                    <h4 style="margin-bottom:12px"><i class="fas fa-info-circle"></i> Informations</h4>
                    <table class="detail-table" style="width:100%">
                        <tr><td style="width:40%;color:var(--gray-500)">Fournisseur</td><td><strong>${esc(c.supplier_name)}</strong></td></tr>
                        <tr><td style="color:var(--gray-500)">Référence</td><td>${esc(c.contract_ref || '-')}</td></tr>
                        <tr><td style="color:var(--gray-500)">Catégorie</td><td>${catBadge}</td></tr>
                        <tr><td style="color:var(--gray-500)">Montant</td><td><strong>${Number(c.amount).toLocaleString('fr-FR', {minimumFractionDigits:2})} €</strong> (${CT_FREQ_LABELS[c.amount_frequency]})</td></tr>
                        <tr><td style="color:var(--gray-500)">Date début</td><td>${c.start_date ? formatDate(c.start_date) : '-'}</td></tr>
                        <tr><td style="color:var(--gray-500)">Date échéance</td><td>${c.end_date ? formatDate(c.end_date) : '-'}</td></tr>
                        <tr><td style="color:var(--gray-500)">Préavis résiliation</td><td>${c.termination_notice_days} jours</td></tr>
                        <tr><td style="color:var(--gray-500)">Tacite reconduction</td><td>${c.auto_renewal == 1 ? `Oui (${c.renewal_duration_months} mois)` : 'Non'}</td></tr>
                        <tr><td style="color:var(--gray-500)">Statut</td><td>${statusBadgeHtml}</td></tr>
                        <tr><td style="color:var(--gray-500)">Créé par</td><td>${esc(c.created_by_name || '-')}</td></tr>
                        <tr><td style="color:var(--gray-500)">Créé le</td><td>${c.created_at ? formatDateTime(c.created_at) : '-'}</td></tr>
                    </table>
                    ${c.description ? `<div style="margin-top:12px"><strong>Description :</strong><p style="margin-top:4px">${esc(c.description)}</p></div>` : ''}
                    ${c.notes ? `<div style="margin-top:12px"><strong>Notes :</strong><p style="margin-top:4px">${esc(c.notes)}</p></div>` : ''}

                    ${hasPermission('contracts.manage') ? `
                    <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
                        <button class="btn btn-sm btn-outline" onclick="closeModal();ctEditContract(${c.id})"><i class="fas fa-edit"></i> Modifier</button>
                        ${c.status !== 'archived' ? `<button class="btn btn-sm btn-outline" onclick="ctChangeStatus(${c.id}, 'archived')"><i class="fas fa-archive"></i> Archiver</button>` : ''}
                        ${c.status !== 'terminated' ? `<button class="btn btn-sm btn-outline" style="color:var(--danger)" onclick="ctChangeStatus(${c.id}, 'terminated')"><i class="fas fa-times"></i> Résilier</button>` : ''}
                        ${(c.status === 'archived' || c.status === 'terminated') ? `<button class="btn btn-sm btn-outline" style="color:var(--success)" onclick="ctChangeStatus(${c.id}, 'active')"><i class="fas fa-redo"></i> Réactiver</button>` : ''}
                    </div>
                    ` : ''}
                </div>

                <!-- Documents + Alertes -->
                <div>
                    <h4 style="margin-bottom:12px"><i class="fas fa-paperclip"></i> Documents (${docs.length})</h4>
                    ${docs.length ? docs.map(d => `
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:8px">
                            <div>
                                <a href="${escAttr(d.file_path)}" target="_blank" style="font-weight:500"><i class="fas fa-file-${d.file_path.endsWith('.pdf') ? 'pdf' : 'image'}" style="color:var(--primary-500)"></i> ${esc(d.label || d.original_filename)}</a>
                                <div style="font-size:0.8em;color:var(--gray-400)">${CT_DOC_TYPES[d.type] || d.type} - ${d.uploader_name || ''} - ${d.created_at ? formatDate(d.created_at) : ''}</div>
                            </div>
                            ${hasPermission('contracts.manage') ? `<button class="btn btn-sm" style="color:var(--danger)" onclick="ctDeleteDocument(${c.id}, ${d.id})"><i class="fas fa-trash"></i></button>` : ''}
                        </div>
                    `).join('') : '<p class="text-muted">Aucun document</p>'}
                    ${hasPermission('contracts.manage') ? `
                    <div style="margin-top:12px">
                        <form id="ct-upload-form" onsubmit="ctUploadDocument(event, ${c.id})">
                            <div style="display:flex;gap:8px;align-items:end">
                                <div style="flex:1">
                                    <select class="form-control" id="ct-doc-type" style="margin-bottom:6px">
                                        ${Object.entries(CT_DOC_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
                                    </select>
                                    <input type="file" class="form-control" id="ct-doc-file" accept=".pdf,.jpg,.jpeg,.png" required>
                                </div>
                                <button type="submit" class="btn btn-sm btn-primary"><i class="fas fa-upload"></i></button>
                            </div>
                        </form>
                    </div>
                    ` : ''}

                    <h4 style="margin-top:24px;margin-bottom:12px"><i class="fas fa-bell"></i> Alertes (${alerts.length})</h4>
                    ${alerts.length ? alerts.map(a => `
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:8px">
                            <div>
                                <strong>${CT_ALERT_TYPES[a.alert_type]}</strong> - ${a.days_before} jours avant
                                ${a.last_triggered_at ? `<div style="font-size:0.8em;color:var(--gray-400)">Dernière: ${formatDateTime(a.last_triggered_at)}</div>` : ''}
                            </div>
                            <label class="toggle-switch" style="margin:0">
                                <input type="checkbox" ${a.is_active == 1 ? 'checked' : ''} onchange="ctToggleAlert(${c.id}, ${a.id}, this.checked)">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    `).join('') : '<p class="text-muted">Aucune alerte</p>'}
                    ${hasPermission('contracts.manage') ? `
                    <button class="btn btn-sm btn-outline" onclick="ctAddAlertModal(${c.id})" style="margin-top:8px"><i class="fas fa-plus"></i> Ajouter une alerte</button>
                    ` : ''}

                    ${c.ai_enabled ? `
                    <h4 style="margin-top:24px;margin-bottom:12px"><i class="fas fa-robot"></i> Analyse IA</h4>
                    ${c.ai_analysis ? `
                        <div style="background:var(--gray-50);padding:16px;border-radius:8px;border-left:4px solid var(--primary-500);max-height:300px;overflow-y:auto;white-space:pre-wrap;font-size:0.9em">${esc(c.ai_analysis)}</div>
                        <div style="font-size:0.8em;color:var(--gray-400);margin-top:4px">Analysé le ${c.ai_analyzed_at ? formatDateTime(c.ai_analyzed_at) : '-'}</div>
                    ` : '<p class="text-muted">Pas encore analysé</p>'}
                    ${hasPermission('contracts.analyze') ? `
                    <button class="btn btn-sm btn-primary" onclick="ctAnalyzeContract(${c.id})" style="margin-top:8px" id="ct-analyze-btn">
                        <i class="fas fa-robot"></i> ${c.ai_analysis ? 'Relancer l\'analyse' : 'Analyser avec l\'IA'}
                    </button>
                    ` : ''}
                    ` : ''}
                </div>
            </div>
        `, 'modal-xl');
    } catch (e) { toast('Erreur: ' + e.message, 'error'); }
}

// ============ ACTIONS SUR CONTRAT ============

async function ctArchiveContract(id) {
    if (!confirm('Archiver ce contrat ?')) return;
    await ctChangeStatus(id, 'archived');
}

async function ctReactivateContract(id) {
    if (!confirm('Réactiver ce contrat ?')) return;
    await ctChangeStatus(id, 'active');
}

async function ctChangeStatus(id, status) {
    try {
        await API.put(`contracts/${id}/status`, { status });
        toast('Statut mis à jour', 'success');
        closeModal();
        ctLoadStats();
        ctSwitchTab(ctActiveTab);
    } catch (e) { toast('Erreur: ' + e.message, 'error'); }
}

async function ctDeleteContract(id) {
    if (!confirm('Supprimer définitivement ce contrat et tous ses documents ?')) return;
    try {
        await API.delete(`contracts/${id}`);
        toast('Contrat supprimé', 'success');
        ctLoadStats();
        ctSwitchTab(ctActiveTab);
    } catch (e) { toast('Erreur', 'error'); }
}

// ============ DOCUMENTS ============

async function ctUploadDocument(e, contractId) {
    e.preventDefault();
    const fileInput = document.getElementById('ct-doc-file');
    const docType = document.getElementById('ct-doc-type').value;
    if (!fileInput.files[0]) return;

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('type', docType);
    formData.append('label', fileInput.files[0].name);

    try {
        await API.upload(`contracts/${contractId}/documents`, formData);
        toast('Document uploadé', 'success');
        ctViewContract(contractId); // Recharger la vue
    } catch (e) { toast('Erreur: ' + e.message, 'error'); }
}

async function ctDeleteDocument(contractId, docId) {
    if (!confirm('Supprimer ce document ?')) return;
    try {
        await API.delete(`contracts/${contractId}/documents/${docId}`);
        toast('Document supprimé', 'success');
        ctViewContract(contractId);
    } catch (e) { toast('Erreur', 'error'); }
}

// ============ ALERTES ============

function ctAddAlertModal(contractId) {
    openModal('Ajouter une alerte', `
        <form onsubmit="ctSaveNewAlert(event, ${contractId})">
            <div class="form-group">
                <label>Type d'alerte</label>
                <select class="form-control" id="ct-new-alert-type">
                    <option value="expiry">Échéance du contrat</option>
                    <option value="termination_notice">Préavis de résiliation</option>
                    <option value="custom">Personnalisée</option>
                </select>
            </div>
            <div class="form-group">
                <label>Nombre de jours avant</label>
                <input type="number" class="form-control" id="ct-new-alert-days" min="1" value="30" required>
            </div>
            <div style="text-align:right;margin-top:20px">
                <button type="submit" class="btn btn-primary">Ajouter</button>
            </div>
        </form>
    `, 'modal-md');
}

async function ctSaveNewAlert(e, contractId) {
    e.preventDefault();
    try {
        await API.post(`contracts/${contractId}/alerts`, {
            alert_type: document.getElementById('ct-new-alert-type').value,
            days_before: parseInt(document.getElementById('ct-new-alert-days').value)
        });
        toast('Alerte ajoutée', 'success');
        closeModal();
        ctViewContract(contractId);
    } catch (e) { toast('Erreur: ' + e.message, 'error'); }
}

// ============ ANALYSE IA ============

async function ctAnalyzeContract(id) {
    const btn = document.getElementById('ct-analyze-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyse en cours...';
    }
    try {
        const res = await API.post(`contracts/${id}/analyze`, {});
        toast('Analyse terminée', 'success');
        ctViewContract(id); // Recharger pour afficher le résultat
    } catch (e) {
        toast('Erreur: ' + e.message, 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-robot"></i> Réessayer l\'analyse';
        }
    }
}

// ============ EXPORT ============

async function ctExportPDF() {
    try {
        const url = `${API.baseUrl}/contracts/export-pdf?hotel_id=${ctCurrentHotel}&status=all`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${API.token}` }
        });
        const blob = await response.blob();
        const a = document.createElement('a');
        a.href = window.URL.createObjectURL(blob);
        a.download = `contrats_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        window.URL.revokeObjectURL(a.href);
        toast('Export téléchargé', 'success');
    } catch (e) { toast('Erreur export', 'error'); }
}
