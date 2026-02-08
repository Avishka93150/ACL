-- =============================================
-- Migration: Relay PMS pour connexion distante
-- Permet la communication VPS <-> PC local via agent relais
-- =============================================

-- Table de file d'attente pour les requêtes PMS relayées
CREATE TABLE IF NOT EXISTS pms_relay_queue (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    request_id VARCHAR(64) NOT NULL UNIQUE COMMENT 'UUID unique pour corréler requête/réponse',
    endpoint VARCHAR(255) NOT NULL COMMENT 'Endpoint PMS ex: /AvailRooms/',
    method VARCHAR(10) DEFAULT 'GET',
    request_body TEXT DEFAULT NULL COMMENT 'Body JSON de la requête',
    response_body TEXT DEFAULT NULL COMMENT 'Body JSON de la réponse',
    response_status INT DEFAULT NULL COMMENT 'HTTP status code de la réponse PMS',
    status ENUM('pending', 'processing', 'completed', 'error', 'timeout') DEFAULT 'pending',
    error_message VARCHAR(500) DEFAULT NULL,
    created_at DATETIME NOT NULL,
    picked_at DATETIME DEFAULT NULL COMMENT 'Quand l agent a pris la requête',
    completed_at DATETIME DEFAULT NULL,
    INDEX idx_hotel_status (hotel_id, status),
    INDEX idx_request_id (request_id),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Token d'authentification pour l'agent relais (un par hôtel)
ALTER TABLE hotels ADD COLUMN pms_relay_token VARCHAR(128) DEFAULT NULL COMMENT 'Token auth pour l agent relais PMS';
ALTER TABLE hotels ADD COLUMN pms_connection_mode ENUM('direct', 'relay') DEFAULT 'direct' COMMENT 'Mode de connexion PMS: direct (curl) ou relay (agent)';

-- Nettoyage automatique des vieilles entrées (à configurer en cron)
-- DELETE FROM pms_relay_queue WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR);
