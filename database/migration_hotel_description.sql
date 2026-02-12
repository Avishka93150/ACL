-- Migration: Ajout du champ description unique par hôtel
ALTER TABLE hotels ADD COLUMN description TEXT DEFAULT NULL AFTER email;
