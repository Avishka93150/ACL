-- Migration: Ajouter la permission hotels.stripe_manage
-- Seuls admin et hotel_manager peuvent modifier les clés API Stripe par défaut

INSERT INTO role_permissions (role, permission, allowed, updated_at) VALUES
('admin', 'hotels.stripe_manage', 1, NOW()),
('groupe_manager', 'hotels.stripe_manage', 0, NOW()),
('hotel_manager', 'hotels.stripe_manage', 1, NOW()),
('comptabilite', 'hotels.stripe_manage', 0, NOW()),
('rh', 'hotels.stripe_manage', 0, NOW()),
('receptionniste', 'hotels.stripe_manage', 0, NOW()),
('employee', 'hotels.stripe_manage', 0, NOW())
ON DUPLICATE KEY UPDATE allowed = VALUES(allowed), updated_at = NOW();
