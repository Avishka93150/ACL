-- Migration: Revenue Events (Événements calendrier)
-- Permet d'ajouter des événements spéciaux sur le calendrier Revenue Management

-- Supprimer l'ancienne table si elle existe (pour corriger les erreurs de TIMESTAMP)
DROP TABLE IF EXISTS revenue_events;

CREATE TABLE revenue_events (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    event_date DATE NOT NULL,
    event_name VARCHAR(100) NOT NULL,
    event_type ENUM('festival', 'conference', 'sport', 'holiday', 'local', 'other') DEFAULT 'other',
    event_color VARCHAR(7) DEFAULT '#F59E0B',
    description TEXT DEFAULT NULL,
    impact_level ENUM('low', 'medium', 'high') DEFAULT 'medium',
    created_by INT UNSIGNED NOT NULL,
    created_at DATETIME DEFAULT NULL,
    updated_at DATETIME DEFAULT NULL,
    FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_hotel_date_event (hotel_id, event_date, event_name),
    INDEX idx_hotel_date (hotel_id, event_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Exemples d'événements types
-- INSERT INTO revenue_events (hotel_id, event_date, event_name, event_type, impact_level, created_by, created_at) VALUES
-- (1, '2026-02-14', 'Saint-Valentin', 'holiday', 'high', 1, NOW()),
-- (1, '2026-06-21', 'Fête de la Musique', 'festival', 'medium', 1, NOW());
