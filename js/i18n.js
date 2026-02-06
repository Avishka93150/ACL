/**
 * ACL GESTION - Systeme de traduction i18n
 * Langues supportees : FR (defaut), EN, ES
 */

const I18N = {
    currentLang: localStorage.getItem('acl_lang') || 'fr',

    translations: {
        fr: {
            // Navigation
            'nav.dashboard': 'Dashboard',
            'nav.hotels': 'Hotels',
            'nav.revenue': 'Revenue',
            'nav.closures': 'Clotures & Remises',
            'nav.housekeeping': 'Gouvernante',
            'nav.maintenance': 'Maintenance',
            'nav.linen': 'Blanchisserie',
            'nav.leaves': 'Conges',
            'nav.tasks': 'Taches',
            'nav.evaluations': 'Evaluations',
            'nav.audit': 'Audits',
            'nav.users': 'Utilisateurs',
            'nav.messages': 'Messages',
            'nav.settings': 'Parametres',
            'nav.logout': 'Deconnexion',

            // Dashboard
            'dashboard.greeting_morning': 'Bonne matinee',
            'dashboard.greeting_afternoon': 'Bon apres-midi',
            'dashboard.greeting_evening': 'Bonne soiree',
            'dashboard.hotels': 'Hotels',
            'dashboard.rooms': 'Chambres',
            'dashboard.open_tickets': 'Tickets ouverts',
            'dashboard.dispatch_today': 'Dispatch du jour',
            'dashboard.tasks_pending': 'Taches en cours',
            'dashboard.leaves_pending': 'Conges en attente',
            'dashboard.closures_pending': 'Clotures en attente',
            'dashboard.audits_month': 'Audits ce mois',
            'dashboard.quick_actions': 'Actions rapides',
            'dashboard.no_hotels': 'Aucun hotel assigne',
            'dashboard.no_hotels_desc': 'Contactez votre administrateur pour obtenir l\'acces a un ou plusieurs hotels.',
            'dashboard.recent_tickets': 'Tickets recents',
            'dashboard.my_tasks': 'Mes taches',
            'dashboard.my_hotels': 'Mes hotels',
            'dashboard.recent_leaves': 'Conges recents',
            'dashboard.recent_closures': 'Clotures & Remises',
            'dashboard.laundry': 'Blanchisserie',
            'dashboard.urgent': 'urgent',
            'dashboard.urgents': 'urgents',
            'dashboard.overdue': 'en retard',
            'dashboard.todo': 'A faire',
            'dashboard.customize': 'Personnaliser',
            'dashboard.customize_title': 'Personnaliser le dashboard',
            'dashboard.customize_desc': 'Glissez-deposez les widgets pour reorganiser votre dashboard. Decochez pour masquer.',
            'dashboard.reset_layout': 'Reinitialiser',

            // Alerts
            'alert.closures_late': 'Clotures en retard',
            'alert.closures_late_msg': 'cloture(s) journaliere(s) non effectuee(s)',
            'alert.maintenance_urgent': 'Maintenance urgente',
            'alert.maintenance_urgent_msg': 'ticket(s) priorite haute en attente',
            'alert.tasks_overdue': 'Taches en retard',
            'alert.tasks_overdue_msg': 'tache(s) en retard',
            'alert.rgpd_pending': 'Demandes RGPD',
            'alert.rgpd_pending_msg': 'demande(s) en attente de traitement',

            // Common
            'common.view_all': 'Voir tout',
            'common.manage': 'Gerer',
            'common.save': 'Enregistrer',
            'common.cancel': 'Annuler',
            'common.delete': 'Supprimer',
            'common.edit': 'Modifier',
            'common.create': 'Creer',
            'common.search': 'Rechercher',
            'common.filter': 'Filtrer',
            'common.loading': 'Chargement...',
            'common.error': 'Erreur',
            'common.success': 'Succes',
            'common.confirm': 'Confirmer',
            'common.close': 'Fermer',
            'common.yes': 'Oui',
            'common.no': 'Non',
            'common.none': 'Aucun',
            'common.all': 'Tous',
            'common.new': 'Nouveau',
            'common.export': 'Exporter',
            'common.import': 'Importer',
            'common.refresh': 'Actualiser',
            'common.back': 'Retour',
            'common.next': 'Suivant',
            'common.previous': 'Precedent',
            'common.results': 'resultats',
            'common.display': 'Affichage',
            'common.on': 'sur',

            // Auth
            'auth.login': 'Se connecter',
            'auth.logout': 'Deconnexion',
            'auth.email': 'Email',
            'auth.password': 'Mot de passe',
            'auth.login_success': 'Connexion reussie',
            'auth.login_error': 'Erreur de connexion',
            'auth.too_many_attempts': 'Trop de tentatives. Reessayez plus tard.',

            // Status
            'status.open': 'Ouvert',
            'status.in_progress': 'En cours',
            'status.resolved': 'Resolu',
            'status.closed': 'Ferme',
            'status.pending': 'En attente',
            'status.completed': 'Termine',
            'status.approved': 'Approuve',
            'status.rejected': 'Refuse',
            'status.active': 'Actif',
            'status.inactive': 'Inactif',
            'status.draft': 'Brouillon',
            'status.submitted': 'Soumis',
            'status.validated': 'Valide',

            // Priority
            'priority.critical': 'Critique',
            'priority.high': 'Haute',
            'priority.medium': 'Moyenne',
            'priority.low': 'Basse',

            // Roles
            'role.admin': 'Administrateur',
            'role.groupe_manager': 'Responsable Groupe',
            'role.hotel_manager': 'Responsable Hotel',
            'role.comptabilite': 'Comptabilite',
            'role.rh': 'Ressources Humaines',
            'role.receptionniste': 'Receptionniste',
            'role.employee': 'Employe',

            // Settings
            'settings.dark_mode': 'Mode sombre',
            'settings.language': 'Langue',
            'settings.notifications': 'Notifications',
            'settings.enable_push': 'Activer les notifications push',
            'settings.appearance': 'Apparence',
            'settings.preferences': 'Preferences',

            // Notifications
            'notif.new': 'Nouvelle notification',
            'notif.mark_read': 'Tout marquer lu',
            'notif.clear_all': 'Effacer tout',
            'notif.none': 'Aucune notification',
            'notif.push_enabled': 'Notifications push activees',
            'notif.push_denied': 'Notifications push refusees par le navigateur',

            // Profile
            'profile.title': 'Mon profil',
            'profile.first_name': 'Prenom',
            'profile.last_name': 'Nom',
            'profile.phone': 'Telephone',
            'profile.password_new': 'Nouveau mot de passe',
            'profile.updated': 'Profil mis a jour',

            // Maintenance
            'maintenance.new_ticket': 'Nouveau ticket',
            'maintenance.category': 'Categorie',
            'maintenance.description': 'Description',
            'maintenance.hotel': 'Hotel',
            'maintenance.room': 'Chambre',
            'maintenance.priority': 'Priorite',
            'maintenance.assigned_to': 'Assigne a',

            // Pagination
            'pagination.display': 'Affichage',
            'pagination.of': 'sur',
            'pagination.results': 'resultats'
        },

        en: {
            // Navigation
            'nav.dashboard': 'Dashboard',
            'nav.hotels': 'Hotels',
            'nav.revenue': 'Revenue',
            'nav.closures': 'Closures & Deposits',
            'nav.housekeeping': 'Housekeeping',
            'nav.maintenance': 'Maintenance',
            'nav.linen': 'Laundry',
            'nav.leaves': 'Leave Requests',
            'nav.tasks': 'Tasks',
            'nav.evaluations': 'Evaluations',
            'nav.audit': 'Audits',
            'nav.users': 'Users',
            'nav.messages': 'Messages',
            'nav.settings': 'Settings',
            'nav.logout': 'Logout',

            // Dashboard
            'dashboard.greeting_morning': 'Good morning',
            'dashboard.greeting_afternoon': 'Good afternoon',
            'dashboard.greeting_evening': 'Good evening',
            'dashboard.hotels': 'Hotels',
            'dashboard.rooms': 'Rooms',
            'dashboard.open_tickets': 'Open tickets',
            'dashboard.dispatch_today': 'Today\'s dispatch',
            'dashboard.tasks_pending': 'Pending tasks',
            'dashboard.leaves_pending': 'Pending leaves',
            'dashboard.closures_pending': 'Pending closures',
            'dashboard.audits_month': 'Audits this month',
            'dashboard.quick_actions': 'Quick actions',
            'dashboard.no_hotels': 'No hotel assigned',
            'dashboard.no_hotels_desc': 'Contact your administrator to get access to one or more hotels.',
            'dashboard.recent_tickets': 'Recent tickets',
            'dashboard.my_tasks': 'My tasks',
            'dashboard.my_hotels': 'My hotels',
            'dashboard.recent_leaves': 'Recent leaves',
            'dashboard.recent_closures': 'Closures & Deposits',
            'dashboard.laundry': 'Laundry',
            'dashboard.urgent': 'urgent',
            'dashboard.urgents': 'urgent',
            'dashboard.overdue': 'overdue',
            'dashboard.todo': 'To do',
            'dashboard.customize': 'Customize',
            'dashboard.customize_title': 'Customize dashboard',
            'dashboard.customize_desc': 'Drag and drop widgets to reorganize your dashboard. Uncheck to hide.',
            'dashboard.reset_layout': 'Reset layout',

            // Alerts
            'alert.closures_late': 'Overdue closures',
            'alert.closures_late_msg': 'daily closure(s) not completed',
            'alert.maintenance_urgent': 'Urgent maintenance',
            'alert.maintenance_urgent_msg': 'high priority ticket(s) pending',
            'alert.tasks_overdue': 'Overdue tasks',
            'alert.tasks_overdue_msg': 'task(s) overdue',
            'alert.rgpd_pending': 'GDPR requests',
            'alert.rgpd_pending_msg': 'request(s) pending',

            // Common
            'common.view_all': 'View all',
            'common.manage': 'Manage',
            'common.save': 'Save',
            'common.cancel': 'Cancel',
            'common.delete': 'Delete',
            'common.edit': 'Edit',
            'common.create': 'Create',
            'common.search': 'Search',
            'common.filter': 'Filter',
            'common.loading': 'Loading...',
            'common.error': 'Error',
            'common.success': 'Success',
            'common.confirm': 'Confirm',
            'common.close': 'Close',
            'common.yes': 'Yes',
            'common.no': 'No',
            'common.none': 'None',
            'common.all': 'All',
            'common.new': 'New',
            'common.export': 'Export',
            'common.import': 'Import',
            'common.refresh': 'Refresh',
            'common.back': 'Back',
            'common.next': 'Next',
            'common.previous': 'Previous',
            'common.results': 'results',
            'common.display': 'Showing',
            'common.on': 'of',

            // Auth
            'auth.login': 'Log in',
            'auth.logout': 'Logout',
            'auth.email': 'Email',
            'auth.password': 'Password',
            'auth.login_success': 'Login successful',
            'auth.login_error': 'Login error',
            'auth.too_many_attempts': 'Too many attempts. Try again later.',

            // Status
            'status.open': 'Open',
            'status.in_progress': 'In Progress',
            'status.resolved': 'Resolved',
            'status.closed': 'Closed',
            'status.pending': 'Pending',
            'status.completed': 'Completed',
            'status.approved': 'Approved',
            'status.rejected': 'Rejected',
            'status.active': 'Active',
            'status.inactive': 'Inactive',
            'status.draft': 'Draft',
            'status.submitted': 'Submitted',
            'status.validated': 'Validated',

            // Priority
            'priority.critical': 'Critical',
            'priority.high': 'High',
            'priority.medium': 'Medium',
            'priority.low': 'Low',

            // Roles
            'role.admin': 'Administrator',
            'role.groupe_manager': 'Group Manager',
            'role.hotel_manager': 'Hotel Manager',
            'role.comptabilite': 'Accounting',
            'role.rh': 'Human Resources',
            'role.receptionniste': 'Receptionist',
            'role.employee': 'Employee',

            // Settings
            'settings.dark_mode': 'Dark mode',
            'settings.language': 'Language',
            'settings.notifications': 'Notifications',
            'settings.enable_push': 'Enable push notifications',
            'settings.appearance': 'Appearance',
            'settings.preferences': 'Preferences',

            // Notifications
            'notif.new': 'New notification',
            'notif.mark_read': 'Mark all read',
            'notif.clear_all': 'Clear all',
            'notif.none': 'No notifications',
            'notif.push_enabled': 'Push notifications enabled',
            'notif.push_denied': 'Push notifications denied by browser',

            // Profile
            'profile.title': 'My profile',
            'profile.first_name': 'First name',
            'profile.last_name': 'Last name',
            'profile.phone': 'Phone',
            'profile.password_new': 'New password',
            'profile.updated': 'Profile updated',

            // Maintenance
            'maintenance.new_ticket': 'New ticket',
            'maintenance.category': 'Category',
            'maintenance.description': 'Description',
            'maintenance.hotel': 'Hotel',
            'maintenance.room': 'Room',
            'maintenance.priority': 'Priority',
            'maintenance.assigned_to': 'Assigned to',

            // Pagination
            'pagination.display': 'Showing',
            'pagination.of': 'of',
            'pagination.results': 'results'
        },

        es: {
            // Navigation
            'nav.dashboard': 'Panel',
            'nav.hotels': 'Hoteles',
            'nav.revenue': 'Ingresos',
            'nav.closures': 'Cierres y Depositos',
            'nav.housekeeping': 'Gobernanta',
            'nav.maintenance': 'Mantenimiento',
            'nav.linen': 'Lavanderia',
            'nav.leaves': 'Vacaciones',
            'nav.tasks': 'Tareas',
            'nav.evaluations': 'Evaluaciones',
            'nav.audit': 'Auditorias',
            'nav.users': 'Usuarios',
            'nav.messages': 'Mensajes',
            'nav.settings': 'Ajustes',
            'nav.logout': 'Cerrar sesion',

            // Dashboard
            'dashboard.greeting_morning': 'Buenos dias',
            'dashboard.greeting_afternoon': 'Buenas tardes',
            'dashboard.greeting_evening': 'Buenas noches',
            'dashboard.hotels': 'Hoteles',
            'dashboard.rooms': 'Habitaciones',
            'dashboard.open_tickets': 'Tickets abiertos',
            'dashboard.dispatch_today': 'Asignacion de hoy',
            'dashboard.tasks_pending': 'Tareas pendientes',
            'dashboard.leaves_pending': 'Vacaciones pendientes',
            'dashboard.closures_pending': 'Cierres pendientes',
            'dashboard.audits_month': 'Auditorias este mes',
            'dashboard.quick_actions': 'Acciones rapidas',
            'dashboard.no_hotels': 'Sin hotel asignado',
            'dashboard.no_hotels_desc': 'Contacte a su administrador para acceder a uno o mas hoteles.',
            'dashboard.recent_tickets': 'Tickets recientes',
            'dashboard.my_tasks': 'Mis tareas',
            'dashboard.my_hotels': 'Mis hoteles',
            'dashboard.recent_leaves': 'Vacaciones recientes',
            'dashboard.recent_closures': 'Cierres y Depositos',
            'dashboard.laundry': 'Lavanderia',
            'dashboard.urgent': 'urgente',
            'dashboard.urgents': 'urgentes',
            'dashboard.overdue': 'atrasado',
            'dashboard.todo': 'Pendiente',
            'dashboard.customize': 'Personalizar',
            'dashboard.customize_title': 'Personalizar panel',
            'dashboard.customize_desc': 'Arrastre y suelte widgets para reorganizar su panel. Desmarque para ocultar.',
            'dashboard.reset_layout': 'Restablecer',

            // Alerts
            'alert.closures_late': 'Cierres atrasados',
            'alert.closures_late_msg': 'cierre(s) diario(s) no realizado(s)',
            'alert.maintenance_urgent': 'Mantenimiento urgente',
            'alert.maintenance_urgent_msg': 'ticket(s) de alta prioridad pendiente(s)',
            'alert.tasks_overdue': 'Tareas atrasadas',
            'alert.tasks_overdue_msg': 'tarea(s) atrasada(s)',
            'alert.rgpd_pending': 'Solicitudes RGPD',
            'alert.rgpd_pending_msg': 'solicitud(es) pendiente(s)',

            // Common
            'common.view_all': 'Ver todo',
            'common.manage': 'Gestionar',
            'common.save': 'Guardar',
            'common.cancel': 'Cancelar',
            'common.delete': 'Eliminar',
            'common.edit': 'Editar',
            'common.create': 'Crear',
            'common.search': 'Buscar',
            'common.filter': 'Filtrar',
            'common.loading': 'Cargando...',
            'common.error': 'Error',
            'common.success': 'Exito',
            'common.confirm': 'Confirmar',
            'common.close': 'Cerrar',
            'common.yes': 'Si',
            'common.no': 'No',
            'common.none': 'Ninguno',
            'common.all': 'Todos',
            'common.new': 'Nuevo',
            'common.export': 'Exportar',
            'common.import': 'Importar',
            'common.refresh': 'Actualizar',
            'common.back': 'Atras',
            'common.next': 'Siguiente',
            'common.previous': 'Anterior',
            'common.results': 'resultados',
            'common.display': 'Mostrando',
            'common.on': 'de',

            // Auth
            'auth.login': 'Iniciar sesion',
            'auth.logout': 'Cerrar sesion',
            'auth.email': 'Correo electronico',
            'auth.password': 'Contrasena',
            'auth.login_success': 'Inicio de sesion exitoso',
            'auth.login_error': 'Error de inicio de sesion',
            'auth.too_many_attempts': 'Demasiados intentos. Intente mas tarde.',

            // Status
            'status.open': 'Abierto',
            'status.in_progress': 'En progreso',
            'status.resolved': 'Resuelto',
            'status.closed': 'Cerrado',
            'status.pending': 'Pendiente',
            'status.completed': 'Completado',
            'status.approved': 'Aprobado',
            'status.rejected': 'Rechazado',
            'status.active': 'Activo',
            'status.inactive': 'Inactivo',
            'status.draft': 'Borrador',
            'status.submitted': 'Enviado',
            'status.validated': 'Validado',

            // Priority
            'priority.critical': 'Critica',
            'priority.high': 'Alta',
            'priority.medium': 'Media',
            'priority.low': 'Baja',

            // Roles
            'role.admin': 'Administrador',
            'role.groupe_manager': 'Gerente de Grupo',
            'role.hotel_manager': 'Gerente de Hotel',
            'role.comptabilite': 'Contabilidad',
            'role.rh': 'Recursos Humanos',
            'role.receptionniste': 'Recepcionista',
            'role.employee': 'Empleado',

            // Settings
            'settings.dark_mode': 'Modo oscuro',
            'settings.language': 'Idioma',
            'settings.notifications': 'Notificaciones',
            'settings.enable_push': 'Activar notificaciones push',
            'settings.appearance': 'Apariencia',
            'settings.preferences': 'Preferencias',

            // Notifications
            'notif.new': 'Nueva notificacion',
            'notif.mark_read': 'Marcar todo leido',
            'notif.clear_all': 'Borrar todo',
            'notif.none': 'Sin notificaciones',
            'notif.push_enabled': 'Notificaciones push activadas',
            'notif.push_denied': 'Notificaciones push denegadas por el navegador',

            // Profile
            'profile.title': 'Mi perfil',
            'profile.first_name': 'Nombre',
            'profile.last_name': 'Apellido',
            'profile.phone': 'Telefono',
            'profile.password_new': 'Nueva contrasena',
            'profile.updated': 'Perfil actualizado',

            // Maintenance
            'maintenance.new_ticket': 'Nuevo ticket',
            'maintenance.category': 'Categoria',
            'maintenance.description': 'Descripcion',
            'maintenance.hotel': 'Hotel',
            'maintenance.room': 'Habitacion',
            'maintenance.priority': 'Prioridad',
            'maintenance.assigned_to': 'Asignado a',

            // Pagination
            'pagination.display': 'Mostrando',
            'pagination.of': 'de',
            'pagination.results': 'resultados'
        }
    },

    availableLanguages: {
        fr: { name: 'Francais', flag: 'fr' },
        en: { name: 'English', flag: 'gb' },
        es: { name: 'Espanol', flag: 'es' }
    }
};

/**
 * Fonction de traduction
 * @param {string} key - Cle de traduction (ex: 'nav.dashboard')
 * @param {object} params - Parametres de substitution (ex: {count: 5})
 * @returns {string}
 */
function t(key, params = {}) {
    const lang = I18N.currentLang;
    let text = I18N.translations[lang]?.[key] || I18N.translations['fr']?.[key] || key;

    // Substitution des parametres {name}, {count}, etc.
    for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }

    return text;
}

/**
 * Changer la langue
 */
function setLanguage(lang) {
    if (!I18N.translations[lang]) return;
    I18N.currentLang = lang;
    localStorage.setItem('acl_lang', lang);

    // Mettre a jour l'attribut lang du HTML
    document.documentElement.lang = lang;

    // Mettre a jour les elements avec data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.placeholder = t(key);
        } else {
            el.textContent = t(key);
        }
    });

    // Mettre a jour les labels de navigation
    updateNavLabels();

    // Recharger la page courante pour appliquer les traductions
    if (typeof navigateTo === 'function' && typeof currentPage !== 'undefined') {
        navigateTo(currentPage);
    }
}

/**
 * Mettre a jour les labels du menu de navigation
 */
function updateNavLabels() {
    const navMap = {
        'dashboard': 'nav.dashboard',
        'hotels': 'nav.hotels',
        'revenue': 'nav.revenue',
        'closures': 'nav.closures',
        'housekeeping': 'nav.housekeeping',
        'maintenance': 'nav.maintenance',
        'linen': 'nav.linen',
        'leaves': 'nav.leaves',
        'tasks': 'nav.tasks',
        'evaluations': 'nav.evaluations',
        'audit': 'nav.audit',
        'users': 'nav.users'
    };

    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
        const page = item.dataset.page;
        if (page && navMap[page]) {
            const span = item.querySelector('span:not(.badge)');
            if (span) span.textContent = t(navMap[page]);
        }
    });

    // Bouton deconnexion
    const logoutBtn = document.querySelector('.btn-logout');
    if (logoutBtn) {
        logoutBtn.innerHTML = `<i class="fas fa-sign-out-alt"></i> ${t('nav.logout')}`;
    }
}

/**
 * Generer le selecteur de langue (pour le header ou les settings)
 */
function renderLanguageSelector() {
    return `
        <div class="language-selector">
            ${Object.entries(I18N.availableLanguages).map(([code, lang]) => `
                <button class="lang-btn ${code === I18N.currentLang ? 'active' : ''}"
                        onclick="setLanguage('${code}')" title="${lang.name}">
                    ${code.toUpperCase()}
                </button>
            `).join('')}
        </div>
    `;
}
