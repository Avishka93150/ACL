# Base de donnees ACL GESTION

## Installation

Importer les fichiers SQL dans l'ordre suivant :

```bash
mysql -u user -p acl_gestion < schema.sql
mysql -u user -p acl_gestion < migration_audit.sql
mysql -u user -p acl_gestion < migration_automations.sql
mysql -u user -p acl_gestion < migration_revenue.sql
mysql -u user -p acl_gestion < migration_revenue_events.sql
mysql -u user -p acl_gestion < migration_revenue_history.sql
mysql -u user -p acl_gestion < migration_task_archive.sql
```

## Fichiers

| Fichier | Description |
|---------|-------------|
| `schema.sql` | Schema principal (~1340 lignes) : users, hotels, rooms, dispatch, maintenance, linen, leaves, tasks, evaluations, time management, closures, messages, notifications, RGPD |
| `migration_audit.sql` | Module Audit : grilles, questions, reponses, permissions, planification, historique, liaison multi-hotels |
| `migration_automations.sql` | Module Automations : automations, liaison hotels, destinataires, logs execution, 9 automations par defaut |
| `migration_revenue.sql` | Module Revenue : concurrents, cache tarifs Xotelo, logs API, permissions par role |
| `migration_revenue_events.sql` | Evenements calendrier revenue (festivals, conferences, etc.) |
| `migration_revenue_history.sql` | Historique des tarifs (evolution tarifaire) |
| `migration_task_archive.sql` | Colonnes archivage sur la table tasks |

## Tables principales (~50)

### Core
- `users` - Comptes utilisateurs (email, mot de passe bcrypt, role, status)
- `user_hotels` - Affectation utilisateurs aux hotels (N:N)
- `role_permissions` - Permissions par role (RBAC)
- `hotels` - Etablissements (nom, adresse, etoiles, xotelo_hotel_key)
- `rooms` - Chambres (numero, etage, type, hotel_id)

### Operations
- `room_dispatch` - Dispatch chambres (date, chambre, employe, type nettoyage, status)
- `dispatch_control` - Controles qualite (6 criteres, score, photos)
- `dispatch_alerts` - Alertes dispatch (jours consecutifs, escalade)
- `maintenance_tickets` - Tickets maintenance (categorie, priorite, status, photos)

### Blanchisserie
- `linen_transactions` - Collectes et receptions de linge
- `linen_stock` - Stock par hotel et type de linge
- `linen_hotel_config` - Configuration types de linge par hotel

### Ressources humaines
- `leave_requests` - Demandes de conges (type, dates, status)
- `leave_approvals` - Approbations hierarchiques
- `task_definitions` / `tasks` - Tableaux Kanban et taches
- `task_assignments` - Assignation taches aux utilisateurs
- `evaluations` - Evaluations employes

### Planning (time management)
- `time_services` - Departements/services
- `time_positions` - Postes avec couleurs
- `time_contracts` - Contrats employes (heures hebdo, type)
- `time_user_positions` - Affectation employes aux postes
- `time_holidays` - Jours feries
- `time_schedules` - Plannings hebdomadaires (draft/published/locked)
- `time_schedule_entries` - Entrees de planning (work/absence)
- `time_entries` - Pointage reel
- `time_counters` - Compteurs heures mensuels

### Qualite (audit)
- `audit_grids` - Grilles d'audit (nom, frequence, rappel)
- `audit_questions` - Questions (type, ponderation, section)
- `audit_grid_permissions` - Permissions (view/execute par role/user)
- `audit_grid_hotels` - Liaison grilles-hotels (multi-hotel)
- `audits` - Audits realises (score, status)
- `audit_answers` - Reponses aux questions
- `audit_schedules` - Deadlines et rappels
- `audit_history` - Historique denormalise

### Finance
- `daily_closures` - Clotures journalieres (cash, depenses, status)
- `closure_documents` - Documents joints (PDF, JPG)
- `closure_field_configs` - Champs configurables par hotel
- `closure_field_values` - Valeurs des champs personnalises

### Revenue
- `hotel_competitors` - Concurrents par hotel (cle Xotelo)
- `xotelo_rates_cache` - Cache tarifs recuperes
- `xotelo_rates_history` - Historique evolution tarifs
- `xotelo_api_logs` - Logs appels API Xotelo
- `revenue_events` - Evenements calendrier

### RGPD
- `user_consents` - Consentements utilisateurs
- `gdpr_requests` - Demandes RGPD (acces, effacement, etc.)
- `gdpr_settings` - Parametres RGPD (retention, etc.)
- `access_logs` - Logs d'acces

### Messaging
- `notifications` - Notifications in-app
- `messages` - Messages internes (ancien systeme)
- `conversations` - Conversations (nouveau systeme Messenger)
- `conversation_participants` - Participants aux conversations
- `conversation_messages` - Messages dans les conversations

### Automations
- `automations` - Definitions des automations
- `automation_hotels` - Liaison automations-hotels
- `automation_recipients` - Destinataires (user/role/email)
- `automation_logs` - Logs d'execution

## Conventions

- Charset : `utf8mb4`
- Engine : `InnoDB`
- Nommage : `snake_case`
- Timestamps : `created_at DATETIME`, `updated_at DATETIME`
- Cles etrangeres avec `ON DELETE CASCADE` ou `ON DELETE SET NULL`
- Index sur les colonnes de filtrage frequentes
- `ON DUPLICATE KEY UPDATE` pour les upserts
