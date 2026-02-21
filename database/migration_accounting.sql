-- Migration: Plan comptable + Comptes auxiliaires
-- Ajoute des champs comptables aux categories et cree les comptes auxiliaires

-- 1. Enrichir les categories avec des champs comptables
ALTER TABLE contract_categories
    ADD COLUMN account_number VARCHAR(20) DEFAULT NULL AFTER color,
    ADD COLUMN account_class ENUM('6','7') DEFAULT '6' COMMENT '6=Charges, 7=Produits' AFTER account_number,
    ADD COLUMN parent_id INT UNSIGNED DEFAULT NULL AFTER account_class,
    ADD COLUMN description TEXT DEFAULT NULL AFTER parent_id,
    ADD COLUMN is_active TINYINT(1) DEFAULT 1 AFTER description,
    ADD INDEX idx_account (account_number),
    ADD INDEX idx_parent (parent_id),
    ADD INDEX idx_class (account_class);

-- 2. Comptes auxiliaires (sous-comptes fournisseurs)
CREATE TABLE IF NOT EXISTS accounting_auxiliary_accounts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    code VARCHAR(20) NOT NULL,
    label VARCHAR(255) NOT NULL,
    type ENUM('supplier','other') DEFAULT 'supplier',
    supplier_id INT UNSIGNED DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME,
    updated_at DATETIME,
    INDEX idx_hotel (hotel_id),
    INDEX idx_code (hotel_id, code),
    INDEX idx_supplier (supplier_id),
    INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
