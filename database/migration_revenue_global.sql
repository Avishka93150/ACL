-- =============================================
-- ACL GESTION - Migration Revenue Global Cache
-- Optimisation: une seule entrée par clé Xotelo + date + OTA
-- Élimine les appels API en doublon quand plusieurs hôtels
-- partagent les mêmes concurrents
-- =============================================

-- Table cache globale des tarifs Xotelo (remplace xotelo_rates_cache)
-- Plus de hotel_id: les tarifs sont stockés par xotelo_hotel_key unique
CREATE TABLE IF NOT EXISTS xotelo_rates_global (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    xotelo_hotel_key VARCHAR(100) NOT NULL,
    hotel_name VARCHAR(255) DEFAULT NULL COMMENT 'Nom de référence (informatif)',
    check_date DATE NOT NULL,
    guests INT DEFAULT 2,
    room_type VARCHAR(100) DEFAULT 'Standard',
    ota_name VARCHAR(100) NOT NULL,
    rate_amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'EUR',
    is_available TINYINT(1) DEFAULT 1,
    raw_data LONGTEXT,
    fetched_at DATETIME NOT NULL,
    INDEX idx_key_date (xotelo_hotel_key, check_date),
    INDEX idx_fetched (fetched_at),
    INDEX idx_currency (currency)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Historique global des tarifs (remplace xotelo_rates_history)
-- Append-only: chaque exécution du cron ajoute de nouvelles lignes
CREATE TABLE IF NOT EXISTS xotelo_rates_history_global (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    xotelo_hotel_key VARCHAR(100) NOT NULL,
    hotel_name VARCHAR(255) DEFAULT NULL,
    check_date DATE NOT NULL,
    ota_name VARCHAR(100) NOT NULL,
    rate_amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'EUR',
    fetched_at DATETIME NOT NULL,
    INDEX idx_key_date (xotelo_hotel_key, check_date),
    INDEX idx_fetched (fetched_at),
    INDEX idx_lookup (xotelo_hotel_key, check_date, ota_name, currency)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================
-- NOTES DE MIGRATION
-- =============================================
-- Les anciennes tables (xotelo_rates_cache, xotelo_rates_history)
-- ne sont PAS supprimées pour permettre un rollback.
-- Le code n'y écrit plus et ne les lit plus.
-- Après validation en production, vous pouvez les supprimer :
--   DROP TABLE IF EXISTS xotelo_rates_cache;
--   DROP TABLE IF EXISTS xotelo_rates_history;
--
-- La table price_alerts et price_alert_logs restent inchangées.
-- Les alertes lisent maintenant depuis les tables globales via JOINs.
-- La table hotel_competitors reste inchangée.
-- La table xotelo_api_logs reste inchangée.
