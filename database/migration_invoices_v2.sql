-- Migration v2 : Module Factures Fournisseurs
-- Ajout catégorie aux lignes + extension modes de paiement
-- Date : 2026-02-17

-- Ajouter category_id aux lignes de facture (ventilation par catégorie)
ALTER TABLE supplier_invoice_lines
ADD COLUMN category_id INT UNSIGNED COMMENT 'FK vers contract_categories' AFTER invoice_id,
ADD INDEX idx_category (category_id);

-- Étendre les modes de paiement (VARCHAR au lieu de ENUM restreint)
ALTER TABLE supplier_invoices
MODIFY COLUMN payment_method VARCHAR(50) DEFAULT 'virement' COMMENT 'Mode de paiement (virement, cheque, prelevement, especes, carte, autre)';
