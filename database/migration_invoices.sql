-- Migration : Module Factures Fournisseurs
-- Date : 2026-02-16

-- =============================================
-- FOURNISSEURS
-- =============================================

-- Fournisseurs (entites persistantes, multi-hotel)
CREATE TABLE IF NOT EXISTS suppliers (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL COMMENT 'Raison sociale',
    siret VARCHAR(14) COMMENT 'SIRET (14 chiffres)',
    tva_number VARCHAR(20) COMMENT 'TVA intracommunautaire (FR...)',
    address_street VARCHAR(255),
    address_zip VARCHAR(10),
    address_city VARCHAR(100),
    address_country VARCHAR(2) DEFAULT 'FR',
    contact_name VARCHAR(255),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(20),
    iban VARCHAR(255) COMMENT 'IBAN chiffre AES-256',
    bic VARCHAR(255) COMMENT 'BIC/SWIFT chiffre AES-256',
    payment_method ENUM('fintecture','virement_manuel','cheque','prelevement','autre') DEFAULT 'virement_manuel',
    payment_delay_days INT DEFAULT 30 COMMENT 'Delai de paiement par defaut (jours)',
    category_id INT UNSIGNED COMMENT 'FK vers contract_categories',
    notes TEXT,
    is_active TINYINT(1) DEFAULT 1,
    created_by INT UNSIGNED NOT NULL,
    created_at DATETIME,
    updated_at DATETIME,
    UNIQUE KEY unique_siret (siret),
    INDEX idx_category (category_id),
    INDEX idx_active (is_active),
    INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Liaison fournisseurs <-> hotels (multi-hotel)
CREATE TABLE IF NOT EXISTS hotel_suppliers (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    supplier_id INT UNSIGNED NOT NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME,
    UNIQUE KEY unique_hotel_supplier (hotel_id, supplier_id),
    INDEX idx_hotel (hotel_id),
    INDEX idx_supplier (supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================
-- FACTURES
-- =============================================

-- Factures fournisseurs
CREATE TABLE IF NOT EXISTS supplier_invoices (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    supplier_id INT UNSIGNED COMMENT 'FK vers suppliers (NULL si nouveau fournisseur)',
    invoice_number VARCHAR(100) COMMENT 'N facture fournisseur',
    invoice_date DATE,
    due_date DATE,
    total_ht DECIMAL(12,2) COMMENT 'Total HT',
    total_tva DECIMAL(12,2) COMMENT 'Total TVA',
    total_ttc DECIMAL(12,2) COMMENT 'Total TTC',
    currency VARCHAR(3) DEFAULT 'EUR',

    -- OCR
    original_file VARCHAR(500) NOT NULL COMMENT 'Chemin fichier original (PDF/image)',
    ocr_status ENUM('pending','processing','completed','failed','skipped') DEFAULT 'pending',
    ocr_raw_data JSON COMMENT 'Donnees brutes OCR (JSON complet)',
    ocr_confidence DECIMAL(5,2) COMMENT 'Score de confiance global OCR (0-100)',
    ocr_processed_at DATETIME,

    -- Workflow
    status ENUM('draft','pending_review','pending_approval','approved','pending_payment','payment_initiated','paid','rejected','cancelled') DEFAULT 'draft',
    submitted_by INT UNSIGNED,
    submitted_at DATETIME,
    reviewed_by INT UNSIGNED COMMENT 'Verificateur (corrige OCR)',
    reviewed_at DATETIME,
    approved_by INT UNSIGNED COMMENT 'Approbateur (valide le paiement)',
    approved_at DATETIME,
    rejection_reason TEXT,

    -- Paiement
    payment_method ENUM('fintecture','manual','other') DEFAULT 'fintecture',
    fintecture_session_id VARCHAR(255),
    fintecture_status VARCHAR(50),
    payment_reference VARCHAR(255),
    paid_at DATETIME,
    paid_by INT UNSIGNED,

    -- Metadonnees
    notes TEXT,
    tags VARCHAR(500) COMMENT 'Tags libres separes par virgule',
    po_number VARCHAR(100) COMMENT 'N bon de commande',
    accounting_code VARCHAR(50) COMMENT 'Code comptable',

    created_by INT UNSIGNED NOT NULL,
    created_at DATETIME,
    updated_at DATETIME,

    INDEX idx_hotel (hotel_id),
    INDEX idx_supplier (supplier_id),
    INDEX idx_status (status),
    INDEX idx_due_date (due_date),
    INDEX idx_invoice_date (invoice_date),
    INDEX idx_fintecture (fintecture_session_id),
    UNIQUE KEY unique_invoice (hotel_id, supplier_id, invoice_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Lignes de facture
CREATE TABLE IF NOT EXISTS supplier_invoice_lines (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT UNSIGNED NOT NULL,
    description VARCHAR(500),
    quantity DECIMAL(10,3) DEFAULT 1,
    unit_price_ht DECIMAL(12,4),
    tva_rate DECIMAL(5,2) DEFAULT 20.00 COMMENT 'Taux TVA (20, 10, 5.5, 2.1)',
    tva_amount DECIMAL(12,2),
    total_ht DECIMAL(12,2),
    total_ttc DECIMAL(12,2),
    accounting_code VARCHAR(50),
    position INT DEFAULT 0,
    INDEX idx_invoice (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================
-- WORKFLOW & VALIDATION
-- =============================================

-- Regles d'approbation par hotel
CREATE TABLE IF NOT EXISTS invoice_approval_rules (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    name VARCHAR(255) NOT NULL,
    min_amount DECIMAL(12,2) DEFAULT 0 COMMENT 'Montant TTC minimum',
    max_amount DECIMAL(12,2) COMMENT 'Montant TTC maximum (NULL = illimite)',
    required_role VARCHAR(50) NOT NULL COMMENT 'Role minimum requis pour approuver',
    requires_double_approval TINYINT(1) DEFAULT 0 COMMENT 'Double validation requise',
    second_approver_role VARCHAR(50) COMMENT 'Role du 2e valideur',
    supplier_category_id INT UNSIGNED COMMENT 'FK vers contract_categories (NULL = toutes)',
    is_active TINYINT(1) DEFAULT 1,
    sort_order INT DEFAULT 0,
    created_at DATETIME,
    updated_at DATETIME,
    INDEX idx_hotel (hotel_id),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Historique des validations
CREATE TABLE IF NOT EXISTS invoice_approvals (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    action ENUM('submit','review','approve','reject','request_payment','confirm_payment','cancel') NOT NULL,
    comment TEXT,
    created_at DATETIME,
    INDEX idx_invoice (invoice_id),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================
-- PAIEMENTS
-- =============================================

-- Suivi des paiements
CREATE TABLE IF NOT EXISTS invoice_payments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT UNSIGNED NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_method ENUM('fintecture','manual') NOT NULL,
    fintecture_session_id VARCHAR(255),
    fintecture_status VARCHAR(50),
    fintecture_provider VARCHAR(100) COMMENT 'Banque du payeur',
    payment_reference VARCHAR(255),
    status ENUM('initiated','pending','completed','failed','cancelled','refunded') DEFAULT 'initiated',
    initiated_by INT UNSIGNED NOT NULL,
    initiated_at DATETIME,
    completed_at DATETIME,
    webhook_data JSON COMMENT 'Donnees webhook brutes Fintecture',
    INDEX idx_invoice (invoice_id),
    INDEX idx_session (fintecture_session_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================
-- DOCUMENTS
-- =============================================

-- Documents annexes
CREATE TABLE IF NOT EXISTS invoice_documents (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT UNSIGNED NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    file_name VARCHAR(255),
    file_type VARCHAR(50) COMMENT 'pdf, jpg, png',
    document_type ENUM('invoice','credit_note','po','delivery','other') DEFAULT 'invoice',
    uploaded_by INT UNSIGNED NOT NULL,
    uploaded_at DATETIME,
    INDEX idx_invoice (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================
-- CONFIGURATION FINTECTURE
-- =============================================

-- Configuration Fintecture par hotel
CREATE TABLE IF NOT EXISTS fintecture_config (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    app_id VARCHAR(255),
    app_secret VARCHAR(500) COMMENT 'Chiffre en BDD',
    private_key_path VARCHAR(500) COMMENT 'Chemin vers la cle privee',
    environment ENUM('sandbox','production') DEFAULT 'sandbox',
    webhook_secret VARCHAR(255),
    is_active TINYINT(1) DEFAULT 0,
    created_at DATETIME,
    updated_at DATETIME,
    UNIQUE KEY unique_hotel (hotel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================
-- PERMISSIONS
-- =============================================

INSERT INTO role_permissions (role, permission, allowed, updated_at) VALUES
-- invoices.view
('admin', 'invoices.view', 1, NOW()),
('groupe_manager', 'invoices.view', 1, NOW()),
('hotel_manager', 'invoices.view', 1, NOW()),
('comptabilite', 'invoices.view', 1, NOW()),
-- invoices.create
('admin', 'invoices.create', 1, NOW()),
('groupe_manager', 'invoices.create', 1, NOW()),
('hotel_manager', 'invoices.create', 1, NOW()),
('comptabilite', 'invoices.create', 1, NOW()),
('receptionniste', 'invoices.create', 1, NOW()),
-- invoices.edit
('admin', 'invoices.edit', 1, NOW()),
('groupe_manager', 'invoices.edit', 1, NOW()),
('hotel_manager', 'invoices.edit', 1, NOW()),
('comptabilite', 'invoices.edit', 1, NOW()),
-- invoices.review
('admin', 'invoices.review', 1, NOW()),
('groupe_manager', 'invoices.review', 1, NOW()),
('hotel_manager', 'invoices.review', 1, NOW()),
('comptabilite', 'invoices.review', 1, NOW()),
-- invoices.approve
('admin', 'invoices.approve', 1, NOW()),
('groupe_manager', 'invoices.approve', 1, NOW()),
('hotel_manager', 'invoices.approve', 1, NOW()),
-- invoices.pay
('admin', 'invoices.pay', 1, NOW()),
('groupe_manager', 'invoices.pay', 1, NOW()),
('comptabilite', 'invoices.pay', 1, NOW()),
-- invoices.delete
('admin', 'invoices.delete', 1, NOW()),
('groupe_manager', 'invoices.delete', 1, NOW()),
-- invoices.configure
('admin', 'invoices.configure', 1, NOW()),
-- invoices.export
('admin', 'invoices.export', 1, NOW()),
('groupe_manager', 'invoices.export', 1, NOW()),
('hotel_manager', 'invoices.export', 1, NOW()),
('comptabilite', 'invoices.export', 1, NOW()),
-- suppliers.manage
('admin', 'suppliers.manage', 1, NOW()),
('groupe_manager', 'suppliers.manage', 1, NOW()),
('hotel_manager', 'suppliers.manage', 1, NOW()),
('comptabilite', 'suppliers.manage', 1, NOW())
ON DUPLICATE KEY UPDATE allowed = VALUES(allowed);
