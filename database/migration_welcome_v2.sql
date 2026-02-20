-- Migration: Welcome/Livret d'accueil v2 - Personnalisation avancée
-- Date: 2026-02-20

-- Nouvelles options de personnalisation pour la config
ALTER TABLE hotel_welcome_config
    ADD COLUMN banner_height INT DEFAULT 320,
    ADD COLUMN banner_overlay TINYINT(1) DEFAULT 1,
    ADD COLUMN header_style VARCHAR(20) DEFAULT 'card',
    ADD COLUMN tab_style VARCHAR(20) DEFAULT 'pills',
    ADD COLUMN item_layout VARCHAR(20) DEFAULT 'cards',
    ADD COLUMN title_font VARCHAR(100) DEFAULT NULL,
    ADD COLUMN title_size VARCHAR(10) DEFAULT 'lg',
    ADD COLUMN body_font_size VARCHAR(10) DEFAULT 'md',
    ADD COLUMN section_order TEXT DEFAULT NULL,
    ADD COLUMN show_header TINYINT(1) DEFAULT 1,
    ADD COLUMN show_wifi TINYINT(1) DEFAULT 1,
    ADD COLUMN show_schedule TINYINT(1) DEFAULT 1,
    ADD COLUMN show_welcome TINYINT(1) DEFAULT 1,
    ADD COLUMN show_contact TINYINT(1) DEFAULT 1,
    ADD COLUMN show_social TINYINT(1) DEFAULT 1,
    ADD COLUMN show_infos TINYINT(1) DEFAULT 1,
    ADD COLUMN custom_css TEXT DEFAULT NULL,
    ADD COLUMN welcome_image_path VARCHAR(255) DEFAULT NULL;

-- Layout par onglet
ALTER TABLE hotel_welcome_tabs
    ADD COLUMN layout VARCHAR(20) DEFAULT 'cards';

-- Champs enrichis pour les items
ALTER TABLE hotel_welcome_items
    ADD COLUMN subtitle VARCHAR(255) DEFAULT NULL,
    ADD COLUMN badge_text VARCHAR(100) DEFAULT NULL,
    ADD COLUMN badge_color VARCHAR(7) DEFAULT NULL;
