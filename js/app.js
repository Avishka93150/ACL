/**
 * ACL GESTION - Main Application
 */

let currentPage = 'dashboard';
let captchaAnswer = 0;

// === DARK MODE ===
function initTheme() {
    const saved = localStorage.getItem('acl_theme');
    if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
}

function toggleDarkMode() {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('acl_theme', newTheme);

    // Mettre a jour l'icone du toggle
    const icon = document.getElementById('theme-toggle-icon');
    if (icon) {
        icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
}

// === SERVICE WORKER ===
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').then(function(reg) {
            // SW enregistre
        }).catch(function() {
            // SW non supporte ou erreur
        });
    }
}

function requestPushPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') return;
    if (Notification.permission === 'denied') return;

    Notification.requestPermission().then(function(permission) {
        if (permission === 'granted') {
            toast(t('notif.push_enabled'), 'success');
        }
    });
}

function sendBrowserNotification(title, body, tag) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    new Notification(title, {
        body: body,
        icon: '/favicon.ico',
        tag: tag || 'acl-' + Date.now(),
        requireInteraction: false
    });
}

// Appliquer le theme des le chargement (avant DOMContentLoaded)
initTheme();

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    registerServiceWorker();
    if (API.token && API.user) {
        showApp();
    } else {
        showLogin();
        // Small delay to ensure DOM is ready
        setTimeout(() => {
            initLandingPage();
        }, 100);
    }
    setupEvents();
});

// Initialize landing page
function initLandingPage() {
    generateCaptcha();
    
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

// Nav scroll effect
window.addEventListener('scroll', function() {
    const nav = document.querySelector('.landing-nav');
    if (nav) {
        nav.classList.toggle('scrolled', window.scrollY > 20);
    }
});

// Generate math captcha
function generateCaptcha() {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    captchaAnswer = num1 + num2;
    
    const questionEl = document.getElementById('captcha-question');
    if (questionEl) {
        questionEl.innerHTML = `<strong>${num1} + ${num2} = </strong>`;
    } else {
        console.warn('Captcha question element not found');
    }
}

// Show/hide login modal
function showLoginForm() {
    document.getElementById('login-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function hideLoginForm() {
    document.getElementById('login-modal').classList.add('hidden');
    document.body.style.overflow = '';
}

// Scroll to contact section
function scrollToContact() {
    const contactSection = document.getElementById('contact');
    if (contactSection) {
        contactSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Toggle mobile menu on landing page
function toggleLandingMenu() {
    const navMenu = document.getElementById('nav-menu');
    const navToggle = document.querySelector('.landing-nav-toggle');

    if (navMenu) {
        const isOpen = navMenu.classList.contains('open');
        navMenu.classList.toggle('open');

        if (navToggle) {
            navToggle.innerHTML = isOpen ? '<i class="fas fa-bars"></i>' : '<i class="fas fa-times"></i>';
        }
    }
}

function closeLandingMenu() {
    const navMenu = document.getElementById('nav-menu');
    const navToggle = document.querySelector('.landing-nav-toggle');

    if (navMenu) {
        navMenu.classList.remove('open');
        if (navToggle) {
            navToggle.innerHTML = '<i class="fas fa-bars"></i>';
        }
    }
}

// Submit contact form
async function submitContactForm(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    const btn = document.getElementById('contact-submit-btn');
    
    // Honeypot check (anti-bot)
    if (formData.get('website')) {
        toast('Erreur de validation', 'error');
        return;
    }
    
    // Captcha check
    const userAnswer = parseInt(formData.get('captcha'));
    if (userAnswer !== captchaAnswer) {
        toast('Réponse anti-robot incorrecte', 'error');
        generateCaptcha();
        return;
    }
    
    // Prepare data
    const contactData = {
        name: formData.get('name'),
        firstname: formData.get('firstname'),
        email: formData.get('email'),
        phone: formData.get('phone') || null,
        company: formData.get('company'),
        hotels_count: formData.get('hotels_count') || null,
        message: formData.get('message') || null
    };
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi en cours...';
    
    try {
        const response = await fetch(`${CONFIG.API_URL}/contact`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(contactData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            toast('Votre demande a bien été envoyée. Nous vous contacterons rapidement.', 'success');
            form.reset();
            generateCaptcha();
        } else {
            toast(result.message || 'Erreur lors de l\'envoi', 'error');
        }
    } catch (error) {
        toast('Erreur de connexion. Veuillez réessayer.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Envoyer ma demande';
    }
}

// Show forgot password (placeholder)
function showForgotPassword() {
    toast('Contactez votre administrateur pour réinitialiser votre mot de passe.', 'info');
}

// Event listeners
function setupEvents() {
    // Login form
    document.getElementById('login-form').addEventListener('submit', handleLogin);

    // Navigation - use both click and touchend for better mobile support
    document.querySelectorAll('.nav-item').forEach(item => {
        const handleNavClick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const page = item.dataset.page;
            if (page) {
                navigateTo(page);
                // Close sidebar on mobile after navigation
                setTimeout(() => closeSidebar(), 50);
            }
        };
        
        item.addEventListener('click', handleNavClick);
    });
    
    // Sidebar overlay click to close
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) {
        overlay.addEventListener('click', closeSidebar);
        overlay.addEventListener('touchend', (e) => {
            e.preventDefault();
            closeSidebar();
        });
    }

    // Close modal on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

// Login handler
async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connexion...';

    try {
        const result = await API.login(email, password);

        if (result.success && result.token && result.user) {
            API.setAuth(result.token, result.user);
            toast('Connexion réussie', 'success');
            
            // Hide login modal if open
            hideLoginForm();
            
            // Vérifier si le consentement RGPD est requis
            if (result.user.needs_gdpr_consent) {
                document.getElementById('login-page').classList.add('hidden');
                document.getElementById('app').classList.remove('hidden');
                showConsentModal();
            } else {
                showApp();
            }
        } else {
            toast(result.message || 'Erreur de connexion', 'error');
        }
    } catch (error) {
        toast('Erreur de connexion', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Se connecter <i class="fas fa-arrow-right"></i>';
    }
}

// Logout
function logout() {
    API.clearAuth();
    document.getElementById('footer-legal').style.display = 'none';
    showLogin();
    toast('Déconnexion', 'info');
}

// Show login page
function showLogin() {
    document.getElementById('login-page').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
}

// Show app
async function showApp() {
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('footer-legal').style.display = 'block';
    
    // Update user info
    document.getElementById('user-name').textContent = `${API.user.first_name} ${API.user.last_name}`;
    document.getElementById('user-role').textContent = LABELS.role[API.user.role] || API.user.role;

    // Load user permissions first
    await loadUserPermissions();

    // Hide menu items based on permissions (remplace l'ancien système data-roles)
    updateMenuByPermissions();

    // Hide header buttons based on role (settings, rgpd-admin)
    document.querySelectorAll('.header-actions [data-roles]').forEach(item => {
        const roles = item.dataset.roles.split(',');
        if (!roles.includes(API.user.role)) {
            item.style.display = 'none';
        }
    });

    // Load modules config and hide disabled modules
    await loadModulesConfig();

    // Inject theme toggle + language selector in header
    injectHeaderControls();

    // Apply saved language
    if (typeof updateNavLabels === 'function') {
        updateNavLabels();
    }

    // Load notifications
    loadNotifications();

    // Request push permission on first interaction
    document.body.addEventListener('click', requestPushPermission, { once: true });

    // Start real-time polling
    startPolling();

    // Initialize chatbot
    if (typeof initChatbot === 'function') {
        initChatbot();
    }

    navigateTo('dashboard');
}

/**
 * Cache les éléments du menu selon les permissions de l'utilisateur
 */
function updateMenuByPermissions() {
    // Mapping page -> permission requise pour voir le module
    const pagePermissions = {
        'housekeeping': 'dispatch.view',
        'maintenance': 'maintenance.view',
        'linen': 'linen.view',
        'tasks': 'tasks.view',
        'leaves': 'leaves.view',
        'evaluations': 'evaluations.view',
        'audit': 'audit.view',
        'closures': 'closures.view',
        'users': 'users.view',
        'hotels': 'hotels.view',
        'revenue': 'revenue.view',
        'settings': 'permissions.manage',
        'reports': 'reports.access'
    };

    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
        const page = item.dataset.page;
        const requiredPermission = pagePermissions[page];
        
        if (requiredPermission && !hasPermission(requiredPermission)) {
            item.style.display = 'none';
        }
    });
}

// Load modules configuration and update sidebar
let enabledModules = {};

async function loadModulesConfig() {
    try {
        const result = await API.getModulesConfig();
        enabledModules = result.modules || {};
        updateSidebarModules();
    } catch (error) {
        console.log('Modules config not available, showing all');
        enabledModules = {};
    }
}

function updateSidebarModules() {
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
        const page = item.dataset.page;
        // Si le module est explicitement désactivé (false ou "false"), le masquer
        if (page && (enabledModules[page] === false || enabledModules[page] === 'false')) {
            item.style.display = 'none';
        }
    });
}

// Navigation
function navigateTo(page) {
    // Vérifier les permissions pour la page demandée
    const pagePermissions = {
        'housekeeping': 'dispatch.view',
        'maintenance': 'maintenance.view',
        'linen': 'linen.view',
        'tasks': 'tasks.view',
        'leaves': 'leaves.view',
        'evaluations': 'evaluations.view',
        'audit': 'audit.view',
        'closures': 'closures.view',
        'users': 'users.view',
        'hotels': 'hotels.view',
        'revenue': 'revenue.view',
        'settings': 'permissions.manage',
        'reports': 'reports.access'
    };

    const requiredPerm = pagePermissions[page];
    if (requiredPerm && !hasPermission(requiredPerm)) {
        toast('Vous n\'avez pas accès à ce module', 'error');
        // Rediriger vers le dashboard si pas de permission
        if (page !== 'dashboard') {
            navigateTo('dashboard');
        }
        return;
    }
    
    currentPage = page;
    
    // Update active nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    // Update title
    const titles = {
        dashboard: 'Dashboard',
        hotels: 'Gestion des Hôtels',
        housekeeping: 'Module Gouvernante',
        maintenance: 'Maintenance',
        tasks: 'Gestion des Tâches',
        evaluations: 'Évaluations',
        linen: 'Gestion du Linge',
        leaves: 'Gestion des Congés',
        audit: 'Audits',
        closures: 'Clôtures & Remises',
        rgpd: 'RGPD',
        messages: 'Messagerie',
        users: 'Utilisateurs',
        settings: 'Paramètres'
    };
    document.getElementById('page-title').textContent = titles[page] || page;

    // Load page
    loadPage(page);
}

function loadPage(page) {
    const container = document.getElementById('page-content');
    switch(page) {
        case 'dashboard': loadDashboard(container); break;
        case 'hotels': loadHotels(container); break;
        case 'revenue': loadRevenue(container); break;
        case 'housekeeping': loadHousekeeping(container); break;
        case 'maintenance': loadMaintenance(container); break;
        case 'tasks': loadTasks(container); break;
        case 'evaluations': loadEvaluations(container); break;
        case 'linen': loadLinen(container); break;
        case 'leaves': loadLeaves(container); break;
        case 'audit': loadAudit(container); break;
        case 'closures': loadClosures(container); break;
        case 'my-data': loadMyData(container); break;
        case 'rgpd-admin': loadRgpdAdmin(container); break;
        case 'messages': loadMessages(container); break;
        case 'users': loadUsers(container); break;
        case 'settings': loadSettings(container); break;
        default: container.innerHTML = '<div class="card"><p>Page non trouvée</p></div>';
    }
}

function refreshPage() {
    loadPage(currentPage);
    toast('Actualisé', 'info');
}

// Mobile sidebar functions
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const isOpen = sidebar.classList.contains('open');
    
    if (isOpen) {
        closeSidebar();
    } else {
        sidebar.classList.add('open');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
}

// Update maintenance badge periodically
async function updateMaintenanceBadge() {
    try {
        const result = await API.getMaintenanceStats();
        if (result.success) {
            const count = result.stats.open + result.stats.in_progress;
            const badge = document.getElementById('maintenance-badge');
            if (badge) badge.textContent = count || '';
        }
    } catch (e) {}
}

// Track last unread count to detect new messages
let lastUnreadCount = 0;

// Update messages badge
async function updateMessagesBadge() {
    try {
        const result = await API.getUnreadCount();
        if (result.success) {
            const count = result.count || 0;
            const badge = document.getElementById('messages-badge');
            if (badge) {
                badge.textContent = count || '';
                
                // Add pulse animation if new messages
                if (count > lastUnreadCount && lastUnreadCount >= 0) {
                    badge.classList.add('badge-pulse');
                    
                    // Show desktop notification if not on messages page
                    if (currentPage !== 'messages' && count > lastUnreadCount) {
                        showNewMessageNotification(count - lastUnreadCount);
                    }
                    
                    setTimeout(() => badge.classList.remove('badge-pulse'), 2000);
                }
                
                lastUnreadCount = count;
            }
        }
    } catch (e) {}
}

// Show notification for new messages
function showNewMessageNotification(newCount) {
    // Toast notification
    toast(`📩 ${newCount} nouveau${newCount > 1 ? 'x' : ''} message${newCount > 1 ? 's' : ''}`, 'info');
    
    // Browser notification (if permitted)
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('ACL GESTION - Nouveau message', {
            body: `Vous avez ${newCount} nouveau${newCount > 1 ? 'x' : ''} message${newCount > 1 ? 's' : ''}`,
            icon: '/favicon.ico'
        });
    }
    
    // Play notification sound (optional - uncomment if you add a sound file)
    // playNotificationSound();
}

// Request notification permission on first interaction
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// === REAL-TIME POLLING ===
let pollingActive = false;
let pollingAbort = null;
let lastPollTimestamp = null;

function startPolling() {
    // Mise a jour initiale des badges
    updateMaintenanceBadge();
    updateMessagesBadge();

    // Demarrer le long polling
    pollingActive = true;
    lastPollTimestamp = new Date().toISOString().replace('T', ' ').substr(0, 19);
    longPoll();
}

function stopPolling() {
    pollingActive = false;
    if (pollingAbort) {
        pollingAbort.abort();
        pollingAbort = null;
    }
}

async function longPoll() {
    if (!pollingActive || !API.token) return;

    try {
        pollingAbort = new AbortController();
        const response = await fetch(
            `${CONFIG.API_URL}/notifications/poll?since=${encodeURIComponent(lastPollTimestamp)}`,
            {
                headers: { 'Authorization': 'Bearer ' + API.token },
                signal: pollingAbort.signal
            }
        );

        if (!response.ok) {
            // Si erreur 401, arreter le polling (session expiree)
            if (response.status === 401) { stopPolling(); return; }
            throw new Error('Poll error');
        }

        const data = await response.json();

        if (data.has_updates) {
            // Mettre a jour le badge de notifications
            const badge = document.querySelector('.notification-count');
            if (badge && data.unread_notifications !== undefined) {
                badge.textContent = data.unread_notifications > 0 ? data.unread_notifications : '';
                badge.style.display = data.unread_notifications > 0 ? 'flex' : 'none';
            }

            // Mettre a jour le badge de messages
            if (data.unread_messages > 0) {
                updateMessagesBadge();
            }

            // Recharger la liste des notifications si le dropdown est ouvert
            const dropdown = document.querySelector('.notification-dropdown.active');
            if (dropdown) {
                loadNotifications();
            }

            // Notification toast + push pour les nouvelles notifications
            if (data.notifications && data.notifications.length > 0) {
                const latest = data.notifications[0];
                toast(latest.title || t('notif.new'), 'info');
                sendBrowserNotification(
                    'ACL GESTION',
                    latest.title || t('notif.new'),
                    'acl-notif-' + latest.id
                );
            }
        }

        if (data.timestamp) {
            lastPollTimestamp = data.timestamp;
        }
    } catch (e) {
        if (e.name === 'AbortError') return;
        // En cas d'erreur, attendre avant de reessayer
        await new Promise(r => setTimeout(r, 5000));
    }

    // Relancer immediatement le prochain poll
    if (pollingActive) {
        setTimeout(longPoll, 500);
    }
}

// Start polling when app loads
document.addEventListener('DOMContentLoaded', () => {
    // Request notification permission after user interaction
    document.body.addEventListener('click', requestNotificationPermission, { once: true });
});

// === HEADER CONTROLS (theme + lang) ===
function injectHeaderControls() {
    const headerActions = document.querySelector('.header-actions');
    if (!headerActions || document.getElementById('header-quick-settings')) return;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    const container = document.createElement('div');
    container.id = 'header-quick-settings';
    container.className = 'header-quick-settings';
    container.innerHTML = `
        <button class="theme-toggle" onclick="toggleDarkMode()" title="${t('settings.dark_mode')}">
            <i id="theme-toggle-icon" class="fas ${isDark ? 'fa-sun' : 'fa-moon'}"></i>
        </button>
        ${typeof renderLanguageSelector === 'function' ? renderLanguageSelector() : ''}
    `;
    headerActions.appendChild(container);
}

// Profile Modal
function showProfileModal() {
    const user = API.user;
    openModal('Mon profil', `
        <form onsubmit="updateProfile(event)">
            <div class="form-row">
                <div class="form-group">
                    <label>Prénom</label>
                    <input type="text" value="${esc(user.first_name)}" disabled>
                </div>
                <div class="form-group">
                    <label>Nom</label>
                    <input type="text" value="${esc(user.last_name)}" disabled>
                </div>
            </div>
            <div class="form-group">
                <label>Email *</label>
                <input type="email" name="email" value="${esc(user.email)}" required>
            </div>
            <div class="form-group">
                <label>Téléphone</label>
                <input type="tel" name="phone" value="${esc(user.phone || '')}" placeholder="06 12 34 56 78">
            </div>
            <div class="form-group">
                <label>Nouveau mot de passe</label>
                <input type="password" name="password" placeholder="Laisser vide pour ne pas changer" minlength="6">
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                <button type="submit" class="btn btn-primary">Enregistrer</button>
            </div>
        </form>
    `);
}

async function updateProfile(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (!data.password) delete data.password;

    try {
        const result = await API.updateProfile(data);
        if (result.user) {
            API.user = result.user;
            localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(result.user));
            document.getElementById('user-name').textContent = `${result.user.first_name} ${result.user.last_name}`;
        }
        toast('Profil mis à jour', 'success');
        closeModal();
    } catch (error) {
        toast(error.message, 'error');
    }
}
