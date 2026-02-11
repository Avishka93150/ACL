-- ============================================================
-- Migration: Self Check-in V2 - Casiers côté hôtel + horaires PDJ par jour
-- Date: 2026-02-11
-- Description:
--   1. Supprimer la liaison casier-chambre (room_id sur hotel_lockers)
--   2. Ajouter table hotel_breakfast_schedules pour horaires PDJ par jour de semaine
--   3. Le code casier reste sur hotel_lockers (code courant, modifiable quotidiennement)
--   4. L'association chambre+casier+code se fait au niveau de la réservation
-- ============================================================

-- 1. Supprimer la clé étrangère et colonne room_id de hotel_lockers
-- -----------------------------------------------------------------
ALTER TABLE hotel_lockers DROP FOREIGN KEY IF EXISTS hotel_lockers_ibfk_2;
ALTER TABLE hotel_lockers DROP INDEX IF EXISTS idx_room;
ALTER TABLE hotel_lockers DROP COLUMN IF EXISTS room_id;

-- 2. Table des horaires petit-déjeuner par jour de la semaine
-- ------------------------------------------------------------
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
