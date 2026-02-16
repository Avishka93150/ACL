-- Migration : Workflow de validation de factures configurable par hotel
-- Date : 2026-02-16

-- Configuration workflow de validation par hotel
CREATE TABLE IF NOT EXISTS closure_workflow_config (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,

    -- Seuils de montant (depenses)
    auto_validate_limit DECIMAL(10,2) DEFAULT 0 COMMENT 'Auto-validation si depenses <= ce montant (0 = desactive)',
    manager_validate_limit DECIMAL(10,2) DEFAULT 0 COMMENT 'Validation hotel_manager si depenses <= ce montant (0 = illimite)',

    -- Justificatif obligatoire a partir de ce montant
    receipt_required_above DECIMAL(10,2) DEFAULT 0 COMMENT 'Justificatif obligatoire si depenses > ce montant (0 = toujours)',

    -- Commentaire obligatoire a partir de ce montant
    comment_required_above DECIMAL(10,2) DEFAULT 0 COMMENT 'Commentaire obligatoire si depenses > ce montant (0 = toujours)',

    -- Double validation au-dessus de ce montant
    double_validation_above DECIMAL(10,2) DEFAULT 0 COMMENT 'Double validation requise si depenses > ce montant (0 = desactive)',

    -- Roles autorises a valider (JSON array)
    validator_roles JSON COMMENT 'Roles autorises a valider, ex: ["admin","groupe_manager","hotel_manager"]',

    -- Roles autorises a valider niveau 2 (double validation)
    validator_roles_level2 JSON COMMENT 'Roles pour la 2e validation, ex: ["admin","groupe_manager"]',

    -- Alerte si cloture non soumise apres X heures
    alert_delay_hours INT DEFAULT 13 COMMENT 'Declenchement alerte apres X heures sans cloture',

    -- Delai max pour validation (heures)
    validation_deadline_hours INT DEFAULT 48 COMMENT 'Alerte si non validee apres X heures',

    created_at DATETIME,
    updated_at DATETIME,

    UNIQUE KEY unique_hotel (hotel_id),
    INDEX idx_hotel (hotel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Etapes de validation personnalisees par hotel
CREATE TABLE IF NOT EXISTS closure_workflow_steps (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    step_order INT NOT NULL DEFAULT 1 COMMENT 'Ordre de letape dans le workflow',
    step_name VARCHAR(200) NOT NULL COMMENT 'Nom de letape (ex: Validation receptionniste)',
    required_role VARCHAR(50) NOT NULL COMMENT 'Role requis pour cette etape',
    min_amount DECIMAL(10,2) DEFAULT 0 COMMENT 'Etape requise si depenses >= ce montant',
    max_amount DECIMAL(10,2) DEFAULT 0 COMMENT 'Etape requise si depenses <= ce montant (0 = illimite)',
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME,

    INDEX idx_hotel (hotel_id),
    INDEX idx_order (hotel_id, step_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Historique des validations (multi-etapes)
CREATE TABLE IF NOT EXISTS closure_validations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    closure_id INT UNSIGNED NOT NULL COMMENT 'Reference daily_closures',
    step_id INT UNSIGNED COMMENT 'Reference closure_workflow_steps (NULL si workflow simple)',
    step_order INT DEFAULT 1,
    validated_by INT UNSIGNED NOT NULL,
    validator_role VARCHAR(50),
    action ENUM('approved', 'rejected') NOT NULL,
    comment TEXT,
    validated_at DATETIME,

    INDEX idx_closure (closure_id),
    INDEX idx_step (step_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Ajouter colonne current_step dans daily_closures pour le suivi multi-etapes
ALTER TABLE daily_closures
    ADD COLUMN current_step INT DEFAULT 0 COMMENT 'Etape actuelle du workflow (0 = soumis, pas encore valide)' AFTER status,
    ADD COLUMN rejection_comment TEXT COMMENT 'Commentaire de rejet' AFTER validated_at;
