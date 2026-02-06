/**
 * Dashboard Page - Vue d'ensemble avec widgets personnalisables (drag & drop)
 * Chaque role voit les widgets qui le concernent
 * L'ordre et la visibilite sont sauvegardés dans localStorage
 */

// Definition des widgets disponibles
const DASHBOARD_WIDGETS = {
    closures:    { id: 'closures',    icon: 'fa-cash-register',   label: 'dashboard.recent_closures', roles: ['admin', 'groupe_manager', 'hotel_manager', 'reception', 'receptionniste', 'comptabilite'], module: 'closures',    col: 'left' },
    dispatch:    { id: 'dispatch',    icon: 'fa-broom',           label: 'dashboard.dispatch_today',   roles: ['admin', 'groupe_manager', 'hotel_manager'],                                                  module: 'housekeeping',col: 'left' },
    maintenance: { id: 'maintenance', icon: 'fa-wrench',          label: 'dashboard.recent_tickets',   roles: ['admin', 'groupe_manager', 'hotel_manager', 'receptionniste', 'employee'],                      module: 'maintenance', col: 'left' },
    tasks:       { id: 'tasks',       icon: 'fa-tasks',           label: 'dashboard.my_tasks',         roles: ['admin', 'groupe_manager', 'hotel_manager', 'rh', 'receptionniste', 'employee'],                module: 'tasks',       col: 'left' },
    hotels:      { id: 'hotels',      icon: 'fa-building',        label: 'dashboard.my_hotels',        roles: ['admin', 'groupe_manager', 'hotel_manager', 'receptionniste', 'employee', 'rh', 'comptabilite'],module: null,          col: 'right' },
    audit:       { id: 'audit',       icon: 'fa-clipboard-list',  label: 'Audits',                     roles: ['admin', 'groupe_manager', 'hotel_manager'],                                                  module: 'audit',       col: 'right' },
    leaves:      { id: 'leaves',      icon: 'fa-calendar-alt',    label: 'dashboard.recent_leaves',    roles: ['admin', 'groupe_manager', 'hotel_manager', 'rh'],                                            module: 'leaves',      col: 'right' },
    evaluations: { id: 'evaluations', icon: 'fa-clipboard-check', label: 'Evaluations',                roles: ['admin', 'groupe_manager', 'hotel_manager', 'rh'],                                            module: 'evaluations', col: 'right' },
    linen:       { id: 'linen',       icon: 'fa-tshirt',          label: 'dashboard.laundry',          roles: ['admin', 'groupe_manager', 'hotel_manager', 'comptabilite'],                                   module: 'linen',       col: 'right' },
    rgpd:        { id: 'rgpd',        icon: 'fa-user-shield',     label: 'RGPD',                       roles: ['admin'],                                                                                      module: null,          col: 'right' },
    quickactions:{ id: 'quickactions', icon: 'fa-bolt',           label: 'dashboard.quick_actions',    roles: ['admin', 'groupe_manager', 'hotel_manager', 'receptionniste', 'employee', 'rh'],               module: null,          col: 'full' }
};

function getDashboardLayout() {
    const key = 'acl_dashboard_' + (API.user?.id || 'default');
    try {
        const saved = localStorage.getItem(key);
        if (saved) return JSON.parse(saved);
    } catch(e) {}
    return null;
}

function saveDashboardLayout(layout) {
    const key = 'acl_dashboard_' + (API.user?.id || 'default');
    localStorage.setItem(key, JSON.stringify(layout));
}

function getVisibleWidgets(modules) {
    const isModuleEnabled = (mod) => !mod || (modules[mod] !== false && modules[mod] !== 'false');
    const role = API.user.role;
    const saved = getDashboardLayout();

    // Filtrer les widgets visibles pour ce role
    let available = Object.values(DASHBOARD_WIDGETS).filter(w =>
        w.roles.includes(role) && isModuleEnabled(w.module)
    );

    if (saved) {
        // Appliquer l'ordre et la visibilite sauvegardés
        const orderedLeft = [];
        const orderedRight = [];
        const orderedFull = [];

        (saved.order || []).forEach(id => {
            const widget = available.find(w => w.id === id);
            if (widget && saved.visible?.[id] !== false) {
                if (saved.columns?.[id] === 'right') orderedRight.push(widget);
                else if (saved.columns?.[id] === 'full') orderedFull.push(widget);
                else orderedLeft.push(widget);
            }
        });

        // Ajouter les widgets non presents dans la sauvegarde
        available.forEach(w => {
            if (!(saved.order || []).includes(w.id)) {
                if (w.col === 'right') orderedRight.push(w);
                else if (w.col === 'full') orderedFull.push(w);
                else orderedLeft.push(w);
            }
        });

        return { left: orderedLeft, right: orderedRight, full: orderedFull };
    }

    // Ordre par defaut
    return {
        left: available.filter(w => w.col === 'left'),
        right: available.filter(w => w.col === 'right'),
        full: available.filter(w => w.col === 'full')
    };
}

async function loadDashboard(container) {
    showLoading(container);

    try {
        const [result, modulesResult] = await Promise.all([
            API.getStats(),
            API.getModulesConfig()
        ]);

        const stats = result.stats || {};
        const recent = result.recent || {};
        const modules = modulesResult.modules || {};
        const isModuleEnabled = (mod) => modules[mod] !== false && modules[mod] !== 'false';

        const hotels = recent.hotels || [];
        const noHotels = hotels.length === 0 && API.user.role !== 'admin';

        const canManage = ['admin', 'groupe_manager', 'hotel_manager'].includes(API.user.role);
        const isRH = ['admin', 'rh'].includes(API.user.role);
        const isCompta = ['admin', 'comptabilite'].includes(API.user.role);
        const isReception = ['admin', 'groupe_manager', 'hotel_manager', 'reception', 'receptionniste'].includes(API.user.role);
        const isAdmin = API.user.role === 'admin';

        // Generer le contenu des widgets
        const widgetRenderers = {
            closures:    () => renderClosuresSection(recent.closures, stats),
            dispatch:    () => renderDispatchSection(recent.dispatch),
            maintenance: () => renderMaintenanceSection(recent.maintenance),
            tasks:       () => renderTasksSection(recent.tasks),
            hotels:      () => renderHotelsSection(hotels),
            audit:       () => renderAuditSection(recent.audits, stats),
            leaves:      () => renderLeavesSection(recent.leaves),
            evaluations: () => renderEvaluationsSection(recent.evaluations, stats),
            linen:       () => renderLinenSection(recent.linen),
            rgpd:        () => renderRgpdSection(stats),
            quickactions:() => renderQuickActions(modules, canManage, isReception)
        };

        const layout = getVisibleWidgets(modules);

        function renderWidgetColumn(widgets) {
            return widgets.map(w => {
                const renderer = widgetRenderers[w.id];
                if (!renderer) return '';
                const content = renderer();
                return `<div class="widget-card" draggable="true" data-widget="${w.id}">
                    ${content}
                </div>`;
            }).join('');
        }

        container.innerHTML = `
            ${noHotels ? renderNoHotelsState() : `
                <!-- Message de bienvenue -->
                <div class="dashboard-welcome">
                    <h2>${getTodayGreeting()} ${esc(API.user.first_name)} </h2>
                    <p class="text-muted">${getTodayDate()}</p>
                </div>

                <!-- Barre de personnalisation -->
                <div class="dashboard-customize-bar">
                    <button class="btn btn-sm btn-outline" onclick="showDashboardCustomize()">
                        <i class="fas fa-sliders-h"></i> ${t('dashboard.customize')}
                    </button>
                </div>

                <!-- Alertes importantes -->
                ${renderAlerts(stats, recent, isModuleEnabled)}

                <!-- KPIs principaux -->
                ${renderKPIs(stats, isModuleEnabled, isReception, canManage)}

                <!-- Grille principale (drag & drop) -->
                <div class="dashboard-grid">
                    <div class="dashboard-col" id="dashboard-col-left">
                        ${renderWidgetColumn(layout.left)}
                    </div>
                    <div class="dashboard-col" id="dashboard-col-right">
                        ${renderWidgetColumn(layout.right)}
                    </div>
                </div>

                <!-- Full-width widgets -->
                <div id="dashboard-col-full">
                    ${renderWidgetColumn(layout.full)}
                </div>

                <!-- Section RGPD pour admin (si pas dans les widgets) -->
            `}
        `;

        // Initialiser le drag & drop
        initDashboardDragDrop();
        updateMaintenanceBadge();

    } catch (error) {
        container.innerHTML = `<div class="card"><p class="text-danger">Erreur: ${esc(error.message)}</p></div>`;
    }
}

// === KPIs ===
function renderKPIs(stats, isModuleEnabled, isReception, canManage) {
    return `
        <div class="kpi-grid">
            <div class="kpi-card" onclick="navigateTo('hotels')">
                <div class="kpi-icon blue"><i class="fas fa-building"></i></div>
                <div><div class="kpi-value">${stats.hotels || 0}</div><div class="kpi-label">${t('dashboard.hotels')}</div></div>
            </div>
            <div class="kpi-card" onclick="navigateTo('hotels')">
                <div class="kpi-icon green"><i class="fas fa-door-open"></i></div>
                <div><div class="kpi-value">${stats.rooms || 0}</div><div class="kpi-label">${t('dashboard.rooms')}</div></div>
            </div>
            ${isModuleEnabled('maintenance') ? `
                <div class="kpi-card ${stats.maintenance_critical > 0 ? 'kpi-alert' : ''}" onclick="navigateTo('maintenance')">
                    <div class="kpi-icon orange"><i class="fas fa-wrench"></i></div>
                    <div><div class="kpi-value">${stats.maintenance_open || 0}</div><div class="kpi-label">${t('dashboard.open_tickets')}</div></div>
                    ${stats.maintenance_critical > 0 ? `<span class="kpi-badge">${stats.maintenance_critical} ${stats.maintenance_critical > 1 ? t('dashboard.urgents') : t('dashboard.urgent')}</span>` : ''}
                </div>
            ` : ''}
            ${isModuleEnabled('housekeeping') ? `
                <div class="kpi-card" onclick="navigateTo('housekeeping')">
                    <div class="kpi-icon purple"><i class="fas fa-broom"></i></div>
                    <div><div class="kpi-value">${stats.dispatch_done || 0}/${stats.dispatch_today || 0}</div><div class="kpi-label">${t('dashboard.dispatch_today')}</div></div>
                </div>
            ` : ''}
            ${isModuleEnabled('tasks') ? `
                <div class="kpi-card ${stats.tasks_overdue > 0 ? 'kpi-alert' : ''}" onclick="navigateTo('tasks')">
                    <div class="kpi-icon cyan"><i class="fas fa-tasks"></i></div>
                    <div><div class="kpi-value">${stats.tasks_pending || 0}</div><div class="kpi-label">${t('dashboard.tasks_pending')}</div></div>
                    ${stats.tasks_overdue > 0 ? `<span class="kpi-badge">${stats.tasks_overdue} ${t('dashboard.overdue')}</span>` : ''}
                </div>
            ` : ''}
            ${isModuleEnabled('leaves') ? `
                <div class="kpi-card" onclick="navigateTo('leaves')">
                    <div class="kpi-icon teal"><i class="fas fa-calendar-alt"></i></div>
                    <div><div class="kpi-value">${stats.leaves_pending || 0}</div><div class="kpi-label">${t('dashboard.leaves_pending')}</div></div>
                </div>
            ` : ''}
            ${isModuleEnabled('closures') && isReception ? `
                <div class="kpi-card ${stats.closures_pending > 0 ? 'kpi-alert' : ''}" onclick="navigateTo('closures')">
                    <div class="kpi-icon red"><i class="fas fa-cash-register"></i></div>
                    <div><div class="kpi-value">${stats.closures_pending || 0}</div><div class="kpi-label">${t('dashboard.closures_pending')}</div></div>
                    ${stats.closures_pending > 0 ? `<span class="kpi-badge">${t('dashboard.todo')}</span>` : ''}
                </div>
            ` : ''}
            ${isModuleEnabled('audit') && canManage ? `
                <div class="kpi-card" onclick="navigateTo('audit')">
                    <div class="kpi-icon indigo"><i class="fas fa-clipboard-list"></i></div>
                    <div><div class="kpi-value">${stats.audits_month || 0}</div><div class="kpi-label">${t('dashboard.audits_month')}</div></div>
                </div>
            ` : ''}
        </div>
    `;
}

// === DRAG & DROP ===
function initDashboardDragDrop() {
    document.querySelectorAll('.widget-card[draggable="true"]').forEach(card => {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
        card.addEventListener('dragover', handleDragOver);
        card.addEventListener('dragenter', handleDragEnter);
        card.addEventListener('dragleave', handleDragLeave);
        card.addEventListener('drop', handleDrop);
    });

    // Aussi les colonnes pour permettre le drop dans les zones vides
    document.querySelectorAll('.dashboard-col, #dashboard-col-full').forEach(col => {
        col.addEventListener('dragover', handleDragOver);
        col.addEventListener('drop', handleDropOnColumn);
    });
}

let dragSrcEl = null;

function handleDragStart(e) {
    dragSrcEl = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.widget);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.widget-card').forEach(c => c.classList.remove('drag-over'));
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
    if (this !== dragSrcEl && this.classList.contains('widget-card')) {
        this.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    e.stopPropagation();
    e.preventDefault();
    this.classList.remove('drag-over');

    if (dragSrcEl !== this && this.classList.contains('widget-card')) {
        const parent = this.parentNode;
        const srcParent = dragSrcEl.parentNode;

        // Echanger les positions
        const srcNext = dragSrcEl.nextElementSibling;
        parent.insertBefore(dragSrcEl, this);
        if (srcNext) {
            srcParent.insertBefore(this, srcNext);
        } else {
            srcParent.appendChild(this);
        }

        // Sauvegarder le nouvel ordre
        saveDashboardOrder();
    }
}

function handleDropOnColumn(e) {
    e.preventDefault();
    if (dragSrcEl && !e.target.classList.contains('widget-card')) {
        this.appendChild(dragSrcEl);
        saveDashboardOrder();
    }
}

function saveDashboardOrder() {
    const order = [];
    const columns = {};
    const visible = {};

    document.querySelectorAll('.widget-card').forEach(card => {
        const id = card.dataset.widget;
        if (!id) return;
        order.push(id);
        visible[id] = true;

        const parent = card.parentElement;
        if (parent.id === 'dashboard-col-right') columns[id] = 'right';
        else if (parent.id === 'dashboard-col-full') columns[id] = 'full';
        else columns[id] = 'left';
    });

    saveDashboardLayout({ order, columns, visible });
}

// === MODAL PERSONNALISATION ===
function showDashboardCustomize() {
    const role = API.user.role;
    const available = Object.values(DASHBOARD_WIDGETS).filter(w => w.roles.includes(role));
    const saved = getDashboardLayout();
    const visible = saved?.visible || {};

    // Determiner l'ordre
    let ordered = [];
    if (saved?.order) {
        saved.order.forEach(id => {
            const w = available.find(x => x.id === id);
            if (w) ordered.push(w);
        });
        available.forEach(w => {
            if (!saved.order.includes(w.id)) ordered.push(w);
        });
    } else {
        ordered = available;
    }

    const content = `
        <p class="text-muted mb-15">${t('dashboard.customize_desc')}</p>
        <div class="widget-config-modal">
            <ul class="widget-list" id="widget-config-list">
                ${ordered.map(w => {
                    const isVisible = visible[w.id] !== false;
                    return `
                        <li class="widget-item" draggable="true" data-widget-id="${w.id}">
                            <i class="fas fa-grip-vertical drag-icon"></i>
                            <input type="checkbox" id="wdg-${w.id}" ${isVisible ? 'checked' : ''} onchange="updateWidgetVisibility()">
                            <label for="wdg-${w.id}">
                                <i class="fas ${w.icon}"></i> ${typeof t === 'function' ? t(w.label) : w.label}
                            </label>
                        </li>
                    `;
                }).join('')}
            </ul>
        </div>
        <div class="form-actions mt-15" style="display:flex;gap:8px;justify-content:space-between">
            <button class="btn btn-sm btn-outline" onclick="resetDashboardLayout()">${t('dashboard.reset_layout')}</button>
            <button class="btn btn-sm btn-primary" onclick="applyWidgetConfig()">${t('common.save')}</button>
        </div>
    `;

    openModal(t('dashboard.customize_title'), content);

    // Drag & drop dans la modale
    setTimeout(() => {
        const list = document.getElementById('widget-config-list');
        if (!list) return;
        let dragItem = null;

        list.querySelectorAll('.widget-item').forEach(item => {
            item.addEventListener('dragstart', function(e) {
                dragItem = this;
                this.style.opacity = '0.5';
                e.dataTransfer.effectAllowed = 'move';
            });
            item.addEventListener('dragend', function() {
                this.style.opacity = '1';
            });
            item.addEventListener('dragover', function(e) { e.preventDefault(); });
            item.addEventListener('drop', function(e) {
                e.preventDefault();
                if (dragItem !== this) {
                    const items = [...list.children];
                    const from = items.indexOf(dragItem);
                    const to = items.indexOf(this);
                    if (from < to) this.after(dragItem);
                    else this.before(dragItem);
                }
            });
        });
    }, 100);
}

function applyWidgetConfig() {
    const list = document.getElementById('widget-config-list');
    if (!list) return;

    const order = [];
    const visible = {};
    const saved = getDashboardLayout() || {};

    list.querySelectorAll('.widget-item').forEach(item => {
        const id = item.dataset.widgetId;
        const checkbox = item.querySelector('input[type="checkbox"]');
        order.push(id);
        visible[id] = checkbox.checked;
    });

    saveDashboardLayout({ order, columns: saved.columns || {}, visible });
    closeModal();
    navigateTo('dashboard');
}

function updateWidgetVisibility() {
    // Appele en temps reel quand on coche/decoche
}

function resetDashboardLayout() {
    const key = 'acl_dashboard_' + (API.user?.id || 'default');
    localStorage.removeItem(key);
    closeModal();
    navigateTo('dashboard');
}

// === GREETING ===
function getTodayGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return t('dashboard.greeting_morning');
    if (hour < 18) return t('dashboard.greeting_afternoon');
    return t('dashboard.greeting_evening');
}

function getTodayDate() {
    const lang = (typeof I18N !== 'undefined') ? I18N.currentLang : 'fr';
    const locale = lang === 'es' ? 'es-ES' : lang === 'en' ? 'en-GB' : 'fr-FR';
    return new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// === ALERTS ===
function renderAlerts(stats, recent, isModuleEnabled) {
    const alerts = [];

    if (isModuleEnabled('closures') && stats.closures_late > 0) {
        alerts.push({
            type: 'danger', icon: 'fa-exclamation-triangle',
            title: t('alert.closures_late'),
            message: `${stats.closures_late} ${t('alert.closures_late_msg')}`,
            action: { label: t('common.view_all'), onclick: "navigateTo('closures')" }
        });
    }
    if (isModuleEnabled('maintenance') && stats.maintenance_critical > 0) {
        alerts.push({
            type: 'warning', icon: 'fa-wrench',
            title: t('alert.maintenance_urgent'),
            message: `${stats.maintenance_critical} ${t('alert.maintenance_urgent_msg')}`,
            action: { label: t('common.view_all'), onclick: "navigateTo('maintenance')" }
        });
    }
    if (isModuleEnabled('tasks') && stats.tasks_overdue > 0) {
        alerts.push({
            type: 'warning', icon: 'fa-clock',
            title: t('alert.tasks_overdue'),
            message: `${stats.tasks_overdue} ${t('alert.tasks_overdue_msg')}`,
            action: { label: t('common.view_all'), onclick: "navigateTo('tasks')" }
        });
    }
    if (API.user.role === 'admin' && stats.rgpd_pending > 0) {
        alerts.push({
            type: 'info', icon: 'fa-user-shield',
            title: t('alert.rgpd_pending'),
            message: `${stats.rgpd_pending} ${t('alert.rgpd_pending_msg')}`,
            action: { label: t('common.manage'), onclick: "navigateTo('rgpd-admin')" }
        });
    }

    if (alerts.length === 0) return '';

    return `
        <div class="dashboard-alerts">
            ${alerts.map(a => `
                <div class="alert alert-${a.type} alert-dismissible">
                    <i class="fas ${a.icon}"></i>
                    <div class="alert-content">
                        <strong>${esc(a.title)}</strong>
                        <span>${esc(a.message)}</span>
                    </div>
                    ${a.action ? `<button class="btn btn-sm btn-${a.type}" onclick="${a.action.onclick}">${esc(a.action.label)}</button>` : ''}
                </div>
            `).join('')}
        </div>
    `;
}

function renderNoHotelsState() {
    return `
        <div class="card">
            <div class="empty-state">
                <i class="fas fa-building"></i>
                <h3>${t('dashboard.no_hotels')}</h3>
                <p>${t('dashboard.no_hotels_desc')}</p>
            </div>
        </div>
    `;
}

// ==================== WIDGET SECTIONS ====================

function renderClosuresSection(closures, stats) {
    const items = closures || [];
    const pendingCount = stats.closures_pending || 0;

    return `
        <div class="card ${pendingCount > 0 ? 'card-alert' : ''}">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-grip-vertical drag-handle"></i> <i class="fas fa-cash-register"></i> ${t('dashboard.recent_closures')}
                    ${pendingCount > 0 ? `<span class="badge badge-danger ml-10">${pendingCount} ${t('status.pending').toLowerCase()}</span>` : ''}
                </h3>
                <button class="btn btn-sm btn-outline" onclick="navigateTo('closures')">${t('common.view_all')}</button>
            </div>
            <div class="card-body">
                ${pendingCount > 0 ? `
                    <div class="closure-alert mb-15">
                        <i class="fas fa-exclamation-circle text-danger"></i>
                        <span><strong>${pendingCount}</strong> ${t('dashboard.closures_pending').toLowerCase()}</span>
                        <button class="btn btn-sm btn-primary" onclick="navigateTo('closures')">${t('common.manage')}</button>
                    </div>
                ` : ''}
                ${items.length ? `
                    <div class="closures-mini-list">
                        ${items.slice(0, 4).map(c => `
                            <div class="closure-mini-item">
                                <div class="closure-date"><i class="fas fa-calendar"></i> ${formatDate(c.closure_date)}</div>
                                <div class="closure-hotel">${esc(c.hotel_name)}</div>
                                <div class="closure-amount">
                                    <span class="text-success">+${formatMoney(c.cash_received)}</span>
                                    <span class="text-danger">-${formatMoney(c.cash_spent)}</span>
                                </div>
                                <span class="badge badge-${c.status === 'validated' ? 'success' : c.status === 'submitted' ? 'warning' : 'secondary'}">
                                    ${t('status.' + (c.status || 'draft'))}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                ` : `<p class="text-muted text-center py-10">${t('common.none')}</p>`}
                <div class="closure-summary mt-15">
                    <div class="summary-item">
                        <span class="summary-label">Solde caisse</span>
                        <span class="summary-value">${formatMoney(stats.cash_balance || 0)}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderAuditSection(audits, stats) {
    const items = audits || [];
    return `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-grip-vertical drag-handle"></i> <i class="fas fa-clipboard-list"></i> Audits</h3>
                <button class="btn btn-sm btn-outline" onclick="navigateTo('audit')">${t('common.view_all')}</button>
            </div>
            <div class="card-body">
                <div class="audit-summary mb-15">
                    <div class="audit-stat">
                        <div class="audit-stat-value">${stats.audits_month || 0}</div>
                        <div class="audit-stat-label">${t('dashboard.audits_month')}</div>
                    </div>
                    <div class="audit-stat">
                        <div class="audit-stat-value">${stats.audits_avg_score ? parseFloat(stats.audits_avg_score).toFixed(0) + '%' : '-'}</div>
                        <div class="audit-stat-label">Score</div>
                    </div>
                </div>
                ${items.length ? `
                    <div class="audits-mini-list">
                        ${items.slice(0, 3).map(a => {
                            const score = a.score_percentage ? parseFloat(a.score_percentage) : null;
                            return `
                            <div class="audit-mini-item">
                                <div class="audit-info">
                                    <div class="audit-title">${esc(a.grid_name || 'Audit')}</div>
                                    <div class="audit-meta">${esc(a.hotel_name)} · ${formatDate(a.completed_at || a.created_at)}</div>
                                </div>
                                <div class="audit-score ${getScoreClass(score)}">${score !== null ? score.toFixed(0) + '%' : '-'}</div>
                            </div>
                        `}).join('')}
                    </div>
                ` : `<p class="text-muted text-center py-10">${t('common.none')}</p>`}
            </div>
        </div>
    `;
}

function renderRgpdSection(stats) {
    return `
        <div class="card mt-20">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-grip-vertical drag-handle"></i> <i class="fas fa-user-shield"></i> RGPD</h3>
                <button class="btn btn-sm btn-outline" onclick="navigateTo('rgpd-admin')">${t('common.manage')}</button>
            </div>
            <div class="card-body">
                <div class="rgpd-summary">
                    <div class="rgpd-stat ${stats.rgpd_pending > 0 ? 'has-pending' : ''}">
                        <i class="fas fa-inbox"></i>
                        <div class="rgpd-stat-value">${stats.rgpd_pending || 0}</div>
                        <div class="rgpd-stat-label">${t('status.pending')}</div>
                    </div>
                    <div class="rgpd-stat">
                        <i class="fas fa-check-circle"></i>
                        <div class="rgpd-stat-value">${stats.rgpd_completed || 0}</div>
                        <div class="rgpd-stat-label">${t('status.completed')}</div>
                    </div>
                    <div class="rgpd-stat">
                        <i class="fas fa-users"></i>
                        <div class="rgpd-stat-value">${stats.users_with_consent || 0}%</div>
                        <div class="rgpd-stat-label">Conformes</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderDispatchSection(dispatch) {
    const items = dispatch || [];
    return `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-grip-vertical drag-handle"></i> <i class="fas fa-broom"></i> ${t('dashboard.dispatch_today')}</h3>
                <button class="btn btn-sm btn-outline" onclick="navigateTo('housekeeping')">${t('common.view_all')}</button>
            </div>
            ${items.length ? `
                <div class="dispatch-mini-list">
                    ${items.slice(0, 6).map(d => `
                        <div class="dispatch-mini-item ${d.status}">
                            <span class="room-badge">${d.room_number}</span>
                            <span class="hotel-name">${esc(d.hotel_name)}</span>
                            <span class="assigned">${esc(d.assigned_name) || '-'}</span>
                            <span class="status-dot ${d.status}" title="${LABELS.status[d.status] || d.status}"></span>
                        </div>
                    `).join('')}
                </div>
                ${items.length > 6 ? `<p class="text-muted text-center mt-10">+ ${items.length - 6}</p>` : ''}
            ` : `<p class="text-muted text-center py-20">${t('common.none')}</p>`}
        </div>
    `;
}

function renderMaintenanceSection(tickets) {
    const items = tickets || [];
    return `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-grip-vertical drag-handle"></i> <i class="fas fa-wrench"></i> ${t('dashboard.recent_tickets')}</h3>
                <button class="btn btn-sm btn-outline" onclick="navigateTo('maintenance')">${t('common.view_all')}</button>
            </div>
            ${items.length ? `
                <table class="table-compact">
                    <tbody>
                        ${items.map(tk => `
                            <tr onclick="navigateTo('maintenance')" style="cursor:pointer">
                                <td><strong>#${tk.id}</strong></td>
                                <td>${esc(tk.hotel_name)}</td>
                                <td>${LABELS.maintenance_cat?.[tk.category] || esc(tk.category)}</td>
                                <td>${priorityBadge(tk.priority)}</td>
                                <td>${statusBadge(tk.status)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            ` : `<p class="text-muted text-center py-20">${t('common.none')}</p>`}
        </div>
    `;
}

function renderTasksSection(tasks) {
    const items = tasks || [];
    return `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-grip-vertical drag-handle"></i> <i class="fas fa-tasks"></i> ${t('dashboard.my_tasks')}</h3>
                <button class="btn btn-sm btn-outline" onclick="navigateTo('tasks')">${t('common.view_all')}</button>
            </div>
            ${items.length ? `
                <div class="tasks-mini-list">
                    ${items.slice(0, 5).map(task => {
                        const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
                        return `
                            <div class="task-mini-item ${isOverdue ? 'overdue' : ''}" onclick="navigateTo('tasks')">
                                <span class="task-priority priority-${task.priority}"></span>
                                <div class="task-content">
                                    <div class="task-title">${esc(task.title)}</div>
                                    <div class="task-meta">
                                        ${task.due_date ? `<span class="${isOverdue ? 'text-danger' : ''}"><i class="fas fa-clock"></i> ${formatDate(task.due_date)}</span>` : ''}
                                    </div>
                                </div>
                                <span class="badge badge-${task.status === 'done' ? 'success' : task.status === 'in_progress' ? 'warning' : 'secondary'}">
                                    ${LABELS.status[task.status] || task.status}
                                </span>
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : `<p class="text-muted text-center py-20">${t('common.none')}</p>`}
        </div>
    `;
}

function renderHotelsSection(hotels) {
    const items = hotels || [];
    return `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-grip-vertical drag-handle"></i> <i class="fas fa-building"></i> ${t('dashboard.my_hotels')}</h3>
                ${['admin', 'groupe_manager'].includes(API.user.role) ? `
                    <button class="btn btn-sm btn-outline" onclick="navigateTo('hotels')">${t('common.manage')}</button>
                ` : ''}
            </div>
            ${items.length ? `
                <div class="hotels-mini-list">
                    ${items.slice(0, 4).map(h => `
                        <div class="hotel-mini-item" onclick="navigateTo('hotels')">
                            <div class="hotel-avatar"><i class="fas fa-hotel"></i></div>
                            <div class="hotel-info">
                                <div class="hotel-name-row">
                                    <span class="hotel-name">${esc(h.name)}</span>
                                </div>
                                <div class="hotel-meta">${esc(h.city) || '-'} · ${h.room_count || 0} ${t('dashboard.rooms').toLowerCase()}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : `<p class="text-muted text-center py-20">${t('common.none')}</p>`}
        </div>
    `;
}

function renderLeavesSection(leaves) {
    const items = leaves || [];
    return `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-grip-vertical drag-handle"></i> <i class="fas fa-calendar-alt"></i> ${t('dashboard.recent_leaves')}</h3>
                <button class="btn btn-sm btn-outline" onclick="navigateTo('leaves')">${t('common.view_all')}</button>
            </div>
            ${items.length ? `
                <div class="leaves-mini-list">
                    ${items.slice(0, 4).map(l => `
                        <div class="leave-mini-item">
                            <div class="leave-avatar">${l.employee_name ? l.employee_name.charAt(0).toUpperCase() : '?'}</div>
                            <div class="leave-content">
                                <div class="leave-name">${esc(l.employee_name)}</div>
                                <div class="leave-dates">${formatDate(l.start_date)} → ${formatDate(l.end_date)}</div>
                            </div>
                            <span class="badge badge-${l.status === 'pending' ? 'warning' : l.status === 'approved' ? 'success' : 'danger'}">
                                ${LABELS.status[l.status] || l.status}
                            </span>
                        </div>
                    `).join('')}
                </div>
            ` : `<p class="text-muted text-center py-20">${t('common.none')}</p>`}
        </div>
    `;
}

function renderEvaluationsSection(evaluations, stats) {
    const items = evaluations || [];
    return `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-grip-vertical drag-handle"></i> <i class="fas fa-clipboard-check"></i> Evaluations</h3>
                <button class="btn btn-sm btn-outline" onclick="navigateTo('evaluations')">${t('common.view_all')}</button>
            </div>
            <div class="eval-summary">
                <div class="eval-stat">
                    <div class="eval-stat-value">${stats.evaluations_month || 0}</div>
                    <div class="eval-stat-label">${t('dashboard.audits_month')}</div>
                </div>
            </div>
            ${items.length ? `
                <div class="evaluations-mini-list">
                    ${items.slice(0, 3).map(e => {
                        const score = e.score_weighted || e.score_simple || null;
                        const maxScore = e.score_weighted ? 100 : 10;
                        return `
                            <div class="eval-mini-item">
                                <div class="eval-avatar">${e.employee_name ? e.employee_name.charAt(0).toUpperCase() : '?'}</div>
                                <div class="eval-content">
                                    <div class="eval-employee">${esc(e.employee_name || 'Employe')}</div>
                                    <div class="eval-meta">${esc(e.grid_name || 'Grille')} · ${formatDate(e.evaluation_date)}</div>
                                </div>
                                <div class="eval-score ${getScoreClass(score)}">${score ? score.toFixed(1) : '-'}/${maxScore}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : `<p class="text-muted text-center py-10">${t('common.none')}</p>`}
        </div>
    `;
}

function renderLinenSection(linen) {
    const items = linen || [];
    return `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-grip-vertical drag-handle"></i> <i class="fas fa-tshirt"></i> ${t('dashboard.laundry')}</h3>
                <button class="btn btn-sm btn-outline" onclick="navigateTo('linen')">${t('common.view_all')}</button>
            </div>
            ${items.length ? `
                <div class="linen-mini-list">
                    ${items.slice(0, 4).map(l => `
                        <div class="linen-mini-item">
                            <span class="linen-type ${l.transaction_type}">
                                <i class="fas fa-${l.transaction_type === 'collecte' ? 'arrow-up' : 'arrow-down'}"></i>
                                ${l.transaction_type === 'collecte' ? 'Collecte' : 'Reception'}
                            </span>
                            <span class="linen-hotel">${esc(l.hotel_name)}</span>
                            <span class="linen-date">${formatDate(l.transaction_date)}</span>
                        </div>
                    `).join('')}
                </div>
            ` : `<p class="text-muted text-center py-20">${t('common.none')}</p>`}
        </div>
    `;
}

function renderQuickActions(modules, canManage, isReception) {
    const actions = [];
    const isEnabled = (mod) => modules[mod] !== false && modules[mod] !== 'false';

    if (isEnabled('closures') && isReception) actions.push({ icon: 'fa-cash-register', label: t('dashboard.recent_closures'), color: 'red', onclick: "navigateTo('closures')" });
    if (isEnabled('maintenance')) actions.push({ icon: 'fa-plus-circle', label: t('maintenance.new_ticket'), color: 'orange', onclick: "navigateTo('maintenance')" });
    if (isEnabled('housekeeping') && canManage) actions.push({ icon: 'fa-broom', label: t('nav.housekeeping'), color: 'purple', onclick: "navigateTo('housekeeping')" });
    if (isEnabled('audit') && canManage) actions.push({ icon: 'fa-clipboard-list', label: 'Audit', color: 'indigo', onclick: "navigateTo('audit')" });
    if (isEnabled('tasks')) actions.push({ icon: 'fa-tasks', label: t('dashboard.my_tasks'), color: 'cyan', onclick: "navigateTo('tasks')" });
    if (isEnabled('leaves')) actions.push({ icon: 'fa-calendar-plus', label: t('nav.leaves'), color: 'teal', onclick: "navigateTo('leaves')" });
    if (isEnabled('evaluations') && canManage) actions.push({ icon: 'fa-user-check', label: t('nav.evaluations'), color: 'green', onclick: "navigateTo('evaluations')" });

    if (actions.length === 0) return '';

    return `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-bolt"></i> ${t('dashboard.quick_actions')}</h3>
            </div>
            <div class="quick-actions">
                ${actions.map(a => `
                    <a href="#" class="quick-action ${a.color || ''}" onclick="event.preventDefault();${a.onclick}">
                        <i class="fas ${a.icon}"></i>
                        <span>${esc(a.label)}</span>
                    </a>
                `).join('')}
            </div>
        </div>
    `;
}

// ==================== HELPERS ====================
function getScoreClass(score) {
    if (!score) return '';
    if (score >= 80) return 'score-excellent';
    if (score >= 60) return 'score-good';
    if (score >= 40) return 'score-average';
    return 'score-low';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const lang = (typeof I18N !== 'undefined') ? I18N.currentLang : 'fr';
    const locale = lang === 'es' ? 'es-ES' : lang === 'en' ? 'en-GB' : 'fr-FR';
    const d = new Date(dateStr);
    return d.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
}

function formatMoney(amount) {
    return parseFloat(amount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20AC';
}
