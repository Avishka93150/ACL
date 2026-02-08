-- Migration: Configuration des alertes maintenance par hôtel
-- Date: 2026-02-08

CREATE TABLE IF NOT EXISTS hotel_maintenance_config (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    notify_on_comment TINYINT(1) DEFAULT 1,
    notify_on_status_change TINYINT(1) DEFAULT 1,
    notify_on_resolution TINYINT(1) DEFAULT 1,
    notify_commenters TINYINT(1) DEFAULT 1,
    notify_hotel_manager TINYINT(1) DEFAULT 1,
    notify_groupe_manager TINYINT(1) DEFAULT 1,
    notify_admin TINYINT(1) DEFAULT 1,
    created_at DATETIME,
    updated_at DATETIME,
    UNIQUE KEY uk_hotel (hotel_id),
    INDEX idx_hotel (hotel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
