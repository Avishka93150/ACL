-- Migration: Import comptable CSV + P&L complet
-- Tables: accounting_entries, accounting_import_batches, accounting_import_templates, hotel_import_email_config
-- Catégories prédéfinies (100+), permissions

-- 1. Écritures comptables (données importées ou saisies manuellement)
CREATE TABLE IF NOT EXISTS accounting_entries (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    batch_id INT UNSIGNED DEFAULT NULL,
    category_id INT UNSIGNED DEFAULT NULL,
    entry_date DATE NOT NULL,
    label VARCHAR(255) NOT NULL,
    amount_ht DECIMAL(12,2) NOT NULL DEFAULT 0,
    amount_tva DECIMAL(12,2) NOT NULL DEFAULT 0,
    amount_ttc DECIMAL(12,2) NOT NULL DEFAULT 0,
    account_class ENUM('6','7') NOT NULL,
    source ENUM('csv_import','manual','email_import') DEFAULT 'manual',
    notes TEXT DEFAULT NULL,
    created_by INT UNSIGNED DEFAULT NULL,
    created_at DATETIME,
    updated_at DATETIME,
    INDEX idx_hotel (hotel_id),
    INDEX idx_batch (batch_id),
    INDEX idx_category (category_id),
    INDEX idx_date (entry_date),
    INDEX idx_class (account_class),
    INDEX idx_hotel_date_class (hotel_id, entry_date, account_class)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Lots d'import (traçabilité)
CREATE TABLE IF NOT EXISTS accounting_import_batches (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    template_id INT UNSIGNED DEFAULT NULL,
    file_name VARCHAR(255),
    file_path VARCHAR(500),
    source ENUM('upload','email') DEFAULT 'upload',
    row_count INT DEFAULT 0,
    total_amount DECIMAL(12,2) DEFAULT 0,
    status ENUM('pending','previewed','confirmed','cancelled') DEFAULT 'pending',
    error_log TEXT DEFAULT NULL,
    imported_by INT UNSIGNED DEFAULT NULL,
    created_at DATETIME,
    confirmed_at DATETIME,
    INDEX idx_hotel (hotel_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Templates de mapping CSV
CREATE TABLE IF NOT EXISTS accounting_import_templates (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT NULL,
    delimiter CHAR(1) DEFAULT ';',
    encoding VARCHAR(20) DEFAULT 'UTF-8',
    skip_rows INT DEFAULT 0,
    date_format VARCHAR(20) DEFAULT 'd/m/Y',
    col_date INT DEFAULT NULL,
    col_label INT DEFAULT NULL,
    col_amount INT DEFAULT NULL,
    col_amount_ht INT DEFAULT NULL,
    col_amount_tva INT DEFAULT NULL,
    col_amount_ttc INT DEFAULT NULL,
    col_category INT DEFAULT NULL,
    default_category_id INT UNSIGNED DEFAULT NULL,
    default_account_class ENUM('6','7') DEFAULT '7',
    category_mapping JSON DEFAULT NULL,
    amount_is_cents TINYINT(1) DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME,
    updated_at DATETIME,
    INDEX idx_hotel (hotel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Config email import par hôtel
CREATE TABLE IF NOT EXISTS hotel_import_email_config (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    email_address VARCHAR(255) NOT NULL,
    imap_host VARCHAR(255) DEFAULT NULL,
    imap_port INT DEFAULT 993,
    imap_user VARCHAR(255) DEFAULT NULL,
    imap_password VARCHAR(500) DEFAULT NULL,
    imap_folder VARCHAR(100) DEFAULT 'INBOX',
    default_template_id INT UNSIGNED DEFAULT NULL,
    auto_confirm TINYINT(1) DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    last_check_at DATETIME DEFAULT NULL,
    created_at DATETIME,
    updated_at DATETIME,
    UNIQUE KEY uk_hotel (hotel_id),
    UNIQUE KEY uk_email (email_address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Ajouter colonnes group_label et sort_order aux catégories comptables
ALTER TABLE contract_categories ADD COLUMN group_label VARCHAR(100) DEFAULT NULL;
ALTER TABLE contract_categories ADD COLUMN sort_order INT DEFAULT 0;

-- 6. Catégories prédéfinies — PRODUITS (Classe 7)
INSERT INTO contract_categories (hotel_id, name, color, account_number, account_class, group_label, sort_order, is_active, created_at)
VALUES
(0, 'CA Hébergement', '#10b981', '706100', '7', 'Chiffre d\'affaires', 10, 1, NOW()),
(0, 'CA Restaurant', '#3b82f6', '707000', '7', 'Chiffre d\'affaires', 20, 1, NOW()),
(0, 'CA Bar', '#f59e0b', '707100', '7', 'Chiffre d\'affaires', 30, 1, NOW()),
(0, 'CA Petit-déjeuner', '#8b5cf6', '707200', '7', 'Chiffre d\'affaires', 40, 1, NOW()),
(0, 'CA Séminaires / Salles', '#ec4899', '707300', '7', 'Chiffre d\'affaires', 50, 1, NOW()),
(0, 'CA Spa / Bien-être', '#14b8a6', '707400', '7', 'Chiffre d\'affaires', 60, 1, NOW()),
(0, 'CA Parking', '#6366f1', '707500', '7', 'Chiffre d\'affaires', 70, 1, NOW()),
(0, 'CA Divers', '#78716c', '707900', '7', 'Chiffre d\'affaires', 80, 1, NOW()),
(0, 'Remboursement assurance', '#22c55e', '791000', '7', 'Produits exceptionnels', 90, 1, NOW()),
(0, 'Rémunération Publiphone', '#a3e635', '708000', '7', 'Produits exceptionnels', 100, 1, NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- 7. Catégories prédéfinies — CHARGES (Classe 6)
-- == Achats consommés ==
INSERT INTO contract_categories (hotel_id, name, color, account_number, account_class, group_label, sort_order, is_active, created_at)
VALUES
(0, 'Achats PDJ', '#ef4444', '601100', '6', 'Achats consommés', 200, 1, NOW()),
(0, 'Achats marchandises bar', '#dc2626', '601200', '6', 'Achats consommés', 210, 1, NOW()),
(0, 'Achats marchandises PDJ et restaurant', '#b91c1c', '601300', '6', 'Achats consommés', 220, 1, NOW()),
(0, 'Achats produits d\'accueil', '#f87171', '602100', '6', 'Achats consommés', 230, 1, NOW()),
(0, 'Achats produits d\'entretien', '#fca5a5', '602200', '6', 'Achats consommés', 240, 1, NOW()),
(0, 'Achats consommés divers', '#fecaca', '602900', '6', 'Achats consommés', 250, 1, NOW()),
(0, 'Achats Journaux clients', '#f97316', '602300', '6', 'Achats consommés', 260, 1, NOW()),
(0, 'Consignes Bar', '#fb923c', '602400', '6', 'Achats consommés', 270, 1, NOW()),
(0, 'Charges sur ventes', '#fdba74', '602500', '6', 'Achats consommés', 280, 1, NOW()),
(0, 'Commissions sur Achats', '#ea580c', '602600', '6', 'Achats consommés', 290, 1, NOW()),
(0, 'Transport sur achats', '#c2410c', '602700', '6', 'Achats consommés', 300, 1, NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- == Autres achats et charges externes ==
INSERT INTO contract_categories (hotel_id, name, color, account_number, account_class, group_label, sort_order, is_active, created_at)
VALUES
(0, 'Sous-traitance', '#7c3aed', '611000', '6', 'Autres achats et charges externes', 400, 1, NOW()),
(0, 'Sous traitance Nettoyage', '#8b5cf6', '611100', '6', 'Autres achats et charges externes', 410, 1, NOW()),
(0, 'Nettoyage sous traitance des vitres', '#a78bfa', '611200', '6', 'Autres achats et charges externes', 420, 1, NOW()),
(0, 'Blanchissage', '#c4b5fd', '611300', '6', 'Autres achats et charges externes', 430, 1, NOW()),
(0, 'Intérim', '#6d28d9', '621000', '6', 'Autres achats et charges externes', 440, 1, NOW()),
(0, 'RFA', '#5b21b6', '609000', '6', 'Autres achats et charges externes', 450, 1, NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- == Energie ==
INSERT INTO contract_categories (hotel_id, name, color, account_number, account_class, group_label, sort_order, is_active, created_at)
VALUES
(0, 'Eau', '#06b6d4', '606100', '6', 'Energie', 500, 1, NOW()),
(0, 'Gaz', '#0891b2', '606200', '6', 'Energie', 510, 1, NOW()),
(0, 'Electricité', '#0e7490', '606300', '6', 'Energie', 520, 1, NOW()),
(0, 'Energie', '#155e75', '606000', '6', 'Energie', 530, 1, NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- == Locations ==
INSERT INTO contract_categories (hotel_id, name, color, account_number, account_class, group_label, sort_order, is_active, created_at)
VALUES
(0, 'Loyer', '#d946ef', '613100', '6', 'Locations', 600, 1, NOW()),
(0, 'Loyers', '#c026d3', '613000', '6', 'Locations', 610, 1, NOW()),
(0, 'Divers locations', '#a21caf', '613200', '6', 'Locations', 620, 1, NOW()),
(0, 'Collecte des déchets (location)', '#86198f', '613300', '6', 'Locations', 630, 1, NOW()),
(0, 'TPE (location)', '#701a75', '613400', '6', 'Locations', 640, 1, NOW()),
(0, 'Diffusion musical & affichage (location)', '#4a044e', '613500', '6', 'Locations', 650, 1, NOW()),
(0, 'Machines à café (location)', '#d946ef', '613600', '6', 'Locations', 660, 1, NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- == Entretien & Maintenance ==
INSERT INTO contract_categories (hotel_id, name, color, account_number, account_class, group_label, sort_order, is_active, created_at)
VALUES
(0, 'Entretien & Maintenance', '#f59e0b', '615000', '6', 'Entretien & Maintenance', 700, 1, NOW()),
(0, 'Maintenance Plomberie', '#d97706', '615100', '6', 'Entretien & Maintenance', 710, 1, NOW()),
(0, 'Maintenance Electrique', '#b45309', '615200', '6', 'Entretien & Maintenance', 720, 1, NOW()),
(0, 'Maintenance CVC ECS Ventilation', '#92400e', '615300', '6', 'Entretien & Maintenance', 730, 1, NOW()),
(0, 'SSI (maintenance)', '#78350f', '615400', '6', 'Entretien & Maintenance', 740, 1, NOW()),
(0, 'Maintenance & Entretien Cuisine', '#fbbf24', '615500', '6', 'Entretien & Maintenance', 750, 1, NOW()),
(0, 'Portes automatiques (maintenance)', '#fcd34d', '615600', '6', 'Entretien & Maintenance', 760, 1, NOW()),
(0, 'Ascenseurs (maintenance)', '#fde68a', '615700', '6', 'Entretien & Maintenance', 770, 1, NOW()),
(0, 'Machines à café (maintenance)', '#fef3c7', '615800', '6', 'Entretien & Maintenance', 780, 1, NOW()),
(0, 'Informatique & Téléphonie (maintenance)', '#f59e0b', '615900', '6', 'Entretien & Maintenance', 790, 1, NOW()),
(0, 'Entretien exceptionnel', '#eab308', '615010', '6', 'Entretien & Maintenance', 800, 1, NOW()),
(0, 'Entretien Réparation immobilier', '#ca8a04', '615020', '6', 'Entretien & Maintenance', 810, 1, NOW()),
(0, 'Entretien Réparation mobilier', '#a16207', '615030', '6', 'Entretien & Maintenance', 820, 1, NOW()),
(0, 'Entretien Espace Verts', '#854d0e', '615040', '6', 'Entretien & Maintenance', 830, 1, NOW()),
(0, 'Dératisation (Entretien)', '#713f12', '615050', '6', 'Entretien & Maintenance', 840, 1, NOW()),
(0, 'Extincteurs - PCF - Défibrilateur (maintenance)', '#f59e0b', '615060', '6', 'Entretien & Maintenance', 850, 1, NOW()),
(0, 'Alarmes et vidéosurveillance (maintenance)', '#d97706', '615070', '6', 'Entretien & Maintenance', 860, 1, NOW()),
(0, 'Serrure & Coffre fort (maintenance)', '#b45309', '615080', '6', 'Entretien & Maintenance', 870, 1, NOW()),
(0, 'Toitures & Terrasse (maintenance)', '#92400e', '615090', '6', 'Entretien & Maintenance', 880, 1, NOW()),
(0, 'Machine à laver - Sèche linge (maintenance)', '#78350f', '615091', '6', 'Entretien & Maintenance', 890, 1, NOW()),
(0, 'Extérieur (maintenance)', '#fbbf24', '615092', '6', 'Entretien & Maintenance', 895, 1, NOW()),
(0, 'Divers maintenance', '#fcd34d', '615099', '6', 'Entretien & Maintenance', 900, 1, NOW()),
(0, 'Travaux Rénovation', '#ea580c', '615200', '6', 'Entretien & Maintenance', 905, 1, NOW()),
(0, 'Achats matériel équipement', '#c2410c', '606400', '6', 'Entretien & Maintenance', 910, 1, NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- == Fournitures ==
INSERT INTO contract_categories (hotel_id, name, color, account_number, account_class, group_label, sort_order, is_active, created_at)
VALUES
(0, 'Achats vaisselles', '#64748b', '606500', '6', 'Fournitures', 1000, 1, NOW()),
(0, 'Linges (Couettes / oreillers / alèses)', '#475569', '606600', '6', 'Fournitures', 1010, 1, NOW()),
(0, 'Vêtement de travail', '#334155', '606700', '6', 'Fournitures', 1020, 1, NOW()),
(0, 'Fournitures entretien et petits equipements', '#1e293b', '606800', '6', 'Fournitures', 1030, 1, NOW()),
(0, 'Divers fournitures administratives', '#94a3b8', '606900', '6', 'Fournitures', 1040, 1, NOW()),
(0, 'Fourniture de bureau', '#64748b', '606010', '6', 'Fournitures', 1050, 1, NOW()),
(0, 'Affranchissement', '#475569', '626000', '6', 'Fournitures', 1060, 1, NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- == Assurances ==
INSERT INTO contract_categories (hotel_id, name, color, account_number, account_class, group_label, sort_order, is_active, created_at)
VALUES
(0, 'Assurances', '#0ea5e9', '616000', '6', 'Assurances', 1100, 1, NOW()),
(0, 'Assurances hôtel', '#0284c7', '616100', '6', 'Assurances', 1110, 1, NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- == Honoraires ==
INSERT INTO contract_categories (hotel_id, name, color, account_number, account_class, group_label, sort_order, is_active, created_at)
VALUES
(0, 'Honoraires', '#6366f1', '622000', '6', 'Honoraires et frais d\'acte', 1200, 1, NOW()),
(0, 'Divers honoraires', '#4f46e5', '622100', '6', 'Honoraires et frais d\'acte', 1210, 1, NOW()),
(0, 'Comptabilité - social - juridique', '#4338ca', '622200', '6', 'Honoraires et frais d\'acte', 1220, 1, NOW()),
(0, 'Formation (Honoraires et frais d\'acte)', '#3730a3', '622300', '6', 'Honoraires et frais d\'acte', 1230, 1, NOW()),
(0, 'Exploitation hôtel (Honoraires et frais d\'actes)', '#312e81', '622400', '6', 'Honoraires et frais d\'acte', 1240, 1, NOW()),
(0, 'Honoraires de gestion', '#818cf8', '622500', '6', 'Honoraires et frais d\'acte', 1250, 1, NOW()),
(0, 'Etudes', '#a5b4fc', '622600', '6', 'Honoraires et frais d\'acte', 1260, 1, NOW()),
(0, 'Medecine de travail', '#c7d2fe', '622700', '6', 'Honoraires et frais d\'acte', 1270, 1, NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- == Publicité & Communication ==
INSERT INTO contract_categories (hotel_id, name, color, account_number, account_class, group_label, sort_order, is_active, created_at)
VALUES
(0, 'Publicités', '#ec4899', '623000', '6', 'Publicité & Communication', 1300, 1, NOW()),
(0, 'Cotisations (Publicité - Communication)', '#db2777', '623100', '6', 'Publicité & Communication', 1310, 1, NOW()),
(0, 'Divers publicité - communication', '#be185d', '623200', '6', 'Publicité & Communication', 1320, 1, NOW()),
(0, 'Dons', '#9d174d', '623300', '6', 'Publicité & Communication', 1330, 1, NOW()),
(0, 'Cadeaux clients', '#831843', '623400', '6', 'Publicité & Communication', 1340, 1, NOW()),
(0, 'Sponsoring', '#f472b6', '623500', '6', 'Publicité & Communication', 1350, 1, NOW()),
(0, 'Missions réceptions', '#f9a8d4', '623600', '6', 'Publicité & Communication', 1360, 1, NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- == Transports & Déplacements ==
INSERT INTO contract_categories (hotel_id, name, color, account_number, account_class, group_label, sort_order, is_active, created_at)
VALUES
(0, 'Déplacements', '#0d9488', '625000', '6', 'Transports & Déplacements', 1400, 1, NOW()),
(0, 'Transports', '#0f766e', '625100', '6', 'Transports & Déplacements', 1410, 1, NOW()),
(0, 'Frais déplacement voiture', '#115e59', '625200', '6', 'Transports & Déplacements', 1420, 1, NOW()),
(0, 'Frais déplacement Train', '#134e4a', '625300', '6', 'Transports & Déplacements', 1430, 1, NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- == Télécom & Audiovisuel ==
INSERT INTO contract_categories (hotel_id, name, color, account_number, account_class, group_label, sort_order, is_active, created_at)
VALUES
(0, 'Téléphone', '#8b5cf6', '626100', '6', 'Télécom & Audiovisuel', 1500, 1, NOW()),
(0, 'Communications', '#7c3aed', '626200', '6', 'Télécom & Audiovisuel', 1510, 1, NOW()),
(0, 'SACEM / SPRE', '#6d28d9', '626300', '6', 'Télécom & Audiovisuel', 1520, 1, NOW()),
(0, 'Redevance TV', '#5b21b6', '626400', '6', 'Télécom & Audiovisuel', 1530, 1, NOW()),
(0, 'Location et Abonnement (Audio visuel)', '#4c1d95', '626500', '6', 'Télécom & Audiovisuel', 1540, 1, NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- == Services bancaires & Commissions ==
INSERT INTO contract_categories (hotel_id, name, color, account_number, account_class, group_label, sort_order, is_active, created_at)
VALUES
(0, 'Frais bancaires', '#ef4444', '627000', '6', 'Services bancaires & Commissions', 1600, 1, NOW()),
(0, 'Services bancaires', '#dc2626', '627100', '6', 'Services bancaires & Commissions', 1610, 1, NOW()),
(0, 'Commission CB', '#b91c1c', '627200', '6', 'Services bancaires & Commissions', 1620, 1, NOW()),
(0, 'Commission OTA', '#991b1b', '627300', '6', 'Services bancaires & Commissions', 1630, 1, NOW()),
(0, 'Redevance franchiseur', '#7f1d1d', '627400', '6', 'Services bancaires & Commissions', 1640, 1, NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- == Logiciels & Services ==
INSERT INTO contract_categories (hotel_id, name, color, account_number, account_class, group_label, sort_order, is_active, created_at)
VALUES
(0, 'PMS Logiciel d\'exploitation', '#2563eb', '628100', '6', 'Logiciels & Services', 1700, 1, NOW()),
(0, 'Light House', '#1d4ed8', '628200', '6', 'Logiciels & Services', 1710, 1, NOW()),
(0, 'Trust You', '#1e40af', '628300', '6', 'Logiciels & Services', 1720, 1, NOW()),
(0, 'Equalog', '#1e3a8a', '628400', '6', 'Logiciels & Services', 1730, 1, NOW()),
(0, 'Qotid', '#3b82f6', '628500', '6', 'Logiciels & Services', 1740, 1, NOW()),
(0, 'Onyx', '#60a5fa', '628600', '6', 'Logiciels & Services', 1750, 1, NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- == Contrôles & Bureaux ==
INSERT INTO contract_categories (hotel_id, name, color, account_number, account_class, group_label, sort_order, is_active, created_at)
VALUES
(0, 'Bureaux de contrôle SSI', '#84cc16', '628700', '6', 'Contrôles & Bureaux', 1800, 1, NOW()),
(0, 'Bureaux de contrôle électrique', '#65a30d', '628800', '6', 'Contrôles & Bureaux', 1810, 1, NOW()),
(0, 'Merieux', '#4d7c0f', '628900', '6', 'Contrôles & Bureaux', 1820, 1, NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- == Impôts & Taxes ==
INSERT INTO contract_categories (hotel_id, name, color, account_number, account_class, group_label, sort_order, is_active, created_at)
VALUES
(0, 'Taxes de séjour', '#f43f5e', '635100', '6', 'Impôts & Taxes', 1900, 1, NOW()),
(0, 'Taxe foncière', '#e11d48', '635200', '6', 'Impôts & Taxes', 1910, 1, NOW()),
(0, 'CFE - CVAE', '#be123c', '635300', '6', 'Impôts & Taxes', 1920, 1, NOW()),
(0, 'Taxes diverses', '#9f1239', '635000', '6', 'Impôts & Taxes', 1930, 1, NOW()),
(0, 'Impôts et taxes', '#881337', '635900', '6', 'Impôts & Taxes', 1940, 1, NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- == Charges diverses ==
INSERT INTO contract_categories (hotel_id, name, color, account_number, account_class, group_label, sort_order, is_active, created_at)
VALUES
(0, 'Autres charges d\'exploitation', '#78716c', '651000', '6', 'Charges diverses', 2000, 1, NOW()),
(0, 'Autres charges externes', '#57534e', '658000', '6', 'Charges diverses', 2010, 1, NOW()),
(0, 'Remboursement Clients', '#44403c', '658100', '6', 'Charges diverses', 2020, 1, NOW()),
(0, 'Fournisseur', '#292524', '401000', '6', 'Charges diverses', 2030, 1, NOW()),
(0, 'Débiteurs douteux', '#a8a29e', '654000', '6', 'Charges diverses', 2040, 1, NOW()),
(0, 'Pertes sur créances irrecouvrables', '#d6d3d1', '654100', '6', 'Charges diverses', 2050, 1, NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- == Charges financières ==
INSERT INTO contract_categories (hotel_id, name, color, account_number, account_class, group_label, sort_order, is_active, created_at)
VALUES
(0, 'Charges financières', '#f97316', '661000', '6', 'Charges financières', 2100, 1, NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- == Charges exceptionnelles ==
INSERT INTO contract_categories (hotel_id, name, color, account_number, account_class, group_label, sort_order, is_active, created_at)
VALUES
(0, 'Perte / Créances (Charges Exceptionnelles)', '#dc2626', '671000', '6', 'Charges exceptionnelles', 2200, 1, NOW()),
(0, 'Charges / ex ant (Charges Exceptionnelles)', '#ef4444', '672000', '6', 'Charges exceptionnelles', 2210, 1, NOW()),
(0, 'Pénalités Amendes (Charges Exceptionnelles)', '#f87171', '673000', '6', 'Charges exceptionnelles', 2220, 1, NOW()),
(0, 'Charges diverses (Charges Exceptionnelles)', '#fca5a5', '678000', '6', 'Charges exceptionnelles', 2230, 1, NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- == Amortissements ==
INSERT INTO contract_categories (hotel_id, name, color, account_number, account_class, group_label, sort_order, is_active, created_at)
VALUES
(0, 'Amortissement', '#6b7280', '681000', '6', 'Amortissements', 2300, 1, NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- 8. Auto-générer email import pour hôtels existants
INSERT IGNORE INTO hotel_import_email_config (hotel_id, email_address, is_active, created_at)
SELECT id, CONCAT('import-', booking_slug, '@acl-gestion.com'), 1, NOW()
FROM hotels
WHERE booking_slug IS NOT NULL
  AND id NOT IN (SELECT hotel_id FROM hotel_import_email_config);

-- 9. Permissions
INSERT INTO role_permissions (role, permission, allowed, updated_at) VALUES
('admin', 'accounting.view', 1, NOW()),
('admin', 'accounting.import', 1, NOW()),
('admin', 'accounting.manage', 1, NOW()),
('admin', 'accounting.delete', 1, NOW()),
('groupe_manager', 'accounting.view', 1, NOW()),
('groupe_manager', 'accounting.import', 1, NOW()),
('groupe_manager', 'accounting.manage', 1, NOW()),
('groupe_manager', 'accounting.delete', 1, NOW()),
('hotel_manager', 'accounting.view', 1, NOW()),
('hotel_manager', 'accounting.import', 1, NOW()),
('hotel_manager', 'accounting.manage', 0, NOW()),
('hotel_manager', 'accounting.delete', 0, NOW()),
('comptabilite', 'accounting.view', 1, NOW()),
('comptabilite', 'accounting.import', 1, NOW()),
('comptabilite', 'accounting.manage', 0, NOW()),
('comptabilite', 'accounting.delete', 0, NOW())
ON DUPLICATE KEY UPDATE allowed = VALUES(allowed);
