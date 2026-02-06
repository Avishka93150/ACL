<?php
/**
 * ACL GESTION - Configuration
 * Les credentials sont lus depuis le fichier .env a la racine du projet
 */

// === CHARGEMENT .env ===
$envFile = __DIR__ . '/../.env';
if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;
        if (strpos($line, '=') === false) continue;
        list($key, $value) = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        if (!array_key_exists($key, $_ENV)) {
            $_ENV[$key] = $value;
        }
    }
}

// === BASE DE DONNEES ===
define('DB_HOST', $_ENV['DB_HOST'] ?? 'localhost');
define('DB_NAME', $_ENV['DB_NAME'] ?? 'acl_gestion');
define('DB_USER', $_ENV['DB_USER'] ?? 'root');
define('DB_PASS', $_ENV['DB_PASS'] ?? '');

// === APPLICATION ===
define('APP_URL', $_ENV['APP_URL'] ?? 'https://acl-gestion.com');
define('APP_NAME', $_ENV['APP_NAME'] ?? 'ACL GESTION');

// === JWT ===
define('JWT_SECRET', $_ENV['JWT_SECRET'] ?? 'CHANGE_THIS_SECRET_KEY');
define('JWT_EXPIRY', (int)($_ENV['JWT_EXPIRY'] ?? 86400 * 7)); // 7 jours

// === TIMEZONE ===
date_default_timezone_set('Europe/Paris');

// === DEBUG (false en production) ===
define('DEBUG', ($_ENV['DEBUG'] ?? 'false') === 'true');

// === CORS ===
define('CORS_ORIGIN', $_ENV['CORS_ORIGIN'] ?? 'https://acl-gestion.com');

// === HEADERS (uniquement pour les requetes HTTP, pas CLI) ===
if (php_sapi_name() !== 'cli') {
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: ' . CORS_ORIGIN);
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Allow-Credentials: true');

    // Headers de securite
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('X-XSS-Protection: 1; mode=block');
    header('Referrer-Policy: strict-origin-when-cross-origin');

    if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit;
    }
}

// === RATE LIMITING CONFIG ===
define('LOGIN_MAX_ATTEMPTS', 5);
define('LOGIN_LOCKOUT_MINUTES', 15);

// === UPLOAD CONFIG ===
define('UPLOAD_MAX_SIZE_IMAGE', 5 * 1024 * 1024);  // 5 Mo
define('UPLOAD_MAX_SIZE_DOC', 10 * 1024 * 1024);    // 10 Mo
define('UPLOAD_ALLOWED_IMAGES', ['jpg', 'jpeg', 'png']);
define('UPLOAD_ALLOWED_DOCS', ['pdf']);
