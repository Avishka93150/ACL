-- Migration: Modules par hôtel
-- Permet à l'administrateur d'activer/désactiver des modules par hôtel

CREATE TABLE IF NOT EXISTS hotel_modules (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    module_key VARCHAR(50) NOT NULL,
    enabled TINYINT(1) DEFAULT 1,
    updated_at DATETIME,
    UNIQUE KEY uk_hotel_module (hotel_id, module_key),
    INDEX idx_hotel (hotel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
