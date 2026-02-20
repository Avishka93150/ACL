-- Migration: Détection de doublons factures fournisseurs
-- Ajoute un flag not_duplicate pour ignorer les alertes

ALTER TABLE supplier_invoices
    ADD COLUMN is_duplicate TINYINT(1) DEFAULT 0 AFTER notes,
    ADD COLUMN not_duplicate TINYINT(1) DEFAULT 0 AFTER is_duplicate,
    ADD COLUMN duplicate_of INT UNSIGNED DEFAULT NULL AFTER not_duplicate,
    ADD INDEX idx_duplicate (is_duplicate),
    ADD INDEX idx_duplicate_of (duplicate_of);
