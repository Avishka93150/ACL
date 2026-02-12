# ACL GESTION

Plateforme SaaS de gestion hoteliere multi-etablissements. Application web SPA (Single Page Application) couvrant l'ensemble des operations quotidiennes d'un groupe hotelier : gouvernante, maintenance, blanchisserie, conges, planning, clotures financieres, audits qualite, revenue management, self check-in avec paiement en ligne, messagerie interne, automatisations, et conformite RGPD.

## Stack technique

- **Backend** : PHP pur (pas de framework), API REST monolithique (~10 380 lignes, 30+ endpoints)
- **Frontend** : Vanilla JavaScript SPA avec routage hash (18 modules, ~19 800 lignes)
- **Base de donnees** : MySQL / MariaDB avec PDO (55+ tables, 16 migrations)
- **Authentification** : JWT HMAC-SHA256 (expiration 7 jours)
- **Application mobile** : iOS / Android via Capacitor 8 (WebView native)
- **PWA** : Service Worker avec cache offline, notifications push, manifest
- **CDN** : Font Awesome 6.4.0, Chart.js 4.4.1, Google Fonts (Inter), jsPDF
- **API externes** : Xotelo (tarifs OTA / revenue management), Stripe (paiement en ligne)
- **PMS** : Integration GeHo via agent relais (`pms-agent.php`)
- **i18n** : Multi-langue (Francais, Anglais, Espagnol) - changement instantane
- **Theme** : Mode clair / sombre avec detection automatique
- **Securite** : Rate limiting, headers securite, CORS strict, RGPD, .htaccess uploads
- **Timezone** : Europe/Paris
- **Aucun build tool** : pas de npm, Composer, Webpack, ou bundler en production

## Serveur VPS / Production

| Element | Valeur |
|---------|--------|
| **Hebergeur** | OVH VPS |
| **OS** | Debian / Ubuntu Linux |
| **Panel** | Plesk |
| **Domaine** | acl-gestion.com |
| **PHP** | 8.3 (compatible 7.4+) avec extension PDO MySQL |
| **MySQL** | MariaDB 10.x |
| **Webserver** | Apache (mod_rewrite actif) |
| **SSL** | Let's Encrypt (auto-renew via Plesk) |
| **Deploiement** | Script `deploy.sh` automatise (git pull + migrations + backup) ou FTP/SSH |
| **Logs** | Plesk > Logs ou `/var/log/apache2/` |
| **Cron** | Configure via Plesk > Taches planifiees |
| **BDD** | Accessible via phpMyAdmin (Plesk) |
| **Sauvegardes** | Automatiques Plesk (quotidien) + backup dans `deploy.sh` |

## Installation

### Prerequis

- PHP 7.4+ avec extension PDO MySQL
- MySQL 5.6+ ou MariaDB 10.x
- Serveur Apache (mod_rewrite pour les URL propres)

### Installation rapide (script automatise)

```bash
# Premier deploiement ou mise a jour
bash deploy.sh
```

Le script gere automatiquement :
- Detection premier deploiement vs mise a jour
- Sauvegarde .env, uploads et base de donnees
- Git clone/pull depuis GitHub
- Execution des migrations SQL
- Permissions fichiers et securite
- Verification syntaxe PHP et fichiers critiques

### Installation manuelle

1. **Cloner le projet**
   ```bash
   git clone <url_repo> /var/www/acl-gestion.com
   ```

2. **Base de donnees**
   ```sql
   CREATE DATABASE acl_gestion CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
   Importer le schema principal puis les migrations :
   ```bash
   mysql -u user -p acl_gestion < database/schema.sql
   mysql -u user -p acl_gestion < database/migration_audit.sql
   mysql -u user -p acl_gestion < database/migration_automations.sql
   mysql -u user -p acl_gestion < database/migration_revenue.sql
   mysql -u user -p acl_gestion < database/migration_revenue_events.sql
   mysql -u user -p acl_gestion < database/migration_revenue_history.sql
   mysql -u user -p acl_gestion < database/migration_revenue_global.sql
   mysql -u user -p acl_gestion < database/migration_task_archive.sql
   mysql -u user -p acl_gestion < database/migration_security.sql
   mysql -u user -p acl_gestion < database/migration_pms_stripe.sql
   mysql -u user -p acl_gestion < database/migration_pms_relay.sql
   mysql -u user -p acl_gestion < database/migration_selfcheckin.sql
   mysql -u user -p acl_gestion < database/migration_selfcheckin_v2.sql
   mysql -u user -p acl_gestion < database/migration_selfcheckin_v3.sql
   mysql -u user -p acl_gestion < database/migration_hotel_description.sql
   mysql -u user -p acl_gestion < database/migration_maintenance_alerts.sql
   mysql -u user -p acl_gestion < database/migration_on_call_phone.sql
   mysql -u user -p acl_gestion < database/migration_stripe_permission.sql
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
   Generer le JWT_SECRET : `php -r "echo bin2hex(random_bytes(32));"`

4. **Permissions fichiers**
   ```bash
   chmod 755 uploads/
   mkdir -p uploads/maintenance uploads/linen uploads/control uploads/closures uploads/audit uploads/evaluations uploads/tasks uploads/leaves uploads/profiles
   chmod -R 775 uploads/
   chmod 600 .env
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
├── index.html                    # Point d'entree SPA + landing page marketing
├── booking.html                  # Self Check-in / reservation publique (Stripe + jsPDF)
├── .env                          # Variables d'environnement (NON commite)
├── .env.example                  # Template .env
├── .gitignore                    # Exclusions Git (uploads, node_modules, .env)
├── manifest.json                 # PWA manifest (standalone, icones, couleurs)
├── sw.js                         # Service Worker (cache offline, push notifications)
├── pms-agent.php                 # Agent relais PMS GeHo (long-polling, PC hotel)
├── deploy.sh                     # Script deploiement automatise (backup + git + migrations)
├── capacitor.config.json         # Configuration Capacitor (app native iOS/Android)
├── package.json                  # Dependencies Capacitor uniquement
│
├── api/
│   ├── .htaccess                 # Rewrite rules + passage header Authorization
│   ├── config.php                # Config (.env, BDD, JWT, CORS, securite, rate limiting, upload)
│   ├── Database.php              # Singleton PDO + helpers (query, queryOne, insert, execute, count)
│   ├── Auth.php                  # JWT HMAC-SHA256 : generation, verification, getUser()
│   ├── index.php                 # API REST complete (~10 380 lignes, 30+ resources)
│   ├── cron.php                  # Cron dispatcher CLI (alertes automatiques, escalade)
│   ├── cron_runner.php           # Runner automations planifiees (intervalle 30 min)
│   └── test.php                  # Fichier de test
│
├── js/
│   ├── config.js                 # URL API (/api/index.php), cles localStorage
│   ├── api.js                    # Fetch wrapper avec injection JWT automatique (426 L)
│   ├── i18n.js                   # Traductions FR/EN/ES completes (2 192 L)
│   ├── utils.js                  # Toast, modals, formatage, permissions RBAC, pagination (535 L)
│   ├── app.js                    # Controleur SPA : routage, menu, session, dark mode, polling (802 L)
│   ├── chatbot.js                # Assistant chatbot integre (pattern matching, navigation) (437 L)
│   ├── capacitor-bridge.js       # Bridge Capacitor iOS/Android (push, camera, haptics) (291 L)
│   └── pages/                    # 18 modules fonctionnels
│       ├── dashboard.js          # KPIs temps reel, graphiques Chart.js (896 L)
│       ├── hotels.js             # Hotels avec 6 onglets de configuration (1 939 L)
│       ├── housekeeping.js       # Dispatch chambres + controle qualite (1 681 L)
│       ├── maintenance.js        # Tickets maintenance avec escalade (919 L)
│       ├── linen.js              # Blanchisserie : collecte/reception/stock (615 L)
│       ├── leaves.js             # Conges : demande/validation/config hotel (1 495 L)
│       ├── tasks.js              # Kanban multi-tableaux (902 L)
│       ├── evaluations.js        # Evaluations personnel (2 121 L)
│       ├── audit.js              # Audits qualite (1 500 L)
│       ├── closures.js           # Clotures financieres (1 414 L)
│       ├── revenue.js            # Revenue management / OTA (1 129 L)
│       ├── selfcheckin.js        # Self Check-in config (1 307 L)
│       ├── automations.js        # Alertes automatiques (920 L)
│       ├── messages.js           # Messagerie interne (408 L)
│       ├── notifications.js      # Notifications ciblees (407 L)
│       ├── rgpd.js               # RGPD admin (909 L)
│       ├── settings.js           # Parametres systeme (674 L)
│       └── users.js              # Gestion utilisateurs (387 L)
│
├── css/
│   ├── theme.css                 # Design system : tokens, variables CSS (1 144 L)
│   ├── style.css                 # Styles principaux + composants (10 627 L)
│   ├── layout.css                # Sidebar, header, contenu principal (608 L)
│   ├── landing.css               # Landing page marketing (1 364 L)
│   ├── dashboard.css             # KPIs, stats, graphiques (586 L)
│   └── app-polish.css            # Raffinements visuels, animations (815 L)
│
├── database/
│   ├── schema.sql                # Schema principal (1 385 L, 55+ tables)
│   └── migration_*.sql           # 16 fichiers de migration
│
├── uploads/                      # Fichiers uploades (photos JPG/PNG, PDF)
│   ├── .htaccess                 # Securite : bloque PHP, autorise JPG/PNG/PDF uniquement
│   ├── maintenance/              # Photos tickets maintenance
│   ├── linen/                    # Bons de reception PDF
│   ├── control/                  # Photos controle qualite
│   ├── closures/                 # Documents clotures
│   ├── audit/                    # Photos audits
│   ├── evaluations/              # Documents evaluations
│   ├── tasks/                    # Pieces jointes taches
│   ├── leaves/                   # Documents conges
│   └── profiles/                 # Photos de profil
│
├── icons/                        # Icones PWA (20x20 a 1024x1024)
│
└── ios/                          # Projet natif iOS (Capacitor / Xcode)
```

## Modules fonctionnels (18+)

### Operations quotidiennes

| Module | Description | Fichier | Lignes |
|--------|-------------|---------|--------|
| **Dashboard** | KPIs temps reel par hotel, graphiques Chart.js (occupation, revenue, tickets), activite recente, raccourcis par role | `dashboard.js` | 896 |
| **Gouvernante** | Dispatch chambres par femme de chambre (a blanc / recouche), suivi nettoyage en temps reel, controle qualite 6 criteres (literie, salle de bain, sol, equipements, ambiance, impression) avec photos, alertes automatiques a 12h et 19h | `housekeeping.js` | 1 681 |
| **Maintenance** | Tickets avec 8 categories (plomberie, electricite, climatisation, mobilier, serrurerie, peinture, nettoyage, autre), 4 niveaux de priorite (basse a critique), assignation technicien, commentaires, photos avant/apres, escalade automatique progressive (2j, 5j, 7j), statistiques | `maintenance.js` | 919 |
| **Blanchisserie** | Collecte linge sale par type (petits draps, grands draps, petites housses, grandes housses), reception linge propre avec suivi des ecarts, bons de reception PDF uploades, stock temps reel, configuration par hotel | `linen.js` | 615 |

### Ressources humaines

| Module | Description | Fichier | Lignes |
|--------|-------------|---------|--------|
| **Conges** | Demande de conges multi-types (CP, RTT, sans solde, maladie, etc.), validation hierarchique avec commentaires, calendrier equipe, export CSV, rapport trimestriel, **configuration des dates limites par hotel** (debut de saison, fin de saison, etc.), possibilite de poser un conge pour un autre employe | `leaves.js` | 1 495 |
| **Evaluations** | Grilles d'evaluation personnalisables avec sections et criteres ponderes (note 1-5, oui/non, texte libre, choix multiples), historique par employe, statistiques comparatives, duplication de grilles, upload de documents | `evaluations.js` | 2 121 |
| **Taches** | Kanban multi-tableaux par hotel, colonnes personnalisables (drag & drop), taches avec priorites (urgent, haute, moyenne, basse), echeances, assignation, checklist, commentaires, pieces jointes, archivage automatique | `tasks.js` | 902 |

### Finance et qualite

| Module | Description | Fichier | Lignes |
|--------|-------------|---------|--------|
| **Clotures** | Cloture journaliere : cash recu, cash depense, remise banque, achats, autres depenses, champs configurables par hotel, documents justificatifs (PDF/JPG), commentaires, validation, export CSV mensuel, historique | `closures.js` | 1 414 |
| **Revenue** | Tarifs OTA via API Xotelo (Booking.com, Expedia, etc.), comparaison avec concurrents, historique des prix, evenements calendrier (salons, vacances, etc.), indicateurs RevPAR, ADR, taux d'occupation, alertes prix | `revenue.js` | 1 129 |
| **Audits** | Grilles configurables avec sections et questions (4 types : note 1-5, oui/non, texte libre, choix multiples), ponderation par question, scoring automatique, planification periodique (quotidien, hebdomadaire, mensuel, trimestriel), audits en attente, duplication de grilles, attribution par hotel | `audit.js` | 1 500 |

### Reservation et check-in

| Module | Description | Fichier | Lignes |
|--------|-------------|---------|--------|
| **Self Check-in** | Configuration par hotel : QR codes, instructions personnalisees, casiers connectes, tarification dynamique, page publique `booking.html` avec paiement Stripe integre, generation facture PDF via jsPDF, synchronisation PMS GeHo | `selfcheckin.js` + `booking.html` | 1 307 + ~1 500 |

### Administration

| Module | Description | Fichier | Lignes |
|--------|-------------|---------|--------|
| **Hotels** | Page complete avec **6 onglets** : General (nom, adresse, categorie, etoiles, etages, description), Reservation (slug, booking en ligne), PMS & Paiement (GeHo relais, cles Stripe), Conges (config dates limites par hotel), Clotures (champs personnalises), Revenue (cle Xotelo, concurrents) | `hotels.js` | 1 939 |
| **Utilisateurs** | CRUD comptes utilisateurs, assignation roles (7 niveaux) et hotels multiples, activation/desactivation | `users.js` | 387 |
| **Parametres** | **3 onglets** : Modules (activer/desactiver chaque module du systeme), Permissions (matrice interactive par role avec 60+ permissions granulaires), Notifications (envoi cible + historique campagnes) | `settings.js` | 674 |
| **Notifications** | Envoi cible (tous les utilisateurs, par hotel, par role, utilisateurs specifiques), historique des campagnes, renvoi, suppression | `notifications.js` | 407 |
| **Messagerie** | Conversations temps reel entre employes, messages directs, par hotel, broadcast, compteur messages non lus, notifications push | `messages.js` | 408 |
| **RGPD** | Gestion consentements (cookies, donnees personnelles, communications), export donnees personnelles, demandes RGPD (acces, rectification, effacement, portabilite), logs d'acces, parametres de retention | `rgpd.js` | 909 |

### Systeme

| Composant | Description |
|-----------|-------------|
| **Automations** | Configuration des alertes planifiees par hotel : type d'alerte, horaire d'execution, jours de la semaine, hotels concernes, destinataires, logs d'execution, test manuel |
| **Chatbot** | Assistant integre avec pattern matching (salutations, aide, navigation, FAQ par module : maintenance, gouvernante, conges, blanchisserie, taches, evaluations, audits, clotures), action de navigation directe |
| **Cron** | 9 types d'alertes automatiques : dispatch, controle, maintenance, conges, taches, audit, cloture, revenue, nettoyage. Escalade progressive hierarchique |
| **Service Worker** | Cache offline (stale-while-revalidate pour assets, network-first pour API), notifications push natives, fallback offline |
| **Application mobile** | iOS/Android via Capacitor 8 : push notifications, camera native, retour haptique, safe areas iOS, gestion clavier, deep links, back button Android |
| **Landing page** | Page marketing integree dans `index.html` : hero section, fonctionnalites, modules, avantages, formulaire de contact (honeypot + captcha math), mentions legales, footer |
| **i18n** | 3 langues (FR, EN, ES), 2 192 lignes de traductions, changement instantane sans rechargement |
| **Dark mode** | Theme clair/sombre, bascule dans le header, persistance localStorage, variables CSS dynamiques |

## Roles et permissions

7 roles hierarchiques avec controle d'acces granulaire via la table `role_permissions` :

| Role | Code | Portee |
|------|------|--------|
| Administrateur | `admin` | Acces complet, gestion permissions, config systeme, tous les hotels |
| Responsable Groupe | `groupe_manager` | Multi-hotels, escalade, validation conges/audits, notifications |
| Responsable Hotel | `hotel_manager` | Son hotel, validation conges, dispatch, clotures, Stripe config |
| Comptabilite | `comptabilite` | Clotures, blanchisserie, rapports financiers, export |
| Ressources Humaines | `rh` | Conges, evaluations, planning, gestion personnel |
| Receptionniste | `receptionniste` | Dispatch, controle, clotures journalieres, maintenance |
| Employe | `employee` | Taches quotidiennes, consulter planning, demander conges |

Les permissions sont configurables par module dans **Parametres > onglet Permissions** (admin uniquement). 60+ permissions granulaires reparties en modules : `hotels`, `rooms`, `users`, `dispatch`, `linen`, `leaves`, `maintenance`, `tasks`, `evaluations`, `audit`, `revenue`, `closures`, `messages`, `notifications`, `dashboard`, `reports`, `permissions`, `selfcheckin`.

## API REST

Point d'entree unique : `api/index.php`

Routage : `/{resource}/{id}/{action}/{subaction}`

Toutes les requetes (sauf `auth/login`, `health`, `contact`, `booking/public`) necessitent le header :
```
Authorization: Bearer <jwt_token>
```

### Endpoints principaux (30+)

| Resource | Methodes | Description |
|----------|----------|-------------|
| `health` | GET | Status API (health check) |
| `contact` | POST | Formulaire contact landing page (public) |
| `auth` | POST login/logout, PUT profile, GET management-info | Authentification JWT, profil, info hotels |
| `dashboard` | GET stats | Statistiques agregees multi-hotel (KPIs) |
| `hotels` | CRUD + leave-config, categories, booking-config, stripe-config | Hotels complets avec 6 onglets de config |
| `rooms` | CRUD | Chambres par hotel (numero, etage, type, statut) |
| `dispatch` | CRUD + complete, control, alerts | Dispatch gouvernante (chambres, nettoyage, controle) |
| `maintenance` | CRUD + assign, resolve, comment, stats | Tickets maintenance avec escalade automatique |
| `linen` | GET/POST transactions + config | Blanchisserie (collecte, reception, stock, config hotel) |
| `leaves` | CRUD + approve, reject, report, for-other, hotel-config | Conges avec validation hierarchique |
| `tasks` | CRUD boards, columns, tasks, checklist, comments, attachments | Kanban complet avec pieces jointes |
| `evaluations` | CRUD grids, questions, evaluations, stats, duplicate | Evaluations avec grilles personnalisables |
| `audit` | CRUD grids, questions, audits, answers, pending, schedules | Audits qualite avec planification |
| `closures` | CRUD + validate, field-configs, documents, export | Clotures financieres avec champs configurables |
| `revenue` | CRUD competitors, rates, events, history | Revenue management (API Xotelo) |
| `price_alerts` | CRUD | Alertes prix (seuils par concurrent) |
| `users` | CRUD + hotels assignment | Gestion utilisateurs multi-hotels |
| `messages` | GET, POST | Messages internes (legacy) |
| `messaging` | CRUD conversations, messages, users, unread-count | Messagerie interne temps reel |
| `notifications` | GET, PUT, DELETE + poll | Notifications in-app + long polling |
| `notifications/admin/*` | GET, POST, DELETE | Campagnes notifications (envoi cible par hotel/role/users) |
| `permissions` | GET, PUT | Permissions par role (matrice RBAC) |
| `modules` | GET, POST/PUT | Activation/desactivation modules |
| `time` | CRUD services, positions, contracts, templates, schedules, entries, timesheet, counters, holidays | Planning complet (services, postes, contrats, emargement) |
| `rgpd` | CRUD consents, requests, settings, access-logs | Conformite RGPD complete |
| `booking` | GET/POST + Stripe, availability, pms-sync | Reservation en ligne (public + admin) |
| `selfcheckin` | CRUD config, instructions, lockers, pricing | Self check-in par hotel |
| `lockers` | CRUD | Gestion casiers self check-in |
| `selfcheckin-pricing` | CRUD | Tarification self check-in |
| `automations` | CRUD + logs, test | Automations planifiees avec execution test |

## Systeme d'escalade automatique

Les cron jobs (`api/cron.php`) gerent des alertes progressives avec escalade hierarchique :

| Module | Horaire | Seuil | Escalade |
|--------|---------|-------|----------|
| **Dispatch** | 12h | Aucun dispatch cree | hotel_manager → 2j: groupe_manager → 5j: admin |
| **Controle** | 19h | Chambres nettoyees non controlees | hotel_manager → 2j: groupe_manager → 5j: admin |
| **Maintenance** | 9h | Ticket ouvert depuis 2j | groupe_manager → 5j: priorite urgente → 7j: priorite grave |
| **Conges** | Lundi 9h | Demandes en attente de validation | Rappel aux validateurs |
| **Taches** | 9h | Taches arrivant a echeance | Rappel aux assignes |
| **Audit** | 9h | X jours avant deadline | Rappel → 2j retard: groupe_manager → 5j: admin |
| **Cloture** | 13h | Pas de cloture aujourd'hui | hotel_manager → 48h: admin |
| **Revenue** | 6h | Quotidien | Mise a jour automatique tarifs OTA via Xotelo |
| **Nettoyage** | 3h | Quotidien | Purge notifications anciennes, sessions expirees |

Les automations personnalisees (`api/cron_runner.php`) s'executent toutes les 30 minutes.

## Integrations externes

| Service | Usage | Configuration |
|---------|-------|---------------|
| **Xotelo API** | Tarifs OTA (Booking.com, Expedia, Hotels.com...) pour revenue management | Cle Xotelo par hotel (`hotels.xotelo_hotel_key`) |
| **Stripe** | Paiement en ligne pour self check-in / booking (Stripe Elements) | Cles par hotel (`stripe_publishable_key` + `stripe_secret_key`) |
| **PMS GeHo** | Synchronisation reservations via agent relais long-polling | `pms-agent.php` installe sur le PC hotel (meme reseau) |
| **Chart.js 4.4.1** | Graphiques dashboard, revenue, statistiques (CDN) | Auto-charge dans index.html |
| **Font Awesome 6.4.0** | Icones interface (900+ icones) (CDN) | Auto-charge dans index.html |
| **Google Fonts** | Police Inter (400, 500, 600, 700) (CDN) | Auto-charge dans index.html |
| **jsPDF 2.5.1** | Generation factures/recus PDF dans booking.html (CDN) | Auto-charge dans booking.html |

## Application mobile (Capacitor 8)

| Element | Valeur |
|---------|--------|
| **App ID** | `com.aclgestion.app` |
| **Nom** | ACL GESTION |
| **WebDir** | `www/` |
| **Mode** | WebView pointant vers `https://acl-gestion.com` (pas de bundle local) |
| **iOS** | Xcode project dans `ios/App/` (Swift) |
| **Plugins** | Camera, PushNotifications, StatusBar, Keyboard, Haptics, SplashScreen, App |
| **Bridge** | `js/capacitor-bridge.js` - detection automatique web vs natif |

### Fonctionnalites natives

- **Push notifications** : Envoi via APNS/FCM, reception en foreground (toast) et background
- **Camera** : Prise de photo native pour tickets maintenance, controles qualite
- **Haptics** : Retour haptique (light, medium, heavy)
- **Safe areas** : Gestion encoche iPhone et barre home
- **Clavier** : Gestion resize body, accessory bar
- **Deep links** : Navigation SPA depuis liens externes
- **Back button** : Navigation Android avec confirmation avant fermeture

### Build

```bash
npm install          # Installer les deps Capacitor
npm run cap:sync     # Synchroniser le projet web
npm run cap:open:ios # Ouvrir dans Xcode
```

## Base de donnees

Schema principal dans `database/schema.sql` + 16 migrations (~55 tables) :

### Tables par domaine

- **Core** : `users`, `user_hotels`, `role_permissions`, `hotels`, `rooms`
- **Operations** : `room_dispatch`, `dispatch_control`, `dispatch_alerts`, `maintenance_tickets`
- **Blanchisserie** : `linen_transactions`, `linen_stock`, `linen_hotel_config`
- **RH** : `leave_requests`, `leave_approvals`, `hotel_leave_config`, `task_definitions`, `task_assignments`, `task_boards`, `task_columns`, `task_checklist`, `task_comments`, `task_attachments`, `evaluations`, `evaluation_grids`, `evaluation_questions`, `evaluation_answers`
- **Planning** : `time_schedules`, `time_schedule_entries`, `time_entries`, `time_contracts`, `time_positions`, `time_services`, `time_counters`, `time_user_positions`, `time_holidays`, `time_templates`
- **Qualite** : `audit_grids`, `audit_questions`, `audit_answers`, `audit_grid_permissions`, `audit_grid_hotels`, `audit_schedules`
- **Finance** : `daily_closures`, `closure_documents`, `closure_field_configs`, `closure_field_values`
- **Revenue** : `hotel_competitors`, `xotelo_rates_cache`, `xotelo_rates_history`, `xotelo_api_logs`, `revenue_events`, `price_alerts`
- **Reservation** : `pms_bookings`, `selfcheckin_config`, `selfcheckin_instructions`, `selfcheckin_lockers`, `selfcheckin_pricing`, `hotel_categories`
- **RGPD** : `user_consents`, `gdpr_requests`, `gdpr_settings`, `access_logs`
- **Securite** : `login_attempts` (rate limiting)
- **Messaging** : `notifications`, `notification_campaigns`, `messages`, `conversations`, `conversation_participants`, `conversation_messages`
- **Automations** : `automations`, `automation_hotels`, `automation_recipients`, `automation_logs`
- **Config** : `modules_config`, `contact_requests`

### Migrations (ordre d'execution)

```
1.  schema.sql                     # Schema principal (55+ tables)
2.  migration_audit.sql            # Audits qualite (grilles, questions, permissions)
3.  migration_automations.sql      # Automatisations (rules, logs)
4.  migration_revenue.sql          # Revenue management (concurrents, cache Xotelo)
5.  migration_revenue_events.sql   # Evenements calendrier revenue
6.  migration_revenue_history.sql  # Historique tarifs OTA
7.  migration_revenue_global.sql   # Statistiques revenue globales
8.  migration_task_archive.sql     # Archivage taches Kanban
9.  migration_security.sql         # Rate limiting, permissions push
10. migration_pms_stripe.sql       # PMS GeHo, Stripe, booking, categories, config conges hotel
11. migration_pms_relay.sql        # Relais PMS GeHo
12. migration_selfcheckin.sql      # Self check-in (config, instructions)
13. migration_selfcheckin_v2.sql   # Self check-in v2 (ameliorations)
14. migration_selfcheckin_v3.sql   # Self check-in v3 (casiers, consignes)
15. migration_hotel_description.sql # Texte descriptif par hotel
16. migration_maintenance_alerts.sql # Alertes maintenance
17. migration_on_call_phone.sql    # Telephone d'astreinte hotel
18. migration_stripe_permission.sql # Permission gestion cles Stripe
```

## Securite

| Mesure | Detail |
|--------|--------|
| **Authentification** | JWT HMAC-SHA256, expiration 7 jours, header Bearer |
| **Rate limiting** | 5 tentatives de login, blocage 15 min (table `login_attempts`) |
| **Headers HTTP** | X-Content-Type-Options: nosniff, X-Frame-Options: DENY, X-XSS-Protection, Referrer-Policy |
| **CORS** | Origine stricte configuree dans `.env` (`CORS_ORIGIN`) |
| **Uploads** | .htaccess bloque execution PHP, autorise JPG/PNG/PDF uniquement, max 5 Mo images / 10 Mo PDF |
| **XSS** | Fonction `esc()` cote frontend, echappement attributs `escAttr()` |
| **Anti-bot** | Honeypot + captcha mathematique sur formulaire contact |
| **RGPD** | Module complet : consentements, export donnees, demandes RGPD, logs acces |
| **Mots de passe** | `password_hash()` / `password_verify()` avec bcrypt |
| **.env** | Fichier non commite, permissions 600 |

## Depannage

### Erreur 500
- Verifier les logs PHP (Plesk > Logs ou `/var/log/apache2/`)
- Verifier les identifiants MySQL dans `.env`
- Verifier que toutes les tables sont creees (schema.sql + toutes les migrations)
- Verifier que le `.htaccess` dans `api/` est present et fonctionnel

### Page blanche
- Verifier que tous les fichiers JS sont presents dans `js/pages/`
- Ouvrir la console du navigateur (F12) pour voir les erreurs JavaScript
- Verifier que tous les `<script>` sont charges dans `index.html` (18 modules)
- Verifier le cache du navigateur (vider si version JS ancienne)

### Erreur de connexion
- Verifier que la base de donnees est importee correctement (schema + migrations)
- Verifier que l'utilisateur admin existe dans la table `users`
- Verifier le `JWT_SECRET` dans `.env`
- Verifier que la table `login_attempts` existe (migration_security.sql)
- Tester directement : `curl -X POST https://acl-gestion.com/api/index.php/auth/login -d '{"email":"admin@acl-gestion.fr","password":"Admin@123"}'`

### Notifications ne s'affichent pas
- Verifier que la classe `.active` est correctement ajoutee au dropdown (css/layout.css)
- La permission `notifications.manage` doit etre presente dans `role_permissions`
- Verifier le long polling dans l'onglet Network du navigateur (`/notifications/poll`)

### Permissions non visibles dans le menu
- Verifier la synchronisation entre `role_permissions` (SQL), `getDefaultPermissions()` (utils.js), et `PERMISSION_LABELS` (settings.js)
- Le menu est filtre par `updateMenuByPermissions()` dans `app.js`
- Un module desactive dans Parametres > Modules sera cache du menu

### Cron ne fonctionne pas
- Tester manuellement : `php api/cron.php dispatch`
- Verifier que le chemin est absolu dans le crontab
- Verifier les permissions du fichier
- Verifier que la timezone est Europe/Paris : `php -r "echo date_default_timezone_get();"`

### Application mobile
- Verifier que le serveur est accessible depuis le device
- Verifier les certificats SSL (Capacitor refuse les certificats invalides)
- Logs debug : `npm run cap:open:ios` puis Xcode Console
- Verifier `capacitor.config.json > server.url`

### Deploy.sh echoue
- Verifier les droits d'execution : `chmod +x deploy.sh`
- Verifier les credentials MySQL dans `.env`
- Verifier l'acces Git au repository
- Consulter les logs dans `/var/www/vhosts/acl-gestion.com/backups/`

---

**ACL GESTION** - 2024-2026
