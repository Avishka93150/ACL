-- ============================================================
-- Migration: Module Contrats Fournisseurs
-- Date: 2026-02-16
-- ============================================================

-- Table des catégories de contrats (par hôtel)
CREATE TABLE IF NOT EXISTS contract_categories (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) DEFAULT '#6366f1',
    created_at DATETIME,
    INDEX idx_hotel (hotel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table principale des contrats
CREATE TABLE IF NOT EXISTS contracts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    supplier_name VARCHAR(255) NOT NULL,
    contract_ref VARCHAR(100),
    category_id INT UNSIGNED,
    description TEXT,
    amount DECIMAL(12,2) DEFAULT 0,
    amount_frequency ENUM('monthly','quarterly','yearly','one_time') DEFAULT 'monthly',
    start_date DATE,
    end_date DATE,
    termination_notice_days INT DEFAULT 90,
    auto_renewal TINYINT(1) DEFAULT 0,
    renewal_duration_months INT DEFAULT 12,
    status ENUM('active','expiring','terminated','archived') DEFAULT 'active',
    ai_analysis TEXT,
    ai_analyzed_at DATETIME,
    notes TEXT,
    created_by INT UNSIGNED NOT NULL,
    created_at DATETIME,
    updated_at DATETIME,
    INDEX idx_hotel (hotel_id),
    INDEX idx_status (status),
    INDEX idx_category (category_id),
    INDEX idx_end_date (end_date),
    INDEX idx_supplier (supplier_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table des documents/pièces jointes des contrats
CREATE TABLE IF NOT EXISTS contract_documents (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    contract_id INT UNSIGNED NOT NULL,
    type ENUM('contract','annex','termination_letter','acknowledgment','invoice','other') DEFAULT 'contract',
    label VARCHAR(255),
    file_path VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255),
    uploaded_by INT UNSIGNED,
    created_at DATETIME,
    INDEX idx_contract (contract_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table des alertes configurées par contrat
CREATE TABLE IF NOT EXISTS contract_alerts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    contract_id INT UNSIGNED NOT NULL,
    alert_type ENUM('expiry','termination_notice','custom') DEFAULT 'expiry',
    days_before INT NOT NULL DEFAULT 30,
    is_active TINYINT(1) DEFAULT 1,
    last_triggered_at DATETIME,
    created_at DATETIME,
    INDEX idx_contract (contract_id),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Configuration IA contrats par hôtel
CREATE TABLE IF NOT EXISTS hotel_contracts_config (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL UNIQUE,
    ai_enabled TINYINT(1) DEFAULT 0,
    anthropic_api_key VARCHAR(255) DEFAULT NULL,
    created_at DATETIME,
    updated_at DATETIME,
    INDEX idx_hotel (hotel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Permissions pour le module contrats
INSERT INTO role_permissions (role, permission, allowed, updated_at) VALUES
('admin', 'contracts.view', 1, NOW()),
('admin', 'contracts.create', 1, NOW()),
('admin', 'contracts.manage', 1, NOW()),
('admin', 'contracts.delete', 1, NOW()),
('admin', 'contracts.analyze', 1, NOW()),
('admin', 'contracts.export', 1, NOW()),
('groupe_manager', 'contracts.view', 1, NOW()),
('groupe_manager', 'contracts.create', 1, NOW()),
('groupe_manager', 'contracts.manage', 1, NOW()),
('groupe_manager', 'contracts.delete', 1, NOW()),
('groupe_manager', 'contracts.analyze', 1, NOW()),
('groupe_manager', 'contracts.export', 1, NOW()),
('hotel_manager', 'contracts.view', 1, NOW()),
('hotel_manager', 'contracts.create', 1, NOW()),
('hotel_manager', 'contracts.manage', 1, NOW()),
('hotel_manager', 'contracts.delete', 0, NOW()),
('hotel_manager', 'contracts.analyze', 1, NOW()),
('hotel_manager', 'contracts.export', 1, NOW()),
('comptabilite', 'contracts.view', 1, NOW()),
('comptabilite', 'contracts.create', 0, NOW()),
('comptabilite', 'contracts.manage', 0, NOW()),
('comptabilite', 'contracts.delete', 0, NOW()),
('comptabilite', 'contracts.analyze', 0, NOW()),
('comptabilite', 'contracts.export', 1, NOW()),
('rh', 'contracts.view', 0, NOW()),
('rh', 'contracts.create', 0, NOW()),
('rh', 'contracts.manage', 0, NOW()),
('rh', 'contracts.delete', 0, NOW()),
('rh', 'contracts.analyze', 0, NOW()),
('rh', 'contracts.export', 0, NOW()),
('receptionniste', 'contracts.view', 0, NOW()),
('receptionniste', 'contracts.create', 0, NOW()),
('receptionniste', 'contracts.manage', 0, NOW()),
('receptionniste', 'contracts.delete', 0, NOW()),
('receptionniste', 'contracts.analyze', 0, NOW()),
('receptionniste', 'contracts.export', 0, NOW()),
('employee', 'contracts.view', 0, NOW()),
('employee', 'contracts.create', 0, NOW()),
('employee', 'contracts.manage', 0, NOW()),
('employee', 'contracts.delete', 0, NOW()),
('employee', 'contracts.analyze', 0, NOW()),
('employee', 'contracts.export', 0, NOW())
ON DUPLICATE KEY UPDATE allowed = VALUES(allowed), updated_at = NOW();
