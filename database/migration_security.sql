-- =============================================
-- ACL GESTION - Migration Securite & Fonctionnalites
-- A executer apres le merge de la branche securite
-- =============================================

-- Table rate limiting (tentatives de connexion)
CREATE TABLE IF NOT EXISTS login_attempts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ip_address VARCHAR(45) NOT NULL,
    username VARCHAR(255) DEFAULT NULL,
    attempted_at DATETIME NOT NULL,
    INDEX idx_ip (ip_address),
    INDEX idx_attempted (attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Permissions notifications push
INSERT INTO role_permissions (role, permission, allowed, updated_at) VALUES
('admin', 'notifications.push', 1, NOW()),
('groupe_manager', 'notifications.push', 1, NOW()),
('hotel_manager', 'notifications.push', 1, NOW()),
('comptabilite', 'notifications.push', 1, NOW()),
('rh', 'notifications.push', 1, NOW()),
('receptionniste', 'notifications.push', 1, NOW()),
('employee', 'notifications.push', 1, NOW())
ON DUPLICATE KEY UPDATE allowed = VALUES(allowed);

-- Nettoyage automatique des tentatives expirees (optionnel, via event scheduler)
-- SET GLOBAL event_scheduler = ON;
-- CREATE EVENT IF NOT EXISTS cleanup_login_attempts
-- ON SCHEDULE EVERY 1 HOUR
-- DO DELETE FROM login_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 1 DAY);
