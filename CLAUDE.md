# CLAUDE.md - Guide de developpement ACL GESTION

Ce fichier contient les instructions et conventions pour developper sur le projet ACL GESTION.

## Presentation du projet

**ACL GESTION** est une plateforme SaaS de gestion hoteliere multi-etablissements destinee aux groupes hoteliers francais. Elle couvre l'ensemble des operations quotidiennes : gouvernante, maintenance, blanchisserie, conges, planning, clotures financieres, audits qualite, revenue management, reservations en ligne (self check-in), messagerie interne, et conformite RGPD.

- **SPA frontend** : Vanilla JavaScript, routage hash, 18 modules (19 800+ lignes JS)
- **API REST backend** : PHP pur, fichier monolithique (~10 380 lignes)
- **Base de donnees** : MySQL/MariaDB (55+ tables, schema + 16 migrations)
- **Application mobile** : iOS/Android via Capacitor 8 (WebView native)
- **PWA** : Service Worker, manifest, mode offline partiel
- **Pas de framework, pas de build tool** : aucun npm/Composer/Webpack en production

## Serveur VPS / Production

| Element | Valeur |
|---------|--------|
| **Hebergeur** | OVH VPS |
| **OS** | Debian / Ubuntu Linux |
| **Panel** | Plesk |
| **Domaine** | acl-gestion.com |
| **PHP** | 8.3 (compatible 7.4+) avec PDO MySQL |
| **MySQL** | MariaDB 10.x |
| **Webserver** | Apache (mod_rewrite actif) |
| **SSL** | Let's Encrypt (auto-renew via Plesk) |
| **Timezone** | Europe/Paris |
| **Deploiement** | Script `deploy.sh` (git pull + migrations auto) ou FTP/SSH |
| **Logs** | Plesk > Logs ou `/var/log/apache2/` |
| **Cron** | Configure via Plesk > Taches planifiees |
| **BDD** | Accessible via phpMyAdmin (Plesk) |
| **Uploads** | Repertoire `uploads/` a la racine, permissions 775 |
| **Sauvegardes** | Automatiques Plesk (quotidien) |

### Fichier .env (racine du projet, NON commite)

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

## Architecture complete

```
ACL/
├── index.html                    # Point d'entree SPA + landing page marketing
├── booking.html                  # Self Check-in / reservation publique (Stripe)
├── .env                          # Variables d'environnement (NON commite)
├── .env.example                  # Template .env
├── manifest.json                 # PWA manifest
├── sw.js                         # Service Worker (cache offline, push notifications)
├── pms-agent.php                 # Agent relais PMS GeHo (tourne sur le PC hotel)
├── deploy.sh                     # Script deploiement complet (premier deploy + MAJ)
├── capacitor.config.json         # Configuration Capacitor (app native iOS/Android)
├── package.json                  # Dependencies Capacitor (pas de build frontend)
│
├── api/
│   ├── .htaccess                 # Rewrite rules + passage header Authorization
│   ├── config.php                # Config (.env, BDD, JWT, CORS, securite, rate limiting, upload)
│   ├── Database.php              # Singleton PDO + helpers (query, queryOne, insert, execute, count)
│   ├── Auth.php                  # JWT HMAC-SHA256 : generation, verification, getUser()
│   ├── index.php                 # API REST complete (~10 380 lignes, 30+ resources)
│   ├── cron.php                  # Cron dispatcher CLI (alertes automatiques)
│   ├── cron_runner.php           # Runner automations planifiees
│   └── test.php                  # Fichier de test
│
├── js/
│   ├── config.js                 # URL API, cles localStorage (8 lignes)
│   ├── api.js                    # Fetch wrapper avec injection JWT (426 lignes)
│   ├── i18n.js                   # Traductions FR/EN/ES (2 192 lignes)
│   ├── utils.js                  # Toast, modals, formatage, permissions frontend (535 lignes)
│   ├── app.js                    # Controleur SPA, routage hash, menu, session, polling (802 lignes)
│   ├── chatbot.js                # Assistant chatbot client, pattern matching (437 lignes)
│   ├── capacitor-bridge.js       # Bridge Capacitor iOS/Android (291 lignes)
│   └── pages/                    # 18 modules fonctionnels
│       ├── dashboard.js          # KPIs, stats, graphiques Chart.js (896 L)
│       ├── hotels.js             # Hotels : 6 onglets (General, Reservation, PMS, Conges, Clotures, Revenue) (1 939 L)
│       ├── housekeeping.js       # Dispatch chambres, controle qualite 6 criteres, photos (1 681 L)
│       ├── maintenance.js        # Tickets, categories, priorites, escalade, photos, commentaires (919 L)
│       ├── linen.js              # Blanchisserie : collecte, reception, stock, bons PDF (615 L)
│       ├── leaves.js             # Conges : demande, validation, config dates par hotel, export CSV (1 495 L)
│       ├── tasks.js              # Kanban : boards, colonnes, drag & drop, checklist, archivage (902 L)
│       ├── evaluations.js        # Evaluations : grilles, criteres ponderes, historique (2 121 L)
│       ├── audit.js              # Audits : grilles, sections, questions, scoring, planification (1 500 L)
│       ├── closures.js           # Clotures financieres, remise banque, champs configurables (1 414 L)
│       ├── revenue.js            # Revenue management, tarifs OTA Xotelo, concurrents (1 129 L)
│       ├── selfcheckin.js        # Self Check-in : config, QR codes, consignes (1 307 L)
│       ├── automations.js        # Configuration alertes planifiees (920 L)
│       ├── messages.js           # Messagerie interne, broadcast (408 L)
│       ├── notifications.js      # Envoi notifications ciblees, historique campagnes (407 L)
│       ├── rgpd.js               # RGPD : consentements, export, demandes (909 L)
│       ├── settings.js           # Parametres : 3 onglets (modules, permissions, notifications) (674 L)
│       └── users.js              # Gestion utilisateurs, affectation hotels (387 L)
│
├── css/
│   ├── theme.css                 # Design system tokens (couleurs, espacements, typographie) (1 144 L)
│   ├── style.css                 # Styles principaux + composants (10 627 L)
│   ├── layout.css                # Sidebar, header, contenu principal (608 L)
│   ├── landing.css               # Landing page marketing (1 364 L)
│   ├── dashboard.css             # KPIs, stats, graphiques, activite (586 L)
│   └── app-polish.css            # Raffinements visuels, animations (815 L)
│
├── database/
│   ├── schema.sql                # Schema principal (1 385 L, 55+ tables)
│   ├── migration_audit.sql       # Tables audit (grilles, questions, permissions)
│   ├── migration_automations.sql # Tables automatisations
│   ├── migration_revenue.sql     # Tables revenue (concurrents, cache Xotelo)
│   ├── migration_revenue_events.sql     # Evenements calendrier revenue
│   ├── migration_revenue_history.sql    # Historique tarifs
│   ├── migration_revenue_global.sql     # Stats revenue globales
│   ├── migration_task_archive.sql       # Archivage taches
│   ├── migration_security.sql           # Rate limiting, permissions push
│   ├── migration_pms_stripe.sql         # PMS, Stripe, booking, categories hotel
│   ├── migration_pms_relay.sql          # Relais PMS GeHo
│   ├── migration_selfcheckin.sql        # Self check-in tables
│   ├── migration_selfcheckin_v2.sql     # Self check-in v2
│   ├── migration_selfcheckin_v3.sql     # Self check-in v3 (consignes, casiers)
│   ├── migration_hotel_description.sql  # Texte descriptif hotel
│   ├── migration_maintenance_alerts.sql # Alertes maintenance
│   ├── migration_on_call_phone.sql      # Telephone d'astreinte
│   └── migration_stripe_permission.sql  # Permission Stripe
│
├── uploads/                      # Fichiers uploades (photos, PDF)
│   ├── .htaccess                 # Securite : bloque execution PHP, autorise JPG/PNG/PDF uniquement
│   ├── maintenance/              # Photos tickets maintenance
│   ├── linen/                    # Bons de reception PDF
│   ├── control/                  # Photos controle qualite
│   ├── closures/                 # Documents clotures (PDF, JPG)
│   ├── audit/                    # Photos audits
│   ├── evaluations/              # Documents evaluations
│   ├── tasks/                    # Pieces jointes taches
│   ├── leaves/                   # Documents conges
│   └── profiles/                 # Photos de profil
│
├── icons/                        # Icones PWA (20x20 a 1024x1024)
│   └── generate-icons.js         # Script generation icones (sharp)
│
└── ios/                          # Projet natif iOS (Capacitor)
    └── App/                      # Xcode project (Swift)
```

### Flux de donnees

```
Navigateur/App → index.html (SPA)
    ├── js/app.js → Routage hash (#dashboard, #maintenance, etc.)
    ├── js/api.js → fetch() + JWT header → api/index.php
    │                                        ├── config.php (.env)
    │                                        ├── Database.php (PDO MySQL)
    │                                        ├── Auth.php (JWT verify)
    │                                        └── switch($resource) → JSON response
    ├── js/pages/*.js → Rendu DOM dans #page-content
    ├── js/utils.js → Toast, modals, permissions, formatage
    ├── js/i18n.js → Traductions t('cle')
    └── sw.js → Cache offline, push notifications
```

- **Routage frontend** : hash-based (`#dashboard`, `#maintenance`, etc.) gere par `app.js > navigateTo()`
- **Routage API** : `api/index.php/{resource}/{id}/{action}/{subaction}` via switch/case
- **Auth** : JWT HMAC-SHA256, expiration 7 jours, header `Authorization: Bearer <token>`
- **Etat client** : localStorage pour token (`acl_token`) et user (`acl_user`)
- **Config backend** : fichier `.env` charge par `config.php` (jamais commite)
- **i18n** : multi-langue (FR, EN, ES) via `js/i18n.js`, fonction `t('cle')`
- **Rate limiting** : 5 tentatives login, blocage 15 min
- **Real-time** : Long polling `/notifications/poll` (toutes les 500ms)
- **PWA** : Service Worker avec strategie stale-while-revalidate pour les assets
- **App native** : Capacitor 8 (iOS/Android) avec push notifications, camera, haptics

## Endpoints API (30+ resources)

Point d'entree unique : `api/index.php`
Routage : `/{resource}/{id}/{action}/{subaction}`

| Resource | Methodes | Description |
|----------|----------|-------------|
| `health` | GET | Status API |
| `contact` | POST | Formulaire contact landing page |
| `auth` | POST login/logout, PUT profile | Authentification, profil, management-info |
| `notifications` | GET, PUT, DELETE | Notifications in-app + polling |
| `notifications/admin/*` | GET, POST, DELETE | Campagnes notifications admin (envoi cible) |
| `modules` | GET, POST/PUT | Config modules actifs/inactifs |
| `dashboard` | GET stats | Statistiques agregees multi-hotel |
| `hotels` | CRUD + leave-config, categories, booking-config, stripe-config | Hotels (6 onglets de config) |
| `rooms` | CRUD | Gestion chambres par hotel |
| `maintenance` | CRUD + assign, resolve, comment, stats | Tickets maintenance avec escalade |
| `tasks` | CRUD boards, columns, tasks, checklist, comments, attachments | Kanban complet |
| `evaluations` | CRUD grids, questions, evaluations, stats | Evaluations personnel |
| `dispatch` | CRUD + complete, control, alerts | Dispatch gouvernante |
| `leaves` | CRUD + approve, reject, report, for-other | Conges avec validation |
| `linen` | GET/POST transactions, config | Blanchisserie (collecte/reception) |
| `users` | CRUD + hotels assignment | Gestion utilisateurs |
| `messages` | GET/POST | Messages (legacy) |
| `messaging` | CRUD conversations, messages, users, unread-count | Messagerie interne temps reel |
| `permissions` | GET, PUT | Permissions par role (matrice RBAC) |
| `time` | CRUD services, positions, contracts, templates, schedules, entries, timesheet, counters, holidays | Planning complet |
| `audit` | CRUD grids, questions, audits, answers, pending, schedules | Audits qualite |
| `closures` | CRUD + validate, field-configs, documents, export | Clotures financieres |
| `rgpd` | CRUD consents, requests, settings, access-logs | Conformite RGPD |
| `revenue` | CRUD competitors, rates, events, history, alerts | Revenue management (API Xotelo) |
| `price_alerts` | GET, POST, PUT, DELETE | Alertes prix revenue |
| `booking` | GET/POST + Stripe payment, availability, pms-sync | Reservation en ligne |
| `selfcheckin` | CRUD config, instructions, lockers, pricing | Self check-in hotels |
| `lockers` | CRUD | Gestion casiers self check-in |
| `selfcheckin-pricing` | CRUD | Tarification self check-in |
| `automations` | CRUD + logs, test | Automations planifiees |

## Conventions de code

### PHP (Backend - api/index.php)

- Tout le code API est dans un seul fichier `api/index.php` (~10 380 lignes)
- Chaque module est un `case` dans le `switch ($resource)`
- Utiliser les helpers de `Database.php` : `db()->query()`, `db()->queryOne()`, `db()->insert()`, `db()->execute()`, `db()->count()`
- Auth : `require_auth()` au debut de chaque case, `require_role('admin', 'hotel_manager')` pour filtrer
- Reponses JSON : `json_out($data, $code)` et `json_error($message, $code)`
- Input JSON : `get_input()` pour decoder le body JSON (cache interne, lecture unique `php://input`)
- Filtrage par hotel : toujours verifier `$user['hotel_ids']` pour limiter l'acces aux donnees
- Methodes HTTP : `$method` contient GET/POST/PUT/DELETE, router avec `if ($method === 'GET')`
- Variables de routage : `$resource`, `$id`, `$action`, `$subaction`
- Uploads fichiers : sauvegarder dans `uploads/{module}/`, generer un nom unique avec `uniqid()`
- Dates : toujours `date('Y-m-d H:i:s')` pour les timestamps SQL
- RGPD logging : `rgpdLog($userId, $action, $resource, $resourceId, $details)`
- Rate limiting : `checkLoginRateLimit($email)` avant authentification

### JavaScript (Frontend - js/pages/*.js)

- Chaque module est un fichier dans `js/pages/` qui exporte une fonction `loadModuleName(container)`
- `container` est le `<div id="page-content">` ou le module doit rendre son HTML
- Appels API via `API.get()`, `API.post()`, `API.put()`, `API.delete()`, `API.upload()` (definis dans `api.js`)
- Notifications : `toast('message', 'success|error|warning|info')` (defini dans `utils.js`)
- Modales : `openModal(title, content, size)` - tailles : `modal-md`, `modal-wide`, `modal-lg`, `modal-xl`, `modal-full`
- Formatage dates : `formatDate()`, `formatDateTime()`, `daysSince()`, `timeAgo()` (definis dans `utils.js`)
- Navigation : `navigateTo('page')` pour changer de page
- Hotel courant : `API.user.current_hotel_id` ou recuperer via `API.getManagementInfo()`
- Permissions : `hasPermission('module.action')`, `hasAnyPermission(...)`, `hasAllPermissions(...)` pour verifier cote frontend
- Traductions : `t('cle.sous_cle')` pour les textes multilingues
- Pas de framework : DOM manipulation directe avec `innerHTML`, `querySelector`, `addEventListener`
- Charger les donnees en asynchrone : `async/await` avec `try/catch`
- Echapper le HTML : `esc(string)` pour prevenir XSS, `escAttr(string)` pour les attributs
- Loading : `showLoading(container)` affiche un spinner
- Badges : `statusBadge(status)`, `priorityBadge(priority)` pour afficher des labels colores
- Pagination : `renderPagination(pagination, onPageChange)` composant reutilisable
- Labels : objet `LABELS` contient les traductions status, priority, role, room_type, etc.

### Pages avec onglets (pattern recommande)

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
- Responsive : breakpoints a 1024px, 768px, 480px
- Pas de preprocesseur CSS (pas de SASS/LESS)
- Theme clair/sombre : attribut `data-theme="dark"` sur `<html>`, variables CSS switchees
- Styles dynamiques : injecter via `document.head.appendChild(style)` avec un ID pour eviter les doublons

### SQL

- Charset : `utf8mb4` (utf8 pour les anciennes tables)
- Engine : `InnoDB`
- Nommage tables : `snake_case` (ex: `room_dispatch`, `leave_requests`)
- Cles etrangeres : nommees `fk_table_column`
- Index : nommes `idx_table_column`
- Timestamps : colonnes `created_at` et `updated_at` de type `DATETIME`
- Soft delete : pas utilise, suppression directe (sauf archivage taches)
- Migrations : fichiers separes dans `database/`, executer via phpMyAdmin ou `deploy.sh`

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
        json_out(['id' => $insertId, 'message' => 'Cree avec succes'], 201);
    } elseif ($method === 'PUT') {
        // PUT /mon_module/{id}
    } elseif ($method === 'DELETE') {
        // DELETE /mon_module/{id}
    }
    break;
```

### 2. Frontend (js/pages/mon_module.js)

Creer le fichier avec la structure standard :

```javascript
let moduleHotelId = null;
let moduleData = [];

async function loadMonModule(container) {
    showLoading(container);

    try {
        const mgmtRes = await API.getManagementInfo();
        const hotels = mgmtRes.manageable_hotels || [];

        if (hotels.length === 0) {
            container.innerHTML = '<div class="card"><div class="empty-state">Aucun hotel</div></div>';
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

Ajouter l'entree sidebar dans `index.html` :

```html
<a href="#" class="nav-item" data-page="mon_module"><i class="fas fa-icon"></i> <span>Mon Module</span></a>
```

Ajouter le `<script>` dans `index.html` :

```html
<script src="js/pages/mon_module.js"></script>
```

### 4. Schema SQL

Creer la migration dans `database/` :

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

**js/utils.js** - `getDefaultPermissions()` : ajouter `'mon_module.manage': true/false` pour chaque role

**js/pages/settings.js** - 3 endroits :
- `PERMISSION_LABELS` : ajouter le label
- `PERMISSION_CATEGORIES` : ajouter dans la bonne categorie
- `DEFAULT_PERMISSIONS` : ajouter pour chaque role

## Fichiers cles a connaitre

| Fichier | Lignes | Role |
|---------|--------|------|
| `api/index.php` | ~10 380 | API REST complete (30+ endpoints, switch/case) |
| `api/Database.php` | 73 | Singleton PDO avec helpers (query, insert, count...) |
| `api/Auth.php` | 92 | JWT HMAC-SHA256 : generation, verification, getUser() |
| `api/config.php` | 76 | Configuration (.env, DB, JWT, CORS, securite, upload) |
| `api/cron.php` | variable | Cron dispatcher CLI (alertes automatiques, escalade) |
| `api/cron_runner.php` | variable | Runner automations planifiees (intervalle 30 min) |
| `js/app.js` | 802 | Controleur SPA, routage, menu, session, dark mode, polling |
| `js/api.js` | 426 | Fetch wrapper avec JWT + tous les appels API structures |
| `js/utils.js` | 535 | Toast, modals, formatage, permissions frontend, pagination |
| `js/i18n.js` | 2 192 | Traductions FR/EN/ES, selecteur langue |
| `js/chatbot.js` | 437 | Assistant chatbot client (pattern matching, navigation) |
| `js/capacitor-bridge.js` | 291 | Bridge Capacitor : push, camera, haptics, safe area |
| `js/config.js` | 8 | URL API et cles localStorage |
| `sw.js` | 176 | Service Worker : cache offline, push, stale-while-revalidate |
| `booking.html` | ~1 500 | Self check-in publique (Stripe, jsPDF) |
| `pms-agent.php` | variable | Agent relais PMS GeHo (long-polling, tourne sur PC hotel) |
| `deploy.sh` | 437 | Script deploiement (backup, git pull, migrations, permissions) |
| `database/schema.sql` | 1 385 | Schema principal (55+ tables) |

## Modules frontend (18 fichiers dans js/pages/)

| Fichier | Lignes | Module |
|---------|--------|--------|
| `dashboard.js` | 896 | Dashboard KPIs et graphiques Chart.js |
| `hotels.js` | 1 939 | Hotels (6 onglets : General, Reservation, PMS, Conges, Clotures, Revenue) |
| `housekeeping.js` | 1 681 | Gouvernante (dispatch + controle qualite 6 criteres + photos) |
| `maintenance.js` | 919 | Tickets maintenance (categories, priorites, escalade, commentaires) |
| `linen.js` | 615 | Blanchisserie (collecte, reception, stock, bons PDF) |
| `leaves.js` | 1 495 | Conges (demande, validation, config par hotel, export CSV, rapport) |
| `tasks.js` | 902 | Kanban (boards, colonnes, drag & drop, checklist, pieces jointes) |
| `evaluations.js` | 2 121 | Evaluations (grilles, criteres ponderes, historique, stats) |
| `audit.js` | 1 500 | Audits qualite (grilles, sections, questions, scoring, planification) |
| `closures.js` | 1 414 | Clotures financieres (cash, remise banque, champs configurables, export CSV) |
| `revenue.js` | 1 129 | Revenue management (tarifs OTA Xotelo, concurrents, historique) |
| `selfcheckin.js` | 1 307 | Self Check-in (config, QR codes, consignes, casiers, tarification) |
| `automations.js` | 920 | Automatisations planifiees (horaire, jours, hotels, destinataires) |
| `users.js` | 387 | Gestion utilisateurs (CRUD, affectation hotels) |
| `messages.js` | 408 | Messagerie interne (conversations, broadcast) |
| `notifications.js` | 407 | Notifications admin (envoi cible, historique campagnes) |
| `settings.js` | 674 | Parametres (3 onglets : Modules, Permissions, Notifications) |
| `rgpd.js` | 909 | RGPD admin (consentements, export, demandes, logs acces) |

## Roles utilisateur (7 niveaux)

| Code | Label | Portee |
|------|-------|--------|
| `admin` | Administrateur | Acces complet, gestion permissions, config systeme |
| `groupe_manager` | Responsable Groupe | Multi-hotels, escalade, validation conges/audits |
| `hotel_manager` | Responsable Hotel | Son hotel, validation conges, dispatch, clotures |
| `comptabilite` | Comptabilite | Clotures, blanchisserie, rapports financiers |
| `rh` | Ressources Humaines | Conges, evaluations, planning, gestion personnel |
| `receptionniste` | Receptionniste | Dispatch, controle, clotures journalieres, maintenance |
| `employee` | Employe | Taches quotidiennes, consulter planning, demander conges |

Verification role dans l'API :
```php
$user = require_role('admin', 'groupe_manager');
// ou manuellement :
if (!in_array($user['role'], ['admin', 'groupe_manager'])) {
    json_error('Acces refuse', 403);
}
```

## Systeme de permissions (RBAC)

Les permissions sont stockees dans `role_permissions` (SQL) et synchronisees en triple :
1. **SQL** : table `role_permissions` (role + permission + allowed)
2. **js/utils.js** : `getDefaultPermissions(role)` - fallback client
3. **js/pages/settings.js** : `PERMISSION_LABELS` + `PERMISSION_CATEGORIES` + `DEFAULT_PERMISSIONS`

Modules de permissions : `hotels`, `rooms`, `users`, `dispatch`, `linen`, `leaves`, `maintenance`, `tasks`, `evaluations`, `audit`, `revenue`, `closures`, `messages`, `notifications`, `dashboard`, `reports`, `permissions`, `selfcheckin`

## Systeme d'escalade automatique (cron.php)

| Module | Seuil | Action |
|--------|-------|--------|
| **Dispatch** | 12h sans dispatch | Alerte hotel_manager → 2j: groupe_manager → 5j: admin |
| **Controle** | 19h chambres non controlees | Meme escalade |
| **Maintenance** | Ticket ouvert 2j | groupe_manager → 5j: priorite urgente → 7j: priorite grave |
| **Audit** | X jours avant deadline | Rappel → 2j retard: groupe_manager → 5j: admin |
| **Cloture** | 13h sans cloture | hotel_manager → 48h: admin |
| **Revenue** | 6h quotidien | Mise a jour tarifs OTA via Xotelo |
| **Conges** | Lundi 9h | Rappel conges en attente de validation |
| **Taches** | 9h quotidien | Rappel taches arrivant a echeance |
| **Nettoyage** | 3h quotidien | Purge anciennes notifications, sessions expirees |

## Integrations externes

| Service | Usage | Configuration |
|---------|-------|---------------|
| **Xotelo API** | Tarifs OTA (Booking.com, Expedia...) pour revenue management | `hotels.xotelo_hotel_key` |
| **Stripe** | Paiement en ligne pour self check-in / booking | `hotels.stripe_publishable_key` + `stripe_secret_key` |
| **PMS GeHo** | Synchronisation reservations via agent relais | `pms-agent.php` sur le PC hotel |
| **Chart.js 4.4.1** | Graphiques dashboard et revenue (CDN) | Charge dans index.html |
| **Font Awesome 6.4.0** | Icones interface (CDN) | Charge dans index.html |
| **Google Fonts (Inter)** | Typographie (CDN) | Charge dans index.html |
| **jsPDF** | Generation factures/recus PDF (booking.html) | CDN dans booking.html |

## Application mobile (Capacitor)

- **App ID** : `com.aclgestion.app`
- **WebDir** : `www/` (contient index.html copie)
- **Mode** : WebView pointant vers `https://acl-gestion.com`
- **Plugins** : Camera, PushNotifications, StatusBar, Keyboard, Haptics, SplashScreen, App
- **Bridge** : `js/capacitor-bridge.js` detecte automatiquement web vs natif
- **Build** : `npm run cap:sync && npm run cap:open:ios`

## Patterns recurrents

### Filtrage multi-hotel
```php
$hotel_ids = implode(',', $user['hotel_ids']);
$items = db()->query("SELECT * FROM table WHERE hotel_id IN ($hotel_ids)");
```

### Upload de fichiers
```php
if (isset($_FILES['photo'])) {
    $ext = strtolower(pathinfo($_FILES['photo']['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, UPLOAD_ALLOWED_IMAGES)) json_error('Format non autorise');
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

### Notifications admin (campagnes ciblees)
```php
// Envoi cible via POST /notifications/admin/send
// target_type: 'all', 'hotel', 'role', 'users'
// Historique via GET /notifications/admin/history
// Restreint a admin, groupe_manager, hotel_manager
```

### Toast frontend
```javascript
toast('Operation reussie', 'success');
toast('Erreur lors de la sauvegarde', 'error');
toast('Attention : donnees incompletes', 'warning');
```

### Configuration par hotel
```javascript
// Charger la config specifique a l'hotel
const lcfg = await API.get(`hotels/${hotelId}/leave-config`);
// GET /hotels/{id}/leave-config et PUT /hotels/{id}/leave-config
```

### Dark mode
```javascript
toggleDarkMode(); // Bascule entre clair et sombre
// Preference sauvegardee dans localStorage('acl_theme')
// CSS variables switchees via data-theme="dark" sur <html>
```

## Points d'attention

- **Pas de framework** : tout est vanilla PHP/JS, pas d'injection de dependances ni d'ORM
- **Fichier API monolithique** : `api/index.php` fait ~10 380 lignes, chercher le `case` du module concerne
- **Pas de tests automatises** : tester manuellement via le navigateur
- **Pas de migration automatique** : executer les SQL manuellement via phpMyAdmin (ou via `deploy.sh`)
- **Configuration** : les credentials sont dans `.env` (jamais commite), lu par `config.php`
- **Encodage** : UTF-8 partout, BOM UTF-8 pour les exports CSV (compatibilite Excel)
- **Locale** : interface en francais par defaut, multilingue (FR/EN/ES)
- **Photos** : accepter JPG/PNG, max 5 Mo par defaut (`UPLOAD_MAX_SIZE_IMAGE`)
- **PDF** : accepter PDF pour les bons de reception et documents cloture, max 10 Mo (`UPLOAD_MAX_SIZE_DOC`)
- **Securite** : rate limiting login (5 tentatives/15min), headers securite (X-Frame-Options, X-XSS-Protection, nosniff), CORS strict, .htaccess uploads
- **Permissions** : triple synchronisation necessaire (SQL, utils.js, settings.js)
- **Versioning JS** : les scripts sont charges avec `?v=YYYYMMDD` pour le cache busting
- **Service Worker** : cache `acl-gestion-v2`, incrementer la version apres chaque deploiement
- **Capacitor** : les changements frontend sont refletes dans l'app via le mode serveur (pas de rebuild natif necessaire)
