# CLAUDE.md - Guide de developpement ACL GESTION

Ce fichier contient les instructions et conventions pour developper sur le projet ACL GESTION.

## Presentation rapide

ACL GESTION est une plateforme de gestion hoteliere multi-etablissements. SPA frontend (Vanilla JS) + API REST backend (PHP pur) + MySQL. Pas de framework, pas de build tool.

## Architecture

```
Frontend (SPA)          Backend (API REST)           Base de donnees
index.html              api/index.php (~7800L)       MySQL (50+ tables)
  └─ js/app.js            └─ switch($resource)       schema.sql + migrations
     └─ js/pages/*.js        ├─ Database.php
     └─ js/api.js            ├─ Auth.php (JWT)
     └─ js/utils.js          └─ config.php
```

- **Routage frontend** : hash-based (`#dashboard`, `#maintenance`, etc.) gere par `app.js`
- **Routage API** : `api/index.php/{resource}/{id}/{action}/{subaction}` avec switch/case
- **Auth** : JWT HMAC-SHA256, 7 jours, header `Authorization: Bearer <token>`
- **Etat** : localStorage pour token (`acl_token`) et user (`acl_user`)

## Conventions de code

### PHP (Backend - api/index.php)

- Tout le code API est dans un seul fichier `api/index.php` (~7800 lignes)
- Chaque module est un `case` dans le `switch ($resource)`
- Utiliser les helpers de `Database.php` : `db()->query()`, `db()->queryOne()`, `db()->insert()`, `db()->execute()`, `db()->count()`
- Auth : `require_auth()` au debut de chaque case, `$user = get_current_user()` pour l'utilisateur courant
- Reponses JSON : `json_response($data, $code)` et `json_error($message, $code)`
- Filtrage par hotel : toujours verifier `$user['hotel_ids']` pour limiter l'acces aux donnees
- Methodes HTTP : `$method` contient GET/POST/PUT/DELETE, router avec `if ($method === 'GET')`
- Variables de routage : `$resource`, `$id`, `$action`, `$subaction`
- Uploads fichiers : sauvegarder dans `uploads/{module}/`, generer un nom unique avec `uniqid()`
- Dates : toujours `date('Y-m-d H:i:s')` pour les timestamps SQL

### JavaScript (Frontend - js/pages/*.js)

- Chaque module est un fichier dans `js/pages/` qui exporte une fonction `loadModuleName(container)`
- `container` est le `<div id="page-content">` ou le module doit rendre son HTML
- Appels API via `API.get()`, `API.post()`, `API.put()`, `API.delete()` (definis dans `api.js`)
- Notifications : `showToast('message', 'success|error|warning|info')` (defini dans `utils.js`)
- Modales : `showModal(title, content, footer)` ou construire manuellement avec la classe `.modal-overlay`
- Formatage dates : `formatDate()`, `formatDateTime()` (definis dans `utils.js`)
- Formatage nombres : `formatNumber()`, `formatCurrency()` (definis dans `utils.js`)
- Navigation : `navigateTo('page')` pour changer de page
- Hotel courant : `API.user.current_hotel_id` ou recuperer via `API.getManagementInfo()`
- Pas de framework : DOM manipulation directe avec `innerHTML`, `querySelector`, `addEventListener`
- Charger les donnees en asynchrone : `async/await` avec `try/catch`

### CSS

- Design tokens dans `css/theme.css` (couleurs, espacements, typographie, ombres, radius)
- Utiliser les variables CSS : `var(--primary-500)`, `var(--space-4)`, `var(--radius-md)`, etc.
- Classes utilitaires : `.btn`, `.btn-primary`, `.btn-sm`, `.card`, `.badge`, `.form-control`, `.table`
- Responsive : mobile-first n'est pas strictement applique, mais breakpoints a 1024px, 768px, 480px
- Pas de preprocesseur CSS (pas de SASS/LESS)

### SQL

- Charset : `utf8mb4`
- Engine : `InnoDB`
- Nommage tables : `snake_case` (ex: `room_dispatch`, `leave_requests`)
- Cles etrangeres : nommees `fk_table_column`
- Index : nommes `idx_table_column`
- Timestamps : colonnes `created_at` et `updated_at` de type `DATETIME`
- Soft delete : pas utilise, suppression directe (sauf archivage taches)

## Comment ajouter un nouveau module

### 1. Backend (api/index.php)

Ajouter un nouveau `case` dans le switch principal :

```php
case 'mon_module':
    require_auth();
    $user = get_current_user();

    if ($method === 'GET') {
        if ($id) {
            // GET /mon_module/{id} - Detail
            $item = db()->queryOne("SELECT * FROM mon_module WHERE id = ?", [$id]);
            json_response($item);
        } else {
            // GET /mon_module - Liste
            $items = db()->query("SELECT * FROM mon_module WHERE hotel_id IN (" . implode(',', $user['hotel_ids']) . ")");
            json_response($items);
        }
    } elseif ($method === 'POST') {
        // POST /mon_module - Creation
        $data = json_decode(file_get_contents('php://input'), true);
        $insertId = db()->insert('mon_module', [
            'hotel_id' => $data['hotel_id'],
            'name' => $data['name'],
            'created_by' => $user['id'],
            'created_at' => date('Y-m-d H:i:s')
        ]);
        json_response(['id' => $insertId, 'message' => 'Cree avec succes'], 201);
    } elseif ($method === 'PUT') {
        // PUT /mon_module/{id} - Modification
    } elseif ($method === 'DELETE') {
        // DELETE /mon_module/{id} - Suppression
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

        // Render HTML
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

async function loadModuleData() {
    // Charger et afficher les donnees
}
```

### 3. Enregistrer le module dans app.js

Ajouter dans le tableau `NAV_ITEMS` de `app.js` :

```javascript
{ id: 'mon_module', label: 'Mon Module', icon: 'fa-icon', section: 'operations',
  roles: ['admin', 'groupe_manager', 'hotel_manager'] }
```

Ajouter dans le `switch` de chargement de pages dans `app.js` :

```javascript
case 'mon_module':
    loadMonModule(container);
    break;
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

Ajouter les permissions dans la migration :

```sql
INSERT INTO role_permissions (role, permission, allowed, updated_at) VALUES
('admin', 'mon_module.manage', 1, NOW()),
('groupe_manager', 'mon_module.manage', 1, NOW()),
('hotel_manager', 'mon_module.view', 1, NOW())
ON DUPLICATE KEY UPDATE allowed = VALUES(allowed);
```

## Fichiers cles a connaitre

| Fichier | Lignes | Role |
|---------|--------|------|
| `api/index.php` | ~7800 | API REST complete (tous les endpoints) |
| `api/Database.php` | 64 | Singleton PDO avec helpers |
| `api/Auth.php` | 92 | JWT generation/verification |
| `api/config.php` | 37 | Configuration (DB, JWT, timezone) |
| `api/cron.php` | ~1400 | Alertes automatiques CLI |
| `api/cron_runner.php` | ~200 | Runner automations planifiees |
| `js/app.js` | ~600 | Controleur SPA, routage, menu |
| `js/api.js` | ~100 | Fetch wrapper avec JWT |
| `js/utils.js` | 440 | Toast, modals, formatage |
| `js/chatbot.js` | 434 | Assistant chatbot client |
| `database/schema.sql` | ~1340 | Schema complet (50+ tables) |

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
if (!in_array($user['role'], ['admin', 'groupe_manager'])) {
    json_error('Acces refuse', 403);
}
```

## Patterns recurrents

### Filtrage multi-hotel
L'utilisateur peut etre affecte a plusieurs hotels. Toujours filtrer :
```php
$hotel_ids = implode(',', $user['hotel_ids']);
$items = db()->query("SELECT * FROM table WHERE hotel_id IN ($hotel_ids)");
```

### Upload de fichiers
```php
if (isset($_FILES['photo'])) {
    $ext = pathinfo($_FILES['photo']['name'], PATHINFO_EXTENSION);
    $filename = uniqid() . '.' . $ext;
    $path = __DIR__ . '/../uploads/module/' . $filename;
    move_uploaded_file($_FILES['photo']['tmp_name'], $path);
    // Sauvegarder le chemin relatif en BDD : 'uploads/module/' . $filename
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

### Toast frontend
```javascript
showToast('Operation reussie', 'success');
showToast('Erreur lors de la sauvegarde', 'error');
showToast('Attention : donnees incompletes', 'warning');
```

## Points d'attention

- **Pas de framework** : tout est vanilla PHP/JS, pas d'injection de dependances ni d'ORM
- **Fichier API monolithique** : `api/index.php` fait ~7800 lignes, chercher le `case` du module concerne
- **Pas de tests automatises** : tester manuellement via le navigateur
- **Pas de migration automatique** : executer les SQL manuellement
- **Encodage** : UTF-8 partout, BOM UTF-8 pour les exports CSV (compatibilite Excel)
- **Locale** : interface en francais, dates au format francais
- **Photos** : accepter JPG/PNG, max 5Mo par defaut
- **PDF** : accepter PDF pour les bons de reception et documents cloture
