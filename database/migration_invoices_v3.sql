-- Migration v3 : Lien clôture → facture fournisseur
-- Ajout closure_id pour tracer les factures créées depuis les clôtures journalières
-- Date : 2026-02-17

-- Ajouter closure_id à supplier_invoices
ALTER TABLE supplier_invoices
ADD COLUMN closure_id INT UNSIGNED COMMENT 'FK vers daily_closures (facture créée depuis clôture)' AFTER po_number,
ADD INDEX idx_closure (closure_id);
