/**
 * Settings Page - Gestion des permissions, modules et notifications (Admin only)
 * Interface à onglets
 */

// Définition des modules du système
const SYSTEM_MODULES = {
    'dashboard': { name: 'Dashboard', icon: 'fa-th-large', description: 'Tableau de bord et statistiques', core: true },
    'hotels': { name: 'Hôtels', icon: 'fa-building', description: 'Gestion des établissements et chambres', core: true },
    'housekeeping': { name: 'Gouvernante', icon: 'fa-broom', description: 'Dispatch et contrôle des chambres' },
    'maintenance': { name: 'Maintenance', icon: 'fa-wrench', description: 'Tickets et suivi des interventions' },
    'tasks': { name: 'Tâches', icon: 'fa-tasks', description: 'Tableaux Kanban et gestion des tâches' },
    'evaluations': { name: 'Évaluations', icon: 'fa-clipboard-check', description: 'Grilles d\'évaluation du personnel' },
    'audit': { name: 'Audits', icon: 'fa-search', description: 'Audits qualité et conformité des hôtels' },
    'linen': { name: 'Blanchisserie', icon: 'fa-tshirt', description: 'Gestion du linge et collectes' },
    'leaves': { name: 'Congés', icon: 'fa-calendar-alt', description: 'Demandes et validation des congés' },
    'closures': { name: 'Clôtures & Remises', icon: 'fa-cash-register', description: 'Clôtures journalières et suivi caisse' },
    'messages': { name: 'Messagerie', icon: 'fa-envelope', description: 'Communication interne' },
    'users': { name: 'Utilisateurs', icon: 'fa-users', description: 'Gestion des comptes utilisateurs', core: true },
    'settings': { name: 'Paramètres', icon: 'fa-cog', description: 'Configuration du système', core: true, adminOnly: true }
};

const PERMISSION_LABELS = {
    'hotels.view': 'Voir les hôtels',
    'hotels.create': 'Créer un hôtel',
    'hotels.edit': 'Modifier un hôtel',
    'hotels.delete': 'Supprimer un hôtel',
    'rooms.manage': 'Gérer les chambres',
    'users.view': 'Voir les utilisateurs',
    'users.manage': 'Gérer les utilisateurs',
    'dispatch.view': 'Voir le dispatch',
    'dispatch.create': 'Créer dispatch chambres',
    'dispatch.complete': 'Marquer chambre nettoyée',
    'dispatch.control': 'Contrôle qualité',
    'linen.view': 'Voir la blanchisserie',
    'linen.manage': 'Saisir collecte/réception',
    'linen.config': 'Configurer blanchisserie',
    'leaves.view': 'Voir les congés',
    'leaves.create': 'Créer demande congés',
    'leaves.validate': 'Valider/Refuser congés',
    'leaves.manage_all': 'Gérer tous les congés',
    'maintenance.view': 'Voir la maintenance',
    'maintenance.create': 'Créer ticket maintenance',
    'maintenance.manage': 'Gérer les tickets',
    'maintenance.comment': 'Commenter les tickets',
    'tasks.view': 'Voir les tableaux tâches',
    'tasks.create': 'Créer tableaux/tâches',
    'tasks.manage': 'Gérer les tâches',
    'tasks.assign': 'Assigner des tâches',
    'evaluations.view': 'Accès module évaluations',
    'evaluations.view_team': 'Voir évaluations équipe',
    'evaluations.grids': 'Gérer les grilles',
    'evaluations.evaluate': 'Réaliser évaluations',
    'evaluations.view_own': 'Voir ses évaluations',
    'audit.view': 'Voir les audits',
    'audit.grids': 'Gérer les grilles d\'audit',
    'audit.execute': 'Réaliser des audits',
    'audit.view_results': 'Voir résultats audits',
    'revenue.view': 'Voir veille tarifaire',
    'revenue.settings': 'Configurer concurrents',
    'revenue.fetch_rates': 'Actualiser tarifs',
    'closures.view': 'Voir le suivi caisse',
    'closures.create': 'Créer clôtures journalières',
    'closures.validate': 'Valider les clôtures',
    'closures.edit_all': 'Modifier toutes les données',
    'closures.add_remise': 'Ajouter remise banque',
    'closures.add_comment': 'Ajouter commentaires',
    'messages.access': 'Accès messagerie',
    'messages.broadcast': 'Envoyer à tous',
    'notifications.receive': 'Recevoir notifications',
    'notifications.manage': 'Gérer les notifications',
    'dashboard.view': 'Voir dashboard',
    'dashboard.global': 'Dashboard multi-hôtels',
    'reports.access': 'Accès aux rapports',
    'reports.export': 'Exporter les données',
    'permissions.manage': 'Gérer les permissions'
};

const PERMISSION_CATEGORIES = {
    'Hôtels & Chambres': ['hotels.view', 'hotels.create', 'hotels.edit', 'hotels.delete', 'rooms.manage'],
    'Utilisateurs': ['users.view', 'users.manage'],
    'Gouvernante': ['dispatch.view', 'dispatch.create', 'dispatch.complete', 'dispatch.control'],
    'Blanchisserie': ['linen.view', 'linen.manage', 'linen.config'],
    'Congés': ['leaves.view', 'leaves.create', 'leaves.validate', 'leaves.manage_all'],
    'Maintenance': ['maintenance.view', 'maintenance.create', 'maintenance.manage', 'maintenance.comment'],
    'Tâches (Kanban)': ['tasks.view', 'tasks.create', 'tasks.manage', 'tasks.assign'],
    'Évaluations': ['evaluations.view', 'evaluations.view_team', 'evaluations.grids', 'evaluations.evaluate', 'evaluations.view_own'],
    'Audits': ['audit.view', 'audit.grids', 'audit.execute', 'audit.view_results'],
    'Revenue Management': ['revenue.view', 'revenue.settings', 'revenue.fetch_rates'],
    'Clôtures & Caisse': ['closures.view', 'closures.create', 'closures.validate', 'closures.edit_all', 'closures.add_remise', 'closures.add_comment'],
    'Communication': ['messages.access', 'messages.broadcast', 'notifications.receive', 'notifications.manage'],
    'Dashboard & Rapports': ['dashboard.view', 'dashboard.global', 'reports.access', 'reports.export'],
    'Administration': ['permissions.manage']
};

const ROLE_LABELS = {
    'admin': 'Administrateur',
    'groupe_manager': 'Resp. Groupe',
    'hotel_manager': 'Resp. Hôtel',
    'comptabilite': 'Comptabilité',
    'rh': 'Ressources Humaines',
    'receptionniste': 'Réceptionniste',
    'employee': 'Employé'
};

const ROLE_DESCRIPTIONS = {
    'admin': 'Accès complet à toutes les fonctionnalités du système',
    'groupe_manager': 'Supervise plusieurs hôtels, valide congés, gère le personnel',
    'hotel_manager': 'Gère un hôtel : dispatch, contrôle, maintenance, équipe',
    'comptabilite': 'Accès rapports financiers, exports, suivi caisse complet',
    'rh': 'Gestion RH : congés, évaluations, suivi du personnel',
    'receptionniste': 'Réception : clôtures, gouvernante, maintenance, blanchisserie, tâches, audits',
    'employee': 'Accès limité : ses tâches, congés, maintenance, messagerie'
};

const ROLE_ICONS = {
    'admin': 'fa-crown',
    'groupe_manager': 'fa-building',
    'hotel_manager': 'fa-hotel',
    'comptabilite': 'fa-calculator',
    'rh': 'fa-users-cog',
    'receptionniste': 'fa-concierge-bell',
    'employee': 'fa-user'
};

// Permissions par défaut pour chaque rôle
const DEFAULT_PERMISSIONS = {
    'groupe_manager': {
        'hotels.view': true, 'hotels.create': false, 'hotels.edit': true, 'hotels.delete': false, 'rooms.manage': true,
        'users.view': true, 'users.manage': true,
        'dispatch.view': true, 'dispatch.create': true, 'dispatch.complete': true, 'dispatch.control': true,
        'linen.view': true, 'linen.manage': true, 'linen.config': true,
        'leaves.view': true, 'leaves.create': true, 'leaves.validate': true, 'leaves.manage_all': true,
        'maintenance.view': true, 'maintenance.create': true, 'maintenance.manage': true, 'maintenance.comment': true,
        'tasks.view': true, 'tasks.create': true, 'tasks.manage': true, 'tasks.assign': true,
        'evaluations.view': true, 'evaluations.view_team': true, 'evaluations.grids': true, 'evaluations.evaluate': true, 'evaluations.view_own': true,
        'audit.view': true, 'audit.grids': true, 'audit.execute': true, 'audit.view_results': true,
        'closures.view': true, 'closures.create': true, 'closures.validate': true, 'closures.edit_all': true, 'closures.add_remise': true, 'closures.add_comment': true,
        'messages.access': true, 'messages.broadcast': true, 'notifications.receive': true, 'notifications.manage': true,
        'dashboard.view': true, 'dashboard.global': true, 'reports.access': true, 'reports.export': true,
        'permissions.manage': false
    },
    'hotel_manager': {
        'hotels.view': true, 'hotels.create': false, 'hotels.edit': true, 'hotels.delete': false, 'rooms.manage': true,
        'users.view': true, 'users.manage': true,
        'dispatch.view': true, 'dispatch.create': true, 'dispatch.complete': true, 'dispatch.control': true,
        'linen.view': true, 'linen.manage': true, 'linen.config': false,
        'leaves.view': true, 'leaves.create': true, 'leaves.validate': true, 'leaves.manage_all': false,
        'maintenance.view': true, 'maintenance.create': true, 'maintenance.manage': true, 'maintenance.comment': true,
        'tasks.view': true, 'tasks.create': true, 'tasks.manage': true, 'tasks.assign': true,
        'evaluations.view': true, 'evaluations.view_team': true, 'evaluations.grids': false, 'evaluations.evaluate': true, 'evaluations.view_own': true,
        'audit.view': true, 'audit.grids': false, 'audit.execute': true, 'audit.view_results': true,
        'closures.view': true, 'closures.create': true, 'closures.validate': false, 'closures.edit_all': false, 'closures.add_remise': true, 'closures.add_comment': true,
        'messages.access': true, 'messages.broadcast': false, 'notifications.receive': true, 'notifications.manage': true,
        'dashboard.view': true, 'dashboard.global': false, 'reports.access': true, 'reports.export': true,
        'permissions.manage': false
    },
    'comptabilite': {
        'hotels.view': true, 'hotels.create': false, 'hotels.edit': false, 'hotels.delete': false, 'rooms.manage': false,
        'users.view': true, 'users.manage': false,
        'dispatch.view': true, 'dispatch.create': false, 'dispatch.complete': false, 'dispatch.control': false,
        'linen.view': true, 'linen.manage': true, 'linen.config': false,
        'leaves.view': true, 'leaves.create': true, 'leaves.validate': false, 'leaves.manage_all': false,
        'maintenance.view': true, 'maintenance.create': false, 'maintenance.manage': false, 'maintenance.comment': false,
        'tasks.view': true, 'tasks.create': false, 'tasks.manage': false, 'tasks.assign': false,
        'evaluations.view': false, 'evaluations.view_team': false, 'evaluations.grids': false, 'evaluations.evaluate': false, 'evaluations.view_own': true,
        'audit.view': true, 'audit.grids': false, 'audit.execute': false, 'audit.view_results': true,
        'closures.view': true, 'closures.create': false, 'closures.validate': true, 'closures.edit_all': true, 'closures.add_remise': true, 'closures.add_comment': true,
        'messages.access': true, 'messages.broadcast': false, 'notifications.receive': true, 'notifications.manage': false,
        'dashboard.view': true, 'dashboard.global': true, 'reports.access': true, 'reports.export': true,
        'permissions.manage': false
    },
    'rh': {
        'hotels.view': true, 'hotels.create': false, 'hotels.edit': false, 'hotels.delete': false, 'rooms.manage': false,
        'users.view': true, 'users.manage': true,
        'dispatch.view': false, 'dispatch.create': false, 'dispatch.complete': false, 'dispatch.control': false,
        'linen.view': false, 'linen.manage': false, 'linen.config': false,
        'leaves.view': true, 'leaves.create': true, 'leaves.validate': true, 'leaves.manage_all': true,
        'maintenance.view': false, 'maintenance.create': false, 'maintenance.manage': false, 'maintenance.comment': false,
        'tasks.view': true, 'tasks.create': true, 'tasks.manage': true, 'tasks.assign': true,
        'evaluations.view': true, 'evaluations.view_team': true, 'evaluations.grids': true, 'evaluations.evaluate': true, 'evaluations.view_own': true,
        'audit.view': false, 'audit.grids': false, 'audit.execute': false, 'audit.view_results': false,
        'closures.view': false, 'closures.create': false, 'closures.validate': false, 'closures.edit_all': false, 'closures.add_remise': false, 'closures.add_comment': false,
        'messages.access': true, 'messages.broadcast': true, 'notifications.receive': true, 'notifications.manage': false,
        'dashboard.view': true, 'dashboard.global': true, 'reports.access': true, 'reports.export': true,
        'permissions.manage': false
    },
    'receptionniste': {
        'hotels.view': true, 'hotels.create': false, 'hotels.edit': false, 'hotels.delete': false, 'rooms.manage': false,
        'users.view': false, 'users.manage': false,
        'dispatch.view': true, 'dispatch.create': true, 'dispatch.complete': true, 'dispatch.control': true,
        'linen.view': true, 'linen.manage': true, 'linen.config': false,
        'leaves.view': true, 'leaves.create': true, 'leaves.validate': false, 'leaves.manage_all': false,
        'maintenance.view': true, 'maintenance.create': true, 'maintenance.manage': false, 'maintenance.comment': true,
        'tasks.view': true, 'tasks.create': true, 'tasks.manage': false, 'tasks.assign': false,
        'evaluations.view': false, 'evaluations.view_team': false, 'evaluations.grids': false, 'evaluations.evaluate': false, 'evaluations.view_own': true,
        'audit.view': true, 'audit.grids': false, 'audit.execute': true, 'audit.view_results': true,
        'closures.view': true, 'closures.create': true, 'closures.validate': false, 'closures.edit_all': false, 'closures.add_remise': true, 'closures.add_comment': true,
        'messages.access': true, 'messages.broadcast': false, 'notifications.receive': true, 'notifications.manage': false,
        'dashboard.view': true, 'dashboard.global': false, 'reports.access': false, 'reports.export': false,
        'permissions.manage': false
    },
    'employee': {
        'hotels.view': true, 'hotels.create': false, 'hotels.edit': false, 'hotels.delete': false, 'rooms.manage': false,
        'users.view': false, 'users.manage': false,
        'dispatch.view': true, 'dispatch.create': false, 'dispatch.complete': true, 'dispatch.control': false,
        'linen.view': true, 'linen.manage': true, 'linen.config': false,
        'leaves.view': true, 'leaves.create': true, 'leaves.validate': false, 'leaves.manage_all': false,
        'maintenance.view': true, 'maintenance.create': true, 'maintenance.manage': false, 'maintenance.comment': true,
        'tasks.view': true, 'tasks.create': false, 'tasks.manage': false, 'tasks.assign': false,
        'evaluations.view': false, 'evaluations.view_team': false, 'evaluations.grids': false, 'evaluations.evaluate': false, 'evaluations.view_own': true,
        'audit.view': false, 'audit.grids': false, 'audit.execute': false, 'audit.view_results': false,
        'closures.view': true, 'closures.create': false, 'closures.validate': false, 'closures.edit_all': false, 'closures.add_remise': false, 'closures.add_comment': false,
        'messages.access': true, 'messages.broadcast': false, 'notifications.receive': true, 'notifications.manage': false,
        'dashboard.view': true, 'dashboard.global': false, 'reports.access': false, 'reports.export': false,
        'permissions.manage': false
    }
};

let currentPermissions = {};
let currentModules = {};
let _settingsActiveTab = 'modules';

async function loadSettings(container) {
    if (API.user.role !== 'admin') {
        container.innerHTML = '<div class="card"><p class="text-danger">' + t('settings.admin_only') + '</p></div>';
        return;
    }

    showLoading(container);

    try {
        const [permResult, modulesResult] = await Promise.all([
            API.getAllPermissions(),
            API.getModulesConfig()
        ]);

        currentPermissions = permResult.permissions || {};
        currentModules = modulesResult.modules || {};

        // Initialiser modules par défaut (tous actifs) SEULEMENT si undefined
        for (const moduleId of Object.keys(SYSTEM_MODULES)) {
            if (currentModules[moduleId] === undefined) {
                currentModules[moduleId] = true;
            }
        }

        // Initialiser permissions par défaut
        for (const role of Object.keys(DEFAULT_PERMISSIONS)) {
            if (!currentPermissions[role]) {
                currentPermissions[role] = { ...DEFAULT_PERMISSIONS[role] };
            }
        }

        container.innerHTML = `
            <div class="page-header">
                <div>
                    <h2><i class="fas fa-cog"></i> Paramètres</h2>
                    <p class="text-muted">Configuration du système, permissions et notifications</p>
                </div>
            </div>

            <div class="settings-tabs">
                <button class="settings-tab active" data-tab="modules" onclick="switchSettingsTab('modules')">
                    <i class="fas fa-puzzle-piece"></i> Modules
                </button>
                <button class="settings-tab" data-tab="permissions" onclick="switchSettingsTab('permissions')">
                    <i class="fas fa-shield-alt"></i> Permissions
                </button>
                <button class="settings-tab" data-tab="notifications" onclick="switchSettingsTab('notifications')">
                    <i class="fas fa-bell"></i> Notifications
                </button>
            </div>

            <div id="settings-tab-content"></div>
        `;

        injectSettingsStyles();
        switchSettingsTab(_settingsActiveTab);
    } catch (error) {
        container.innerHTML = `<div class="card"><p class="text-danger">${t('common.error')}: ${error.message}</p></div>`;
    }
}

function switchSettingsTab(tab) {
    _settingsActiveTab = tab;

    // Mettre à jour les onglets actifs
    document.querySelectorAll('.settings-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    const content = document.getElementById('settings-tab-content');
    if (!content) return;

    switch (tab) {
        case 'modules':
            renderSettingsModules(content);
            break;
        case 'permissions':
            renderSettingsPermissions(content);
            break;
        case 'notifications':
            renderSettingsNotifications(content);
            break;
    }
}

// ============================================================
// ONGLET MODULES
// ============================================================

function renderSettingsModules(content) {
    content.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-puzzle-piece"></i> Modules du système</h3>
            </div>
            <p class="text-muted" style="padding:0 24px 8px">
                Activez ou désactivez les modules selon vos besoins. Les modules désactivés disparaîtront du menu pour tous les utilisateurs.
                <br><span class="text-warning"><i class="fas fa-lock"></i> Les modules essentiels ne peuvent pas être désactivés.</span>
            </p>

            <div class="modules-grid" style="padding:0 24px 24px">
                ${renderModulesGrid()}
            </div>

            <div style="padding:0 24px 24px">
                <button class="btn btn-primary" onclick="saveModulesConfig()">
                    <i class="fas fa-save"></i> ${t('common.save')}
                </button>
            </div>
        </div>
    `;
}

// ============================================================
// ONGLET PERMISSIONS
// ============================================================

function renderSettingsPermissions(content) {
    content.innerHTML = `
        <!-- Rôles -->
        <div class="card">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-user-tag"></i> Rôles du système</h3>
            </div>
            <div class="roles-grid" style="padding:0 24px 24px">
                ${Object.entries(ROLE_LABELS).map(([role, label]) => `
                    <div class="role-card ${role === 'admin' ? 'role-admin' : ''}">
                        <div class="role-icon"><i class="fas ${ROLE_ICONS[role]}"></i></div>
                        <div class="role-info">
                            <h4>${label}</h4>
                            <p>${ROLE_DESCRIPTIONS[role] || ''}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <!-- Matrice des permissions -->
        <div class="card">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-shield-alt"></i> ${t('settings.role_permissions')}</h3>
            </div>
            <p class="text-muted" style="padding:0 24px 8px">
                Configurez les permissions pour chaque rôle. Cochez/décochez pour activer/désactiver une permission.
                <br><strong>Note:</strong> L'administrateur a toujours toutes les permissions.
            </p>

            <div class="permissions-grid" style="padding:0 24px">
                ${renderPermissionsTable()}
            </div>

            <div style="padding:16px 24px 24px; display:flex; gap:10px; flex-wrap:wrap">
                <button class="btn btn-primary" onclick="saveAllPermissions()">
                    <i class="fas fa-save"></i> ${t('common.save')}
                </button>
                <button class="btn btn-outline" onclick="resetToDefaults()">
                    <i class="fas fa-undo"></i> Réinitialiser par défaut
                </button>
            </div>
        </div>

        <!-- Légende -->
        <div class="card">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-info-circle"></i> Légende des permissions</h3>
            </div>
            <div class="permissions-legend" style="padding:0 24px 24px">
                ${Object.entries(PERMISSION_CATEGORIES).map(([cat, perms]) => `
                    <div class="legend-category">
                        <h4><i class="fas ${getCategoryIcon(cat)}"></i> ${cat}</h4>
                        <ul>
                            ${perms.map(p => `<li><code>${p}</code> - ${PERMISSION_LABELS[p] || p}</li>`).join('')}
                        </ul>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// ============================================================
// ONGLET NOTIFICATIONS
// ============================================================

function renderSettingsNotifications(content) {
    if (typeof loadNotificationManager === 'function') {
        loadNotificationManager(content);
    } else {
        content.innerHTML = '<div class="card"><p class="text-muted" style="padding:24px">Module de notifications non disponible.</p></div>';
    }
}

// ============================================================
// FONCTIONS MODULES
// ============================================================

function renderModulesGrid() {
    return Object.entries(SYSTEM_MODULES).map(([moduleId, module]) => {
        const moduleValue = currentModules[moduleId];
        const isInactive = moduleValue === false || moduleValue === 'false';
        const isCore = module.core === true;

        return `
            <div class="module-card ${isInactive ? 'inactive' : 'active'} ${isCore ? 'core' : ''}">
                <div class="module-toggle">
                    <label class="switch">
                        <input type="checkbox"
                            ${!isInactive ? 'checked' : ''}
                            ${isCore ? 'disabled' : ''}
                            onchange="toggleModule('${moduleId}', this.checked)"
                            id="module-${moduleId}">
                        <span class="slider"></span>
                    </label>
                </div>
                <div class="module-icon">
                    <i class="fas ${module.icon}"></i>
                </div>
                <div class="module-info">
                    <h4>${module.name} ${isCore ? '<span class="badge badge-gray">Essentiel</span>' : ''}</h4>
                    <p>${module.description}</p>
                </div>
                <div class="module-status">
                    ${!isInactive ? '<span class="status-active"><i class="fas fa-check-circle"></i> Actif</span>' : '<span class="status-inactive"><i class="fas fa-times-circle"></i> Inactif</span>'}
                </div>
            </div>
        `;
    }).join('');
}

function toggleModule(moduleId, enabled) {
    currentModules[moduleId] = enabled;

    const card = document.querySelector(`#module-${moduleId}`).closest('.module-card');
    if (enabled) {
        card.classList.remove('inactive');
        card.classList.add('active');
        card.querySelector('.module-status').innerHTML = '<span class="status-active"><i class="fas fa-check-circle"></i> Actif</span>';
    } else {
        card.classList.remove('active');
        card.classList.add('inactive');
        card.querySelector('.module-status').innerHTML = '<span class="status-inactive"><i class="fas fa-times-circle"></i> Inactif</span>';
    }
}

async function saveModulesConfig() {
    try {
        const result = await API.saveModulesConfig(currentModules);
        toast(t('settings.saved'), 'success');

        if (typeof enabledModules !== 'undefined') {
            for (const key in currentModules) {
                enabledModules[key] = currentModules[key];
            }
        }

        updateSidebarModulesFromSettings();
    } catch (error) {
        toast(t('common.error') + ': ' + error.message, 'error');
    }
}

function updateSidebarModulesFromSettings() {
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
        const page = item.dataset.page;
        if (page) {
            const isDisabled = currentModules[page] === false || currentModules[page] === 'false';
            item.style.display = isDisabled ? 'none' : '';
        }
    });
}

// ============================================================
// FONCTIONS PERMISSIONS
// ============================================================

function getCategoryIcon(cat) {
    const icons = {
        'Hôtels & Chambres': 'fa-building',
        'Utilisateurs': 'fa-users',
        'Gouvernante': 'fa-broom',
        'Blanchisserie': 'fa-tshirt',
        'Congés': 'fa-calendar-alt',
        'Maintenance': 'fa-wrench',
        'Tâches (Kanban)': 'fa-tasks',
        'Évaluations': 'fa-clipboard-check',
        'Audits': 'fa-search',
        'Revenue Management': 'fa-chart-line',
        'Communication': 'fa-envelope',
        'Dashboard & Rapports': 'fa-chart-bar',
        'Administration': 'fa-cog'
    };
    return icons[cat] || 'fa-circle';
}

function renderPermissionsTable() {
    const roles = ['groupe_manager', 'hotel_manager', 'comptabilite', 'rh', 'receptionniste', 'employee'];

    let rows = '';
    for (const [category, perms] of Object.entries(PERMISSION_CATEGORIES)) {
        rows += `<tr class="category-row"><td colspan="${roles.length + 2}"><i class="fas ${getCategoryIcon(category)}"></i> <strong>${category}</strong></td></tr>`;
        for (const perm of perms) {
            rows += `
                <tr>
                    <td class="perm-label">${PERMISSION_LABELS[perm] || perm}</td>
                    <td class="text-center">
                        <input type="checkbox" checked disabled title="Admin a toujours cette permission">
                    </td>
                    ${roles.map(role => {
                        const checked = currentPermissions[role] && currentPermissions[role][perm];
                        const isProtected = perm === 'permissions.manage';
                        return `
                            <td class="text-center">
                                <input type="checkbox"
                                    ${checked ? 'checked' : ''}
                                    ${isProtected ? 'disabled title="Réservé à l\'admin"' : ''}
                                    onchange="togglePermission('${role}', '${perm}', this.checked)"
                                    id="perm-${role}-${perm.replace(/\./g, '-')}"
                                >
                            </td>
                        `;
                    }).join('')}
                </tr>
            `;
        }
    }

    return `
        <div class="table-responsive">
            <table class="permissions-table">
                <thead>
                    <tr>
                        <th style="min-width:200px">${t('settings.permissions')}</th>
                        <th class="text-center" style="min-width:80px">
                            <div class="role-header role-admin-header">
                                <i class="fas fa-crown"></i><br>Admin
                            </div>
                        </th>
                        ${roles.map(r => `
                            <th class="text-center" style="min-width:80px">
                                <div class="role-header">
                                    <i class="fas ${ROLE_ICONS[r]}"></i><br><small>${ROLE_LABELS[r]}</small>
                                </div>
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}

function togglePermission(role, permission, allowed) {
    if (!currentPermissions[role]) {
        currentPermissions[role] = {};
    }
    currentPermissions[role][permission] = allowed;
}

async function saveAllPermissions() {
    const roles = ['groupe_manager', 'hotel_manager', 'comptabilite', 'rh', 'receptionniste', 'employee'];

    try {
        for (const role of roles) {
            if (currentPermissions[role]) {
                await API.updateRolePermissions(role, currentPermissions[role]);
            }
        }
        toast(t('settings.permission_updated'), 'success');
    } catch (error) {
        toast(t('common.error') + ': ' + error.message, 'error');
    }
}

async function resetToDefaults() {
    if (!confirm('Réinitialiser toutes les permissions aux valeurs par défaut ?\n\nCette action va écraser vos modifications actuelles.')) return;

    try {
        for (const [role, perms] of Object.entries(DEFAULT_PERMISSIONS)) {
            await API.updateRolePermissions(role, perms);
        }
        toast(t('settings.saved'), 'success');
        loadSettings(document.getElementById('page-content'));
    } catch (error) {
        toast(t('common.error') + ': ' + error.message, 'error');
    }
}

// ============================================================
// STYLES ONGLETS
// ============================================================

function injectSettingsStyles() {
    if (document.getElementById('settings-tab-styles')) return;
    const style = document.createElement('style');
    style.id = 'settings-tab-styles';
    style.textContent = `
        .settings-tabs {
            display: flex;
            gap: 0;
            background: var(--gray-100, #f3f4f6);
            border-radius: 12px;
            padding: 4px;
            margin-bottom: 24px;
        }
        .settings-tab {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 12px 20px;
            border: none;
            background: transparent;
            color: var(--gray-600, #6b7280);
            font-size: 14px;
            font-weight: 500;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .settings-tab:hover {
            color: var(--gray-800, #1f2937);
            background: var(--gray-200, #e5e7eb);
        }
        .settings-tab.active {
            background: white;
            color: var(--primary, #1E3A5F);
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            font-weight: 600;
        }
        .settings-tab i {
            font-size: 15px;
        }
        @media (max-width: 600px) {
            .settings-tab span {
                display: none;
            }
            .settings-tab {
                padding: 12px 16px;
            }
            .settings-tab i {
                font-size: 18px;
            }
        }
    `;
    document.head.appendChild(style);
}
