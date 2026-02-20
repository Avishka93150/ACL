-- Migration: Welcome/Livret d'accueil v3 - Sections dynamiques (page builder)
-- Date: 2026-02-20

-- Table des sections dynamiques du livret d'accueil
-- Chaque section est un bloc independant avec son type, contenu, config et position
CREATE TABLE IF NOT EXISTS hotel_welcome_sections (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    type VARCHAR(30) NOT NULL COMMENT 'banner, header, text, image, gallery, services, infos, contact, schedule, wifi, social, separator, map, spacer',
    title VARCHAR(255) DEFAULT NULL,
    content TEXT DEFAULT NULL,
    config TEXT DEFAULT NULL COMMENT 'JSON type-specific config',
    image_path VARCHAR(255) DEFAULT NULL,
    is_visible TINYINT(1) DEFAULT 1,
    display_order INT DEFAULT 0,
    created_at DATETIME,
    updated_at DATETIME,
    INDEX idx_hotel_order (hotel_id, display_order),
    INDEX idx_hotel_type (hotel_id, type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
