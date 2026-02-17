# CLAUDE.md - Guide de développement ACL GESTION

Ce fichier contient les instructions et conventions pour développer sur le projet ACL GESTION.

## Présentation du projet

**ACL GESTION** est une plateforme SaaS de gestion hôtelière multi-établissements destinée aux groupes hôteliers français. Elle couvre l'ensemble des opérations quotidiennes : gouvernante, maintenance, blanchisserie, congés, planning, clôtures financières, factures fournisseurs, contrats, audits qualité, revenue management, réservations en ligne (self check-in), livret d'accueil numérique, messagerie interne, automatisations, et conformité RGPD.

- **SPA frontend** : Vanilla JavaScript, routage hash, 21 modules (25 300+ lignes JS)
- **API REST backend** : PHP pur, fichier monolithique (~14 400 lignes, 35+ resources)
- **Base de données** : MySQL/MariaDB (69+ tables, schéma + 27 migrations)
- **Application mobile** : iOS/Android via Capacitor 8 (WebView native)
- **PWA** : Service Worker, manifest, mode offline partiel
- **OCR** : Tesseract + Ghostscript + Claude AI (extraction factures fournisseurs)
- **Paiements** : Stripe (self check-in), Fintecture (Open Banking PSD2), SEPA XML (virements)
- **IA** : Anthropic Claude AI (OCR factures + analyse contrats)
- **Pas de framework, pas de build tool** : aucun npm/Composer/Webpack en production

## Serveur VPS / Production

| Élément | Valeur |
|---------|--------|
| **Hébergeur** | OVH VPS |
| **OS** | Debian / Ubuntu Linux |
| **Panel** | Plesk |
| **Domaine** | acl-gestion.com |
| **PHP** | 8.3 (compatible 7.4+) avec PDO MySQL |
| **MySQL** | MariaDB 10.x |
| **Webserver** | Apache (mod_rewrite actif) |
| **SSL** | Let's Encrypt (auto-renew via Plesk) |
| **Timezone** | Europe/Paris |
| **Déploiement** | Script `deploy.sh` (git pull + migrations auto) ou FTP/SSH |
| **Logs** | Plesk > Logs ou `/var/log/apache2/` |
| **Cron** | Configuré via Plesk > Tâches planifiées |
| **BDD** | Accessible via phpMyAdmin (Plesk) |
| **Uploads** | Répertoire `uploads/` à la racine, permissions 775 |
| **Sauvegardes** | Automatiques Plesk (quotidien) |
| **OCR** | Tesseract OCR + Ghostscript installés sur le serveur |

### Fichier .env (racine du projet, NON commité)

```env
DB_HOST=localhost
DB_NAME=acl_gestion
DB_USER=votre_user_mysql
DB_PASS=votre_password_mysql
APP_URL=https://acl-gestion.com
APP_NAME=ACL GESTION
JWT_SECRET=votre_cle_secrete_unique_64_chars
JWT_EXPIRY=604800
DEBUG=false
CORS_ORIGIN=https://acl-gestion.com
```

## Architecture complète

```
ACL/
├── index.html                    # Point d'entrée SPA + landing page marketing (768 L)
├── booking.html                  # Self Check-in / réservation publique Stripe (1 809 L)
├── welcome.html                  # Livret d'accueil public par hôtel (466 L)
├── .env                          # Variables d'environnement (NON commité)
├── .env.example                  # Template .env
├── manifest.json                 # PWA manifest
├── sw.js                         # Service Worker (cache offline, push notifications) (175 L)
├── pms-agent.php                 # Agent relais PMS GeHo (tourne sur le PC hôtel) (246 L)
├── deploy.sh                     # Script déploiement complet (premier deploy + MAJ) (437 L)
├── capacitor.config.json         # Configuration Capacitor (app native iOS/Android)
├── package.json                  # Dépendances Capacitor (pas de build frontend)
│
├── api/
│   ├── .htaccess                 # Rewrite rules + passage header Authorization
│   ├── config.php                # Config (.env, BDD, JWT, CORS, sécurité, rate limiting, upload) (75 L)
│   ├── Database.php              # Singleton PDO + helpers (query, queryOne, insert, execute, count) (72 L)
│   ├── Auth.php                  # JWT HMAC-SHA256 : génération, vérification, getUser() (99 L)
│   ├── index.php                 # API REST complète (14 408 L, 35+ resources)
│   ├── OcrClient.php             # OCR : Tesseract + Claude AI (extraction factures) (378 L)
│   ├── FintectureClient.php      # Paiement Open Banking PSD2 via Fintecture (354 L)
│   ├── cron.php                  # Cron dispatcher CLI (alertes automatiques, escalade) (1 970 L)
│   ├── cron_runner.php           # Runner automations planifiées (intervalle 30 min) (381 L)
│   └── test.php                  # Fichier de test
│
├── js/
│   ├── config.js                 # URL API, clés localStorage (8 L)
│   ├── api.js                    # Fetch wrapper avec injection JWT (438 L)
│   ├── i18n.js                   # Traductions FR/EN/ES (2 640 L)
│   ├── utils.js                  # Toast, modals, formatage, permissions frontend (565 L)
│   ├── app.js                    # Contrôleur SPA, routage hash, menu, session, polling (866 L)
│   ├── chatbot.js                # Assistant chatbot client, pattern matching (437 L)
│   ├── capacitor-bridge.js       # Bridge Capacitor iOS/Android (291 L)
│   └── pages/                    # 21 modules fonctionnels
│       ├── dashboard.js          # KPIs, stats, graphiques Chart.js (896 L)
│       ├── hotels.js             # Hôtels : 7 onglets (Général, Réservation, PMS, Congés, Clôtures, Revenue, Banque) (2 160 L)
│       ├── housekeeping.js       # Dispatch chambres, contrôle qualité 6 critères, photos (1 681 L)
│       ├── maintenance.js        # Tickets, catégories, priorités, escalade, photos, commentaires (919 L)
│       ├── linen.js              # Blanchisserie : collecte, réception, stock, bons PDF (615 L)
│       ├── leaves.js             # Congés : demande, validation, config dates par hôtel, export CSV (1 495 L)
│       ├── tasks.js              # Kanban : boards, colonnes, drag & drop, checklist, archivage (902 L)
│       ├── evaluations.js        # Évaluations : grilles, critères pondérés, historique (2 121 L)
│       ├── audit.js              # Audits : grilles, sections, questions, scoring, planification (1 500 L)
│       ├── closures.js           # Clôtures financières, remise banque, espèces, champs configurables (1 436 L)
│       ├── revenue.js            # Revenue management, tarifs OTA Xotelo, concurrents (1 129 L)
│       ├── selfcheckin.js        # Self Check-in : config, QR codes, consignes, liens paiement (1 716 L)
│       ├── invoices.js           # Factures fournisseurs : OCR, workflow, SEPA, Fintecture (2 238 L)
│       ├── contracts.js          # Contrats fournisseurs : catégories, alertes, analyse IA (1 033 L)
│       ├── welcome.js            # Livret d'accueil : onglets, éléments, infos pratiques (1 109 L)
│       ├── automations.js        # Configuration alertes planifiées (920 L)
│       ├── messages.js           # Messagerie interne, broadcast (408 L)
│       ├── notifications.js      # Envoi notifications ciblées, historique campagnes (407 L)
│       ├── rgpd.js               # RGPD : consentements, export, demandes + pages légales (1 137 L)
│       ├── settings.js           # Paramètres : 3 onglets (modules, permissions, notifications) (1 107 L)
│       └── users.js              # Gestion utilisateurs, affectation hôtels (387 L)
│
├── css/
│   ├── theme.css                 # Design system tokens (couleurs, espacements, typographie) (1 144 L)
│   ├── style.css                 # Styles principaux + composants (10 627 L)
│   ├── layout.css                # Sidebar, header, contenu principal (608 L)
│   ├── landing.css               # Landing page marketing (1 364 L)
│   ├── dashboard.css             # KPIs, stats, graphiques, activité (586 L)
│   └── app-polish.css            # Raffinements visuels, animations (815 L)
│
├── database/
│   ├── schema.sql                # Schéma principal (1 385 L, 69+ tables)
│   ├── migration_audit.sql       # Tables audit (grilles, questions, permissions)
│   ├── migration_automations.sql # Tables automatisations
│   ├── migration_revenue.sql     # Tables revenue (concurrents, cache Xotelo)
│   ├── migration_revenue_events.sql     # Événements calendrier revenue
│   ├── migration_revenue_history.sql    # Historique tarifs
│   ├── migration_revenue_global.sql     # Stats revenue globales
│   ├── migration_task_archive.sql       # Archivage tâches
│   ├── migration_security.sql           # Rate limiting, permissions push
│   ├── migration_pms_stripe.sql         # PMS, Stripe, booking, catégories hôtel
│   ├── migration_pms_relay.sql          # Relais PMS GeHo
│   ├── migration_selfcheckin.sql        # Self check-in tables
│   ├── migration_selfcheckin_v2.sql     # Self check-in v2
│   ├── migration_selfcheckin_v3.sql     # Self check-in v3 (consignes, casiers)
│   ├── migration_hotel_description.sql  # Texte descriptif hôtel
│   ├── migration_maintenance_alerts.sql # Alertes maintenance
│   ├── migration_on_call_phone.sql      # Téléphone d'astreinte
│   ├── migration_stripe_permission.sql  # Permission Stripe
│   ├── migration_bank_accounts.sql      # Comptes bancaires hôtel (SEPA)
│   ├── migration_contracts.sql          # Contrats fournisseurs
│   ├── migration_invoices.sql           # Factures fournisseurs (tables principales)
│   ├── migration_invoices_v2.sql        # Factures v2 (améliorations)
│   ├── migration_invoices_v3.sql        # Factures v3 (ventilation, export)
│   ├── migration_welcome.sql            # Livret d'accueil
│   ├── migration_smtp.sql               # Configuration SMTP
│   ├── migration_walkin_hold.sql        # Walk-in hold réservations
│   ├── migration_payment_links.sql      # Liens de paiement Stripe
│   └── migration_hotel_modules.sql      # Modules activés par hôtel
│
├── uploads/                      # Fichiers uploadés (photos, PDF)
│   ├── .htaccess                 # Sécurité : bloque exécution PHP, autorise JPG/PNG/PDF
│   ├── maintenance/              # Photos tickets maintenance
│   ├── linen/                    # Bons de réception PDF
│   ├── control/                  # Photos contrôle qualité
│   ├── closures/                 # Documents clôtures (PDF, JPG)
│   ├── audit/                    # Photos audits
│   ├── evaluations/              # Documents évaluations
│   ├── tasks/                    # Pièces jointes tâches
│   ├── leaves/                   # Documents congés
│   ├── profiles/                 # Photos de profil
│   ├── invoices/                 # Factures fournisseurs (PDF, images)
│   ├── contracts/                # Documents contrats
│   └── welcome/                  # Photos livret d'accueil
│
├── icons/                        # Icônes PWA (20x20 à 1024x1024)
│   └── generate-icons.js         # Script génération icônes (sharp)
│
└── ios/                          # Projet natif iOS (Capacitor)
    └── App/                      # Xcode project (Swift)
```

### Flux de données

```
Navigateur/App → index.html (SPA)
    ├── js/app.js → Routage hash (#dashboard, #maintenance, #invoices, etc.)
    ├── js/api.js → fetch() + JWT header → api/index.php
    │                                        ├── config.php (.env)
    │                                        ├── Database.php (PDO MySQL)
    │                                        ├── Auth.php (JWT verify)
    │                                        ├── OcrClient.php (Tesseract + Claude AI)
    │                                        ├── FintectureClient.php (Open Banking)
    │                                        └── switch($resource) → JSON response
    ├── js/pages/*.js → Rendu DOM dans #page-content
    ├── js/utils.js → Toast, modals, permissions, formatage
    ├── js/i18n.js → Traductions t('clé')
    └── sw.js → Cache offline, push notifications
```

- **Routage frontend** : hash-based (`#dashboard`, `#maintenance`, `#invoices`, etc.) géré par `app.js > navigateTo()`
- **Routage API** : `api/index.php/{resource}/{id}/{action}/{subaction}` via switch/case
- **Auth** : JWT HMAC-SHA256, expiration 7 jours, header `Authorization: Bearer <token>` + fallback `$_GET['token']` pour downloads
- **État client** : localStorage pour token (`acl_token`) et user (`acl_user`)
- **Config backend** : fichier `.env` chargé par `config.php` (jamais commité)
- **i18n** : multi-langue (FR, EN, ES) via `js/i18n.js`, fonction `t('clé')`
- **Rate limiting** : 5 tentatives login, blocage 15 min
- **Real-time** : Long polling `/notifications/poll` (toutes les 500ms)
- **PWA** : Service Worker avec stratégie stale-while-revalidate pour les assets
- **App native** : Capacitor 8 (iOS/Android) avec push notifications, camera, haptics

## Endpoints API (35+ resources)

Point d'entrée unique : `api/index.php`
Routage : `/{resource}/{id}/{action}/{subaction}`

| Resource | Méthodes | Description |
|----------|----------|-------------|
| `health` | GET | Status API |
| `contact` | POST | Formulaire contact landing page |
| `auth` | POST login/logout, PUT profile | Authentification, profil, management-info |
| `notifications` | GET, PUT, DELETE | Notifications in-app + polling |
| `notifications/admin/*` | GET, POST, DELETE | Campagnes notifications admin (envoi ciblé) |
| `modules` | GET, POST/PUT | Config modules actifs/inactifs |
| `dashboard` | GET stats | Statistiques agrégées multi-hôtel |
| `hotels` | CRUD + leave-config, categories, booking-config, stripe-config, bank-accounts | Hôtels (7 onglets de config) |
| `rooms` | CRUD | Gestion chambres par hôtel |
| `maintenance` | CRUD + assign, resolve, comment, stats | Tickets maintenance avec escalade |
| `tasks` | CRUD boards, columns, tasks, checklist, comments, attachments | Kanban complet |
| `evaluations` | CRUD grids, questions, evaluations, stats | Évaluations personnel |
| `dispatch` | CRUD + complete, control, alerts | Dispatch gouvernante |
| `leaves` | CRUD + approve, reject, report, for-other | Congés avec validation |
| `linen` | GET/POST transactions, config | Blanchisserie (collecte/réception) |
| `users` | CRUD + hotels assignment | Gestion utilisateurs |
| `messages` | GET/POST | Messages (legacy) |
| `messaging` | CRUD conversations, messages, users, unread-count | Messagerie interne temps réel |
| `permissions` | GET, PUT | Permissions par rôle (matrice RBAC) |
| `time` | CRUD services, positions, contracts, templates, schedules, entries, timesheet, counters, holidays | Planning complet |
| `audit` | CRUD grids, questions, audits, answers, pending, schedules | Audits qualité |
| `closures` | CRUD + validate, field-configs, documents, export | Clôtures financières |
| `rgpd` | CRUD consents, requests, settings, access-logs | Conformité RGPD |
| `revenue` | CRUD competitors, rates, events, history, alerts | Revenue management (API Xotelo) |
| `price_alerts` | GET, POST, PUT, DELETE | Alertes prix revenue |
| `booking` | GET/POST + Stripe payment, availability, pms-sync | Réservation en ligne |
| `selfcheckin` | CRUD config, instructions, lockers, pricing | Self check-in hôtels |
| `lockers` | CRUD | Gestion casiers self check-in |
| `selfcheckin-pricing` | CRUD | Tarification self check-in |
| `payment-links` | CRUD + email Stripe | Liens de paiement self check-in |
| `smtp` | GET, PUT, POST test | Configuration email SMTP (admin) |
| `welcome` | CRUD config, tabs, items, infos + public/{slug} | Livret d'accueil numérique |
| `contracts` | CRUD + stats, categories, documents, alerts, analyze, charges, export-pdf | Contrats fournisseurs |
| `suppliers` | CRUD + search, hotels assignment, invoices | Fournisseurs multi-hôtel |
| `invoices` | CRUD + upload/OCR, submit, review, approve, reject, pay, mark-paid, batch-mark-paid, stats, reporting, extract, export, approval-rules, fintecture-config | Factures fournisseurs |
| `fintecture_webhook` | POST (public) | Webhook Fintecture (vérifie signature) |
| `automations` | CRUD + logs, test | Automations planifiées |

## Conventions de code

### PHP (Backend - api/index.php)

- Tout le code API est dans un seul fichier `api/index.php` (~14 400 lignes)
- Chaque module est un `case` dans le `switch ($resource)`
- Utiliser les helpers de `Database.php` : `db()->query()`, `db()->queryOne()`, `db()->insert()`, `db()->execute()`, `db()->count()`
- Auth : `require_auth()` au début de chaque case, `require_role('admin', 'hotel_manager')` pour filtrer
- Réponses JSON : `json_out($data, $code)` et `json_error($message, $code)`
- Input JSON : `get_input()` pour décoder le body JSON (cache interne, lecture unique `php://input`)
- Filtrage par hôtel : toujours vérifier `$user['hotel_ids']` pour limiter l'accès aux données
- Méthodes HTTP : `$method` contient GET/POST/PUT/DELETE, router avec `if ($method === 'GET')`
- Variables de routage : `$resource`, `$id`, `$action`, `$subaction`
- Uploads fichiers : sauvegarder dans `uploads/{module}/`, générer un nom unique avec `uniqid()`
- Dates : toujours `date('Y-m-d H:i:s')` pour les timestamps SQL
- RGPD logging : `rgpdLog($userId, $action, $resource, $resourceId, $details)`
- Rate limiting : `checkLoginRateLimit($email)` avant authentification
- Chiffrement : `encryptData($data)` / `decryptData($data)` pour IBAN/BIC (AES-256-CBC)
- OCR : `require_once __DIR__ . '/OcrClient.php'` puis `OcrClient::processInvoice($filePath, $apiKey)`
- Fintecture : `require_once __DIR__ . '/FintectureClient.php'` puis `FintectureClient::initiatePayment(...)`

### JavaScript (Frontend - js/pages/*.js)

- Chaque module est un fichier dans `js/pages/` qui exporte une fonction `loadModuleName(container)`
- `container` est le `<div id="page-content">` où le module doit rendre son HTML
- Appels API via `API.get()`, `API.post()`, `API.put()`, `API.delete()`, `API.upload()` (définis dans `api.js`)
- Notifications : `toast('message', 'success|error|warning|info')` (défini dans `utils.js`)
- Modales : `openModal(title, content, size)` - tailles : `modal-md`, `modal-wide`, `modal-lg`, `modal-xl`, `modal-full`
- Formatage dates : `formatDate()`, `formatDateTime()`, `daysSince()`, `timeAgo()` (définis dans `utils.js`)
- Navigation : `navigateTo('page')` pour changer de page
- Hôtel courant : `API.user.current_hotel_id` ou récupérer via `API.getManagementInfo()`
- Permissions : `hasPermission('module.action')`, `hasAnyPermission(...)`, `hasAllPermissions(...)` pour vérifier côté frontend
- Traductions : `t('clé.sous_clé')` pour les textes multilingues
- Pas de framework : DOM manipulation directe avec `innerHTML`, `querySelector`, `addEventListener`
- Charger les données en asynchrone : `async/await` avec `try/catch`
- Échapper le HTML : `esc(string)` pour prévenir XSS, `escAttr(string)` pour les attributs
- Loading : `showLoading(container)` affiche un spinner
- Badges : `statusBadge(status)`, `priorityBadge(priority)` pour afficher des labels colorés
- Pagination : `renderPagination(pagination, onPageChange)` composant réutilisable
- Labels : objet `LABELS` contient les traductions status, priority, role, room_type, etc.

### Pages avec onglets (pattern recommandé)

```javascript
let _activeTab = 'tab1';

function switchTab(tab) {
    _activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    const content = document.getElementById('tab-content');
    switch (tab) {
        case 'tab1': renderTab1(content); break;
        case 'tab2': renderTab2(content); break;
    }
}
```

### CSS

- Design tokens dans `css/theme.css` (couleurs, espacements, typographie, ombres, radius)
- Utiliser les variables CSS : `var(--primary-500)`, `var(--space-4)`, `var(--radius-md)`, etc.
- Classes utilitaires : `.btn`, `.btn-primary`, `.btn-sm`, `.card`, `.badge`, `.form-control`, `.table`
- Responsive : breakpoints à 1024px, 768px, 480px
- Pas de préprocesseur CSS (pas de SASS/LESS)
- Thème clair/sombre : attribut `data-theme="dark"` sur `<html>`, variables CSS switchées
- Styles dynamiques : injecter via `document.head.appendChild(style)` avec un ID pour éviter les doublons

### SQL

- Charset : `utf8mb4` (utf8 pour les anciennes tables)
- Engine : `InnoDB`
- Nommage tables : `snake_case` (ex: `room_dispatch`, `leave_requests`, `supplier_invoices`)
- Clés étrangères : nommées `fk_table_column`
- Index : nommés `idx_table_column`
- Timestamps : colonnes `created_at` et `updated_at` de type `DATETIME`
- Soft delete : pas utilisé, suppression directe (sauf archivage tâches et `hotel_suppliers.is_active`)
- Migrations : fichiers séparés dans `database/`, exécuter via phpMyAdmin ou `deploy.sh`
- Chiffrement : IBAN/BIC stockés chiffrés AES-256-CBC dans `suppliers` et `hotel_bank_accounts`

## Comment ajouter un nouveau module

### 1. Backend (api/index.php)

Ajouter un nouveau `case` dans le switch principal :

```php
case 'mon_module':
    require_auth();
    $user = get_current_user();

    if ($method === 'GET') {
        if ($id) {
            $item = db()->queryOne("SELECT * FROM mon_module WHERE id = ?", [$id]);
            json_out($item);
        } else {
            $hotel_ids = implode(',', $user['hotel_ids']);
            $items = db()->query("SELECT * FROM mon_module WHERE hotel_id IN ($hotel_ids)");
            json_out(['items' => $items]);
        }
    } elseif ($method === 'POST') {
        $data = get_input();
        $insertId = db()->insert('mon_module', [
            'hotel_id' => $data['hotel_id'],
            'name' => $data['name'],
            'created_by' => $user['id'],
            'created_at' => date('Y-m-d H:i:s')
        ]);
        json_out(['id' => $insertId, 'message' => 'Créé avec succès'], 201);
    } elseif ($method === 'PUT') {
        // PUT /mon_module/{id}
    } elseif ($method === 'DELETE') {
        // DELETE /mon_module/{id}
    }
    break;
```

### 2. Frontend (js/pages/mon_module.js)

Créer le fichier avec la structure standard :

```javascript
let moduleHotelId = null;
let moduleData = [];

async function loadMonModule(container) {
    showLoading(container);

    try {
        const mgmtRes = await API.getManagementInfo();
        const hotels = mgmtRes.manageable_hotels || [];

        if (hotels.length === 0) {
            container.innerHTML = '<div class="card"><div class="empty-state">Aucun hôtel</div></div>';
            return;
        }

        moduleHotelId = moduleHotelId || hotels[0].id;

        container.innerHTML = `
            <div class="page-header">
                <div>
                    <h2><i class="fas fa-icon"></i> Mon Module</h2>
                    <p>Description du module</p>
                </div>
                <div class="header-actions-group">
                    <button class="btn btn-primary" onclick="createItem()">
                        <i class="fas fa-plus"></i> Nouveau
                    </button>
                </div>
            </div>
            <div id="module-content"></div>
        `;

        await loadModuleData();
    } catch (err) {
        container.innerHTML = '<div class="alert alert-danger">Erreur de chargement</div>';
        console.error(err);
    }
}
```

### 3. Enregistrer le module dans app.js

Ajouter dans le `switch` de `loadPage()` dans `app.js` :

```javascript
case 'mon_module':
    loadMonModule(container);
    break;
```

Ajouter dans les deux maps `pagePermissions` (dans `updateMenuByPermissions()` et `navigateTo()`) :

```javascript
'mon_module': 'mon_module.view'
```

Ajouter le titre dans la map `titles` de `navigateTo()` :

```javascript
mon_module: 'Mon Module'
```

Ajouter l'entrée sidebar dans `index.html` :

```html
<a href="#" class="nav-item" data-page="mon_module"><i class="fas fa-icon"></i> <span>Mon Module</span></a>
```

Ajouter le `<script>` dans `index.html` :

```html
<script src="js/pages/mon_module.js?v=20260217"></script>
```

### 4. Schéma SQL

Créer la migration dans `database/` :

```sql
CREATE TABLE IF NOT EXISTS mon_module (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    name VARCHAR(255) NOT NULL,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_by INT UNSIGNED NOT NULL,
    created_at DATETIME,
    updated_at DATETIME,
    INDEX idx_hotel (hotel_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 5. Permissions (triple synchronisation)

**SQL** :
```sql
INSERT INTO role_permissions (role, permission, allowed, updated_at) VALUES
('admin', 'mon_module.manage', 1, NOW()),
('groupe_manager', 'mon_module.manage', 1, NOW()),
('hotel_manager', 'mon_module.view', 1, NOW())
ON DUPLICATE KEY UPDATE allowed = VALUES(allowed);
```

**js/utils.js** - `getDefaultPermissions()` : ajouter `'mon_module.manage': true/false` pour chaque rôle

**js/pages/settings.js** - 3 endroits :
- `PERMISSION_LABELS` : ajouter le label
- `PERMISSION_CATEGORIES` : ajouter dans la bonne catégorie
- `DEFAULT_PERMISSIONS` : ajouter pour chaque rôle

## Fichiers clés à connaître

| Fichier | Lignes | Rôle |
|---------|--------|------|
| `api/index.php` | 14 408 | API REST complète (35+ endpoints, switch/case) |
| `api/Database.php` | 72 | Singleton PDO avec helpers (query, insert, count...) |
| `api/Auth.php` | 99 | JWT HMAC-SHA256 : génération, vérification, getUser() |
| `api/config.php` | 75 | Configuration (.env, DB, JWT, CORS, sécurité, upload) |
| `api/OcrClient.php` | 378 | OCR factures : Tesseract + Claude AI → JSON structuré |
| `api/FintectureClient.php` | 354 | Client Fintecture : OAuth2, initiation paiement, webhook |
| `api/cron.php` | 1 970 | Cron dispatcher CLI (9 types d'alertes, escalade) |
| `api/cron_runner.php` | 381 | Runner automations planifiées (intervalle 30 min) |
| `js/app.js` | 866 | Contrôleur SPA, routage, menu, session, dark mode, polling |
| `js/api.js` | 438 | Fetch wrapper avec JWT + tous les appels API structurés |
| `js/utils.js` | 565 | Toast, modals, formatage, permissions frontend, pagination |
| `js/i18n.js` | 2 640 | Traductions FR/EN/ES, sélecteur langue |
| `js/chatbot.js` | 437 | Assistant chatbot client (pattern matching, navigation) |
| `js/capacitor-bridge.js` | 291 | Bridge Capacitor : push, camera, haptics, safe area |
| `js/config.js` | 8 | URL API et clés localStorage |
| `sw.js` | 175 | Service Worker : cache offline, push, stale-while-revalidate |
| `booking.html` | 1 809 | Self check-in publique (Stripe, jsPDF) |
| `welcome.html` | 466 | Livret d'accueil publique (slug hôtel) |
| `pms-agent.php` | 246 | Agent relais PMS GeHo (long-polling, PC hôtel) |
| `deploy.sh` | 437 | Script déploiement (backup, git pull, migrations, permissions) |
| `database/schema.sql` | 1 385 | Schéma principal (69+ tables) |

## Modules frontend (21 fichiers dans js/pages/)

| Fichier | Lignes | Module |
|---------|--------|--------|
| `dashboard.js` | 896 | Dashboard KPIs et graphiques Chart.js |
| `hotels.js` | 2 160 | Hôtels (7 onglets : Général, Réservation, PMS, Congés, Clôtures, Revenue, Banque) |
| `housekeeping.js` | 1 681 | Gouvernante (dispatch + contrôle qualité 6 critères + photos) |
| `maintenance.js` | 919 | Tickets maintenance (catégories, priorités, escalade, commentaires) |
| `linen.js` | 615 | Blanchisserie (collecte, réception, stock, bons PDF) |
| `leaves.js` | 1 495 | Congés (demande, validation, config par hôtel, export CSV, rapport) |
| `tasks.js` | 902 | Kanban (boards, colonnes, drag & drop, checklist, pièces jointes) |
| `evaluations.js` | 2 121 | Évaluations (grilles, critères pondérés, historique, stats) |
| `audit.js` | 1 500 | Audits qualité (grilles, sections, questions, scoring, planification) |
| `closures.js` | 1 436 | Clôtures financières (cash, espèces, remise banque, champs configurables, export CSV) |
| `revenue.js` | 1 129 | Revenue management (tarifs OTA Xotelo, concurrents, historique) |
| `selfcheckin.js` | 1 716 | Self Check-in (config, QR codes, consignes, casiers, tarification, liens paiement) |
| `invoices.js` | 2 238 | Factures fournisseurs (OCR, workflow validation, SEPA XML, Fintecture, reporting) |
| `contracts.js` | 1 033 | Contrats (catégories, alertes échéance, documents, analyse IA, charges fixes) |
| `welcome.js` | 1 109 | Livret d'accueil (config, onglets, éléments, infos pratiques, page publique) |
| `automations.js` | 920 | Automatisations planifiées (horaire, jours, hôtels, destinataires) |
| `users.js` | 387 | Gestion utilisateurs (CRUD, affectation hôtels) |
| `messages.js` | 408 | Messagerie interne (conversations, broadcast) |
| `notifications.js` | 407 | Notifications admin (envoi ciblé, historique campagnes) |
| `settings.js` | 1 107 | Paramètres (3 onglets : Modules, Permissions, Notifications) |
| `rgpd.js` | 1 137 | RGPD admin (consentements, export, demandes, logs) + pages légales (CGV, CGU, mentions, confidentialité) |

## Rôles utilisateur (7 niveaux)

| Code | Label | Portée |
|------|-------|--------|
| `admin` | Administrateur | Accès complet, gestion permissions, config système |
| `groupe_manager` | Responsable Groupe | Multi-hôtels, escalade, validation congés/audits, factures, contrats |
| `hotel_manager` | Responsable Hôtel | Son hôtel, validation congés, dispatch, clôtures, factures |
| `comptabilite` | Comptabilité | Clôtures, blanchisserie, factures fournisseurs, paiements, export |
| `rh` | Ressources Humaines | Congés, évaluations, planning, gestion personnel |
| `receptionniste` | Réceptionniste | Dispatch, contrôle, clôtures journalières, maintenance, dépôt factures |
| `employee` | Employé | Tâches quotidiennes, consulter planning, demander congés |

Vérification rôle dans l'API :
```php
$user = require_role('admin', 'groupe_manager');
// ou manuellement :
if (!in_array($user['role'], ['admin', 'groupe_manager'])) {
    json_error('Accès refusé', 403);
}
```

## Système de permissions (RBAC)

Les permissions sont stockées dans `role_permissions` (SQL) et synchronisées en triple :
1. **SQL** : table `role_permissions` (role + permission + allowed)
2. **js/utils.js** : `getDefaultPermissions(role)` - fallback client
3. **js/pages/settings.js** : `PERMISSION_LABELS` + `PERMISSION_CATEGORIES` + `DEFAULT_PERMISSIONS`

Modules de permissions : `hotels`, `rooms`, `users`, `dispatch`, `linen`, `leaves`, `maintenance`, `tasks`, `evaluations`, `audit`, `revenue`, `closures`, `messages`, `notifications`, `dashboard`, `reports`, `permissions`, `selfcheckin`, `invoices`, `suppliers`, `contracts`, `welcome`

## Système d'escalade automatique (cron.php)

| Module | Seuil | Action |
|--------|-------|--------|
| **Dispatch** | 12h sans dispatch | Alerte hotel_manager → 2j: groupe_manager → 5j: admin |
| **Contrôle** | 19h chambres non contrôlées | Même escalade |
| **Maintenance** | Ticket ouvert 2j | groupe_manager → 5j: priorité urgente → 7j: priorité grave |
| **Audit** | X jours avant deadline | Rappel → 2j retard: groupe_manager → 5j: admin |
| **Clôture** | 13h sans clôture | hotel_manager → 48h: admin |
| **Revenue** | 6h quotidien | Mise à jour tarifs OTA via Xotelo |
| **Congés** | Lundi 9h | Rappel congés en attente de validation |
| **Tâches** | 9h quotidien | Rappel tâches arrivant à échéance |
| **Nettoyage** | 3h quotidien | Purge anciennes notifications, sessions expirées |

## Intégrations externes

| Service | Usage | Configuration |
|---------|-------|---------------|
| **Xotelo API** | Tarifs OTA (Booking.com, Expedia...) pour revenue management | `hotels.xotelo_hotel_key` |
| **Stripe** | Paiement en ligne pour self check-in / booking | `hotels.stripe_publishable_key` + `stripe_secret_key` |
| **Fintecture** | Paiement Open Banking PSD2 (virement instantané) | `fintecture_config` par hôtel (app_id, app_secret, private_key) |
| **Anthropic Claude AI** | OCR factures (extraction JSON) + analyse contrats (clauses, risques) | `hotel_contracts_config.anthropic_api_key` |
| **Tesseract OCR** | Extraction texte brut PDF/images → texte pour structuration IA | Installé serveur (`tesseract-ocr` + `tesseract-ocr-fra`) |
| **Ghostscript** | Conversion PDF → PNG pour traitement Tesseract | Installé serveur |
| **SEPA XML** | Génération fichiers de virement (pain.001.001.03) | `hotel_bank_accounts` (IBAN/BIC) |
| **SMTP** | Envoi emails (liens paiement, notifications) | `system_config` (PHPMailer) |
| **PMS GeHo** | Synchronisation réservations via agent relais | `pms-agent.php` sur le PC hôtel |
| **Chart.js 4.4.1** | Graphiques dashboard et revenue (CDN) | Chargé dans index.html |
| **Font Awesome 6.4.0** | Icônes interface (CDN) | Chargé dans index.html |
| **Google Fonts (Inter)** | Typographie (CDN) | Chargé dans index.html |
| **jsPDF** | Génération factures/reçus PDF (booking.html) | CDN dans booking.html |

## Application mobile (Capacitor)

- **App ID** : `com.aclgestion.app`
- **WebDir** : `www/` (contient index.html copié)
- **Mode** : WebView pointant vers `https://acl-gestion.com`
- **Plugins** : Camera, PushNotifications, StatusBar, Keyboard, Haptics, SplashScreen, App
- **Bridge** : `js/capacitor-bridge.js` détecte automatiquement web vs natif
- **Build** : `npm run cap:sync && npm run cap:open:ios`

## Patterns récurrents

### Filtrage multi-hôtel
```php
$hotel_ids = implode(',', $user['hotel_ids']);
$items = db()->query("SELECT * FROM table WHERE hotel_id IN ($hotel_ids)");
```

### Upload de fichiers
```php
if (isset($_FILES['photo'])) {
    $ext = strtolower(pathinfo($_FILES['photo']['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, UPLOAD_ALLOWED_IMAGES)) json_error('Format non autorisé');
    if ($_FILES['photo']['size'] > UPLOAD_MAX_SIZE_IMAGE) json_error('Fichier trop volumineux');
    $filename = uniqid() . '.' . $ext;
    $path = __DIR__ . '/../uploads/module/' . $filename;
    move_uploaded_file($_FILES['photo']['tmp_name'], $path);
}
```

### Notifications in-app
```php
function createNotification($userId, $title, $message, $type = 'info', $link = null) {
    db()->insert('notifications', [
        'user_id' => $userId,
        'title' => $title,
        'message' => $message,
        'type' => $type,
        'link' => $link,
        'is_read' => 0,
        'created_at' => date('Y-m-d H:i:s')
    ]);
}
```

### Notifications admin (campagnes ciblées)
```php
// Envoi ciblé via POST /notifications/admin/send
// target_type: 'all', 'hotel', 'role', 'users'
// Historique via GET /notifications/admin/history
// Restreint à admin, groupe_manager, hotel_manager
```

### Toast frontend
```javascript
toast('Opération réussie', 'success');
toast('Erreur lors de la sauvegarde', 'error');
toast('Attention : données incomplètes', 'warning');
```

### Configuration par hôtel
```javascript
// Charger la config spécifique à l'hôtel
const lcfg = await API.get(`hotels/${hotelId}/leave-config`);
// GET /hotels/{id}/leave-config et PUT /hotels/{id}/leave-config
```

### Dark mode
```javascript
toggleDarkMode(); // Bascule entre clair et sombre
// Préférence sauvegardée dans localStorage('acl_theme')
// CSS variables switchées via data-theme="dark" sur <html>
```

### OCR facture (pipeline)
```php
// 1. Upload PDF/image
// 2. Tesseract : extraction texte brut (PDF → PNG via Ghostscript si besoin)
// 3. Claude AI : structuration JSON (supplier, invoice_number, amounts, line_items)
// 4. Retour JSON avec confiance par champ (>90% vert, 60-90% orange, <60% rouge)
require_once __DIR__ . '/OcrClient.php';
$result = OcrClient::processInvoice($filePath, $anthropicApiKey);
```

### Paiement Fintecture
```php
// Initier un paiement Open Banking
require_once __DIR__ . '/FintectureClient.php';
$client = new FintectureClient($config);
$session = $client->initiatePayment($invoice, $supplier);
// Retourne session_id + redirect_url pour SCA bancaire
```

### SEPA XML (batch payment)
```php
// POST /invoices/batch-mark-paid avec generate_sepa=true
// Génère un fichier XML pain.001.001.03
// Utilise hotel_bank_accounts pour l'IBAN émetteur
// Valide IBAN/BIC fournisseur avant génération
```

## Points d'attention

- **Pas de framework** : tout est vanilla PHP/JS, pas d'injection de dépendances ni d'ORM
- **Fichier API monolithique** : `api/index.php` fait ~14 400 lignes, chercher le `case` du module concerné
- **Pas de tests automatisés** : tester manuellement via le navigateur
- **Pas de migration automatique** : exécuter les SQL manuellement via phpMyAdmin (ou via `deploy.sh`)
- **Configuration** : les credentials sont dans `.env` (jamais commité), lu par `config.php`
- **Encodage** : UTF-8 partout, BOM UTF-8 pour les exports CSV (compatibilité Excel)
- **Locale** : interface en français par défaut, multilingue (FR/EN/ES)
- **Photos** : accepter JPG/PNG, max 5 Mo par défaut (`UPLOAD_MAX_SIZE_IMAGE`)
- **PDF** : accepter PDF pour factures, bons de réception et documents, max 10 Mo (`UPLOAD_MAX_SIZE_DOC`)
- **Sécurité** : rate limiting login (5 tentatives/15min), headers sécurité (X-Frame-Options, X-XSS-Protection, nosniff), CORS strict, .htaccess uploads
- **Chiffrement** : IBAN/BIC chiffrés AES-256-CBC en base (fournisseurs + comptes bancaires hôtel)
- **Permissions** : triple synchronisation nécessaire (SQL, utils.js, settings.js)
- **Versioning JS** : les scripts sont chargés avec `?v=YYYYMMDD` pour le cache busting
- **Service Worker** : cache `acl-gestion-v2`, incrémenter la version après chaque déploiement
- **Capacitor** : les changements frontend sont reflétés dans l'app via le mode serveur (pas de rebuild natif nécessaire)
- **OCR** : nécessite Tesseract + Ghostscript sur le serveur + clé API Anthropic
- **Fintecture** : environnement sandbox disponible pour tests, webhook doit être accessible publiquement
- **SEPA** : vérifier la validité des IBAN/BIC avant génération XML, format pain.001.001.03
