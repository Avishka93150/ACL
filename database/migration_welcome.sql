-- ============================================================
-- Migration: Livret d'accueil numerique
-- Date: 2026-02-16
-- Description:
--   - Table config principale du livret par hotel
--   - Table onglets personnalisables
--   - Table elements de contenu par onglet
--   - Table infos pratiques
--   - Permissions pour le module welcome
-- ============================================================

-- 1. Config globale du livret par hotel
-- --------------------------------------
CREATE TABLE IF NOT EXISTS hotel_welcome_config (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    slug VARCHAR(100) NOT NULL COMMENT 'Slug URL unique pour acces public',
    is_published TINYINT(1) DEFAULT 0 COMMENT 'Livret publie ou brouillon',
    -- Design
    primary_color VARCHAR(7) DEFAULT '#1a56db' COMMENT 'Couleur principale',
    secondary_color VARCHAR(7) DEFAULT '#f3f4f6' COMMENT 'Couleur secondaire',
    font_family VARCHAR(100) DEFAULT 'Inter' COMMENT 'Police de caracteres',
    logo_path VARCHAR(255) DEFAULT NULL COMMENT 'Chemin logo hotel',
    banner_path VARCHAR(255) DEFAULT NULL COMMENT 'Chemin banniere hotel',
    -- Contenu accueil
    welcome_title VARCHAR(255) DEFAULT NULL COMMENT 'Titre de bienvenue',
    welcome_text TEXT DEFAULT NULL COMMENT 'Texte d''accueil',
    -- Contact
    phone VARCHAR(50) DEFAULT NULL,
    email VARCHAR(255) DEFAULT NULL,
    address TEXT DEFAULT NULL,
    google_maps_url VARCHAR(500) DEFAULT NULL,
    -- Reseaux sociaux
    facebook_url VARCHAR(500) DEFAULT NULL,
    instagram_url VARCHAR(500) DEFAULT NULL,
    website_url VARCHAR(500) DEFAULT NULL,
    -- Infos pratiques globales
    wifi_name VARCHAR(100) DEFAULT NULL,
    wifi_password VARCHAR(100) DEFAULT NULL,
    checkin_time TIME DEFAULT '15:00:00' COMMENT 'Heure check-in',
    checkout_time TIME DEFAULT '11:00:00' COMMENT 'Heure check-out',
    created_at DATETIME,
    updated_at DATETIME,
    UNIQUE KEY unique_hotel (hotel_id),
    UNIQUE KEY unique_slug (slug),
    INDEX idx_published (is_published),
    FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Onglets personnalisables du livret
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS hotel_welcome_tabs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    name VARCHAR(255) NOT NULL COMMENT 'Nom de l''onglet (Restaurant, Spa, Activites...)',
    icon VARCHAR(50) DEFAULT 'concierge-bell' COMMENT 'Icone FontAwesome sans prefixe fa-',
    description TEXT DEFAULT NULL COMMENT 'Texte d''introduction de l''onglet',
    banner_path VARCHAR(255) DEFAULT NULL COMMENT 'Image header de l''onglet',
    sort_order INT DEFAULT 0 COMMENT 'Ordre d''affichage',
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME,
    updated_at DATETIME,
    INDEX idx_hotel (hotel_id),
    INDEX idx_order (hotel_id, sort_order),
    FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Elements de contenu dans chaque onglet
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS hotel_welcome_items (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tab_id INT UNSIGNED NOT NULL,
    hotel_id INT UNSIGNED NOT NULL,
    title VARCHAR(255) NOT NULL COMMENT 'Titre de l''element',
    description TEXT DEFAULT NULL COMMENT 'Description detaillee',
    photo_path VARCHAR(255) DEFAULT NULL COMMENT 'Photo illustrative',
    price VARCHAR(100) DEFAULT NULL COMMENT 'Prix optionnel (texte libre: 15EUR, Gratuit)',
    schedule VARCHAR(255) DEFAULT NULL COMMENT 'Horaires optionnels (7h-10h30)',
    external_link VARCHAR(500) DEFAULT NULL COMMENT 'Lien externe optionnel',
    sort_order INT DEFAULT 0 COMMENT 'Ordre d''affichage',
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME,
    updated_at DATETIME,
    INDEX idx_tab (tab_id),
    INDEX idx_hotel (hotel_id),
    INDEX idx_order (tab_id, sort_order),
    FOREIGN KEY (tab_id) REFERENCES hotel_welcome_tabs(id) ON DELETE CASCADE,
    FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Infos pratiques (liste flexible)
-- --------------------------------------
CREATE TABLE IF NOT EXISTS hotel_welcome_infos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    info_type ENUM('wifi','parking','transport','emergency','rules','other') DEFAULT 'other' COMMENT 'Type d''info',
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL COMMENT 'Contenu de l''info',
    icon VARCHAR(50) DEFAULT 'info-circle' COMMENT 'Icone FontAwesome',
    sort_order INT DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME,
    INDEX idx_hotel (hotel_id),
    INDEX idx_order (hotel_id, sort_order),
    FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Permissions pour le module livret d'accueil
-- ------------------------------------------------
INSERT INTO role_permissions (role, permission, allowed, updated_at) VALUES
('admin', 'welcome.manage', 1, NOW()),
('admin', 'welcome.view', 1, NOW()),
('groupe_manager', 'welcome.manage', 1, NOW()),
('groupe_manager', 'welcome.view', 1, NOW()),
('hotel_manager', 'welcome.manage', 1, NOW()),
('hotel_manager', 'welcome.view', 1, NOW()),
('receptionniste', 'welcome.view', 1, NOW()),
('receptionniste', 'welcome.manage', 0, NOW()),
('comptabilite', 'welcome.view', 0, NOW()),
('comptabilite', 'welcome.manage', 0, NOW()),
('rh', 'welcome.view', 0, NOW()),
('rh', 'welcome.manage', 0, NOW()),
('employee', 'welcome.view', 0, NOW()),
('employee', 'welcome.manage', 0, NOW())
ON DUPLICATE KEY UPDATE allowed = VALUES(allowed), updated_at = NOW();
