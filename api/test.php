<?php
/**
 * ACL GESTION - Test de configuration
 * Acces: https://acl-gestion.com/api/test.php
 * A SUPPRIMER apres verification
 */

header('Content-Type: text/html; charset=utf-8');

echo "<h2>ACL GESTION - Test serveur</h2>";
echo "<hr>";

// 1. PHP
echo "<h3>1. PHP</h3>";
echo "<p>Version: " . phpversion() . "</p>";
echo "<p>Extensions PDO: " . (extension_loaded('pdo_mysql') ? 'OK' : 'MANQUANTE') . "</p>";
echo "<p>Extensions JSON: " . (extension_loaded('json') ? 'OK' : 'MANQUANTE') . "</p>";
echo "<p>Extensions cURL: " . (extension_loaded('curl') ? 'OK' : 'MANQUANTE') . "</p>";

// 2. .env
echo "<h3>2. Fichier .env</h3>";
$envFile = __DIR__ . '/../.env';
if (file_exists($envFile)) {
    echo "<p style='color:green'>.env existe</p>";
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;
        if (strpos($line, '=') === false) continue;
        list($key, $value) = explode('=', $line, 2);
        $key = trim($key);
        // Masquer les valeurs sensibles
        $masked = in_array($key, ['DB_PASS', 'JWT_SECRET']) ? '********' : trim($value);
        echo "<p>&nbsp;&nbsp;$key = $masked</p>";
    }
} else {
    echo "<p style='color:red'>.env MANQUANT</p>";
}

// 3. Base de donnees
echo "<h3>3. Base de donnees</h3>";
try {
    require_once __DIR__ . '/config.php';
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    echo "<p style='color:green'>Connexion OK (host: " . DB_HOST . ", db: " . DB_NAME . ")</p>";

    // Compter les tables
    $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    echo "<p>Tables: " . count($tables) . "</p>";

    // Verifier les tables critiques
    $critical = ['users', 'hotels', 'notifications', 'login_attempts', 'role_permissions'];
    foreach ($critical as $table) {
        $exists = in_array($table, $tables);
        $color = $exists ? 'green' : 'red';
        $status = $exists ? 'OK' : 'MANQUANTE';
        echo "<p>&nbsp;&nbsp;$table: <span style='color:$color'>$status</span></p>";
    }

    // Compter les utilisateurs
    $userCount = $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
    echo "<p>Utilisateurs: $userCount</p>";

} catch (PDOException $e) {
    echo "<p style='color:red'>ERREUR: " . htmlspecialchars($e->getMessage()) . "</p>";
}

// 4. Fichiers critiques
echo "<h3>4. Fichiers critiques</h3>";
$files = [
    'index.html' => '/../index.html',
    'js/app.js' => '/../js/app.js',
    'js/api.js' => '/../js/api.js',
    'js/utils.js' => '/../js/utils.js',
    'js/i18n.js' => '/../js/i18n.js',
    'sw.js' => '/../sw.js',
    'api/index.php' => '/index.php',
    'api/Database.php' => '/Database.php',
    'api/Auth.php' => '/Auth.php',
    'css/theme.css' => '/../css/theme.css',
];
foreach ($files as $label => $path) {
    $full = __DIR__ . $path;
    $exists = file_exists($full);
    $color = $exists ? 'green' : 'red';
    $status = $exists ? 'OK' : 'MANQUANT';
    echo "<p>&nbsp;&nbsp;$label: <span style='color:$color'>$status</span></p>";
}

// 5. Dossiers uploads
echo "<h3>5. Dossiers uploads</h3>";
$dirs = ['uploads', 'uploads/maintenance', 'uploads/linen', 'uploads/audit', 'uploads/closures'];
foreach ($dirs as $dir) {
    $full = __DIR__ . '/../' . $dir;
    $exists = is_dir($full);
    $writable = is_writable($full);
    $color = ($exists && $writable) ? 'green' : 'red';
    $status = !$exists ? 'MANQUANT' : ($writable ? 'OK (writable)' : 'NON WRITABLE');
    echo "<p>&nbsp;&nbsp;$dir: <span style='color:$color'>$status</span></p>";
}

echo "<hr>";
echo "<p style='color:orange'><strong>IMPORTANT: Supprimez ce fichier apres verification !</strong></p>";
echo "<p><code>rm /var/www/vhosts/acl-gestion.com/httpdocs/api/test.php</code></p>";
