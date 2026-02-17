-- Migration : Choix des modèles IA par module et par hôtel
-- Date : 2026-02-17

-- Ajouter les colonnes de choix de modèle IA dans la config hôtel
ALTER TABLE hotel_contracts_config
    ADD COLUMN ai_model_ocr VARCHAR(100) DEFAULT 'claude-sonnet-4-5-20250929' COMMENT 'Modèle IA pour OCR factures',
    ADD COLUMN ai_model_contracts VARCHAR(100) DEFAULT 'claude-sonnet-4-5-20250929' COMMENT 'Modèle IA pour analyse contrats';
