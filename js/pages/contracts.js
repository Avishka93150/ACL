/**
 * Contrats Fournisseurs - Module complet
 * Gestion des contrats, alertes, catégories, charges fixes, export, analyse IA
 */

let ctHotels = [];
let ctCurrentHotel = null;
let ctActiveTab = 'list';
let ctCategories = [];
let ctCurrentPage = 1;

function ctStatusLabel(status) {
    const map = { active: 'contracts.active', expiring: 'contracts.expiring', terminated: 'contracts.terminated', archived: 'contracts.archived' };
    return map[status] ? t(map[status]) : status;
}

function ctStatusColor(status) {
    const map = { active: 'success', expiring: 'warning', terminated: 'danger', archived: 'secondary' };
    return map[status] || 'secondary';
}

function ctFreqLabel(freq) {
    const map = { monthly: 'contracts.freq_monthly', quarterly: 'contracts.freq_quarterly', yearly: 'contracts.freq_yearly', one_time: 'contracts.freq_one_time' };
    return map[freq] ? t(map[freq]) : freq;
}

function ctDocTypeLabel(type) {
    const map = { contract: 'contracts.doc_contract', annex: 'contracts.doc_annex', termination_letter: 'contracts.doc_termination', acknowledgment: 'contracts.doc_acknowledgment', invoice: 'contracts.doc_invoice', other: 'contracts.doc_other' };
    return map[type] ? t(map[type]) : type;
}

function ctAlertTypeLabel(type) {
    const map = { expiry: 'contracts.alert_expiry', termination_notice: 'contracts.alert_termination', custom: 'contracts.alert_custom' };
    return map[type] ? t(map[type]) : type;
}

// ============ CHARGEMENT PRINCIPAL ============

async function loadContracts(container) {
    showLoading(container);

    try {
        const mgmtRes = await API.getManagementInfo();
        ctHotels = mgmtRes.manageable_hotels || [];

        if (ctHotels.length === 0) {
            container.innerHTML = `<div class="card"><div class="empty-state"><i class="fas fa-file-contract"></i><h3>${t('contracts.no_hotel')}</h3></div></div>`;
            return;
        }

        ctCurrentHotel = ctCurrentHotel || ctHotels[0].id;

        container.innerHTML = `
            <div class="page-header">
                <div>
                    <h2><i class="fas fa-file-contract"></i> ${t('contracts.title')}</h2>
                    <p>${t('contracts.subtitle')}</p>
                </div>
                <div class="header-actions-group">
                    ${ctHotels.length > 1 ? `
                        <select id="ct-hotel-select" class="form-control" onchange="ctChangeHotel(this.value)" style="min-width:200px">
                            ${ctHotels.map(h => `<option value="${h.id}" ${h.id == ctCurrentHotel ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}
                        </select>
                    ` : ''}
                    ${hasPermission('contracts.export') ? `
                        <button class="btn btn-outline" onclick="ctExportCSV()"><i class="fas fa-file-csv"></i> ${t('contracts.export_csv')}</button>
                        <button class="btn btn-outline" onclick="ctExportPDFDoc()"><i class="fas fa-file-pdf"></i> ${t('contracts.export_pdf')}</button>
                    ` : ''}
                    ${hasPermission('contracts.create') ? `<button class="btn btn-primary" onclick="ctShowCreateModal()"><i class="fas fa-plus"></i> ${t('contracts.new')}</button>` : ''}
                </div>
            </div>

            <div id="ct-stats"></div>

            <div class="closure-tabs">
                <div class="closure-tab ${ctActiveTab === 'list' ? 'active' : ''}" data-tab="list" onclick="ctSwitchTab('list')"><i class="fas fa-list"></i> <span>${t('contracts.tab_list')}</span></div>
                <div class="closure-tab ${ctActiveTab === 'charges' ? 'active' : ''}" data-tab="charges" onclick="ctSwitchTab('charges')"><i class="fas fa-table"></i> <span>${t('contracts.charges')}</span></div>
                <div class="closure-tab ${ctActiveTab === 'alerts' ? 'active' : ''}" data-tab="alerts" onclick="ctSwitchTab('alerts')"><i class="fas fa-bell"></i> <span>${t('contracts.alerts')}</span></div>
                <div class="closure-tab ${ctActiveTab === 'categories' ? 'active' : ''}" data-tab="categories" onclick="ctSwitchTab('categories')"><i class="fas fa-tags"></i> <span>${t('contracts.categories')}</span></div>
                <div class="closure-tab ${ctActiveTab === 'archives' ? 'active' : ''}" data-tab="archives" onclick="ctSwitchTab('archives')"><i class="fas fa-archive"></i> <span>${t('contracts.archives')}</span></div>
            </div>

            <div id="ct-tab-content"></div>
        `;

        await ctLoadStats();
        ctSwitchTab(ctActiveTab);
    } catch (err) {
        container.innerHTML = `<div class="card"><p class="text-danger">${t('contracts.error')}: ${err.message}</p></div>`;
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
            <div class="kpi-grid">
                <div class="kpi-card">
                    <div class="kpi-icon green"><i class="fas fa-check-circle"></i></div>
                    <div class="kpi-content">
                        <div class="kpi-value">${s.active}</div>
                        <div class="kpi-label">${t('contracts.active_contracts')}</div>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-icon blue"><i class="fas fa-euro-sign"></i></div>
                    <div class="kpi-content">
                        <div class="kpi-value">${Number(s.total_monthly).toLocaleString('fr-FR', {minimumFractionDigits: 2})} &euro;</div>
                        <div class="kpi-label">${t('contracts.monthly_charges')}</div>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-icon orange"><i class="fas fa-exclamation-triangle"></i></div>
                    <div class="kpi-content">
                        <div class="kpi-value">${s.expiring}</div>
                        <div class="kpi-label">${t('contracts.expiring_soon')}</div>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-icon red"><i class="fas fa-archive"></i></div>
                    <div class="kpi-content">
                        <div class="kpi-value">${s.archived}</div>
                        <div class="kpi-label">${t('contracts.archived_terminated')}</div>
                    </div>
                </div>
            </div>
        `;
    } catch (e) {
        console.error('Stats error:', e);
    }
}

function ctSwitchTab(tab) {
    ctActiveTab = tab;
    document.querySelectorAll('.closure-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
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
                    <h3 class="card-title">${t('contracts.active_contracts')}</h3>
                    <div style="display:flex;gap:10px;align-items:center">
                        <input type="text" id="ct-search" class="form-control" placeholder="${t('contracts.search')}" style="width:200px" onkeyup="ctSearchContracts(event)">
                        <select id="ct-filter-cat" class="form-control" onchange="ctFilterByCategory()" style="min-width:150px">
                            <option value="">${t('contracts.all_categories')}</option>
                            ${ctCategories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                ${contracts.length ? `
                    <div style="overflow-x:auto">
                    <table>
                        <thead><tr>
                            <th>${t('contracts.supplier')}</th>
                            <th>${t('contracts.reference')}</th>
                            <th>${t('contracts.category')}</th>
                            <th>${t('contracts.amount')}</th>
                            <th>${t('contracts.frequency')}</th>
                            <th>${t('contracts.start_date')}</th>
                            <th>${t('contracts.end_date')}</th>
                            <th>${t('contracts.status')}</th>
                            <th>${t('contracts.actions')}</th>
                        </tr></thead>
                        <tbody>
                            ${contracts.map(c => ctRenderContractRow(c)).join('')}
                        </tbody>
                    </table>
                    </div>
                    <div id="ct-pagination" style="padding:16px">${pagination ? renderPagination(pagination, ctGoToPage) : ''}</div>
                ` : `<div class="empty-state"><i class="fas fa-file-contract"></i><h3>${t('contracts.no_contracts')}</h3><p>${t('contracts.first_contract_hint')}</p></div>`}
            </div>
        `;
    } catch (e) {
        content.innerHTML = `<div class="card"><p class="text-danger">${t('contracts.error')}: ${e.message}</p></div>`;
    }
}

function ctRenderContractRow(c) {
    const catBadge = c.category_name
        ? `<span class="badge" style="background:${escAttr(c.category_color || '#6366f1')};color:#fff">${esc(c.category_name)}</span>`
        : '<span class="text-muted">-</span>';
    const statusBadgeHtml = `<span class="badge badge-${ctStatusColor(c.status)}">${ctStatusLabel(c.status)}</span>`;
    const endDateDisplay = c.end_date ? formatDate(c.end_date) : '-';
    const startDateDisplay = c.start_date ? formatDate(c.start_date) : '-';
    const amount = Number(c.amount).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' \u20AC';

    return `<tr>
        <td><strong>${esc(c.supplier_name)}</strong></td>
        <td>${esc(c.contract_ref || '-')}</td>
        <td>${catBadge}</td>
        <td style="text-align:right">${amount}</td>
        <td>${ctFreqLabel(c.amount_frequency)}</td>
        <td>${startDateDisplay}</td>
        <td>${endDateDisplay}</td>
        <td>${statusBadgeHtml}</td>
        <td>
            <div class="table-actions">
                <button onclick="ctViewContract(${c.id})" title="${t('contracts.view')}"><i class="fas fa-eye"></i></button>
                ${hasPermission('contracts.manage') ? `<button onclick="ctEditContract(${c.id})" title="${t('contracts.edit')}"><i class="fas fa-edit"></i></button>` : ''}
                ${hasPermission('contracts.manage') ? `<button onclick="ctArchiveContract(${c.id})" title="${t('contracts.archive_btn')}" style="color:var(--gray-400)"><i class="fas fa-archive"></i></button>` : ''}
                ${hasPermission('contracts.delete') ? `<button onclick="ctDeleteContract(${c.id})" title="${t('contracts.delete')}" style="color:var(--danger)"><i class="fas fa-trash"></i></button>` : ''}
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
            content.querySelector('tbody').innerHTML = tbody || `<tr><td colspan="9" class="text-center">${t('contracts.no_results')}</td></tr>`;
        } catch (err) { toast(t('contracts.search_error'), 'error'); }
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
    } catch (err) { toast(t('contracts.error'), 'error'); }
}

// ============ ONGLET CHARGES FIXES ============

async function ctRenderCharges(content) {
    content.innerHTML = '<div class="loading-spinner"></div>';
    try {
        const year = new Date().getFullYear();
        const res = await API.get(`contracts/charges?hotel_id=${ctCurrentHotel}&year=${year}`);
        const contracts = res.contracts || [];
        const months = [t('contracts.month_jan'), t('contracts.month_feb'), t('contracts.month_mar'), t('contracts.month_apr'), t('contracts.month_may'), t('contracts.month_jun'), t('contracts.month_jul'), t('contracts.month_aug'), t('contracts.month_sep'), t('contracts.month_oct'), t('contracts.month_nov'), t('contracts.month_dec')];
        const totals = new Array(12).fill(0);

        content.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title"><i class="fas fa-table"></i> ${t('contracts.charges_table')} ${year}</h3>
                    ${hasPermission('contracts.export') ? `<button class="btn btn-outline btn-sm" onclick="ctExportCSV()"><i class="fas fa-file-csv"></i> ${t('contracts.export_csv')}</button>` : ''}
                </div>
                ${contracts.length ? `
                <div style="overflow-x:auto">
                <table>
                    <thead><tr>
                        <th>${t('contracts.supplier')}</th>
                        <th>${t('contracts.category')}</th>
                        <th>${t('contracts.frequency')}</th>
                        ${months.map(m => `<th style="text-align:right">${m}</th>`).join('')}
                        <th style="text-align:right"><strong>${t('contracts.total')}</strong></th>
                    </tr></thead>
                    <tbody>
                        ${contracts.map(c => {
                            const monthlyAmount = ctCalcMonthly(c);
                            let rowTotal = 0;
                            const cells = months.map((_, i) => {
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
                                <td>${ctFreqLabel(c.amount_frequency)}</td>
                                ${cells}
                                <td style="text-align:right"><strong>${rowTotal.toLocaleString('fr-FR', {minimumFractionDigits:2})} \u20AC</strong></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="font-weight:700;background:var(--gray-50)">
                            <td colspan="3">${t('contracts.total')}</td>
                            ${totals.map(t => `<td style="text-align:right">${t.toLocaleString('fr-FR', {minimumFractionDigits:2})}</td>`).join('')}
                            <td style="text-align:right">${totals.reduce((a, b) => a + b, 0).toLocaleString('fr-FR', {minimumFractionDigits:2})} \u20AC</td>
                        </tr>
                    </tfoot>
                </table>
                </div>
                ` : `<div class="empty-state"><i class="fas fa-table"></i><h3>${t('contracts.no_active_contract')}</h3></div>`}
            </div>
        `;
    } catch (e) {
        content.innerHTML = `<div class="card"><p class="text-danger">${t('contracts.error')}: ${e.message}</p></div>`;
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
                    <h3 class="card-title"><i class="fas fa-bell"></i> ${t('contracts.configured_alerts')}</h3>
                </div>
                ${allAlerts.length ? `
                <table>
                    <thead><tr>
                        <th>${t('contracts.tab_list')}</th>
                        <th>${t('contracts.type')}</th>
                        <th>${t('contracts.days_before')}</th>
                        <th>${t('contracts.end_date')}</th>
                        <th>${t('contracts.last_alert')}</th>
                        <th>${t('contracts.state')}</th>
                        <th>${t('contracts.actions')}</th>
                    </tr></thead>
                    <tbody>
                        ${allAlerts.map(a => `<tr>
                            <td><strong>${esc(a.contract_name)}</strong> ${a.contract_ref ? `<small class="text-muted">(${esc(a.contract_ref)})</small>` : ''}</td>
                            <td>${ctAlertTypeLabel(a.alert_type)}</td>
                            <td>${a.days_before} ${t('contracts.days_unit')}</td>
                            <td>${a.end_date ? formatDate(a.end_date) : '-'}</td>
                            <td>${a.last_triggered_at ? formatDateTime(a.last_triggered_at) : t('contracts.never')}</td>
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
                ` : `<div class="empty-state"><i class="fas fa-bell-slash"></i><h3>${t('contracts.no_alert_configured')}</h3><p>${t('contracts.alert_auto_hint')}</p></div>`}
            </div>
        `;
    } catch (e) {
        content.innerHTML = `<div class="card"><p class="text-danger">${t('contracts.error')}: ${e.message}</p></div>`;
    }
}

async function ctToggleAlert(contractId, alertId, active) {
    try {
        await API.put(`contracts/${contractId}/alerts/${alertId}`, { is_active: active ? 1 : 0 });
        toast(active ? t('contracts.alert_activated') : t('contracts.alert_deactivated'), 'success');
    } catch (e) { toast(t('contracts.error'), 'error'); }
}

async function ctDeleteAlert(contractId, alertId) {
    if (!confirm(t('contracts.delete_alert_confirm'))) return;
    try {
        await API.delete(`contracts/${contractId}/alerts/${alertId}`);
        toast(t('contracts.alert_deleted'), 'success');
        ctSwitchTab('alerts');
    } catch (e) { toast(t('contracts.error'), 'error'); }
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
                    <h3 class="card-title"><i class="fas fa-tags"></i> ${t('contracts.contract_categories')}</h3>
                    ${hasPermission('contracts.manage') ? `<button class="btn btn-primary btn-sm" onclick="ctShowCategoryModal()"><i class="fas fa-plus"></i> ${t('contracts.new_category')}</button>` : ''}
                </div>
                ${ctCategories.length ? `
                <table>
                    <thead><tr><th>${t('contracts.color')}</th><th>${t('contracts.name')}</th><th>${t('contracts.tab_list')}</th><th>${t('contracts.actions')}</th></tr></thead>
                    <tbody>
                        ${ctCategories.map(c => `<tr>
                            <td><span style="display:inline-block;width:24px;height:24px;border-radius:4px;background:${escAttr(c.color)}"></span></td>
                            <td><strong>${esc(c.name)}</strong></td>
                            <td><span class="badge badge-primary">${c.contract_count || 0}</span></td>
                            <td>
                                <div class="table-actions">
                                    ${hasPermission('contracts.manage') ? `<button onclick="ctEditCategory(${c.id}, '${escAttr(c.name)}', '${escAttr(c.color)}')" title="${t('contracts.edit')}"><i class="fas fa-edit"></i></button>` : ''}
                                    ${hasPermission('contracts.delete') ? `<button onclick="ctDeleteCategory(${c.id})" title="${t('contracts.delete')}" style="color:var(--danger)"><i class="fas fa-trash"></i></button>` : ''}
                                </div>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
                ` : `<div class="empty-state"><i class="fas fa-tags"></i><h3>${t('contracts.no_category')}</h3><p>${t('contracts.create_categories_hint')}</p></div>`}
            </div>
        `;
    } catch (e) {
        content.innerHTML = `<div class="card"><p class="text-danger">${t('contracts.error')}: ${e.message}</p></div>`;
    }
}

function ctShowCategoryModal(id, name, color) {
    const isEdit = !!id;
    openModal(isEdit ? t('contracts.edit_category') : t('contracts.new_category'), `
        <form onsubmit="ctSaveCategory(event, ${id || 'null'})">
            <div class="form-group">
                <label>${t('contracts.category_name')}</label>
                <input type="text" class="form-control" id="ct-cat-name" value="${esc(name || '')}" required>
            </div>
            <div class="form-group">
                <label>${t('contracts.color')}</label>
                <input type="color" id="ct-cat-color" value="${color || '#6366f1'}" style="width:60px;height:40px;border:none;cursor:pointer">
            </div>
            <div style="text-align:right;margin-top:20px">
                <button type="submit" class="btn btn-primary">${isEdit ? t('contracts.edit') : t('contracts.create')}</button>
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
        toast(t('contracts.category_saved'), 'success');
        closeModal();
        ctSwitchTab('categories');
    } catch (e) { toast(t('contracts.error') + ': ' + e.message, 'error'); }
}

async function ctDeleteCategory(id) {
    if (!confirm(t('contracts.delete_category_confirm'))) return;
    try {
        await API.delete(`contracts/categories/${id}`);
        toast(t('contracts.category_deleted'), 'success');
        ctSwitchTab('categories');
    } catch (e) { toast(t('contracts.error'), 'error'); }
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
                    <h3 class="card-title"><i class="fas fa-archive"></i> ${t('contracts.archived_contracts')}</h3>
                </div>
                ${contracts.length ? `
                <div style="overflow-x:auto">
                <table>
                    <thead><tr><th>${t('contracts.supplier')}</th><th>${t('contracts.reference')}</th><th>${t('contracts.category')}</th><th>${t('contracts.amount')}</th><th>${t('contracts.end_date')}</th><th>${t('contracts.status')}</th><th>${t('contracts.actions')}</th></tr></thead>
                    <tbody>
                        ${contracts.map(c => {
                            const catBadge = c.category_name ? `<span class="badge" style="background:${escAttr(c.category_color || '#6366f1')};color:#fff">${esc(c.category_name)}</span>` : '-';
                            return `<tr>
                                <td><strong>${esc(c.supplier_name)}</strong></td>
                                <td>${esc(c.contract_ref || '-')}</td>
                                <td>${catBadge}</td>
                                <td style="text-align:right">${Number(c.amount).toLocaleString('fr-FR', {minimumFractionDigits:2})} \u20AC</td>
                                <td>${c.end_date ? formatDate(c.end_date) : '-'}</td>
                                <td><span class="badge badge-${ctStatusColor(c.status)}">${ctStatusLabel(c.status)}</span></td>
                                <td>
                                    <div class="table-actions">
                                        <button onclick="ctViewContract(${c.id})" title="${t('contracts.view')}"><i class="fas fa-eye"></i></button>
                                        ${hasPermission('contracts.manage') ? `<button onclick="ctReactivateContract(${c.id})" title="${t('contracts.reactivate_btn')}" style="color:var(--success)"><i class="fas fa-redo"></i></button>` : ''}
                                    </div>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
                </div>
                ` : `<div class="empty-state"><i class="fas fa-archive"></i><h3>${t('contracts.no_archive')}</h3></div>`}
            </div>
        `;
    } catch (e) {
        content.innerHTML = `<div class="card"><p class="text-danger">${t('contracts.error')}: ${e.message}</p></div>`;
    }
}

// ============ CRÉATION / ÉDITION DE CONTRAT ============

async function ctShowCreateModal(contractId) {
    const isEdit = !!contractId;
    let contract = {};

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
        } catch (e) { toast(t('contracts.error'), 'error'); return; }
    }

    openModal(isEdit ? t('contracts.edit_contract') : t('contracts.new'), `
        <form onsubmit="ctSaveContract(event, ${contractId || 'null'})">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
                <div class="form-group">
                    <label>${t('contracts.supplier')} *</label>
                    <input type="text" class="form-control" id="ct-supplier" value="${esc(contract.supplier_name || '')}" required>
                </div>
                <div class="form-group">
                    <label>${t('contracts.reference')}</label>
                    <input type="text" class="form-control" id="ct-ref" value="${esc(contract.contract_ref || '')}">
                </div>
                <div class="form-group">
                    <label>${t('contracts.category')}</label>
                    <select class="form-control" id="ct-category">
                        <option value="">${t('contracts.without_category')}</option>
                        ${ctCategories.map(c => `<option value="${c.id}" ${contract.category_id == c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>${t('contracts.status')}</label>
                    <select class="form-control" id="ct-status">
                        <option value="active" ${contract.status === 'active' ? 'selected' : ''}>${t('contracts.active')}</option>
                        <option value="expiring" ${contract.status === 'expiring' ? 'selected' : ''}>${t('contracts.expiring')}</option>
                        <option value="terminated" ${contract.status === 'terminated' ? 'selected' : ''}>${t('contracts.terminated')}</option>
                        <option value="archived" ${contract.status === 'archived' ? 'selected' : ''}>${t('contracts.archived')}</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>${t('contracts.amount')}</label>
                    <input type="number" class="form-control" id="ct-amount" step="0.01" min="0" value="${contract.amount || '0'}">
                </div>
                <div class="form-group">
                    <label>${t('contracts.frequency')}</label>
                    <select class="form-control" id="ct-frequency">
                        <option value="monthly" ${contract.amount_frequency === 'monthly' ? 'selected' : ''}>${t('contracts.freq_monthly')}</option>
                        <option value="quarterly" ${contract.amount_frequency === 'quarterly' ? 'selected' : ''}>${t('contracts.freq_quarterly')}</option>
                        <option value="yearly" ${contract.amount_frequency === 'yearly' ? 'selected' : ''}>${t('contracts.freq_yearly')}</option>
                        <option value="one_time" ${contract.amount_frequency === 'one_time' ? 'selected' : ''}>${t('contracts.freq_one_time')}</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>${t('contracts.start_date')}</label>
                    <input type="date" class="form-control" id="ct-start" value="${contract.start_date || ''}">
                </div>
                <div class="form-group">
                    <label>${t('contracts.end_date')}</label>
                    <input type="date" class="form-control" id="ct-end" value="${contract.end_date || ''}">
                </div>
                <div class="form-group">
                    <label>${t('contracts.notice_days')}</label>
                    <input type="number" class="form-control" id="ct-notice" min="0" value="${contract.termination_notice_days || 90}">
                </div>
                <div class="form-group" style="display:flex;align-items:center;gap:12px;padding-top:28px">
                    <label style="display:flex;align-items:center;gap:8px;margin:0;cursor:pointer">
                        <input type="checkbox" id="ct-autorenewal" ${contract.auto_renewal == 1 ? 'checked' : ''}>
                        ${t('contracts.auto_renewal')}
                    </label>
                </div>
                <div class="form-group" id="ct-renewal-months-group" style="${contract.auto_renewal == 1 ? '' : 'display:none'}">
                    <label>${t('contracts.renewal_duration')}</label>
                    <input type="number" class="form-control" id="ct-renewal-months" min="1" value="${contract.renewal_duration_months || 12}">
                </div>
            </div>
            <div class="form-group">
                <label>${t('contracts.description')}</label>
                <textarea class="form-control" id="ct-description" rows="3">${esc(contract.description || '')}</textarea>
            </div>
            <div class="form-group">
                <label>${t('contracts.notes')}</label>
                <textarea class="form-control" id="ct-notes" rows="2">${esc(contract.notes || '')}</textarea>
            </div>
            <div class="form-group">
                <label><i class="fas fa-file-pdf" style="color:var(--danger);margin-right:4px"></i>${t('contracts.attach_signed_pdf')}</label>
                <input type="file" class="form-control" id="ct-signed-pdf" accept=".pdf">
                <small class="text-muted">${t('contracts.attach_pdf_hint')}</small>
            </div>
            <div style="text-align:right;margin-top:20px">
                <button type="button" class="btn btn-outline" onclick="closeModal()">${t('contracts.cancel')}</button>
                <button type="submit" class="btn btn-primary">${isEdit ? t('contracts.edit') : t('contracts.create')}</button>
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

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (id ? t('contracts.saving') : t('contracts.creating')); }

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

    const pdfInput = document.getElementById('ct-signed-pdf');
    const pdfFile = pdfInput && pdfInput.files[0] ? pdfInput.files[0] : null;

    try {
        let contractId = id;
        if (id) {
            await API.put(`contracts/${id}`, data);
            toast(t('contracts.contract_modified'), 'success');
        } else {
            const res = await API.post('contracts', data);
            contractId = res.id;
            toast(t('contracts.contract_created'), 'success');
        }

        // Upload du PDF signe si un fichier a ete selectionne
        if (pdfFile && contractId) {
            try {
                if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Upload du document...';
                const formData = new FormData();
                formData.append('file', pdfFile);
                formData.append('type', 'contract');
                formData.append('label', pdfFile.name);
                await API.upload(`contracts/${contractId}/documents`, formData);
                toast(t('contracts.doc_uploaded'), 'success');
            } catch (uploadErr) {
                toast(t('contracts.error') + ' (document) : ' + uploadErr.message, 'error');
            }
        }

        closeModal();
        ctLoadStats();
        ctSwitchTab(ctActiveTab);
    } catch (err) {
        toast(t('contracts.error') + ': ' + err.message, 'error');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fas fa-save"></i> ' + (id ? t('contracts.edit') : t('contracts.create')); }
    }
}

// ============ VUE DÉTAILLÉE D'UN CONTRAT ============

async function ctViewContract(id) {
    try {
        const res = await API.get(`contracts/${id}`);
        const c = res.contract;
        const docs = c.documents || [];
        const alerts = c.alerts || [];

        const statusBadgeHtml = `<span class="badge badge-${ctStatusColor(c.status)}">${ctStatusLabel(c.status)}</span>`;
        const catBadge = c.category_name ? `<span class="badge" style="background:${escAttr(c.category_color || '#6366f1')};color:#fff">${esc(c.category_name)}</span>` : t('contracts.no_category_assigned');

        openModal(`${t('contracts.tab_list')} - ${esc(c.supplier_name)}`, `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
                <!-- Informations -->
                <div>
                    <h4 style="margin-bottom:12px"><i class="fas fa-info-circle"></i> ${t('contracts.info')}</h4>
                    <table class="detail-table" style="width:100%">
                        <tr><td style="width:40%;color:var(--gray-500)">${t('contracts.supplier')}</td><td><strong>${esc(c.supplier_name)}</strong></td></tr>
                        <tr><td style="color:var(--gray-500)">${t('contracts.reference')}</td><td>${esc(c.contract_ref || '-')}</td></tr>
                        <tr><td style="color:var(--gray-500)">${t('contracts.category')}</td><td>${catBadge}</td></tr>
                        <tr><td style="color:var(--gray-500)">${t('contracts.amount')}</td><td><strong>${Number(c.amount).toLocaleString('fr-FR', {minimumFractionDigits:2})} \u20AC</strong> (${ctFreqLabel(c.amount_frequency)})</td></tr>
                        <tr><td style="color:var(--gray-500)">${t('contracts.start_date')}</td><td>${c.start_date ? formatDate(c.start_date) : '-'}</td></tr>
                        <tr><td style="color:var(--gray-500)">${t('contracts.end_date')}</td><td>${c.end_date ? formatDate(c.end_date) : '-'}</td></tr>
                        <tr><td style="color:var(--gray-500)">${t('contracts.notice_days')}</td><td>${c.termination_notice_days} ${t('contracts.days_unit')}</td></tr>
                        <tr><td style="color:var(--gray-500)">${t('contracts.auto_renewal')}</td><td>${c.auto_renewal == 1 ? t('contracts.yes') + ` (${c.renewal_duration_months} ${t('contracts.months')})` : t('contracts.no')}</td></tr>
                        <tr><td style="color:var(--gray-500)">${t('contracts.status')}</td><td>${statusBadgeHtml}</td></tr>
                        <tr><td style="color:var(--gray-500)">${t('contracts.created_by')}</td><td>${esc(c.created_by_name || '-')}</td></tr>
                        <tr><td style="color:var(--gray-500)">${t('contracts.created_at')}</td><td>${c.created_at ? formatDateTime(c.created_at) : '-'}</td></tr>
                    </table>
                    ${c.description ? `<div style="margin-top:12px"><strong>${t('contracts.description')} :</strong><p style="margin-top:4px">${esc(c.description)}</p></div>` : ''}
                    ${c.notes ? `<div style="margin-top:12px"><strong>${t('contracts.notes')} :</strong><p style="margin-top:4px">${esc(c.notes)}</p></div>` : ''}

                    ${hasPermission('contracts.manage') ? `
                    <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
                        <button class="btn btn-sm btn-outline" onclick="closeModal();ctEditContract(${c.id})"><i class="fas fa-edit"></i> ${t('contracts.edit')}</button>
                        ${c.status !== 'archived' ? `<button class="btn btn-sm btn-outline" onclick="ctChangeStatus(${c.id}, 'archived')"><i class="fas fa-archive"></i> ${t('contracts.archive_btn')}</button>` : ''}
                        ${c.status !== 'terminated' ? `<button class="btn btn-sm btn-outline" style="color:var(--danger)" onclick="ctChangeStatus(${c.id}, 'terminated')"><i class="fas fa-times"></i> ${t('contracts.terminate_btn')}</button>` : ''}
                        ${(c.status === 'archived' || c.status === 'terminated') ? `<button class="btn btn-sm btn-outline" style="color:var(--success)" onclick="ctChangeStatus(${c.id}, 'active')"><i class="fas fa-redo"></i> ${t('contracts.reactivate_btn')}</button>` : ''}
                    </div>
                    ` : ''}
                </div>

                <!-- Documents + Alertes -->
                <div>
                    <h4 style="margin-bottom:12px"><i class="fas fa-paperclip"></i> ${t('contracts.documents')} (${docs.length})</h4>
                    ${docs.length ? docs.map(d => `
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:8px">
                            <div>
                                <a href="${escAttr(d.file_path)}" target="_blank" style="font-weight:500"><i class="fas fa-file-${d.file_path.endsWith('.pdf') ? 'pdf' : 'image'}" style="color:var(--primary-500)"></i> ${esc(d.label || d.original_filename)}</a>
                                <div style="font-size:0.8em;color:var(--gray-400)">${ctDocTypeLabel(d.type)} - ${d.uploader_name || ''} - ${d.created_at ? formatDate(d.created_at) : ''}</div>
                            </div>
                            ${hasPermission('contracts.manage') ? `<button class="btn btn-sm" style="color:var(--danger)" onclick="ctDeleteDocument(${c.id}, ${d.id})"><i class="fas fa-trash"></i></button>` : ''}
                        </div>
                    `).join('') : `<p class="text-muted">${t('contracts.no_documents')}</p>`}
                    ${hasPermission('contracts.manage') ? `
                    <div style="margin-top:12px">
                        <form id="ct-upload-form" onsubmit="ctUploadDocument(event, ${c.id})">
                            <div style="display:flex;gap:8px;align-items:end">
                                <div style="flex:1">
                                    <select class="form-control" id="ct-doc-type" style="margin-bottom:6px">
                                        <option value="contract">${t('contracts.doc_contract')}</option>
                                        <option value="annex">${t('contracts.doc_annex')}</option>
                                        <option value="termination_letter">${t('contracts.doc_termination')}</option>
                                        <option value="acknowledgment">${t('contracts.doc_acknowledgment')}</option>
                                        <option value="invoice">${t('contracts.doc_invoice')}</option>
                                        <option value="other">${t('contracts.doc_other')}</option>
                                    </select>
                                    <input type="file" class="form-control" id="ct-doc-file" accept=".pdf,.jpg,.jpeg,.png" required>
                                </div>
                                <button type="submit" class="btn btn-sm btn-primary"><i class="fas fa-upload"></i></button>
                            </div>
                        </form>
                    </div>
                    ` : ''}

                    <h4 style="margin-top:24px;margin-bottom:12px"><i class="fas fa-bell"></i> ${t('contracts.alerts')} (${alerts.length})</h4>
                    ${alerts.length ? alerts.map(a => `
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:8px">
                            <div>
                                <strong>${ctAlertTypeLabel(a.alert_type)}</strong> - ${a.days_before} ${t('contracts.days_unit')}
                                ${a.last_triggered_at ? `<div style="font-size:0.8em;color:var(--gray-400)">${t('contracts.last_alert')}: ${formatDateTime(a.last_triggered_at)}</div>` : ''}
                            </div>
                            <label class="toggle-switch" style="margin:0">
                                <input type="checkbox" ${a.is_active == 1 ? 'checked' : ''} onchange="ctToggleAlert(${c.id}, ${a.id}, this.checked)">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    `).join('') : `<p class="text-muted">${t('contracts.no_alerts')}</p>`}
                    ${hasPermission('contracts.manage') ? `
                    <button class="btn btn-sm btn-outline" onclick="ctAddAlertModal(${c.id})" style="margin-top:8px"><i class="fas fa-plus"></i> ${t('contracts.add_alert')}</button>
                    ` : ''}

                    ${c.ai_enabled ? `
                    <h4 style="margin-top:24px;margin-bottom:12px"><i class="fas fa-robot"></i> ${t('contracts.ai_analysis')}</h4>
                    ${c.ai_analysis ? `
                        <div style="background:var(--gray-50);padding:16px;border-radius:8px;border-left:4px solid var(--primary-500);max-height:300px;overflow-y:auto;white-space:pre-wrap;font-size:0.9em">${esc(c.ai_analysis)}</div>
                        <div style="font-size:0.8em;color:var(--gray-400);margin-top:4px">${t('contracts.analyzed_at')} ${c.ai_analyzed_at ? formatDateTime(c.ai_analyzed_at) : '-'}</div>
                    ` : `<p class="text-muted">${t('contracts.not_analyzed')}</p>`}
                    ${hasPermission('contracts.analyze') ? `
                    <button class="btn btn-sm btn-primary" onclick="ctAnalyzeContract(${c.id})" style="margin-top:8px" id="ct-analyze-btn">
                        <i class="fas fa-robot"></i> ${c.ai_analysis ? t('contracts.retry_analysis') : t('contracts.analyze')}
                    </button>
                    ` : ''}
                    ` : ''}
                </div>
            </div>
        `, 'modal-xl');
    } catch (e) { toast(t('contracts.error') + ': ' + e.message, 'error'); }
}

// ============ ACTIONS SUR CONTRAT ============

async function ctArchiveContract(id) {
    if (!confirm(t('contracts.archive_confirm'))) return;
    await ctChangeStatus(id, 'archived');
}

async function ctReactivateContract(id) {
    if (!confirm(t('contracts.reactivate_confirm'))) return;
    await ctChangeStatus(id, 'active');
}

async function ctChangeStatus(id, status) {
    try {
        await API.put(`contracts/${id}/status`, { status });
        toast(t('contracts.status_updated'), 'success');
        closeModal();
        ctLoadStats();
        ctSwitchTab(ctActiveTab);
    } catch (e) { toast(t('contracts.error') + ': ' + e.message, 'error'); }
}

async function ctDeleteContract(id) {
    if (!confirm(t('contracts.delete_confirm'))) return;
    try {
        await API.delete(`contracts/${id}`);
        toast(t('contracts.contract_deleted'), 'success');
        ctLoadStats();
        ctSwitchTab(ctActiveTab);
    } catch (e) { toast(t('contracts.error'), 'error'); }
}

// ============ DOCUMENTS ============

async function ctUploadDocument(e, contractId) {
    e.preventDefault();
    const fileInput = document.getElementById('ct-doc-file');
    const docType = document.getElementById('ct-doc-type').value;
    if (!fileInput.files[0]) { toast('Veuillez sélectionner un fichier', 'warning'); return; }

    const file = fileInput.files[0];

    // Validation côté client
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) {
        toast('Format non autorisé. Formats acceptés : PDF, JPG, PNG', 'error');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        toast('Fichier trop volumineux (max 10 Mo)', 'error');
        return;
    }

    const uploadBtn = e.target.querySelector('button[type="submit"]');
    if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', docType);
    formData.append('label', file.name);

    try {
        await API.upload(`contracts/${contractId}/documents`, formData);
        toast(t('contracts.doc_uploaded'), 'success');
        ctViewContract(contractId);
    } catch (err) {
        toast(t('contracts.error') + ': ' + err.message, 'error');
        if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.innerHTML = '<i class="fas fa-upload"></i>'; }
    }
}

async function ctDeleteDocument(contractId, docId) {
    if (!confirm(t('contracts.delete_doc_confirm'))) return;
    try {
        await API.delete(`contracts/${contractId}/documents/${docId}`);
        toast(t('contracts.doc_deleted'), 'success');
        ctViewContract(contractId);
    } catch (e) { toast(t('contracts.error'), 'error'); }
}

// ============ ALERTES ============

function ctAddAlertModal(contractId) {
    openModal(t('contracts.add_alert'), `
        <form onsubmit="ctSaveNewAlert(event, ${contractId})">
            <div class="form-group">
                <label>${t('contracts.alert_type')}</label>
                <select class="form-control" id="ct-new-alert-type">
                    <option value="expiry">${t('contracts.alert_expiry_label')}</option>
                    <option value="termination_notice">${t('contracts.alert_termination_label')}</option>
                    <option value="custom">${t('contracts.alert_custom_label')}</option>
                </select>
            </div>
            <div class="form-group">
                <label>${t('contracts.days_before_label')}</label>
                <input type="number" class="form-control" id="ct-new-alert-days" min="1" value="30" required>
            </div>
            <div style="text-align:right;margin-top:20px">
                <button type="submit" class="btn btn-primary">${t('contracts.add')}</button>
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
        toast(t('contracts.alert_added'), 'success');
        closeModal();
        ctViewContract(contractId);
    } catch (e) { toast(t('contracts.error') + ': ' + e.message, 'error'); }
}

// ============ ANALYSE IA ============

async function ctAnalyzeContract(id) {
    const btn = document.getElementById('ct-analyze-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${t('contracts.analyzing')}`;
    }
    try {
        const res = await API.post(`contracts/${id}/analyze`, {});
        toast(t('contracts.analysis_done'), 'success');
        ctViewContract(id);
    } catch (e) {
        toast(t('contracts.error') + ': ' + e.message, 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-robot"></i> ${t('contracts.retry_analysis')}`;
        }
    }
}

// ============ EXPORT CSV ============

async function ctExportCSV() {
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
        toast(t('contracts.export_downloaded'), 'success');
    } catch (e) { toast(t('contracts.error'), 'error'); }
}

// ============ EXPORT PDF ============

async function ctExportPDFDoc() {
    try {
        const res = await API.get(`contracts?hotel_id=${ctCurrentHotel}&per_page=200`);
        const contracts = res.contracts || [];
        const hotelName = ctHotels.find(h => h.id == ctCurrentHotel)?.name || '';
        const today = new Date().toLocaleDateString('fr-FR');

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${t('contracts.title')} - ${esc(hotelName)}</title>
<style>
    body { font-family: 'Inter', Arial, sans-serif; margin: 30px; color: #333; font-size: 12px; }
    h1 { font-size: 20px; color: #1E3A5F; margin-bottom: 4px; }
    .subtitle { color: #666; margin-bottom: 24px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #1E3A5F; color: #fff; padding: 10px 8px; text-align: left; font-size: 11px; text-transform: uppercase; }
    td { padding: 8px; border-bottom: 1px solid #e0e0e0; }
    tr:nth-child(even) { background: #f8f9fa; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 10px; font-weight: 600; }
    .badge-success { background: #d4edda; color: #155724; }
    .badge-warning { background: #fff3cd; color: #856404; }
    .badge-danger { background: #f8d7da; color: #721c24; }
    .badge-secondary { background: #e2e3e5; color: #383d41; }
    .amount { text-align: right; font-weight: 600; }
    .footer { margin-top: 30px; text-align: center; color: #999; font-size: 10px; border-top: 1px solid #e0e0e0; padding-top: 10px; }
    @media print { body { margin: 15px; } }
</style>
</head><body>
<h1><i class="fas fa-file-contract"></i> ${t('contracts.title')}</h1>
<div class="subtitle">${esc(hotelName)} - ${today}</div>
<table>
    <thead><tr>
        <th>${t('contracts.supplier')}</th>
        <th>${t('contracts.reference')}</th>
        <th>${t('contracts.category')}</th>
        <th>${t('contracts.amount')}</th>
        <th>${t('contracts.frequency')}</th>
        <th>${t('contracts.start_date')}</th>
        <th>${t('contracts.end_date')}</th>
        <th>${t('contracts.status')}</th>
    </tr></thead>
    <tbody>
        ${contracts.map(c => `<tr>
            <td><strong>${esc(c.supplier_name)}</strong></td>
            <td>${esc(c.contract_ref || '-')}</td>
            <td>${c.category_name ? esc(c.category_name) : '-'}</td>
            <td class="amount">${Number(c.amount).toLocaleString('fr-FR', {minimumFractionDigits:2})} \u20AC</td>
            <td>${ctFreqLabel(c.amount_frequency)}</td>
            <td>${c.start_date ? formatDate(c.start_date) : '-'}</td>
            <td>${c.end_date ? formatDate(c.end_date) : '-'}</td>
            <td><span class="badge badge-${ctStatusColor(c.status)}">${ctStatusLabel(c.status)}</span></td>
        </tr>`).join('')}
    </tbody>
</table>
<div class="footer">ACL GESTION - ${t('contracts.title')} - ${esc(hotelName)} - ${today}</div>
<script>window.onload = function() { window.print(); }</script>
</body></html>`);
        printWindow.document.close();
    } catch (e) { toast(t('contracts.error'), 'error'); }
}
