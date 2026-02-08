# CLAUDE.md - Guide de developpement ACL GESTION

Ce fichier contient les instructions et conventions pour developper sur le projet ACL GESTION.

## Presentation rapide

ACL GESTION est une plateforme de gestion hoteliere multi-etablissements. SPA frontend (Vanilla JS) + API REST backend (PHP pur) + MySQL. Pas de framework, pas de build tool.

## Serveur VPS / Production

| Element | Valeur |
|---------|--------|
| **Hebergeur** | OVH VPS |
| **OS** | Debian / Ubuntu Linux |
| **Panel** | Plesk |
| **Domaine** | acl-gestion.com |
| **PHP** | 7.4+ avec PDO MySQL |
| **MySQL** | MariaDB 10.x |
| **Webserver** | Apache (mod_rewrite actif) |
| **SSL** | Let's Encrypt (auto-renew) |
| **Timezone** | Europe/Paris |
| **Deploiement** | Upload FTP / SSH ou git pull |
| **Logs** | Plesk > Logs ou `/var/log/apache2/` |
| **Cron** | Configure via Plesk > Taches planifiees |
| **BDD** | Accessible via phpMyAdmin (Plesk) |
| **Uploads** | Repertoire `uploads/` a la racine, permissions 755 |
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

## Architecture

```
Frontend (SPA)          Backend (API REST)           Base de donnees
index.html              api/index.php (~9100L)       MySQL (55+ tables)
  └─ js/app.js            └─ switch($resource)       schema.sql + 8 migrations
     └─ js/pages/*.js        ├─ Database.php
     └─ js/api.js            ├─ Auth.php (JWT)
     └─ js/i18n.js           ├─ config.php (.env)
     └─ js/utils.js          ├─ cron.php
     └─ js/chatbot.js        └─ cron_runner.php
```

- **Routage frontend** : hash-based (`#dashboard`, `#maintenance`, etc.) gere par `app.js`
- **Routage API** : `api/index.php/{resource}/{id}/{action}/{subaction}` avec switch/case
- **Auth** : JWT HMAC-SHA256, 7 jours, header `Authorization: Bearer <token>`
- **Etat** : localStorage pour token (`acl_token`) et user (`acl_user`)
- **Config** : fichier `.env` charge par `config.php` (jamais commite)
- **i18n** : multi-langue (FR, EN, ES) via `js/i18n.js`, fonction `t('cle')`
- **Rate limiting** : 5 tentatives login, blocage 15 min

## Conventions de code

### PHP (Backend - api/index.php)

- Tout le code API est dans un seul fichier `api/index.php` (~9100 lignes)
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

### JavaScript (Frontend - js/pages/*.js)

- Chaque module est un fichier dans `js/pages/` qui exporte une fonction `loadModuleName(container)`
- `container` est le `<div id="page-content">` ou le module doit rendre son HTML
- Appels API via `API.get()`, `API.post()`, `API.put()`, `API.delete()` (definis dans `api.js`)
- Notifications : `toast('message', 'success|error|warning|info')` (defini dans `utils.js`)
- Modales : `openModal(title, content, size)` ou construire manuellement
- Formatage dates : `formatDate()`, `formatDateTime()` (definis dans `utils.js`)
- Formatage nombres : `formatNumber()`, `formatCurrency()` (definis dans `utils.js`)
- Navigation : `navigateTo('page')` pour changer de page
- Hotel courant : `API.user.current_hotel_id` ou recuperer via `API.getManagementInfo()`
- Permissions : `hasPermission('module.action')` pour verifier cote frontend
- Traductions : `t('cle.sous_cle')` pour les textes multilingues
- Pas de framework : DOM manipulation directe avec `innerHTML`, `querySelector`, `addEventListener`
- Charger les donnees en asynchrone : `async/await` avec `try/catch`
- Echapper le HTML : `esc(string)` pour prevenir XSS, `escAttr(string)` pour les attributs

### Pages avec onglets (pattern recommande)

Certaines pages utilisent un systeme d'onglets (hotels, parametres). Pattern :

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
- Styles dynamiques : injecter via `document.head.appendChild(style)` avec un ID pour eviter les doublons

### SQL

- Charset : `utf8mb4`
- Engine : `InnoDB`
- Nommage tables : `snake_case` (ex: `room_dispatch`, `leave_requests`)
- Cles etrangeres : nommees `fk_table_column`
- Index : nommes `idx_table_column`
- Timestamps : colonnes `created_at` et `updated_at` de type `DATETIME`
- Soft delete : pas utilise, suppression directe (sauf archivage taches)
- Migrations : fichiers separes dans `database/`, executer via phpMyAdmin

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

### 5. Permissions

Ajouter les permissions dans la migration SQL + dans 3 endroits frontend :

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
| `api/index.php` | ~9100 | API REST complete (tous les endpoints) |
| `api/Database.php` | 64 | Singleton PDO avec helpers |
| `api/Auth.php` | 92 | JWT generation/verification |
| `api/config.php` | 76 | Configuration (.env, DB, JWT, CORS, securite) |
| `api/cron.php` | ~1580 | Alertes automatiques CLI |
| `api/cron_runner.php` | ~340 | Runner automations planifiees |
| `js/app.js` | ~774 | Controleur SPA, routage, menu, permissions |
| `js/api.js` | ~100 | Fetch wrapper avec JWT |
| `js/utils.js` | ~524 | Toast, modals, formatage, permissions frontend |
| `js/i18n.js` | ~2192 | Traductions FR/EN/ES |
| `js/chatbot.js` | 437 | Assistant chatbot client |
| `js/config.js` | 8 | URL API et cles localStorage |
| `database/schema.sql` | ~1385 | Schema complet (55+ tables) |

## Modules frontend (17 fichiers dans js/pages/)

| Fichier | Lignes | Module |
|---------|--------|--------|
| `dashboard.js` | 896 | Dashboard KPIs et graphiques |
| `hotels.js` | 1387 | Hotels (page complete avec 6 onglets) |
| `housekeeping.js` | 1681 | Gouvernante (dispatch + controle) |
| `maintenance.js` | 921 | Tickets maintenance |
| `linen.js` | 615 | Blanchisserie |
| `leaves.js` | 1495 | Conges (config dynamique par hotel) |
| `tasks.js` | 862 | Kanban taches |
| `evaluations.js` | 2011 | Evaluations personnel |
| `audit.js` | 1500 | Audits qualite |
| `closures.js` | 1280 | Clotures financieres |
| `revenue.js` | 1129 | Revenue management |
| `users.js` | 387 | Gestion utilisateurs |
| `messages.js` | 408 | Messagerie interne |
| `settings.js` | 673 | Parametres (3 onglets : Modules, Permissions, Notifications) |
| `notifications.js` | 407 | Gestion des notifications (envoi cible, historique) |
| `rgpd.js` | 909 | RGPD admin |
| `automations.js` | 920 | Automatisations planifiees |

## Roles utilisateur

| Code | Label |
|------|-------|
| `admin` | Administrateur |
| `groupe_manager` | Responsable Groupe |
| `hotel_manager` | Responsable Hotel |
| `comptabilite` | Comptabilite |
| `rh` | Ressources Humaines |
| `receptionniste` | Receptionniste |
| `employee` | Employe |

Verification role dans l'API :
```php
$user = require_role('admin', 'groupe_manager');
// ou manuellement :
if (!in_array($user['role'], ['admin', 'groupe_manager'])) {
    json_error('Acces refuse', 403);
}
```

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

### Configuration par hotel (pattern conges)
```javascript
// Charger la config specifique a l'hotel
const lcfg = await API.get(`hotels/${hotelId}/leave-config`);
// GET /hotels/{id}/leave-config et PUT /hotels/{id}/leave-config
```

### Page avec onglets dans Parametres
Le module Parametres (`settings.js`) utilise 3 onglets :
- **Modules** : activer/desactiver les modules du systeme
- **Permissions** : matrice des permissions par role + legende
- **Notifications** : envoi de notifications ciblees + historique des campagnes

Le module Hotels (`hotels.js`) utilise 6 onglets pour l'edition :
- General, Reservation, PMS & Paiement, Conges, Clotures, Revenue

## Points d'attention

- **Pas de framework** : tout est vanilla PHP/JS, pas d'injection de dependances ni d'ORM
- **Fichier API monolithique** : `api/index.php` fait ~9100 lignes, chercher le `case` du module concerne
- **Pas de tests automatises** : tester manuellement via le navigateur
- **Pas de migration automatique** : executer les SQL manuellement via phpMyAdmin
- **Configuration** : les credentials sont dans `.env` (jamais commite), lu par `config.php`
- **Encodage** : UTF-8 partout, BOM UTF-8 pour les exports CSV (compatibilite Excel)
- **Locale** : interface en francais par defaut, multilingue (FR/EN/ES)
- **Photos** : accepter JPG/PNG, max 5Mo par defaut
- **PDF** : accepter PDF pour les bons de reception et documents cloture, max 10Mo
- **Securite** : rate limiting login (5 tentatives/15min), headers securite, CORS strict
- **Permissions** : triple synchronisation necessaire (SQL, utils.js `getDefaultPermissions()`, settings.js)
