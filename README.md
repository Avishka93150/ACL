# ACL GESTION

Plateforme de gestion hoteliere multi-etablissements. Application web SPA (Single Page Application) couvrant l'ensemble des operations quotidiennes d'un groupe hotelier : gouvernante, maintenance, blanchisserie, conges, planning, clotures financieres, audits qualite, revenue management, reservations en ligne, gestion des notifications, et plus.

## Stack technique

- **Backend** : PHP pur (pas de framework), API REST monolithique (~9100 lignes)
- **Frontend** : Vanilla JavaScript SPA avec routage hash (17 modules, ~17 000 lignes)
- **Base de donnees** : MySQL / MariaDB avec PDO (55+ tables)
- **Authentification** : JWT (HMAC-SHA256, expiration 7 jours)
- **CDN** : Font Awesome 6.4.0, Chart.js 4.4.1, Google Fonts (Inter)
- **API externe** : Xotelo (tarifs OTA / revenue management)
- **i18n** : Multi-langue (Francais, Anglais, Espagnol)
- **Securite** : Rate limiting, headers securite, CORS strict, RGPD
- **Timezone** : Europe/Paris
- **Aucun build tool** : pas de npm, Composer, Webpack, ou bundler

## Serveur VPS / Production

| Element | Valeur |
|---------|--------|
| **Hebergeur** | OVH VPS |
| **OS** | Debian / Ubuntu Linux |
| **Panel** | Plesk |
| **Domaine** | acl-gestion.com |
| **PHP** | 7.4+ avec extension PDO MySQL |
| **MySQL** | MariaDB 10.x |
| **Webserver** | Apache (mod_rewrite actif) |
| **SSL** | Let's Encrypt (auto-renew via Plesk) |
| **Deploiement** | Upload FTP/SSH ou git pull |
| **Logs** | Plesk > Logs ou `/var/log/apache2/` |
| **Cron** | Configure via Plesk > Taches planifiees |
| **BDD** | Accessible via phpMyAdmin (Plesk) |
| **Sauvegardes** | Automatiques Plesk (quotidien) |

## Installation

### Prerequis

- PHP 7.4+ avec extension PDO MySQL
- MySQL 5.6+ ou MariaDB 10.x
- Serveur Apache ou Nginx (mod_rewrite pour les URL propres)

### Etapes

1. **Cloner le projet**
   ```bash
   git clone <url_repo> /var/www/acl-gestion.com
   ```

2. **Base de donnees**
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
   mysql -u user -p acl_gestion < database/migration_security.sql
   mysql -u user -p acl_gestion < database/migration_pms_stripe.sql
   ```

3. **Fichier .env** (a la racine du projet)
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

4. **Permissions fichiers**
   ```bash
   chmod 755 uploads/
   chmod 755 uploads/maintenance/ uploads/linen/ uploads/dispatch/ uploads/closures/
   ```

5. **Cron jobs** (via Plesk ou crontab)
   ```crontab
   # Alertes dispatch (12h) et controle (19h)
   0 12 * * * php /var/www/acl-gestion.com/api/cron.php dispatch
   0 19 * * * php /var/www/acl-gestion.com/api/cron.php control
   # Alertes maintenance, conges, taches, audit, cloture (9h)
   0 9 * * * php /var/www/acl-gestion.com/api/cron.php maintenance
   0 9 * * 1 php /var/www/acl-gestion.com/api/cron.php leaves_reminder
   0 9 * * * php /var/www/acl-gestion.com/api/cron.php tasks_due
   0 9 * * * php /var/www/acl-gestion.com/api/cron.php audit
   0 13 * * * php /var/www/acl-gestion.com/api/cron.php closure
   # Revenue management (6h)
   0 6 * * * php /var/www/acl-gestion.com/api/cron.php revenue
   # Nettoyage systeme (3h)
   0 3 * * * php /var/www/acl-gestion.com/api/cron.php cleanup
   # Runner automations (toutes les 30 min)
   */30 * * * * php /var/www/acl-gestion.com/api/cron_runner.php
   ```

6. **Test**
   Ouvrir le site dans un navigateur. Se connecter avec le compte admin.

## Connexion par defaut

| Email | Mot de passe |
|-------|-------------|
| admin@acl-gestion.fr | Admin@123 |

**Changer ce mot de passe immediatement apres la premiere connexion.**

## Structure du projet

```
ACL/
├── index.html                  # Point d'entree unique SPA
├── .env                        # Variables d'environnement (NON commite)
├── booking.html                # Page de reservation publique
├── css/
│   ├── theme.css               # Design system (tokens, variables, composants)
│   ├── layout.css              # Sidebar, header, contenu principal
│   ├── style.css               # Landing page, login, formulaires
│   ├── landing.css             # Landing page (version design tokens)
│   ├── dashboard.css           # KPIs, stats, graphiques, activite
│   └── app-polish.css          # Raffinements visuels
├── js/
│   ├── config.js               # URL API, cles localStorage
│   ├── api.js                  # Fetch wrapper avec injection JWT
│   ├── i18n.js                 # Traductions FR/EN/ES (~2200 lignes)
│   ├── utils.js                # Toast, modals, formatage, permissions (~524 lignes)
│   ├── app.js                  # Controleur SPA, routage hash, menu, session (~774 lignes)
│   ├── chatbot.js              # Assistant chatbot client (pattern matching)
│   └── pages/                  # 17 modules fonctionnels
│       ├── dashboard.js        # KPIs, stats, graphiques Chart.js
│       ├── hotels.js           # Hotels : page complete avec 6 onglets
│       ├── housekeeping.js     # Dispatch chambres, controle qualite
│       ├── maintenance.js      # Tickets maintenance, priorites, escalade
│       ├── linen.js            # Blanchisserie : collecte, reception, stock
│       ├── leaves.js           # Conges : demande, validation, config par hotel
│       ├── tasks.js            # Kanban : boards, colonnes, drag & drop
│       ├── audit.js            # Grilles audit, questions, scoring
│       ├── closures.js         # Clotures financieres, remise banque
│       ├── evaluations.js      # Evaluations employes, criteres ponderes
│       ├── revenue.js          # Revenue management, tarifs OTA (Xotelo)
│       ├── automations.js      # Config alertes automatiques
│       ├── messages.js         # Messagerie interne, broadcast
│       ├── notifications.js    # Gestion notifications (envoi cible, historique)
│       ├── rgpd.js             # RGPD : consentements, export, demandes
│       ├── settings.js         # Parametres (3 onglets : modules, permissions, notifications)
│       └── users.js            # Gestion utilisateurs, affectation hotels
├── api/
│   ├── config.php              # Config (.env, BDD, JWT, CORS, securite, rate limiting)
│   ├── Database.php            # Singleton PDO + helpers (query, insert, etc.)
│   ├── Auth.php                # JWT : generation, verification, require_auth()
│   ├── index.php               # API REST complete (~9100 lignes)
│   ├── cron.php                # Cron dispatcher CLI (alertes automatiques, ~1580 lignes)
│   └── cron_runner.php         # Runner d'automations planifiees (~340 lignes)
├── database/
│   ├── schema.sql              # Schema principal (~1385 lignes, 55+ tables)
│   ├── migration_audit.sql     # Tables audit (grilles, questions, permissions)
│   ├── migration_automations.sql # Tables automatisations
│   ├── migration_revenue.sql   # Tables revenue (concurrents, cache Xotelo)
│   ├── migration_revenue_events.sql # Evenements calendrier revenue
│   ├── migration_revenue_history.sql # Historique tarifs
│   ├── migration_task_archive.sql # Archivage taches
│   ├── migration_security.sql  # Rate limiting, permissions push
│   └── migration_pms_stripe.sql # PMS, Stripe, reservations, conges hotel, categories, notifications
└── uploads/                    # Fichiers uploades (photos, PDF)
    ├── maintenance/            # Photos tickets maintenance
    ├── linen/                  # Bons de reception PDF
    ├── dispatch/               # Photos controle qualite
    └── closures/               # Documents clotures (PDF, JPG)
```

## Modules fonctionnels (17+)

### Operations quotidiennes

| Module | Description | Fichier |
|--------|-------------|---------|
| **Dashboard** | KPIs temps reel, graphiques Chart.js, activite recente, raccourcis | `dashboard.js` |
| **Gouvernante** | Dispatch chambres par femme de chambre, suivi nettoyage (blanc/recouche), controle qualite 6 criteres avec photos | `housekeeping.js` |
| **Maintenance** | Tickets avec categories, priorite (basse a critique), assignation technicien, escalade automatique, photos | `maintenance.js` |
| **Blanchisserie** | Collecte linge sale, reception linge propre, suivi 4 types (petits draps, grands draps, petites housses, grandes housses), ecarts | `linen.js` |

### Ressources humaines

| Module | Description | Fichier |
|--------|-------------|---------|
| **Conges** | Demande de conges (CP, RTT, sans solde, etc.), validation hierarchique, calendrier, export CSV, rapport trimestriel, **config dates limites par hotel** | `leaves.js` |
| **Evaluations** | Grilles d'evaluation personnalisables, criteres ponderes, historique par employe | `evaluations.js` |
| **Taches** | Kanban multi-tableaux, colonnes personnalisables, drag & drop, priorites, echeances, archivage | `tasks.js` |

### Finance et qualite

| Module | Description | Fichier |
|--------|-------------|---------|
| **Clotures** | Cloture journaliere : cash recu/depense, remise banque, achats, documents, champs configurables, export CSV mensuel | `closures.js` |
| **Revenue** | Tarifs OTA via API Xotelo, comparaison concurrents, historique prix, evenements calendrier | `revenue.js` |
| **Audits** | Grilles configurables avec sections, questions (note/oui-non/texte/choix), ponderation, scoring, planification periodique | `audit.js` |

### Administration

| Module | Description | Fichier |
|--------|-------------|---------|
| **Hotels** | Page complete avec **6 onglets** : General (categorie, nom, adresse), Reservation (slug, booking), PMS & Paiement (GeHo, Stripe), Conges (config dates limites par hotel), Clotures, Revenue | `hotels.js` |
| **Utilisateurs** | CRUD comptes, assignation roles et hotels | `users.js` |
| **Parametres** | **3 onglets** : Modules (activer/desactiver), Permissions (matrice par role), Notifications (envoi cible + historique) | `settings.js` |
| **Notifications** | Envoi cible (tous, par hotel, par role, utilisateurs specifiques), historique campagnes, renvoi, suppression | `notifications.js` |
| **Messagerie** | Messages directs, par hotel, broadcast, conversations | `messages.js` |
| **RGPD** | Consentements, export donnees personnelles, demandes (acces, rectification, effacement, portabilite) | `rgpd.js` |

### Systeme

| Composant | Description |
|-----------|-------------|
| **Automations** | Configuration des alertes planifiees (horaire, jours, hotels, destinataires) |
| **Chatbot** | Assistant integre avec pattern matching (aide navigation, FAQ modules) |
| **Cron** | Alertes automatiques : dispatch, controle, maintenance, conges, taches, audit, cloture, revenue, nettoyage |
| **Reservation en ligne** | Page publique `booking.html` avec paiement Stripe, synchronisation PMS GeHo |
| **i18n** | Interface multilingue FR/EN/ES, changement instantane |

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

Les permissions sont configurables par module dans **Parametres > onglet Permissions** (admin uniquement).

La gestion des notifications est accessible dans **Parametres > onglet Notifications** (admin, resp. groupe, resp. hotel).

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
| `hotels/{id}/leave-config` | GET, PUT | Config conges par hotel |
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
| `time` | GET, POST, PUT, DELETE | Planning complet |
| `revenue` | GET, POST, PUT, DELETE | Tarifs Xotelo et concurrents |
| `users` | GET, POST, PUT, DELETE | Gestion utilisateurs |
| `messages` | GET, POST | Messages internes |
| `messaging` | GET, POST | Conversations Messenger |
| `notifications` | GET, PUT | Notifications in-app |
| `notifications/admin/*` | GET, POST, DELETE | Campagnes notifications admin |
| `permissions` | GET, PUT | Permissions par role |
| `modules` | GET, POST | Config modules actifs |
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

Schema principal dans `database/schema.sql` + 8 migrations (~55 tables) :

- **Core** : `users`, `user_hotels`, `role_permissions`, `hotels`, `rooms`
- **Operations** : `room_dispatch`, `dispatch_control`, `dispatch_alerts`, `maintenance_tickets`
- **Blanchisserie** : `linen_transactions`, `linen_stock`, `linen_hotel_config`
- **RH** : `leave_requests`, `leave_approvals`, `task_definitions`, `task_assignments`, `evaluations`, `hotel_leave_config`
- **Planning** : `time_schedules`, `time_schedule_entries`, `time_entries`, `time_contracts`, `time_positions`, `time_services`, `time_counters`, `time_user_positions`, `time_holidays`
- **Qualite** : `audit_grids`, `audit_questions`, `audit_answers`, `audit_grid_permissions`, `audit_grid_hotels`, `audit_schedules`
- **Finance** : `daily_closures`, `closure_documents`, `closure_field_configs`, `closure_field_values`
- **Revenue** : `hotel_competitors`, `xotelo_rates_cache`, `xotelo_rates_history`, `xotelo_api_logs`, `revenue_events`
- **Reservation** : `pms_bookings` (avec integration PMS GeHo et paiement Stripe)
- **RGPD** : `user_consents`, `gdpr_requests`, `gdpr_settings`, `access_logs`
- **Securite** : `login_attempts` (rate limiting)
- **Messaging** : `notifications`, `notification_campaigns`, `messages`, `conversations`, `conversation_participants`, `conversation_messages`
- **Automations** : `automations`, `automation_hotels`, `automation_recipients`, `automation_logs`
- **Config** : `modules_config` (activation/desactivation modules)

### Migrations (ordre d'execution)

```bash
1. schema.sql                    # Schema principal (55+ tables)
2. migration_audit.sql           # Audits qualite
3. migration_automations.sql     # Automatisations
4. migration_revenue.sql         # Revenue management
5. migration_revenue_events.sql  # Evenements calendrier
6. migration_revenue_history.sql # Historique tarifs
7. migration_task_archive.sql    # Archivage taches
8. migration_security.sql        # Rate limiting, permissions push
9. migration_pms_stripe.sql      # PMS, Stripe, booking, categories hotel,
                                 # config conges par hotel, notification_campaigns,
                                 # permission notifications.manage
```

## Depannage

### Erreur 500
- Verifier les logs PHP (Plesk > Logs ou `/var/log/apache2/`)
- Verifier les identifiants MySQL dans `.env`
- Verifier que toutes les tables sont creees (schema.sql + toutes les migrations)

### Page blanche
- Verifier que tous les fichiers JS sont presents dans `js/pages/`
- Ouvrir la console du navigateur (F12) pour voir les erreurs
- Verifier que le fichier `js/pages/notifications.js` est bien charge dans `index.html`

### Erreur de connexion
- Verifier que la base de donnees est importee correctement
- Verifier que l'utilisateur admin existe dans la table `users`
- Verifier le `JWT_SECRET` dans `.env`
- Verifier que la table `login_attempts` existe (migration_security.sql)

### Notifications ne s'affichent pas
- Verifier que la classe `.active` est correctement ajoutee au dropdown (css/layout.css)
- La permission `notifications.manage` doit etre presente dans `role_permissions`

### Permissions non visibles dans le menu
- Verifier la synchronisation entre `role_permissions` (SQL), `getDefaultPermissions()` (utils.js), et `PERMISSION_LABELS` (settings.js)
- Le menu est filtre par `updateMenuByPermissions()` dans `app.js`

### Cron ne fonctionne pas
- Tester manuellement : `php api/cron.php dispatch`
- Verifier que le chemin est absolu dans le crontab
- Verifier les permissions du fichier

---

**ACL GESTION** - 2024-2026
