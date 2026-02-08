-- =============================================
-- Migration: Ajout PMS (Geho) + Stripe par hôtel
-- =============================================

-- Colonnes PMS sur la table hotels
ALTER TABLE hotels ADD COLUMN pms_type VARCHAR(50) DEFAULT NULL COMMENT 'Type de PMS: geho, opera, mews, etc.';
ALTER TABLE hotels ADD COLUMN pms_ip VARCHAR(255) DEFAULT NULL COMMENT 'Adresse IP du serveur PMS';
ALTER TABLE hotels ADD COLUMN pms_port INT UNSIGNED DEFAULT NULL COMMENT 'Port de communication PMS';
ALTER TABLE hotels ADD COLUMN pms_api_key VARCHAR(255) DEFAULT NULL COMMENT 'Clé API du PMS (si applicable)';
ALTER TABLE hotels ADD COLUMN pms_username VARCHAR(255) DEFAULT NULL COMMENT 'Login PMS (si applicable)';
ALTER TABLE hotels ADD COLUMN pms_password VARCHAR(255) DEFAULT NULL COMMENT 'Password PMS (si applicable)';

-- Colonnes Stripe par hôtel
ALTER TABLE hotels ADD COLUMN stripe_public_key VARCHAR(255) DEFAULT NULL COMMENT 'Clé publique Stripe (pk_live_xxx)';
ALTER TABLE hotels ADD COLUMN stripe_secret_key VARCHAR(255) DEFAULT NULL COMMENT 'Clé secrète Stripe (sk_live_xxx)';
ALTER TABLE hotels ADD COLUMN stripe_webhook_secret VARCHAR(255) DEFAULT NULL COMMENT 'Secret webhook Stripe (whsec_xxx)';

-- Colonne pour activer/désactiver la réservation en ligne
ALTER TABLE hotels ADD COLUMN booking_enabled TINYINT(1) DEFAULT 0 COMMENT 'Réservation en ligne activée';
ALTER TABLE hotels ADD COLUMN booking_slug VARCHAR(100) DEFAULT NULL COMMENT 'Slug URL unique pour la page de réservation';

-- Table des réservations (via page publique)
CREATE TABLE IF NOT EXISTS pms_bookings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    booking_ref VARCHAR(50) NOT NULL COMMENT 'Référence unique de réservation',
    pms_booking_id VARCHAR(100) DEFAULT NULL COMMENT 'ID retourné par le PMS',

    -- Client
    guest_first_name VARCHAR(100) NOT NULL,
    guest_last_name VARCHAR(100) NOT NULL,
    guest_email VARCHAR(255) NOT NULL,
    guest_phone VARCHAR(50),

    -- Séjour
    checkin_date DATE NOT NULL,
    checkout_date DATE NOT NULL,
    room_type VARCHAR(100),
    guests_count TINYINT UNSIGNED DEFAULT 1,
    special_requests TEXT,

    -- Tarification
    total_amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',

    -- Paiement Stripe
    stripe_payment_intent_id VARCHAR(255) DEFAULT NULL,
    stripe_charge_id VARCHAR(255) DEFAULT NULL,
    payment_status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',

    -- Statut
    status ENUM('pending', 'confirmed', 'cancelled', 'checked_in', 'checked_out', 'no_show') DEFAULT 'pending',
    pms_synced TINYINT(1) DEFAULT 0 COMMENT 'Synchronisé avec le PMS',
    pms_sync_error TEXT DEFAULT NULL,

    created_at DATETIME,
    updated_at DATETIME,

    INDEX idx_hotel (hotel_id),
    INDEX idx_ref (booking_ref),
    INDEX idx_dates (checkin_date, checkout_date),
    INDEX idx_status (status),
    INDEX idx_payment (payment_status),
    FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Index unique pour le slug de réservation
ALTER TABLE hotels ADD UNIQUE INDEX idx_booking_slug (booking_slug);

-- =============================================
-- Migration: Colonnes supplémentaires pms_bookings (GeHo)
-- =============================================
ALTER TABLE pms_bookings ADD COLUMN civilite VARCHAR(10) DEFAULT 'M.' COMMENT 'Civilité: M., Mme, etc.';
ALTER TABLE pms_bookings ADD COLUMN address1 VARCHAR(255) DEFAULT NULL COMMENT 'Adresse ligne 1';
ALTER TABLE pms_bookings ADD COLUMN address2 VARCHAR(255) DEFAULT NULL COMMENT 'Adresse ligne 2';
ALTER TABLE pms_bookings ADD COLUMN city VARCHAR(100) DEFAULT NULL COMMENT 'Ville';
ALTER TABLE pms_bookings ADD COLUMN postal_code VARCHAR(20) DEFAULT NULL COMMENT 'Code postal';
ALTER TABLE pms_bookings ADD COLUMN nb_adult TINYINT UNSIGNED DEFAULT 1 COMMENT 'Nombre adultes';
ALTER TABLE pms_bookings ADD COLUMN nb_child TINYINT UNSIGNED DEFAULT 0 COMMENT 'Nombre enfants';
ALTER TABLE pms_bookings ADD COLUMN extras_amount DECIMAL(10,2) DEFAULT 0 COMMENT 'Montant extras/produits';
ALTER TABLE pms_bookings ADD COLUMN extras_json TEXT DEFAULT NULL COMMENT 'Détail extras sélectionnés (JSON)';

-- =============================================
-- Migration: Catégorie hôtel + Config congés par hôtel
-- =============================================

-- Catégorie d'hôtel
ALTER TABLE hotels ADD COLUMN category VARCHAR(50) DEFAULT NULL COMMENT 'Catégorie: urban, resort, business, boutique, budget, luxury, apart, residence';

-- Table de configuration des congés par hôtel
CREATE TABLE IF NOT EXISTS hotel_leave_config (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    leave_min_delay INT UNSIGNED DEFAULT 2 COMMENT 'Délai minimum en mois pour poser un CP',
    default_annual_days INT UNSIGNED DEFAULT 25 COMMENT 'Solde annuel de CP par défaut',
    t1_deadline VARCHAR(5) DEFAULT '11-01' COMMENT 'Date limite dépôt T1 (MM-DD)',
    t2_deadline VARCHAR(5) DEFAULT '02-01' COMMENT 'Date limite dépôt T2 (MM-DD)',
    t3_deadline VARCHAR(5) DEFAULT '05-01' COMMENT 'Date limite dépôt T3 (MM-DD)',
    t4_deadline VARCHAR(5) DEFAULT '08-01' COMMENT 'Date limite dépôt T4 (MM-DD)',
    created_at DATETIME,
    updated_at DATETIME,
    UNIQUE KEY unique_hotel (hotel_id),
    FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
