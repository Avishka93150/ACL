-- ============================================================
-- Migration: Self Check-in System
-- Date: 2026-02-11
-- Description: Remplacement du système PMS/Geho par un système
--   de self check-in avec casiers pour les hôtels.
-- ============================================================

-- 1. Nouvelles colonnes sur la table hotels
-- ------------------------------------------
ALTER TABLE hotels ADD COLUMN selfcheckin_enabled TINYINT(1) DEFAULT 0 COMMENT 'Active le self check-in pour cet hôtel';
ALTER TABLE hotels ADD COLUMN walkin_enabled TINYINT(1) DEFAULT 0 COMMENT 'Autorise les réservations walk-in (sans réservation)';
ALTER TABLE hotels ADD COLUMN default_night_price DECIMAL(10,2) DEFAULT 0 COMMENT 'Prix par nuit par défaut';
ALTER TABLE hotels ADD COLUMN default_breakfast_price DECIMAL(10,2) DEFAULT 0 COMMENT 'Prix petit-déjeuner par défaut';
ALTER TABLE hotels ADD COLUMN default_tourist_tax DECIMAL(10,2) DEFAULT 0 COMMENT 'Taxe de séjour par défaut par personne/nuit';
ALTER TABLE hotels ADD COLUMN breakfast_start TIME DEFAULT '07:00:00' COMMENT 'Heure début petit-déjeuner';
ALTER TABLE hotels ADD COLUMN breakfast_end TIME DEFAULT '10:30:00' COMMENT 'Heure fin petit-déjeuner';
ALTER TABLE hotels ADD COLUMN night_cutoff_hour TINYINT UNSIGNED DEFAULT 7 COMMENT 'Heure limite pour considérer la nuit précédente (0-12)';

-- 2. Table des casiers
-- --------------------
CREATE TABLE IF NOT EXISTS hotel_lockers (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    locker_number VARCHAR(20) NOT NULL COMMENT 'Numéro du casier (permanent)',
    locker_code VARCHAR(50) NOT NULL COMMENT 'Code d''accès actuel (modifiable quotidiennement)',
    status ENUM('available','assigned','maintenance') DEFAULT 'available',
    notes TEXT DEFAULT NULL,
    created_at DATETIME,
    updated_at DATETIME,
    UNIQUE KEY unique_locker (hotel_id, locker_number),
    INDEX idx_hotel (hotel_id),
    INDEX idx_status (status),
    FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Table des horaires petit-déjeuner par jour de la semaine
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hotel_breakfast_schedules (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    day_of_week TINYINT UNSIGNED NOT NULL COMMENT '0=Dimanche, 1=Lundi, ..., 6=Samedi',
    breakfast_start TIME NOT NULL DEFAULT '07:00:00',
    breakfast_end TIME NOT NULL DEFAULT '10:30:00',
    enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Petit-déjeuner servi ce jour',
    UNIQUE KEY unique_hotel_day (hotel_id, day_of_week),
    INDEX idx_hotel (hotel_id),
    FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Table des tarifs journaliers
-- --------------------------------
CREATE TABLE IF NOT EXISTS selfcheckin_pricing (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    night_price DECIMAL(10,2) NOT NULL COMMENT 'Prix de la nuit',
    breakfast_price DECIMAL(10,2) DEFAULT 0 COMMENT 'Prix petit-déjeuner par personne',
    tourist_tax DECIMAL(10,2) DEFAULT 0 COMMENT 'Taxe de séjour par personne/nuit',
    breakfast_start TIME DEFAULT '07:00:00',
    breakfast_end TIME DEFAULT '10:30:00',
    notes VARCHAR(255) DEFAULT NULL COMMENT 'Notes (événement, haute saison, etc.)',
    created_at DATETIME,
    updated_at DATETIME,
    UNIQUE KEY unique_pricing (hotel_id, date),
    INDEX idx_hotel_date (hotel_id, date),
    FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Table des réservations self check-in
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS selfcheckin_reservations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    reservation_number VARCHAR(50) NOT NULL COMMENT 'Numéro de réservation unique',
    type ENUM('pre_booked','walkin') NOT NULL DEFAULT 'pre_booked',

    -- Infos client
    guest_first_name VARCHAR(100) DEFAULT NULL,
    guest_last_name VARCHAR(100) DEFAULT NULL,
    guest_email VARCHAR(255) DEFAULT NULL,
    guest_phone VARCHAR(50) DEFAULT NULL,
    nb_adults TINYINT UNSIGNED DEFAULT 1,
    nb_children TINYINT UNSIGNED DEFAULT 0,

    -- Séjour
    checkin_date DATE NOT NULL,
    checkout_date DATE DEFAULT NULL,
    room_id INT UNSIGNED DEFAULT NULL,
    room_number VARCHAR(20) DEFAULT NULL,

    -- Casier
    locker_id INT UNSIGNED DEFAULT NULL,
    locker_number VARCHAR(20) DEFAULT NULL,
    locker_code VARCHAR(50) DEFAULT NULL,

    -- Tarification
    accommodation_price DECIMAL(10,2) DEFAULT 0 COMMENT 'Prix hébergement total',
    tourist_tax_amount DECIMAL(10,2) DEFAULT 0 COMMENT 'Montant total taxe de séjour',
    breakfast_price DECIMAL(10,2) DEFAULT 0 COMMENT 'Prix total petit-déjeuner',
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'Prix total TTC',
    deposit_amount DECIMAL(10,2) DEFAULT 0 COMMENT 'Arrhes déjà payées',
    remaining_amount DECIMAL(10,2) DEFAULT 0 COMMENT 'Reste à payer',

    -- Options
    breakfast_included TINYINT(1) DEFAULT 0,

    -- Pièce d''identité (walk-in)
    id_document_path VARCHAR(255) DEFAULT NULL,

    -- Paiement Stripe
    stripe_payment_intent_id VARCHAR(255) DEFAULT NULL,
    stripe_charge_id VARCHAR(255) DEFAULT NULL,
    payment_status ENUM('pending','paid','partial','failed','refunded') DEFAULT 'pending',

    -- Statut
    status ENUM('pending','confirmed','checked_in','checked_out','cancelled','no_show') DEFAULT 'pending',

    -- Reçu PDF
    receipt_pdf_path VARCHAR(255) DEFAULT NULL,

    created_at DATETIME,
    updated_at DATETIME,
    created_by INT UNSIGNED DEFAULT NULL COMMENT 'Utilisateur ayant créé la réservation',

    UNIQUE KEY unique_reservation (hotel_id, reservation_number),
    INDEX idx_hotel (hotel_id),
    INDEX idx_status (status),
    INDEX idx_checkin (checkin_date),
    INDEX idx_guest_name (guest_last_name),
    INDEX idx_payment (payment_status),
    INDEX idx_type (type),
    FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL,
    FOREIGN KEY (locker_id) REFERENCES hotel_lockers(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Permissions pour le module self check-in
-- --------------------------------------------
INSERT INTO role_permissions (role, permission, allowed, updated_at) VALUES
('admin', 'selfcheckin.manage', 1, NOW()),
('groupe_manager', 'selfcheckin.manage', 1, NOW()),
('hotel_manager', 'selfcheckin.manage', 1, NOW()),
('receptionniste', 'selfcheckin.manage', 1, NOW()),
('admin', 'selfcheckin.view', 1, NOW()),
('groupe_manager', 'selfcheckin.view', 1, NOW()),
('hotel_manager', 'selfcheckin.view', 1, NOW()),
('receptionniste', 'selfcheckin.view', 1, NOW()),
('employee', 'selfcheckin.view', 0, NOW())
ON DUPLICATE KEY UPDATE allowed = VALUES(allowed), updated_at = NOW();
