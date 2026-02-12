-- Migration: Ajouter le numéro d'astreinte aux hôtels
-- Date: 2026-02-12

ALTER TABLE hotels ADD COLUMN on_call_phone VARCHAR(20) DEFAULT NULL AFTER phone;
