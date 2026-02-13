-- Migration : Liens de paiement Stripe (Self Check-in)
-- Date : 2026-02-13

CREATE TABLE IF NOT EXISTS payment_links (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT UNSIGNED NOT NULL,
    guest_first_name VARCHAR(100) NOT NULL,
    guest_last_name VARCHAR(100) NOT NULL,
    guest_email VARCHAR(255) NOT NULL,
    reservation_reference VARCHAR(100) NOT NULL,
    checkin_date DATE NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'eur',
    stripe_checkout_session_id VARCHAR(255) DEFAULT NULL,
    stripe_payment_url VARCHAR(500) DEFAULT NULL,
    stripe_payment_intent_id VARCHAR(255) DEFAULT NULL,
    payment_status ENUM('pending', 'paid', 'expired', 'cancelled') DEFAULT 'pending',
    paid_at DATETIME DEFAULT NULL,
    email_sent_at DATETIME DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    created_by INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME DEFAULT NULL,
    INDEX idx_hotel (hotel_id),
    INDEX idx_status (payment_status),
    INDEX idx_email (guest_email),
    INDEX idx_reference (reservation_reference),
    INDEX idx_stripe_session (stripe_checkout_session_id),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
