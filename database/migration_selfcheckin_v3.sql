-- ============================================================
-- Migration: Self Check-in V3 - Capacité chambres, services complémentaires, RGPD
-- Date: 2026-02-11
-- Description:
--   - Ajout capacité max adultes par chambre
--   - Ajout catégories triple et quadruple
--   - Table services complémentaires pour self check-in
--   - Table services commandés par réservation
-- ============================================================

-- 1. Ajout de la colonne max_adults sur la table rooms
-- ----------------------------------------------------
ALTER TABLE rooms ADD COLUMN max_adults TINYINT UNSIGNED DEFAULT 2 COMMENT 'Nombre maximum d''adultes dans la chambre';

-- 2. Modifier l'ENUM room_type pour ajouter triple et quadruple
-- ---------------------------------------------------------------
ALTER TABLE rooms MODIFY COLUMN room_type ENUM('standard','superieure','suite','familiale','pmr','triple','quadruple') DEFAULT 'standard';

-- 3. Table des services complémentaires configurables par hôtel
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hotel_selfcheckin_services (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    name VARCHAR(255) NOT NULL COMMENT 'Nom du service (ex: Kit de bienvenue, Parking, Late checkout...)',
    description TEXT DEFAULT NULL COMMENT 'Description du service',
    price DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'Prix unitaire du service',
    icon VARCHAR(50) DEFAULT 'concierge-bell' COMMENT 'Icône FontAwesome (sans le préfixe fa-)',
    is_active TINYINT(1) DEFAULT 1 COMMENT 'Service actif ou non',
    sort_order INT DEFAULT 0 COMMENT 'Ordre d''affichage',
    created_at DATETIME,
    updated_at DATETIME,
    INDEX idx_hotel (hotel_id),
    INDEX idx_active (is_active),
    FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Table des services commandés par réservation
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS selfcheckin_reservation_services (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    reservation_id INT UNSIGNED NOT NULL,
    service_id INT UNSIGNED NOT NULL,
    service_name VARCHAR(255) NOT NULL COMMENT 'Nom du service au moment de la commande',
    service_price DECIMAL(10,2) NOT NULL COMMENT 'Prix au moment de la commande',
    quantity TINYINT UNSIGNED DEFAULT 1,
    created_at DATETIME,
    INDEX idx_reservation (reservation_id),
    FOREIGN KEY (reservation_id) REFERENCES selfcheckin_reservations(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES hotel_selfcheckin_services(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Mettre à jour les capacités par défaut selon le type de chambre existant
-- ---------------------------------------------------------------------------
UPDATE rooms SET max_adults = 1 WHERE room_type = 'standard' AND bed_type = 'single';
UPDATE rooms SET max_adults = 2 WHERE room_type IN ('standard', 'superieure') AND bed_type != 'single';
UPDATE rooms SET max_adults = 2 WHERE room_type = 'suite';
UPDATE rooms SET max_adults = 4 WHERE room_type = 'familiale';
UPDATE rooms SET max_adults = 1 WHERE room_type = 'pmr' AND bed_type = 'single';
UPDATE rooms SET max_adults = 2 WHERE room_type = 'pmr' AND bed_type != 'single';
UPDATE rooms SET max_adults = 3 WHERE room_type = 'triple';
UPDATE rooms SET max_adults = 4 WHERE room_type = 'quadruple';
