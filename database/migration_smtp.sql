-- Migration SMTP : Configuration email dans system_config
-- Les paramètres SMTP sont stockés en JSON dans system_config avec config_key = 'smtp'

-- La table system_config existe déjà (créée par le module modules)
-- On insère simplement la config SMTP par défaut si elle n'existe pas

INSERT INTO system_config (config_key, config_value, created_at, updated_at)
VALUES ('smtp', '{"enabled":false,"host":"","port":587,"encryption":"tls","username":"","password":"","from_email":"noreply@acl-gestion.com","from_name":"ACL GESTION"}', NOW(), NOW())
ON DUPLICATE KEY UPDATE config_key = config_key;
