-- Migration : Comptes bancaires hôtels
-- Table pour stocker les RIB/IBAN des hôtels (utilisés pour le SEPA XML)
-- Date : 2026-02-17

CREATE TABLE IF NOT EXISTS hotel_bank_accounts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    label VARCHAR(100) NOT NULL COMMENT 'Nom du compte (ex: Compte principal, Compte fournisseurs)',
    iban VARCHAR(34) NOT NULL,
    bic VARCHAR(11) DEFAULT NULL,
    is_default TINYINT(1) DEFAULT 0 COMMENT '1 = compte par défaut',
    created_at DATETIME,
    updated_at DATETIME,
    INDEX idx_hotel (hotel_id),
    CONSTRAINT fk_bank_hotel FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
