-- Migration: Walk-in hold system
-- Ne modifie pas la réservation walk-in tant que le paiement n'est pas effectué
-- Les infos client sont stockées temporairement dans walkin_guest_data
-- Le slot est réservé via walkin_hold_until (expiration auto après 15 min)

ALTER TABLE selfcheckin_reservations
    ADD COLUMN walkin_guest_data TEXT DEFAULT NULL COMMENT 'JSON temporaire des infos client en attente de paiement',
    ADD COLUMN walkin_hold_until DATETIME DEFAULT NULL COMMENT 'Date expiration du hold walk-in (libéré auto si dépassé)';

ALTER TABLE selfcheckin_reservations
    ADD INDEX idx_walkin_hold (walkin_hold_until);
