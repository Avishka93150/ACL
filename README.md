# ACL GESTION

Plateforme de gestion hoteliere multi-etablissements. Application web SPA (Single Page Application) couvrant l'ensemble des operations quotidiennes d'un groupe hotelier : gouvernante, maintenance, blanchisserie, conges, planning, clotures financieres, audits qualite, revenue management, et plus.

## Stack technique

- **Backend** : PHP pur (pas de framework), API REST monolithique
- **Frontend** : Vanilla JavaScript SPA avec routage hash
- **Base de donnees** : MySQL avec PDO
- **Authentification** : JWT (HMAC-SHA256, expiration 7 jours)
- **CDN** : Font Awesome 6.4.0, Chart.js 4.4.1, Google Fonts (Inter)
- **API externe** : Xotelo (tarifs OTA / revenue management)
- **Timezone** : Europe/Paris
- **Aucun build tool** : pas de npm, Composer, Webpack, ou bundler

## Installation

### Prerequis

- PHP 7.4+ avec extension PDO MySQL
- MySQL 5.6+ ou MariaDB 10.x
- Serveur Apache ou Nginx (mod_rewrite optionnel)

### Etapes

1. **Base de donnees**
   ```sql
   CREATE DATABASE acl_gestion CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
   Importer dans l'ordre :
   ```bash
   mysql -u user -p acl_gestion < database/schema.sql
   mysql -u user -p acl_gestion < database/migration_audit.sql
   mysql -u user -p acl_gestion < database/migration_automations.sql
   mysql -u user -p acl_gestion < database/migration_revenue.sql
   mysql -u user -p acl_gestion < database/migration_revenue_events.sql
   mysql -u user -p acl_gestion < database/migration_revenue_history.sql
   mysql -u user -p acl_gestion < database/migration_task_archive.sql
   ```

2. **Configuration**
   Editer `api/config.php` :
   ```php
   define('DB_HOST', 'localhost');
   define('DB_NAME', 'acl_gestion');
   define('DB_USER', 'votre_user');
   define('DB_PASS', 'votre_password');
   define('JWT_SECRET', 'votre_cle_secrete_unique');
   ```

3. **Cron jobs** (optionnel mais recommande)
   ```crontab
   # Alertes dispatch (12h) et controle (19h)
   0 12 * * * php /chemin/api/cron.php dispatch
   0 19 * * * php /chemin/api/cron.php control
   # Alertes maintenance, conges, taches, audit, cloture (9h)
   0 9 * * * php /chemin/api/cron.php maintenance
   0 9 * * 1 php /chemin/api/cron.php leaves_reminder
   0 9 * * * php /chemin/api/cron.php tasks_due
   0 9 * * * php /chemin/api/cron.php audit
   0 13 * * * php /chemin/api/cron.php closure
   # Revenue management (6h)
   0 6 * * * php /chemin/api/cron.php revenue
   # Nettoyage systeme (3h)
   0 3 * * * php /chemin/api/cron.php cleanup
   # Runner automations (toutes les 30 min)
   */30 * * * * php /chemin/api/cron_runner.php
   ```

4. **Deploiement**
   Uploader tous les fichiers a la racine du domaine.

5. **Test**
   Ouvrir le site dans un navigateur.

## Connexion par defaut

| Email | Mot de passe |
|-------|-------------|
| admin@acl-gestion.fr | Admin@123 |

**Changer ce mot de passe immediatement apres la premiere connexion.**

## Structure du projet

```
ACL/
├── index.html                  # Point d'entree unique SPA
├── css/
│   ├── theme.css               # Design system (tokens, variables, composants)
│   ├── layout.css              # Sidebar, header, contenu principal
│   ├── style.css               # Landing page, login, formulaires
│   ├── landing.css             # Landing page (version design tokens)
│   └── dashboard.css           # KPIs, stats, graphiques, activite
├── js/
│   ├── config.js               # URL API, cles localStorage
│   ├── api.js                  # Fetch wrapper avec injection JWT
│   ├── utils.js                # Toast, modals, formatage dates/nombres
│   ├── app.js                  # Controleur SPA, routage hash, menu, session
│   ├── chatbot.js              # Assistant chatbot client (pattern matching)
│   └── pages/                  # 16 modules fonctionnels
│       ├── dashboard.js        # KPIs, stats, graphiques Chart.js
│       ├── hotels.js           # CRUD hotels + chambres
│       ├── housekeeping.js     # Dispatch chambres, controle qualite
│       ├── maintenance.js      # Tickets maintenance, priorites, escalade
│       ├── linen.js            # Blanchisserie : collecte, reception, stock
│       ├── leaves.js           # Conges : demande, validation, export CSV
│       ├── tasks.js            # Kanban : boards, colonnes, drag & drop
│       ├── audit.js            # Grilles audit, questions, scoring
│       ├── closures.js         # Clotures financieres, remise banque
│       ├── evaluations.js      # Evaluations employes, criteres ponderes
│       ├── revenue.js          # Revenue management, tarifs OTA (Xotelo)
│       ├── automations.js      # Config alertes automatiques
│       ├── messages.js         # Messagerie interne, broadcast
│       ├── rgpd.js             # RGPD : consentements, export, demandes
│       ├── settings.js         # Activation modules, permissions roles
│       └── users.js            # Gestion utilisateurs, affectation hotels
├── api/
│   ├── config.php              # Config BDD, JWT, timezone, debug
│   ├── Database.php            # Singleton PDO + helpers (query, insert, etc.)
│   ├── Auth.php                # JWT : generation, verification, require_auth()
│   ├── index.php               # API REST complete (~7800 lignes)
│   ├── cron.php                # Cron dispatcher CLI (alertes automatiques)
│   └── cron_runner.php         # Runner d'automations planifiees
├── database/
│   ├── schema.sql              # Schema principal (~1340 lignes, 50+ tables)
│   ├── migration_audit.sql     # Tables audit (grilles, questions, permissions)
│   ├── migration_automations.sql # Tables automatisations
│   ├── migration_revenue.sql   # Tables revenue (concurrents, cache Xotelo)
│   ├── migration_revenue_events.sql # Evenements calendrier revenue
│   ├── migration_revenue_history.sql # Historique tarifs
│   └── migration_task_archive.sql # Archivage taches
└── uploads/                    # Fichiers uploades (photos, PDF)
    ├── maintenance/            # Photos tickets maintenance
    ├── linen/                  # Bons de reception PDF
    ├── dispatch/               # Photos controle qualite
    └── closures/               # Documents clotures (PDF, JPG)
```

## Modules fonctionnels (16)

### Operations quotidiennes

| Module | Description | Fichiers |
|--------|-------------|----------|
| **Dashboard** | KPIs temps reel, graphiques, activite recente, raccourcis | `dashboard.js` |
| **Gouvernante** | Dispatch chambres par femme de chambre, suivi nettoyage (blanc/recouche), controle qualite 6 criteres avec photos | `housekeeping.js` |
| **Maintenance** | Tickets avec categories, priorite (basse a critique), assignation technicien, escalade automatique, photos | `maintenance.js` |
| **Blanchisserie** | Collecte linge sale, reception linge propre, suivi 4 types (petits draps, grands draps, petites housses, grandes housses), ecarts | `linen.js` |

### Ressources humaines

| Module | Description | Fichiers |
|--------|-------------|----------|
| **Conges** | Demande de conges (CP, RTT, sans solde, etc.), validation hierarchique multi-niveaux, calendrier, export CSV, rapport trimestriel | `leaves.js` |
| **Evaluations** | Grilles d'evaluation personnalisables, criteres ponderes, historique par employe | `evaluations.js` |
| **Planning** | Gestion du temps : services, postes, contrats, plannings hebdomadaires (brouillon/publie/verrouille), pointage, compteurs heures | `time` (API) |
| **Taches** | Kanban multi-tableaux, colonnes personnalisables, drag & drop, priorites, echeances, archivage | `tasks.js` |

### Finance et qualite

| Module | Description | Fichiers |
|--------|-------------|----------|
| **Clotures** | Cloture journaliere : cash recu/depense, remise banque, achats, documents, champs configurables, export CSV mensuel | `closures.js` |
| **Revenue** | Tarifs OTA via API Xotelo, comparaison concurrents, historique prix, evenements calendrier | `revenue.js` |
| **Audits** | Grilles configurables avec sections, questions (note/oui-non/texte/choix), ponderation, scoring, planification periodique | `audit.js` |

### Administration

| Module | Description | Fichiers |
|--------|-------------|----------|
| **Hotels** | CRUD etablissements, gestion chambres (numero, etage, type), config Xotelo | `hotels.js` |
| **Utilisateurs** | CRUD comptes, assignation roles et hotels | `users.js` |
| **Parametres** | Activation/desactivation modules, permissions par role | `settings.js` |
| **Messagerie** | Messages directs, par hotel, broadcast, conversations | `messages.js` |
| **RGPD** | Consentements, export donnees personnelles, demandes (acces, rectification, effacement, portabilite) | `rgpd.js` |

### Systeme

| Composant | Description |
|-----------|-------------|
| **Automations** | Configuration des alertes planifiees (horaire, jours, hotels, destinataires) |
| **Chatbot** | Assistant integre avec pattern matching (aide navigation, FAQ modules) |
| **Cron** | Alertes automatiques : dispatch, controle, maintenance, conges, taches, audit, cloture, revenue, nettoyage |

## Roles et permissions

7 roles hierarchiques avec controle d'acces granulaire via la table `role_permissions` :

| Role | Code | Portee |
|------|------|--------|
| Administrateur | `admin` | Acces complet, gestion permissions, config systeme |
| Responsable Groupe | `groupe_manager` | Multi-hotels, escalade, validation conges/audits |
| Responsable Hotel | `hotel_manager` | Son hotel, validation conges, dispatch, clotures |
| Comptabilite | `comptabilite` | Clotures, blanchisserie, rapports financiers |
| Ressources Humaines | `rh` | Conges, evaluations, planning, gestion personnel |
| Receptionniste | `receptionniste` | Dispatch, controle, clotures journalieres |
| Employe | `employee` | Taches quotidiennes, consulter planning, demander conges |

Les permissions sont configurables par module dans les Parametres (admin uniquement).

## API REST

Point d'entree unique : `api/index.php`

Routage : `/{resource}/{id}/{action}/{subaction}`

Toutes les requetes (sauf `auth/login` et `health`) necessitent le header :
```
Authorization: Bearer <jwt_token>
```

### Endpoints principaux

| Resource | Methodes | Description |
|----------|----------|-------------|
| `health` | GET | Status API |
| `auth` | POST login/logout | Authentification |
| `dashboard` | GET stats | Statistiques agregees |
| `hotels` | GET, POST, PUT, DELETE | Gestion hotels |
| `rooms` | GET, POST, PUT, DELETE | Gestion chambres |
| `dispatch` | GET, POST, PUT | Dispatch et suivi chambres |
| `dispatch-control` | GET, POST, PUT | Controle qualite |
| `maintenance` | GET, POST, PUT, DELETE | Tickets maintenance |
| `linen` | GET, POST | Transactions blanchisserie |
| `leaves` | GET, POST, PUT | Demandes de conges |
| `tasks` | GET, POST, PUT, DELETE | Boards et taches Kanban |
| `evaluations` | GET, POST, PUT, DELETE | Grilles et evaluations |
| `audit` | GET, POST, PUT, DELETE | Grilles audit, executions |
| `closures` | GET, POST, PUT | Clotures journalieres |
| `time` | GET, POST, PUT, DELETE | Planning complet (sous-resources : positions, services, contracts, holidays, schedules, entries, timesheet, counters) |
| `revenue` | GET, POST, PUT, DELETE | Tarifs Xotelo et concurrents |
| `users` | GET, POST, PUT, DELETE | Gestion utilisateurs |
| `messages` | GET, POST | Messages internes |
| `messaging` | GET, POST | Conversations Messenger |
| `notifications` | GET, PUT | Notifications in-app |
| `permissions` | GET, PUT | Permissions par role |
| `rgpd` | GET, POST, PUT, DELETE | RGPD (consentements, demandes) |
| `automations` | GET, POST, PUT, DELETE | Automations planifiees |

## Systeme d'escalade automatique

Les cron jobs gerent des alertes progressives :

**Dispatch** : Alerte si aucun dispatch a 12h → hotel_manager, 2 jours → groupe_manager, 5 jours → admin

**Controle** : Alerte si chambres nettoyees non controlees a 19h → meme escalade

**Maintenance** : Ticket ouvert 2 jours → groupe_manager, 5 jours → priorite urgente, 7 jours → priorite grave

**Audit** : Rappel X jours avant deadline, en retard 2 jours → groupe_manager, 5 jours → admin

**Cloture** : Rappel 13h → hotel_manager, 48h sans cloture → admin

## Base de donnees

Schema principal dans `database/schema.sql` (~50 tables) :

- **Core** : `users`, `user_hotels`, `role_permissions`, `hotels`, `rooms`
- **Operations** : `room_dispatch`, `dispatch_control`, `dispatch_alerts`, `maintenance_tickets`
- **Blanchisserie** : `linen_transactions`, `linen_stock`, `linen_hotel_config`
- **RH** : `leave_requests`, `leave_approvals`, `task_definitions`, `task_assignments`, `evaluations`
- **Planning** : `time_schedules`, `time_schedule_entries`, `time_entries`, `time_contracts`, `time_positions`, `time_services`, `time_counters`, `time_user_positions`, `time_holidays`
- **Qualite** : `audit_grids`, `audit_questions`, `audit_answers`, `audit_grid_permissions`, `audit_grid_hotels`, `audit_schedules`
- **Finance** : `daily_closures`, `closure_documents`, `closure_field_configs`, `closure_field_values`
- **Revenue** : `hotel_competitors`, `xotelo_rates_cache`, `xotelo_rates_history`, `xotelo_api_logs`, `revenue_events`
- **RGPD** : `user_consents`, `gdpr_requests`, `gdpr_settings`, `access_logs`
- **Messaging** : `notifications`, `messages`, `conversations`, `conversation_participants`, `conversation_messages`
- **Automations** : `automations`, `automation_hotels`, `automation_recipients`, `automation_logs`

## Depannage

### Erreur 500
- Verifier les logs PHP (Plesk ou `/var/log/`)
- Verifier les identifiants MySQL dans `api/config.php`
- Verifier que toutes les tables sont creees (schema.sql + migrations)

### Page blanche
- Verifier que tous les fichiers JS sont presents
- Ouvrir la console du navigateur (F12) pour voir les erreurs

### Erreur de connexion
- Verifier que la base de donnees est importee correctement
- Verifier que l'utilisateur admin existe dans la table `users`
- Verifier le JWT_SECRET dans config.php

### Cron ne fonctionne pas
- Tester manuellement : `php api/cron.php dispatch`
- Verifier que le chemin est absolu dans le crontab
- Verifier les permissions du fichier

---

**ACL GESTION** - 2024-2026
