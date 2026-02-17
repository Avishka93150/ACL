# ACL GESTION

Plateforme SaaS de gestion hôtelière multi-établissements destinée aux groupes hôteliers français. Application web SPA couvrant l'ensemble des opérations quotidiennes : gouvernante, maintenance, blanchisserie, congés, planning, clôtures financières, factures fournisseurs, contrats, audits qualité, revenue management, self check-in avec paiement en ligne, livret d'accueil numérique, messagerie interne, automatisations, et conformité RGPD.

## Stack technique

- **Backend** : PHP pur (pas de framework), API REST monolithique (~14 400 lignes, 35+ endpoints)
- **Frontend** : Vanilla JavaScript SPA avec routage hash (21 modules, ~25 300 lignes)
- **Base de données** : MySQL / MariaDB avec PDO (69+ tables, 27 migrations)
- **Authentification** : JWT HMAC-SHA256 (expiration 7 jours)
- **Application mobile** : iOS / Android via Capacitor 8 (WebView native)
- **PWA** : Service Worker avec cache offline, notifications push, manifest
- **CDN** : Font Awesome 6.4.0, Chart.js 4.4.1, Google Fonts (Inter), jsPDF
- **API externes** : Xotelo (tarifs OTA), Stripe (paiement en ligne), Fintecture (Open Banking PSD2), Anthropic Claude AI (OCR + analyse contrats)
- **OCR** : Tesseract + Ghostscript (extraction texte) puis Claude AI (structuration JSON)
- **SEPA** : Génération XML pain.001.001.03 pour virements bancaires
- **PMS** : Intégration GeHo via agent relais (`pms-agent.php`)
- **Email** : SMTP configurable par l'administrateur (PHPMailer)
- **i18n** : Multi-langue (Français, Anglais, Espagnol) - changement instantané
- **Thème** : Mode clair / sombre avec détection automatique
- **Sécurité** : Rate limiting, headers sécurité, CORS strict, RGPD, .htaccess uploads
- **Timezone** : Europe/Paris
- **Aucun build tool** : pas de npm, Composer, Webpack, ou bundler en production

## Serveur VPS / Production

| Élément | Valeur |
|---------|--------|
| **Hébergeur** | OVH VPS |
| **OS** | Debian / Ubuntu Linux |
| **Panel** | Plesk |
| **Domaine** | acl-gestion.com |
| **PHP** | 8.3 (compatible 7.4+) avec extension PDO MySQL |
| **MySQL** | MariaDB 10.x |
| **Webserver** | Apache (mod_rewrite actif) |
| **SSL** | Let's Encrypt (auto-renew via Plesk) |
| **Déploiement** | Script `deploy.sh` automatisé (git pull + migrations + backup) ou FTP/SSH |
| **Logs** | Plesk > Logs ou `/var/log/apache2/` |
| **Cron** | Configuré via Plesk > Tâches planifiées |
| **BDD** | Accessible via phpMyAdmin (Plesk) |
| **Sauvegardes** | Automatiques Plesk (quotidien) + backup dans `deploy.sh` |
| **OCR** | Tesseract OCR + Ghostscript installés sur le serveur |

## Installation

### Prérequis

- PHP 7.4+ avec extension PDO MySQL
- MySQL 5.6+ ou MariaDB 10.x
- Serveur Apache (mod_rewrite pour les URL propres)
- Tesseract OCR + Ghostscript (pour l'OCR des factures fournisseurs)

### Installation rapide (script automatisé)

```bash
# Premier déploiement ou mise à jour
bash deploy.sh
```

Le script gère automatiquement :
- Détection premier déploiement vs mise à jour
- Sauvegarde .env, uploads et base de données
- Git clone/pull depuis GitHub
- Exécution des migrations SQL
- Permissions fichiers et sécurité
- Vérification syntaxe PHP et fichiers critiques

### Installation manuelle

1. **Cloner le projet**
   ```bash
   git clone <url_repo> /var/www/acl-gestion.com
   ```

2. **Base de données**
   ```sql
   CREATE DATABASE acl_gestion CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
   Importer le schéma principal puis les migrations :
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
   mysql -u user -p acl_gestion < database/migration_bank_accounts.sql
   mysql -u user -p acl_gestion < database/migration_contracts.sql
   mysql -u user -p acl_gestion < database/migration_invoices.sql
   mysql -u user -p acl_gestion < database/migration_invoices_v2.sql
   mysql -u user -p acl_gestion < database/migration_invoices_v3.sql
   mysql -u user -p acl_gestion < database/migration_welcome.sql
   mysql -u user -p acl_gestion < database/migration_smtp.sql
   mysql -u user -p acl_gestion < database/migration_walkin_hold.sql
   mysql -u user -p acl_gestion < database/migration_payment_links.sql
   mysql -u user -p acl_gestion < database/migration_hotel_modules.sql
   ```

3. **Dépendances système (OCR)**
   ```bash
   apt-get install tesseract-ocr tesseract-ocr-fra ghostscript
   ```

4. **Fichier .env** (à la racine du projet)
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
   Générer le JWT_SECRET : `php -r "echo bin2hex(random_bytes(32));"`

5. **Permissions fichiers**
   ```bash
   chmod 755 uploads/
   mkdir -p uploads/{maintenance,linen,control,closures,audit,evaluations,tasks,leaves,profiles,invoices,contracts,welcome}
   chmod -R 775 uploads/
   chmod 600 .env
   ```

6. **Cron jobs** (via Plesk ou crontab)
   ```crontab
   # Alertes dispatch (12h) et contrôle (19h)
   0 12 * * * php /var/www/acl-gestion.com/api/cron.php dispatch
   0 19 * * * php /var/www/acl-gestion.com/api/cron.php control
   # Alertes maintenance, congés, tâches, audit, clôture (9h)
   0 9 * * * php /var/www/acl-gestion.com/api/cron.php maintenance
   0 9 * * 1 php /var/www/acl-gestion.com/api/cron.php leaves_reminder
   0 9 * * * php /var/www/acl-gestion.com/api/cron.php tasks_due
   0 9 * * * php /var/www/acl-gestion.com/api/cron.php audit
   0 13 * * * php /var/www/acl-gestion.com/api/cron.php closure
   # Revenue management (6h)
   0 6 * * * php /var/www/acl-gestion.com/api/cron.php revenue
   # Nettoyage système (3h)
   0 3 * * * php /var/www/acl-gestion.com/api/cron.php cleanup
   # Runner automations (toutes les 30 min)
   */30 * * * * php /var/www/acl-gestion.com/api/cron_runner.php
   ```

7. **Test**
   Ouvrir le site dans un navigateur. Se connecter avec le compte admin.

## Connexion par défaut

| Email | Mot de passe |
|-------|-------------|
| admin@acl-gestion.fr | Admin@123 |

**Changer ce mot de passe immédiatement après la première connexion.**

## Structure du projet

```
ACL/
├── index.html                    # Point d'entrée SPA + landing page marketing (768 L)
├── booking.html                  # Self Check-in / réservation publique Stripe (1 809 L)
├── welcome.html                  # Livret d'accueil public par hôtel (466 L)
├── .env                          # Variables d'environnement (NON commité)
├── .env.example                  # Template .env
├── .gitignore                    # Exclusions Git (uploads, node_modules, .env)
├── manifest.json                 # PWA manifest (standalone, icônes, couleurs)
├── sw.js                         # Service Worker (cache offline, push notifications) (175 L)
├── pms-agent.php                 # Agent relais PMS GeHo (long-polling, PC hôtel) (246 L)
├── deploy.sh                     # Script déploiement automatisé (437 L)
├── capacitor.config.json         # Configuration Capacitor (app native iOS/Android)
├── package.json                  # Dépendances Capacitor uniquement
│
├── api/
│   ├── .htaccess                 # Rewrite rules + passage header Authorization
│   ├── config.php                # Config (.env, BDD, JWT, CORS, sécurité, upload) (75 L)
│   ├── Database.php              # Singleton PDO + helpers (query, insert, count...) (72 L)
│   ├── Auth.php                  # JWT HMAC-SHA256 : génération, vérification, getUser() (99 L)
│   ├── index.php                 # API REST complète (14 408 L, 35+ resources)
│   ├── OcrClient.php             # OCR : Tesseract + Claude AI (extraction factures) (378 L)
│   ├── FintectureClient.php      # Paiement Open Banking PSD2 via Fintecture (354 L)
│   ├── cron.php                  # Cron dispatcher CLI (alertes, escalade) (1 970 L)
│   ├── cron_runner.php           # Runner automations planifiées (381 L)
│   └── test.php                  # Fichier de test
│
├── js/
│   ├── config.js                 # URL API, clés localStorage (8 L)
│   ├── api.js                    # Fetch wrapper avec injection JWT (438 L)
│   ├── i18n.js                   # Traductions FR/EN/ES complètes (2 640 L)
│   ├── utils.js                  # Toast, modals, formatage, permissions RBAC (565 L)
│   ├── app.js                    # Contrôleur SPA : routage, menu, session, dark mode (866 L)
│   ├── chatbot.js                # Assistant chatbot intégré (pattern matching) (437 L)
│   ├── capacitor-bridge.js       # Bridge Capacitor iOS/Android (push, camera) (291 L)
│   └── pages/                    # 21 modules fonctionnels
│       ├── dashboard.js          # KPIs temps réel, graphiques Chart.js (896 L)
│       ├── hotels.js             # Hôtels : 7 onglets de configuration (2 160 L)
│       ├── housekeeping.js       # Dispatch chambres + contrôle qualité (1 681 L)
│       ├── maintenance.js        # Tickets maintenance avec escalade (919 L)
│       ├── linen.js              # Blanchisserie : collecte/réception/stock (615 L)
│       ├── leaves.js             # Congés : demande/validation/config hôtel (1 495 L)
│       ├── tasks.js              # Kanban multi-tableaux (902 L)
│       ├── evaluations.js        # Évaluations personnel (2 121 L)
│       ├── audit.js              # Audits qualité (1 500 L)
│       ├── closures.js           # Clôtures financières (1 436 L)
│       ├── revenue.js            # Revenue management / OTA (1 129 L)
│       ├── selfcheckin.js        # Self Check-in config (1 716 L)
│       ├── invoices.js           # Factures fournisseurs (OCR, SEPA, Fintecture) (2 238 L)
│       ├── contracts.js          # Contrats fournisseurs (IA, alertes) (1 033 L)
│       ├── welcome.js            # Livret d'accueil numérique (1 109 L)
│       ├── automations.js        # Alertes automatiques (920 L)
│       ├── messages.js           # Messagerie interne (408 L)
│       ├── notifications.js      # Notifications ciblées (407 L)
│       ├── rgpd.js               # RGPD admin + pages légales (1 137 L)
│       ├── settings.js           # Paramètres système (1 107 L)
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
│   ├── schema.sql                # Schéma principal (1 385 L, 69+ tables)
│   └── migration_*.sql           # 27 fichiers de migration
│
├── uploads/                      # Fichiers uploadés (photos JPG/PNG, PDF)
│   ├── .htaccess                 # Sécurité : bloque PHP, autorise JPG/PNG/PDF
│   ├── maintenance/              # Photos tickets maintenance
│   ├── linen/                    # Bons de réception PDF
│   ├── control/                  # Photos contrôle qualité
│   ├── closures/                 # Documents clôtures
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
│
└── ios/                          # Projet natif iOS (Capacitor / Xcode)
```

## Modules fonctionnels (21)

### Opérations quotidiennes

| Module | Description | Fichier | Lignes |
|--------|-------------|---------|--------|
| **Dashboard** | KPIs temps réel par hôtel, graphiques Chart.js (occupation, revenue, tickets), activité récente, raccourcis par rôle | `dashboard.js` | 896 |
| **Gouvernante** | Dispatch chambres par femme de chambre (à blanc / recouche), suivi nettoyage en temps réel, contrôle qualité 6 critères (literie, salle de bain, sol, équipements, ambiance, impression) avec photos, alertes automatiques à 12h et 19h | `housekeeping.js` | 1 681 |
| **Maintenance** | Tickets avec 8 catégories (plomberie, électricité, climatisation, mobilier, serrurerie, peinture, nettoyage, autre), 4 niveaux de priorité, assignation technicien, commentaires, photos avant/après, escalade automatique progressive (2j, 5j, 7j) | `maintenance.js` | 919 |
| **Blanchisserie** | Collecte linge sale par type (petits draps, grands draps, petites housses, grandes housses), réception linge propre avec suivi des écarts, bons de réception PDF, stock temps réel, configuration par hôtel | `linen.js` | 615 |

### Ressources humaines

| Module | Description | Fichier | Lignes |
|--------|-------------|---------|--------|
| **Congés** | Demande multi-types (CP, RTT, sans solde, maladie, etc.), validation hiérarchique avec commentaires, calendrier équipe, export CSV, rapport trimestriel, configuration des dates limites par hôtel, possibilité de poser un congé pour un autre employé | `leaves.js` | 1 495 |
| **Évaluations** | Grilles personnalisables avec sections et critères pondérés (note 1-5, oui/non, texte libre, choix multiples), historique par employé, statistiques comparatives, duplication de grilles, upload documents | `evaluations.js` | 2 121 |
| **Tâches** | Kanban multi-tableaux par hôtel, colonnes personnalisables (drag & drop), tâches avec priorités, échéances, assignation, checklist, commentaires, pièces jointes, archivage automatique | `tasks.js` | 902 |

### Finance et comptabilité

| Module | Description | Fichier | Lignes |
|--------|-------------|---------|--------|
| **Clôtures** | Clôture journalière : cash reçu, cash dépensé, remise banque, achats, espèces, autres dépenses, champs configurables par hôtel, documents justificatifs (PDF/JPG), validation, export CSV mensuel, création automatique de facture depuis ticket de caisse | `closures.js` | 1 436 |
| **Factures fournisseurs** | Module complet : dépôt PDF/image avec OCR (Tesseract + Claude AI), extraction automatique données, workflow de validation multi-niveaux configurable par hôtel (seuils, double approbation, réplication règles), paiement via Fintecture (Open Banking PSD2) ou virement SEPA XML (pain.001.001.03), ventilation par catégorie, reporting annuel croisé (catégories × mois), extraction comptable avec export CSV/PDF/ZIP | `invoices.js` | 2 238 |
| **Contrats** | Gestion contrats fournisseurs par hôtel, catégories, alertes d'échéance, upload documents, analyse IA via Claude (extraction clauses, risques, recommandations), charges fixes récurrentes, export PDF | `contracts.js` | 1 033 |

### Qualité

| Module | Description | Fichier | Lignes |
|--------|-------------|---------|--------|
| **Revenue** | Tarifs OTA via API Xotelo (Booking.com, Expedia, etc.), comparaison concurrents, historique prix, événements calendrier, indicateurs RevPAR, ADR, taux d'occupation, alertes prix | `revenue.js` | 1 129 |
| **Audits** | Grilles configurables avec sections et questions (4 types), pondération, scoring automatique, planification périodique, audits en attente, duplication, attribution par hôtel | `audit.js` | 1 500 |

### Réservation et accueil

| Module | Description | Fichier | Lignes |
|--------|-------------|---------|--------|
| **Self Check-in** | Configuration par hôtel : QR codes, instructions personnalisées, casiers connectés, tarification dynamique, page publique `booking.html` avec paiement Stripe, génération facture PDF via jsPDF, synchronisation PMS GeHo, liens de paiement par email | `selfcheckin.js` + `booking.html` | 1 716 + 1 809 |
| **Livret d'accueil** | Livret numérique par hôtel : onglets personnalisables (restaurant, spa, activités...), éléments avec photos, informations pratiques (WiFi, parking, transports...), page publique `welcome.html` accessible via URL/QR code, configuration logo et bannière | `welcome.js` + `welcome.html` | 1 109 + 466 |

### Administration

| Module | Description | Fichier | Lignes |
|--------|-------------|---------|--------|
| **Hôtels** | Page complète avec **7 onglets** : Général (nom, adresse, catégorie, étoiles, étages, description), Réservation (slug, booking en ligne), PMS & Paiement (GeHo relais, clés Stripe), Congés (config dates limites), Clôtures (champs personnalisés), Revenue (clé Xotelo, concurrents), Comptes bancaires (IBAN/BIC pour SEPA) | `hotels.js` | 2 160 |
| **Utilisateurs** | CRUD comptes utilisateurs, assignation rôles (7 niveaux) et hôtels multiples, activation/désactivation | `users.js` | 387 |
| **Paramètres** | **3 onglets** : Modules (activer/désactiver chaque module), Permissions (matrice interactive par rôle avec 70+ permissions granulaires), Notifications (envoi ciblé + historique campagnes) | `settings.js` | 1 107 |
| **Notifications** | Envoi ciblé (tous les utilisateurs, par hôtel, par rôle, utilisateurs spécifiques), historique des campagnes, renvoi, suppression | `notifications.js` | 407 |
| **Messagerie** | Conversations temps réel entre employés, messages directs, par hôtel, broadcast, compteur non lus, notifications push | `messages.js` | 408 |
| **RGPD** | Gestion consentements, export données personnelles, demandes RGPD (accès, rectification, effacement, portabilité), logs d'accès, paramètres de rétention, pages légales (CGV, CGU, mentions légales, politique de confidentialité) | `rgpd.js` | 1 137 |

### Système

| Composant | Description |
|-----------|-------------|
| **Automations** | Configuration alertes planifiées par hôtel : type d'alerte, horaire, jours, hôtels concernés, destinataires, logs d'exécution, test manuel |
| **Chatbot** | Assistant intégré avec pattern matching (salutations, aide, navigation, FAQ par module), action de navigation directe |
| **Cron** | 9 types d'alertes automatiques : dispatch, contrôle, maintenance, congés, tâches, audit, clôture, revenue, nettoyage. Escalade progressive hiérarchique |
| **SMTP** | Configuration email SMTP par l'administrateur (serveur, port, identifiants, TLS), test d'envoi |
| **Service Worker** | Cache offline (stale-while-revalidate pour assets, network-first pour API), notifications push natives, fallback offline |
| **Application mobile** | iOS/Android via Capacitor 8 : push notifications, caméra native, retour haptique, safe areas iOS, gestion clavier, deep links, back button Android |
| **Landing page** | Page marketing intégrée dans `index.html` : hero, 18 modules présentés, avantages, formulaire de contact (honeypot + captcha), mentions légales, CGV, CGU |
| **i18n** | 3 langues (FR, EN, ES), 2 640 lignes de traductions, changement instantané sans rechargement |
| **Dark mode** | Thème clair/sombre, bascule dans le header, persistance localStorage, variables CSS dynamiques |

## Rôles et permissions

7 rôles hiérarchiques avec contrôle d'accès granulaire via la table `role_permissions` :

| Rôle | Code | Portée |
|------|------|--------|
| Administrateur | `admin` | Accès complet, gestion permissions, config système, tous les hôtels |
| Responsable Groupe | `groupe_manager` | Multi-hôtels, escalade, validation congés/audits, factures, contrats |
| Responsable Hôtel | `hotel_manager` | Son hôtel, validation congés, dispatch, clôtures, factures |
| Comptabilité | `comptabilite` | Clôtures, blanchisserie, factures fournisseurs, paiements, export |
| Ressources Humaines | `rh` | Congés, évaluations, planning, gestion personnel |
| Réceptionniste | `receptionniste` | Dispatch, contrôle, clôtures journalières, maintenance, dépôt factures |
| Employé | `employee` | Tâches quotidiennes, consulter planning, demander congés |

Les permissions sont configurables dans **Paramètres > Permissions** (admin uniquement). 70+ permissions granulaires réparties en modules : `hotels`, `rooms`, `users`, `dispatch`, `linen`, `leaves`, `maintenance`, `tasks`, `evaluations`, `audit`, `revenue`, `closures`, `messages`, `notifications`, `dashboard`, `reports`, `permissions`, `selfcheckin`, `invoices`, `suppliers`, `contracts`, `welcome`.

## API REST

Point d'entrée unique : `api/index.php`

Routage : `/{resource}/{id}/{action}/{subaction}`

Toutes les requêtes (sauf `auth/login`, `health`, `contact`, `booking/public`, `welcome/public`, `fintecture_webhook`) nécessitent le header :
```
Authorization: Bearer <jwt_token>
```

### Endpoints principaux (35+)

| Resource | Méthodes | Description |
|----------|----------|-------------|
| `health` | GET | Status API (health check) |
| `contact` | POST | Formulaire contact landing page (public) |
| `auth` | POST login/logout, PUT profile, GET management-info | Authentification JWT, profil, info hôtels |
| `dashboard` | GET stats | Statistiques agrégées multi-hôtel (KPIs) |
| `hotels` | CRUD + leave-config, categories, booking-config, stripe-config, bank-accounts | Hôtels complets avec 7 onglets de config |
| `rooms` | CRUD | Chambres par hôtel (numéro, étage, type, statut) |
| `dispatch` | CRUD + complete, control, alerts | Dispatch gouvernante (chambres, nettoyage, contrôle) |
| `maintenance` | CRUD + assign, resolve, comment, stats | Tickets maintenance avec escalade automatique |
| `linen` | GET/POST transactions + config | Blanchisserie (collecte, réception, stock) |
| `leaves` | CRUD + approve, reject, report, for-other, hotel-config | Congés avec validation hiérarchique |
| `tasks` | CRUD boards, columns, tasks, checklist, comments, attachments | Kanban complet avec pièces jointes |
| `evaluations` | CRUD grids, questions, evaluations, stats, duplicate | Évaluations avec grilles personnalisables |
| `audit` | CRUD grids, questions, audits, answers, pending, schedules | Audits qualité avec planification |
| `closures` | CRUD + validate, field-configs, documents, export | Clôtures financières avec champs configurables |
| `revenue` | CRUD competitors, rates, events, history | Revenue management (API Xotelo) |
| `price_alerts` | CRUD | Alertes prix (seuils par concurrent) |
| `invoices` | CRUD + upload/OCR, submit, review, approve, reject, pay, mark-paid, batch-mark-paid, stats, reporting, extract, export, approval-rules, fintecture-config | Factures fournisseurs (workflow complet) |
| `suppliers` | CRUD + search, hotels assignment, invoices | Fournisseurs multi-hôtel |
| `contracts` | CRUD + stats, categories, documents, alerts, analyze, charges, export-pdf | Contrats fournisseurs avec analyse IA |
| `welcome` | CRUD config, tabs, items, infos + public/{slug} | Livret d'accueil numérique |
| `payment-links` | CRUD + email Stripe | Liens de paiement self check-in |
| `smtp` | GET, PUT, POST test | Configuration email SMTP |
| `users` | CRUD + hotels assignment | Gestion utilisateurs multi-hôtels |
| `messages` | GET, POST | Messages internes (legacy) |
| `messaging` | CRUD conversations, messages, users, unread-count | Messagerie interne temps réel |
| `notifications` | GET, PUT, DELETE + poll | Notifications in-app + long polling |
| `notifications/admin/*` | GET, POST, DELETE | Campagnes notifications ciblées |
| `permissions` | GET, PUT | Permissions par rôle (matrice RBAC) |
| `modules` | GET, POST/PUT | Activation/désactivation modules |
| `time` | CRUD services, positions, contracts, templates, schedules, entries, timesheet, counters, holidays | Planning complet |
| `rgpd` | CRUD consents, requests, settings, access-logs | Conformité RGPD complète |
| `booking` | GET/POST + Stripe, availability, pms-sync | Réservation en ligne (public + admin) |
| `selfcheckin` | CRUD config, instructions, lockers, pricing | Self check-in par hôtel |
| `lockers` | CRUD | Gestion casiers self check-in |
| `selfcheckin-pricing` | CRUD | Tarification self check-in |
| `automations` | CRUD + logs, test | Automations planifiées |
| `fintecture_webhook` | POST | Webhook Fintecture (public, vérifie signature) |

## Système d'escalade automatique

Les cron jobs (`api/cron.php`) gèrent des alertes progressives avec escalade hiérarchique :

| Module | Horaire | Seuil | Escalade |
|--------|---------|-------|----------|
| **Dispatch** | 12h | Aucun dispatch créé | hotel_manager → 2j: groupe_manager → 5j: admin |
| **Contrôle** | 19h | Chambres nettoyées non contrôlées | hotel_manager → 2j: groupe_manager → 5j: admin |
| **Maintenance** | 9h | Ticket ouvert depuis 2j | groupe_manager → 5j: priorité urgente → 7j: priorité grave |
| **Congés** | Lundi 9h | Demandes en attente de validation | Rappel aux validateurs |
| **Tâches** | 9h | Tâches arrivant à échéance | Rappel aux assignés |
| **Audit** | 9h | X jours avant deadline | Rappel → 2j retard: groupe_manager → 5j: admin |
| **Clôture** | 13h | Pas de clôture aujourd'hui | hotel_manager → 48h: admin |
| **Revenue** | 6h | Quotidien | Mise à jour automatique tarifs OTA via Xotelo |
| **Nettoyage** | 3h | Quotidien | Purge notifications anciennes, sessions expirées |

Les automations personnalisées (`api/cron_runner.php`) s'exécutent toutes les 30 minutes.

## Intégrations externes

| Service | Usage | Configuration |
|---------|-------|---------------|
| **Xotelo API** | Tarifs OTA (Booking.com, Expedia, Hotels.com...) pour revenue management | Clé Xotelo par hôtel (`hotels.xotelo_hotel_key`) |
| **Stripe** | Paiement en ligne pour self check-in / booking (Stripe Elements) | Clés par hôtel (`stripe_publishable_key` + `stripe_secret_key`) |
| **Fintecture** | Paiement par virement bancaire Open Banking PSD2 (initiation + suivi) | Config par hôtel dans `fintecture_config` (app_id, app_secret, private_key) |
| **Anthropic Claude AI** | OCR factures (extraction structurée JSON) + analyse contrats (clauses, risques) | Clé API dans `hotel_contracts_config.anthropic_api_key` |
| **Tesseract OCR** | Extraction texte brut depuis PDF/images de factures | Installé sur le serveur (`tesseract-ocr` + `tesseract-ocr-fra`) |
| **Ghostscript** | Conversion PDF → PNG pour traitement OCR Tesseract | Installé sur le serveur |
| **PMS GeHo** | Synchronisation réservations via agent relais long-polling | `pms-agent.php` sur le PC hôtel |
| **SEPA XML** | Génération fichiers de virement bancaire (pain.001.001.03) | Comptes bancaires hôtel dans `hotel_bank_accounts` |
| **SMTP** | Envoi emails (liens de paiement, notifications) | Config dans `system_config` (PHPMailer) |
| **Chart.js 4.4.1** | Graphiques dashboard, revenue, statistiques (CDN) | Auto-chargé dans index.html |
| **Font Awesome 6.4.0** | Icônes interface (CDN) | Auto-chargé dans index.html |
| **Google Fonts** | Police Inter (400, 500, 600, 700) (CDN) | Auto-chargé dans index.html |
| **jsPDF 2.5.1** | Génération factures/reçus PDF (CDN) | Auto-chargé dans booking.html |

## Application mobile (Capacitor 8)

| Élément | Valeur |
|---------|--------|
| **App ID** | `com.aclgestion.app` |
| **Nom** | ACL GESTION |
| **WebDir** | `www/` |
| **Mode** | WebView pointant vers `https://acl-gestion.com` (pas de bundle local) |
| **iOS** | Xcode project dans `ios/App/` (Swift) |
| **Plugins** | Camera, PushNotifications, StatusBar, Keyboard, Haptics, SplashScreen, App |
| **Bridge** | `js/capacitor-bridge.js` - détection automatique web vs natif |

### Fonctionnalités natives

- **Push notifications** : Envoi via APNS/FCM, réception en foreground (toast) et background
- **Caméra** : Prise de photo native pour tickets maintenance, contrôles qualité
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

## Base de données

Schéma principal dans `database/schema.sql` + 27 migrations (~69+ tables) :

### Tables par domaine

- **Core** : `users`, `user_hotels`, `role_permissions`, `hotels`, `rooms`, `modules_config`, `system_config`
- **Opérations** : `room_dispatch`, `dispatch_control`, `dispatch_alerts`, `maintenance_tickets`
- **Blanchisserie** : `linen_transactions`, `linen_stock`, `linen_hotel_config`
- **RH** : `leave_requests`, `leave_approvals`, `hotel_leave_config`, `task_boards`, `task_columns`, `task_definitions`, `task_assignments`, `task_checklist`, `task_comments`, `task_attachments`, `evaluations`, `evaluation_grids`, `evaluation_questions`, `evaluation_answers`
- **Planning** : `time_schedules`, `time_schedule_entries`, `time_entries`, `time_contracts`, `time_positions`, `time_services`, `time_counters`, `time_user_positions`, `time_holidays`, `time_templates`
- **Qualité** : `audit_grids`, `audit_questions`, `audit_answers`, `audit_grid_permissions`, `audit_grid_hotels`, `audit_schedules`
- **Finance** : `daily_closures`, `closure_documents`, `closure_field_configs`, `closure_field_values`
- **Factures** : `suppliers`, `hotel_suppliers`, `supplier_invoices`, `supplier_invoice_lines`, `invoice_approvals`, `invoice_approval_rules`, `invoice_documents`, `invoice_payments`, `fintecture_config`
- **Contrats** : `contract_categories`, `contracts`, `contract_documents`, `contract_alerts`, `hotel_contracts_config`
- **Revenue** : `hotel_competitors`, `xotelo_rates_cache`, `xotelo_rates_history`, `xotelo_api_logs`, `revenue_events`, `price_alerts`
- **Réservation** : `pms_bookings`, `selfcheckin_config`, `selfcheckin_instructions`, `selfcheckin_lockers`, `selfcheckin_pricing`, `hotel_categories`, `payment_links`
- **Accueil** : `hotel_welcome_config`, `hotel_welcome_tabs`, `hotel_welcome_items`, `hotel_welcome_infos`
- **Banque** : `hotel_bank_accounts` (IBAN/BIC chiffrés AES-256 pour SEPA)
- **RGPD** : `user_consents`, `gdpr_requests`, `gdpr_settings`, `access_logs`
- **Sécurité** : `login_attempts` (rate limiting)
- **Messaging** : `notifications`, `notification_campaigns`, `messages`, `conversations`, `conversation_participants`, `conversation_messages`
- **Automations** : `automations`, `automation_hotels`, `automation_recipients`, `automation_logs`
- **Contact** : `contact_requests`

### Migrations (ordre d'exécution)

```
1.  schema.sql                        # Schéma principal (69+ tables)
2.  migration_audit.sql               # Audits qualité (grilles, questions, permissions)
3.  migration_automations.sql         # Automatisations (rules, logs)
4.  migration_revenue.sql             # Revenue management (concurrents, cache Xotelo)
5.  migration_revenue_events.sql      # Événements calendrier revenue
6.  migration_revenue_history.sql     # Historique tarifs OTA
7.  migration_revenue_global.sql      # Statistiques revenue globales
8.  migration_task_archive.sql        # Archivage tâches Kanban
9.  migration_security.sql            # Rate limiting, permissions push
10. migration_pms_stripe.sql          # PMS GeHo, Stripe, booking, catégories hôtel
11. migration_pms_relay.sql           # Relais PMS GeHo
12. migration_selfcheckin.sql         # Self check-in (config, instructions)
13. migration_selfcheckin_v2.sql      # Self check-in v2
14. migration_selfcheckin_v3.sql      # Self check-in v3 (casiers, consignes)
15. migration_hotel_description.sql   # Texte descriptif par hôtel
16. migration_maintenance_alerts.sql  # Alertes maintenance
17. migration_on_call_phone.sql       # Téléphone d'astreinte hôtel
18. migration_stripe_permission.sql   # Permission gestion clés Stripe
19. migration_bank_accounts.sql       # Comptes bancaires hôtel (SEPA)
20. migration_contracts.sql           # Contrats fournisseurs
21. migration_invoices.sql            # Factures fournisseurs (tables principales)
22. migration_invoices_v2.sql         # Factures v2 (améliorations)
23. migration_invoices_v3.sql         # Factures v3 (ventilation, export)
24. migration_welcome.sql             # Livret d'accueil
25. migration_smtp.sql                # Configuration SMTP
26. migration_walkin_hold.sql         # Walk-in hold réservations
27. migration_payment_links.sql       # Liens de paiement Stripe
28. migration_hotel_modules.sql       # Modules activés par hôtel
```

## Sécurité

| Mesure | Détail |
|--------|--------|
| **Authentification** | JWT HMAC-SHA256, expiration 7 jours, header Bearer |
| **Rate limiting** | 5 tentatives de login, blocage 15 min (table `login_attempts`) |
| **Headers HTTP** | X-Content-Type-Options: nosniff, X-Frame-Options: DENY, X-XSS-Protection, Referrer-Policy |
| **CORS** | Origine stricte configurée dans `.env` (`CORS_ORIGIN`) |
| **Uploads** | .htaccess bloque exécution PHP, autorise JPG/PNG/PDF uniquement, max 5 Mo images / 10 Mo PDF |
| **XSS** | Fonction `esc()` côté frontend, échappement attributs `escAttr()` |
| **Anti-bot** | Honeypot + captcha mathématique sur formulaire contact |
| **RGPD** | Module complet : consentements, export données, demandes RGPD, logs accès |
| **Mots de passe** | `password_hash()` / `password_verify()` avec bcrypt |
| **Chiffrement** | IBAN/BIC chiffrés AES-256 en base (fournisseurs + comptes bancaires hôtel) |
| **Webhooks** | Vérification signature asymétrique (Fintecture) |
| **.env** | Fichier non commité, permissions 600 |

## Pages légales

Accessibles depuis le footer de l'application et de la landing page :
- **Mentions légales** : informations éditeur (ACL GESTION SAS), hébergeur (OVH), directeur de publication
- **CGV** (14 articles) : conditions générales de vente, tarification, paiement, obligations
- **CGU** (15 articles) : conditions d'utilisation, accès, propriété intellectuelle, responsabilité
- **Politique de confidentialité** (12 articles) : traitement données personnelles, droits RGPD, cookies, durée conservation

## Dépannage

### Erreur 500
- Vérifier les logs PHP (Plesk > Logs ou `/var/log/apache2/`)
- Vérifier les identifiants MySQL dans `.env`
- Vérifier que toutes les tables sont créées (schema.sql + toutes les migrations)
- Vérifier que le `.htaccess` dans `api/` est présent et fonctionnel

### Page blanche
- Vérifier que tous les fichiers JS sont présents dans `js/pages/` (21 modules)
- Ouvrir la console du navigateur (F12) pour voir les erreurs JavaScript
- Vérifier que tous les `<script>` sont chargés dans `index.html`
- Vérifier le cache du navigateur (vider si version JS ancienne)

### OCR ne fonctionne pas
- Vérifier que Tesseract est installé : `tesseract --version`
- Vérifier que Ghostscript est installé : `gs --version`
- Vérifier les langues installées : `tesseract --list-langs` (doit contenir `fra`)
- Vérifier la clé API Anthropic dans la configuration contrats de l'hôtel

### Erreur de connexion
- Vérifier que la base de données est importée correctement (schéma + migrations)
- Vérifier que l'utilisateur admin existe dans la table `users`
- Vérifier le `JWT_SECRET` dans `.env`
- Vérifier que la table `login_attempts` existe (migration_security.sql)

### Notifications ne s'affichent pas
- Vérifier que la classe `.active` est correctement ajoutée au dropdown (css/layout.css)
- La permission `notifications.manage` doit être présente dans `role_permissions`
- Vérifier le long polling dans l'onglet Network du navigateur (`/notifications/poll`)

### Permissions non visibles dans le menu
- Vérifier la synchronisation entre `role_permissions` (SQL), `getDefaultPermissions()` (utils.js), et `PERMISSION_LABELS` (settings.js)
- Le menu est filtré par `updateMenuByPermissions()` dans `app.js`
- Un module désactivé dans Paramètres > Modules sera caché du menu

### Cron ne fonctionne pas
- Tester manuellement : `php api/cron.php dispatch`
- Vérifier que le chemin est absolu dans le crontab
- Vérifier les permissions du fichier
- Vérifier que la timezone est Europe/Paris : `php -r "echo date_default_timezone_get();"`

### Application mobile
- Vérifier que le serveur est accessible depuis le device
- Vérifier les certificats SSL (Capacitor refuse les certificats invalides)
- Logs debug : `npm run cap:open:ios` puis Xcode Console
- Vérifier `capacitor.config.json > server.url`

### Deploy.sh échoue
- Vérifier les droits d'exécution : `chmod +x deploy.sh`
- Vérifier les credentials MySQL dans `.env`
- Vérifier l'accès Git au repository
- Consulter les logs dans `/var/www/vhosts/acl-gestion.com/backups/`

---

**ACL GESTION** - SAS au capital de 1 000 € - SIRET 845 388 222 00018 - RCS Bobigny - 2024-2026
