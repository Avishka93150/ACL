<?php
/**
 * ACL GESTION - API REST
 * URL: /api/index.php/endpoint
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Auth.php';

// === HELPERS ===
function json_out($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function json_error($msg, $code = 400) {
    json_out(['success' => false, 'error' => $msg, 'message' => $msg], $code);
}

// Cache pour l'input brut (php://input ne peut être lu qu'une fois)
$GLOBALS['_RAW_INPUT'] = null;

function get_raw_input() {
    if ($GLOBALS['_RAW_INPUT'] === null) {
        $GLOBALS['_RAW_INPUT'] = file_get_contents('php://input');
    }
    return $GLOBALS['_RAW_INPUT'];
}

function get_input() {
    return json_decode(get_raw_input(), true) ?? [];
}

function require_auth() {
    $user = Auth::getUser();
    if (!$user) json_error('Non autorisé', 401);
    return $user;
}

function require_role(...$roles) {
    $user = require_auth();
    if (!in_array($user['role'], $roles)) json_error('Accès refusé', 403);
    return $user;
}

// Fonction de logging RGPD
function rgpdLog($userId, $action, $resource, $resourceId = null, $details = null) {
    try {
        db()->insert(
            "INSERT INTO access_logs (user_id, action, resource, resource_id, ip_address, user_agent, details, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
            [
                $userId,
                $action,
                $resource,
                $resourceId,
                $_SERVER['REMOTE_ADDR'] ?? null,
                substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 500),
                $details
            ]
        );
    } catch (Exception $e) {
        // Silently fail - le logging ne doit pas bloquer l'application
        error_log("RGPD Log Error: " . $e->getMessage());
    }
}

// Vérifier permission dynamique
function hasPermission($role, $permission) {
    // Admin a toujours toutes les permissions
    if ($role === 'admin') return true;
    
    try {
        $perm = db()->queryOne(
            "SELECT allowed FROM role_permissions WHERE role = ? AND permission = ?",
            [$role, $permission]
        );
        
        // Si pas défini, refuser par défaut
        return $perm ? (bool)$perm['allowed'] : false;
    } catch (Exception $e) {
        return false;
    }
}

// Récupérer toutes les permissions d'un rôle
function getRolePermissions($role) {
    try {
        $perms = db()->query("SELECT permission, allowed FROM role_permissions WHERE role = ?", [$role]);
        $result = [];
        foreach ($perms as $p) {
            $result[$p['permission']] = (bool)$p['allowed'];
        }
        return $result;
    } catch (Exception $e) {
        return [];
    }
}

// === PAGINATION HELPER ===
function paginate($query, $params = [], $countQuery = null, $countParams = null) {
    $page = max(1, (int)($_GET['page'] ?? 1));
    $perPage = min(100, max(1, (int)($_GET['per_page'] ?? 25)));
    $offset = ($page - 1) * $perPage;

    // Compter le total
    if (!$countQuery) {
        $countQuery = preg_replace('/SELECT .+? FROM/is', 'SELECT COUNT(*) FROM', $query);
        $countQuery = preg_replace('/ORDER BY .+$/is', '', $countQuery);
        $countQuery = preg_replace('/LIMIT .+$/is', '', $countQuery);
        $countParams = $params;
    }

    $total = (int)db()->count($countQuery, $countParams);
    $totalPages = $perPage > 0 ? ceil($total / $perPage) : 1;

    // Ajouter LIMIT/OFFSET
    $query = preg_replace('/LIMIT \d+/i', '', $query);
    $query .= " LIMIT $perPage OFFSET $offset";

    $data = db()->query($query, $params);

    return [
        'data' => $data,
        'pagination' => [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'total_pages' => (int)$totalPages,
            'has_next' => $page < $totalPages,
            'has_prev' => $page > 1
        ]
    ];
}

// === RATE LIMITING (login) ===
function checkRateLimit($email) {
    try {
        // Creer la table si elle n'existe pas
        db()->execute("CREATE TABLE IF NOT EXISTS login_attempts (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            ip_address VARCHAR(45),
            attempted_at DATETIME NOT NULL,
            INDEX idx_email_time (email, attempted_at),
            INDEX idx_ip_time (ip_address, attempted_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $since = date('Y-m-d H:i:s', time() - LOGIN_LOCKOUT_MINUTES * 60);

        // Verifier par email
        $attempts = db()->count(
            "SELECT COUNT(*) FROM login_attempts WHERE email = ? AND attempted_at > ?",
            [$email, $since]
        );
        if ($attempts >= LOGIN_MAX_ATTEMPTS) {
            return false;
        }

        // Verifier par IP
        $ip = $_SERVER['REMOTE_ADDR'] ?? '';
        $ipAttempts = db()->count(
            "SELECT COUNT(*) FROM login_attempts WHERE ip_address = ? AND attempted_at > ?",
            [$ip, $since]
        );
        if ($ipAttempts >= LOGIN_MAX_ATTEMPTS * 3) {
            return false;
        }

        return true;
    } catch (Exception $e) {
        return true; // En cas d'erreur, laisser passer
    }
}

function recordLoginAttempt($email) {
    try {
        db()->insert(
            "INSERT INTO login_attempts (email, ip_address, attempted_at) VALUES (?, ?, NOW())",
            [$email, $_SERVER['REMOTE_ADDR'] ?? '']
        );
        // Nettoyage des anciennes tentatives (> 24h)
        db()->execute("DELETE FROM login_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)");
    } catch (Exception $e) {}
}

function clearLoginAttempts($email) {
    try {
        db()->execute("DELETE FROM login_attempts WHERE email = ?", [$email]);
    } catch (Exception $e) {}
}

// === VALIDATION MOT DE PASSE ===
function validatePassword($password) {
    if (strlen($password) < 8) return 'Le mot de passe doit contenir au moins 8 caracteres';
    if (!preg_match('/[A-Z]/', $password)) return 'Le mot de passe doit contenir au moins une majuscule';
    if (!preg_match('/[a-z]/', $password)) return 'Le mot de passe doit contenir au moins une minuscule';
    if (!preg_match('/[0-9]/', $password)) return 'Le mot de passe doit contenir au moins un chiffre';
    return null;
}

// === VALIDATION UPLOAD ===
function validateUpload($file, $type = 'image') {
    if ($file['error'] !== UPLOAD_ERR_OK) {
        return 'Erreur lors de l\'upload du fichier';
    }

    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));

    if ($type === 'image') {
        if (!in_array($ext, UPLOAD_ALLOWED_IMAGES)) {
            return 'Format d\'image non autorise. Formats acceptes: ' . implode(', ', UPLOAD_ALLOWED_IMAGES);
        }
        if ($file['size'] > UPLOAD_MAX_SIZE_IMAGE) {
            return 'Image trop volumineuse (max ' . (UPLOAD_MAX_SIZE_IMAGE / 1024 / 1024) . ' Mo)';
        }
        // Verifier le type MIME reel
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);
        if (!in_array($mime, ['image/jpeg', 'image/png'])) {
            return 'Le contenu du fichier ne correspond pas a une image valide';
        }
    } elseif ($type === 'document') {
        if (!in_array($ext, UPLOAD_ALLOWED_DOCS)) {
            return 'Format de document non autorise. Formats acceptes: ' . implode(', ', UPLOAD_ALLOWED_DOCS);
        }
        if ($file['size'] > UPLOAD_MAX_SIZE_DOC) {
            return 'Document trop volumineux (max ' . (UPLOAD_MAX_SIZE_DOC / 1024 / 1024) . ' Mo)';
        }
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);
        if ($mime !== 'application/pdf') {
            return 'Le contenu du fichier ne correspond pas a un PDF valide';
        }
    } elseif ($type === 'any') {
        $allowedExts = array_merge(UPLOAD_ALLOWED_IMAGES, UPLOAD_ALLOWED_DOCS);
        if (!in_array($ext, $allowedExts)) {
            return 'Format non autorise. Formats acceptes: ' . implode(', ', $allowedExts);
        }
        $maxSize = in_array($ext, UPLOAD_ALLOWED_IMAGES) ? UPLOAD_MAX_SIZE_IMAGE : UPLOAD_MAX_SIZE_DOC;
        if ($file['size'] > $maxSize) {
            return 'Fichier trop volumineux';
        }
    }

    return null;
}

// === PROTECTION CSRF ===
function checkCsrf() {
    if ($_SERVER['REQUEST_METHOD'] === 'GET' || $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        return; // Pas de verification pour GET/OPTIONS
    }

    $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
    $referer = $_SERVER['HTTP_REFERER'] ?? null;

    // Si ni Origin ni Referer, accepter (requete meme-origine typique)
    if (!$origin && !$referer) return;

    $allowedHost = parse_url(CORS_ORIGIN, PHP_URL_HOST);

    if ($origin) {
        $originHost = parse_url($origin, PHP_URL_HOST);
        if ($originHost && $originHost !== $allowedHost) {
            json_error('Requete cross-origin non autorisee', 403);
        }
        return;
    }

    if ($referer) {
        $refererHost = parse_url($referer, PHP_URL_HOST);
        if ($refererHost && $refererHost !== $allowedHost) {
            json_error('Requete cross-origin non autorisee', 403);
        }
    }
}

// Créer une notification
// Types disponibles: info, warning, danger, success
function createNotification($userId, $type, $title, $message = null) {
    // Mapper les anciens types vers les nouveaux
    $typeMap = [
        'task_assigned' => 'info',
        'task_due' => 'warning',
        'message' => 'info',
        'maintenance' => 'warning',
        'evaluation' => 'info',
        'leave' => 'info',
        'system' => 'info',
        'leave_request' => 'info',
        'leave_approved' => 'success',
        'leave_rejected' => 'danger'
    ];
    $mappedType = $typeMap[$type] ?? $type;
    
    // S'assurer que le type est valide
    if (!in_array($mappedType, ['info', 'warning', 'danger', 'success'])) {
        $mappedType = 'info';
    }
    
    try {
        db()->insert(
            "INSERT INTO notifications (user_id, type, title, message, created_at) VALUES (?, ?, ?, ?, NOW())",
            [$userId, $mappedType, $title, $message]
        );
    } catch (Exception $e) {
        // Ignorer les erreurs de notification
        error_log("Notification error: " . $e->getMessage());
    }
}

// Hiérarchie des rôles (qui peut gérer qui)
function getRoleHierarchy() {
    return [
        'admin' => ['admin', 'groupe_manager', 'hotel_manager', 'comptabilite', 'rh', 'receptionniste', 'employee'],
        'groupe_manager' => ['hotel_manager', 'comptabilite', 'rh', 'receptionniste', 'employee'],
        'hotel_manager' => ['receptionniste', 'employee'],
        'comptabilite' => [],
        'rh' => ['employee'],
        'receptionniste' => [],
        'employee' => []
    ];
}

// Vérifier si un utilisateur peut gérer un autre utilisateur
function canManageUser($manager, $target) {
    // On ne peut pas se modifier soi-même via cette fonction
    if ($manager['id'] == $target['id']) return true;
    
    // Admin peut tout faire
    if ($manager['role'] === 'admin') return true;
    
    $hierarchy = getRoleHierarchy();
    $manageableRoles = $hierarchy[$manager['role']] ?? [];
    
    // Vérifier si le rôle cible est gérable
    if (!in_array($target['role'], $manageableRoles)) return false;
    
    // Pour hotel_manager, vérifier qu'ils partagent au moins un hôtel
    if ($manager['role'] === 'hotel_manager') {
        $sharedHotels = db()->count(
            "SELECT COUNT(*) FROM user_hotels uh1 
             INNER JOIN user_hotels uh2 ON uh1.hotel_id = uh2.hotel_id 
             WHERE uh1.user_id = ? AND uh2.user_id = ?",
            [$manager['id'], $target['id']]
        );
        return $sharedHotels > 0;
    }
    
    return true;
}

// Vérifier si un utilisateur peut assigner un rôle
function canAssignRole($manager, $targetRole) {
    if ($manager['role'] === 'admin') return true;
    
    $hierarchy = getRoleHierarchy();
    $manageableRoles = $hierarchy[$manager['role']] ?? [];
    
    return in_array($targetRole, $manageableRoles);
}

// Récupérer les hôtels que l'utilisateur peut gérer
function getManageableHotels($user) {
    if ($user['role'] === 'admin') {
        // Admin peut gérer tous les hôtels
        return array_column(db()->query("SELECT id FROM hotels"), 'id');
    }
    
    // Groupe manager et Hotel manager ne peuvent gérer que leurs hôtels assignés
    return array_column(
        db()->query("SELECT hotel_id FROM user_hotels WHERE user_id = ?", [$user['id']]),
        'hotel_id'
    );
}

// Récupérer les rôles assignables par un utilisateur
function getAssignableRoles($user) {
    $hierarchy = getRoleHierarchy();
    return $hierarchy[$user['role']] ?? [];
}

// Notifier les supérieurs hiérarchiques pour une demande de congés
function notifyManagersForLeaveRequest($employee, $leaveId, $startDate, $endDate, $days, $leaveType = 'cp') {
    $employeeName = $employee['first_name'] . ' ' . $employee['last_name'];
    $dateRange = date('d/m/Y', strtotime($startDate)) . ' au ' . date('d/m/Y', strtotime($endDate));
    
    $typeLabel = $leaveType === 'maladie' ? 'arrêt maladie' : 'congés payés';
    $message = "$employeeName a demandé $days jour(s) de $typeLabel du $dateRange.";
    $emailSubject = $leaveType === 'maladie' 
        ? "🏥 Arrêt maladie - $employeeName" 
        : "📅 Demande de congés - $employeeName";
    
    $managersToNotify = [];
    $emailsToNotify = [];
    
    // Récupérer les hôtels de l'employé
    $employeeHotels = db()->query(
        "SELECT hotel_id FROM user_hotels WHERE user_id = ?",
        [$employee['id']]
    );
    $hotelIds = array_column($employeeHotels, 'hotel_id');
    
    if (!empty($hotelIds)) {
        $placeholders = implode(',', array_fill(0, count($hotelIds), '?'));
        
        // 1. Notifier les hotel_manager des mêmes hôtels
        $hotelManagers = db()->query(
            "SELECT DISTINCT u.id, u.email, CONCAT(u.first_name, ' ', u.last_name) as name 
             FROM users u
             JOIN user_hotels uh ON u.id = uh.user_id
             WHERE uh.hotel_id IN ($placeholders) 
               AND u.role = 'hotel_manager' 
               AND u.status = 'active'
               AND u.id != ?",
            array_merge($hotelIds, [$employee['id']])
        );
        foreach ($hotelManagers as $m) {
            $managersToNotify[] = $m['id'];
            if ($m['email']) $emailsToNotify[] = ['email' => $m['email'], 'name' => $m['name']];
        }
        
        // 2. Notifier les groupe_manager des mêmes hôtels
        $groupeManagers = db()->query(
            "SELECT DISTINCT u.id, u.email, CONCAT(u.first_name, ' ', u.last_name) as name 
             FROM users u
             JOIN user_hotels uh ON u.id = uh.user_id
             WHERE uh.hotel_id IN ($placeholders) 
               AND u.role = 'groupe_manager' 
               AND u.status = 'active'
               AND u.id != ?",
            array_merge($hotelIds, [$employee['id']])
        );
        foreach ($groupeManagers as $m) {
            $managersToNotify[] = $m['id'];
            if ($m['email']) $emailsToNotify[] = ['email' => $m['email'], 'name' => $m['name']];
        }
        
        // 3. Notifier les RH affectés aux mêmes hôtels
        $rhUsers = db()->query(
            "SELECT DISTINCT u.id, u.email, CONCAT(u.first_name, ' ', u.last_name) as name 
             FROM users u
             JOIN user_hotels uh ON u.id = uh.user_id
             WHERE uh.hotel_id IN ($placeholders) 
               AND u.role = 'rh' 
               AND u.status = 'active'
               AND u.id != ?",
            array_merge($hotelIds, [$employee['id']])
        );
        foreach ($rhUsers as $m) {
            $managersToNotify[] = $m['id'];
            if ($m['email']) $emailsToNotify[] = ['email' => $m['email'], 'name' => $m['name']];
        }
    }
    
    // 4. Toujours notifier les admins
    $admins = db()->query(
        "SELECT id, email, CONCAT(first_name, ' ', last_name) as name 
         FROM users WHERE role = 'admin' AND status = 'active' AND id != ?",
        [$employee['id']]
    );
    foreach ($admins as $m) {
        $managersToNotify[] = $m['id'];
        if ($m['email']) $emailsToNotify[] = ['email' => $m['email'], 'name' => $m['name']];
    }
    
    // Supprimer les doublons
    $managersToNotify = array_unique($managersToNotify);
    
    // Créer les notifications en base
    foreach ($managersToNotify as $managerId) {
        db()->insert(
            "INSERT INTO notifications (user_id, type, title, message, created_at) VALUES (?, ?, ?, ?, NOW())",
            [
                $managerId, 
                $leaveType === 'maladie' ? 'warning' : 'info', 
                $leaveType === 'maladie' ? 'Arrêt maladie' : 'Demande de congés', 
                $message
            ]
        );
    }
    
    // Envoyer les emails
    $uniqueEmails = [];
    foreach ($emailsToNotify as $recipient) {
        if (!isset($uniqueEmails[$recipient['email']])) {
            $uniqueEmails[$recipient['email']] = $recipient;
        }
    }
    
    foreach ($uniqueEmails as $recipient) {
        sendLeaveNotificationEmail($recipient['email'], $recipient['name'], $employeeName, $typeLabel, $dateRange, $days, $leaveType);
    }
}

function sendLeaveNotificationEmail($toEmail, $toName, $employeeName, $typeLabel, $dateRange, $days, $leaveType) {
    // Vérifier si les mails sont activés
    $config = @include(__DIR__ . '/config.php');
    if (empty($config['smtp_host'])) return;
    
    $isUrgent = $leaveType === 'maladie';
    
    $subject = $isUrgent 
        ? "🏥 [URGENT] Arrêt maladie - $employeeName"
        : "📅 Demande de congés - $employeeName";
    
    $htmlBody = "
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Inter', Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: " . ($isUrgent ? '#e74c3c' : '#1E3A5F') . "; color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; }
            .header .icon { font-size: 48px; margin-bottom: 15px; }
            .content { padding: 30px; }
            .info-box { background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
            .info-row:last-child { border-bottom: none; }
            .info-label { color: #666; }
            .info-value { font-weight: 600; color: #333; }
            .btn { display: inline-block; background: #1E3A5F; color: white; text-decoration: none; padding: 12px 30px; border-radius: 6px; margin-top: 20px; }
            .urgent-badge { background: #e74c3c; color: white; padding: 5px 15px; border-radius: 20px; font-size: 12px; text-transform: uppercase; }
            .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class='container'>
            <div class='header'>
                <div class='icon'>" . ($isUrgent ? '🏥' : '📅') . "</div>
                <h1>" . ($isUrgent ? 'Arrêt Maladie' : 'Demande de Congés') . "</h1>
            </div>
            <div class='content'>
                <p>Bonjour " . htmlspecialchars($toName) . ",</p>
                <p>" . ($isUrgent ? '<span class=\"urgent-badge\">Urgent</span> ' : '') . "Une nouvelle demande nécessite votre attention :</p>
                
                <div class='info-box'>
                    <div class='info-row'>
                        <span class='info-label'>Collaborateur</span>
                        <span class='info-value'>" . htmlspecialchars($employeeName) . "</span>
                    </div>
                    <div class='info-row'>
                        <span class='info-label'>Type</span>
                        <span class='info-value'>" . ucfirst($typeLabel) . "</span>
                    </div>
                    <div class='info-row'>
                        <span class='info-label'>Période</span>
                        <span class='info-value'>$dateRange</span>
                    </div>
                    <div class='info-row'>
                        <span class='info-label'>Durée</span>
                        <span class='info-value'>$days jour(s)</span>
                    </div>
                </div>
                
                <p>Connectez-vous à ACL GESTION pour traiter cette demande.</p>
                
                <center>
                    <a href='#' class='btn'>Accéder à la plateforme</a>
                </center>
            </div>
            <div class='footer'>
                <p>ACL GESTION - Plateforme de gestion hôtelière</p>
                <p>Ceci est un message automatique, merci de ne pas y répondre.</p>
            </div>
        </div>
    </body>
    </html>
    ";
    
    // Envoyer avec mail() ou SMTP selon config
    $headers = "MIME-Version: 1.0\r\n";
    $headers .= "Content-type: text/html; charset=UTF-8\r\n";
    $headers .= "From: ACL GESTION <noreply@acl-gestion.com>\r\n";
    
    @mail($toEmail, $subject, $htmlBody, $headers);
}

/**
 * Envoyer un email de confirmation de réservation au client (self check-in / walk-in)
 */
function sendBookingConfirmationEmail($reservations, $hotel) {
    if (empty($reservations)) return;

    $primary = $reservations[0];
    $guestEmail = $primary['guest_email'];
    if (empty($guestEmail) || !filter_var($guestEmail, FILTER_VALIDATE_EMAIL)) return;

    $guestName = htmlspecialchars(trim(($primary['guest_first_name'] ?? '') . ' ' . ($primary['guest_last_name'] ?? '')));
    $hotelName = htmlspecialchars($hotel['name'] ?? '');
    $hotelAddress = htmlspecialchars(trim(($hotel['address'] ?? '') . ', ' . ($hotel['city'] ?? '')));
    $checkinDate = date('d/m/Y', strtotime($primary['checkin_date']));
    $checkoutDate = !empty($primary['checkout_date']) ? date('d/m/Y', strtotime($primary['checkout_date'])) : '';
    $nbRooms = count($reservations);

    // Construire la liste des chambres
    $roomLines = '';
    foreach ($reservations as $res) {
        $roomNum = htmlspecialchars($res['room_number'] ?? '-');
        $lockerNum = htmlspecialchars($res['locker_number'] ?? '-');
        $lockerCode = htmlspecialchars($res['locker_code'] ?? '-');
        $roomLines .= "
            <tr>
                <td style='padding: 8px 12px; border-bottom: 1px solid #eee;'>{$roomNum}</td>
                <td style='padding: 8px 12px; border-bottom: 1px solid #eee;'>{$lockerNum}</td>
                <td style='padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: 700; color: #1E3A5F;'>{$lockerCode}</td>
            </tr>";
    }

    // Tarification (basée sur la réservation primaire qui porte le total)
    $accommodation = number_format((float)($primary['accommodation_price'] ?? 0), 2, ',', ' ');
    $touristTax = number_format((float)($primary['tourist_tax_amount'] ?? 0), 2, ',', ' ');
    $breakfast = number_format((float)($primary['breakfast_price'] ?? 0), 2, ',', ' ');
    $total = number_format((float)($primary['total_amount'] ?? 0), 2, ',', ' ');
    $breakfastIncluded = !empty($primary['breakfast_included']);

    // Horaires petit-déjeuner
    $breakfastInfo = '';
    if ($breakfastIncluded) {
        $bStart = !empty($hotel['breakfast_start']) ? substr($hotel['breakfast_start'], 0, 5) : '07:00';
        $bEnd = !empty($hotel['breakfast_end']) ? substr($hotel['breakfast_end'], 0, 5) : '10:30';
        $breakfastInfo = "
            <div style='background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 15px; margin: 20px 0;'>
                <strong>☕ Petit-déjeuner inclus</strong><br>
                Servi de {$bStart} à {$bEnd}
            </div>";
    }

    // Dates
    $dateRow = "<div style='display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee;'>
        <span style='color: #666;'>Date d'arrivée</span>
        <span style='font-weight: 600; color: #333;'>{$checkinDate}</span>
    </div>";
    if ($checkoutDate) {
        $dateRow .= "<div style='display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee;'>
            <span style='color: #666;'>Date de départ</span>
            <span style='font-weight: 600; color: #333;'>{$checkoutDate}</span>
        </div>";
    }

    $resNumbers = array_map(function($r) { return $r['reservation_number']; }, $reservations);
    $resNumStr = htmlspecialchars(implode(', ', $resNumbers));

    $subject = "=?UTF-8?B?" . base64_encode("Confirmation de réservation - {$hotel['name']}") . "?=";

    $htmlBody = "
    <!DOCTYPE html>
    <html>
    <head><meta charset='UTF-8'></head>
    <body style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background: #f5f5f5;'>
        <div style='max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);'>
            <div style='background: linear-gradient(135deg, #1E3A5F, #0F2744); color: white; padding: 30px; text-align: center;'>
                <div style='font-size: 48px; margin-bottom: 15px;'>✅</div>
                <h1 style='margin: 0; font-size: 24px;'>Réservation confirmée</h1>
                <p style='margin: 10px 0 0; opacity: 0.8;'>{$hotelName}</p>
            </div>
            <div style='padding: 30px;'>
                <p>Bonjour {$guestName},</p>
                <p>Votre réservation a été confirmée avec succès. Voici les détails de votre séjour :</p>

                <div style='background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;'>
                    <div style='display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee;'>
                        <span style='color: #666;'>N° de réservation</span>
                        <span style='font-weight: 600; color: #333;'>{$resNumStr}</span>
                    </div>
                    {$dateRow}
                    <div style='display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee;'>
                        <span style='color: #666;'>Adultes</span>
                        <span style='font-weight: 600; color: #333;'>{$primary['nb_adults']}</span>
                    </div>" . ((int)($primary['nb_children'] ?? 0) > 0 ? "
                    <div style='display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee;'>
                        <span style='color: #666;'>Enfants</span>
                        <span style='font-weight: 600; color: #333;'>{$primary['nb_children']}</span>
                    </div>" : "") . "
                    <div style='display: flex; justify-content: space-between; padding: 10px 0;'>
                        <span style='color: #666;'>Chambre(s)</span>
                        <span style='font-weight: 600; color: #333;'>{$nbRooms}</span>
                    </div>
                </div>

                <div style='background: #e8f5e9; border: 1px solid #4caf50; border-radius: 8px; padding: 15px; margin: 20px 0;'>
                    <strong style='color: #2e7d32;'>🔑 Accès à votre chambre</strong>
                    <p style='margin: 10px 0 0; font-size: 14px;'>Récupérez votre clé dans le casier indiqué ci-dessous :</p>
                    <table style='width: 100%; border-collapse: collapse; margin-top: 10px;'>
                        <thead>
                            <tr style='background: rgba(0,0,0,0.05);'>
                                <th style='padding: 8px 12px; text-align: left; font-size: 13px;'>Chambre</th>
                                <th style='padding: 8px 12px; text-align: left; font-size: 13px;'>Casier</th>
                                <th style='padding: 8px 12px; text-align: left; font-size: 13px;'>Code</th>
                            </tr>
                        </thead>
                        <tbody>
                            {$roomLines}
                        </tbody>
                    </table>
                </div>

                {$breakfastInfo}

                <div style='background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;'>
                    <h3 style='margin: 0 0 15px; color: #1E3A5F; font-size: 16px;'>Détail du paiement</h3>
                    <div style='display: flex; justify-content: space-between; padding: 8px 0;'>
                        <span style='color: #666;'>Hébergement</span>
                        <span>{$accommodation} €</span>
                    </div>
                    <div style='display: flex; justify-content: space-between; padding: 8px 0;'>
                        <span style='color: #666;'>Taxe de séjour</span>
                        <span>{$touristTax} €</span>
                    </div>" . ($breakfastIncluded ? "
                    <div style='display: flex; justify-content: space-between; padding: 8px 0;'>
                        <span style='color: #666;'>Petit-déjeuner</span>
                        <span>{$breakfast} €</span>
                    </div>" : "") . "
                    <div style='display: flex; justify-content: space-between; padding: 12px 0; border-top: 2px solid #1E3A5F; margin-top: 8px; font-size: 18px; font-weight: 700; color: #1E3A5F;'>
                        <span>Total payé</span>
                        <span>{$total} €</span>
                    </div>
                </div>

                <p style='margin-top: 25px; color: #666; font-size: 14px;'>
                    📍 <strong>{$hotelName}</strong><br>
                    {$hotelAddress}
                </p>

                <p style='color: #666; font-size: 14px;'>Nous vous souhaitons un excellent séjour !</p>
            </div>
            <div style='background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;'>
                <p style='margin: 0;'>ACL GESTION - Plateforme de gestion hôtelière</p>
                <p style='margin: 5px 0 0;'>Ceci est un message automatique, merci de ne pas y répondre.</p>
            </div>
        </div>
    </body>
    </html>";

    $headers = "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "From: " . htmlspecialchars($hotel['name']) . " <noreply@acl-gestion.com>\r\n";

    @mail($guestEmail, $subject, $htmlBody, $headers);
}

// Notifier pour un ticket de maintenance (création, alerte retard)
function notifyMaintenanceTicket($ticketId, $ticketData, $creator, $type = 'created') {
    $hotelId = $ticketData['hotel_id'];
    
    // Récupérer les infos de l'hôtel
    $hotel = db()->queryOne("SELECT name FROM hotels WHERE id = ?", [$hotelId]);
    $hotelName = $hotel ? $hotel['name'] : 'Hôtel #' . $hotelId;
    $creatorName = $creator['first_name'] . ' ' . $creator['last_name'];
    
    // Labels
    $categoryLabels = [
        'plomberie' => 'Plomberie', 'electricite' => 'Électricité', 'climatisation' => 'Climatisation',
        'mobilier' => 'Mobilier', 'serrurerie' => 'Serrurerie', 'peinture' => 'Peinture',
        'nettoyage' => 'Nettoyage', 'autre' => 'Autre'
    ];
    $priorityLabels = ['low' => 'Basse', 'medium' => 'Moyenne', 'high' => 'Haute', 'critical' => 'CRITIQUE'];
    
    $category = $categoryLabels[$ticketData['category']] ?? $ticketData['category'];
    $priority = $ticketData['priority'] ?? 'medium';
    $priorityLabel = $priorityLabels[$priority] ?? $priority;
    $roomInfo = !empty($ticketData['room_number']) ? $ticketData['room_number'] : 'Parties communes';
    
    // Trouver les responsables de cet hôtel (hotel_manager, groupe_manager, admin)
    $managers = db()->query(
        "SELECT DISTINCT u.id, u.email, u.first_name, u.last_name, u.role 
         FROM users u
         JOIN user_hotels uh ON u.id = uh.user_id
         WHERE uh.hotel_id = ? 
           AND u.role IN ('hotel_manager', 'groupe_manager', 'admin')
           AND u.status = 'active'
           AND u.id != ?",
        [$hotelId, $creator['id']]
    );
    
    // Préparer les messages selon le type
    $priorityEmoji = $priority === 'critical' ? '🚨' : ($priority === 'high' ? '⚠️' : '🔧');
    
    if ($type === 'created') {
        $notifTitle = 'Nouveau ticket maintenance';
        $notifType = $priority === 'critical' ? 'warning' : 'info';
        $emailSubject = "[Maintenance] {$priorityEmoji} Ticket #{$ticketId} - {$category} - {$hotelName}";
        $emailHeader = "{$priorityEmoji} Nouveau Ticket Maintenance";
        $emailIntro = "Un nouveau ticket de maintenance a été créé et nécessite votre attention.";
    } elseif ($type === 'reminder_2days') {
        $notifTitle = '⚠️ Ticket non pris en charge';
        $notifType = 'warning';
        $emailSubject = "⚠️ [RAPPEL] Ticket #{$ticketId} non pris en charge depuis 2 jours";
        $emailHeader = "⚠️ Ticket en attente depuis 2 jours";
        $emailIntro = "Ce ticket n'a pas encore été pris en charge. Merci d'y accorder votre attention.";
    } elseif ($type === 'reminder_5days') {
        $notifTitle = '🚨 Ticket non résolu depuis 5 jours';
        $notifType = 'warning';
        $emailSubject = "🚨 [URGENT] Ticket #{$ticketId} non résolu depuis 5 jours";
        $emailHeader = "🚨 Ticket non résolu depuis 5 jours";
        $emailIntro = "Ce ticket est en cours depuis plus de 5 jours sans résolution. Action urgente requise.";
    }
    
    // Message interne
    $messageContent = "{$priorityEmoji} Ticket maintenance #{$ticketId}\n\n";
    $messageContent .= "🏨 Hôtel: {$hotelName}\n";
    $messageContent .= "📍 Localisation: {$roomInfo}\n";
    $messageContent .= "🏷️ Catégorie: {$category}\n";
    $messageContent .= "⚡ Priorité: {$priorityLabel}\n\n";
    $messageContent .= "📝 Description:\n{$ticketData['description']}\n\n";
    $messageContent .= "👤 Signalé par: {$creatorName}";
    
    // Email HTML
    $bgColor = $priority === 'critical' || $type !== 'created' ? '#DC2626' : '#1E3A5F';
    $emailBody = "
    <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;'>
        <div style='background: {$bgColor}; color: white; padding: 20px; text-align: center;'>
            <h2 style='margin: 0;'>{$emailHeader}</h2>
            <p style='margin: 10px 0 0 0; opacity: 0.9;'>Ticket #{$ticketId}</p>
        </div>
        <div style='padding: 25px; background: #f9f9f9;'>
            <p style='margin: 0 0 20px 0;'>{$emailIntro}</p>
            <table style='width: 100%; border-collapse: collapse;'>
                <tr>
                    <td style='padding: 10px 0; border-bottom: 1px solid #ddd;'><strong>🏨 Hôtel</strong></td>
                    <td style='padding: 10px 0; border-bottom: 1px solid #ddd;'>{$hotelName}</td>
                </tr>
                <tr>
                    <td style='padding: 10px 0; border-bottom: 1px solid #ddd;'><strong>📍 Localisation</strong></td>
                    <td style='padding: 10px 0; border-bottom: 1px solid #ddd;'>{$roomInfo}</td>
                </tr>
                <tr>
                    <td style='padding: 10px 0; border-bottom: 1px solid #ddd;'><strong>🏷️ Catégorie</strong></td>
                    <td style='padding: 10px 0; border-bottom: 1px solid #ddd;'>{$category}</td>
                </tr>
                <tr>
                    <td style='padding: 10px 0; border-bottom: 1px solid #ddd;'><strong>⚡ Priorité</strong></td>
                    <td style='padding: 10px 0; border-bottom: 1px solid #ddd;'>
                        <span style='background: " . ($priority === 'critical' ? '#DC2626' : ($priority === 'high' ? '#F59E0B' : '#3B82F6')) . "; color: white; padding: 3px 10px; border-radius: 3px;'>{$priorityLabel}</span>
                    </td>
                </tr>
                <tr>
                    <td style='padding: 10px 0;'><strong>👤 Signalé par</strong></td>
                    <td style='padding: 10px 0;'>{$creatorName}</td>
                </tr>
            </table>
            
            <div style='margin-top: 20px; padding: 15px; background: white; border-radius: 5px; border-left: 4px solid #1E3A5F;'>
                <strong>📝 Description du problème:</strong>
                <p style='margin: 10px 0 0 0; color: #333;'>" . nl2br(htmlspecialchars($ticketData['description'])) . "</p>
            </div>
        </div>
        <div style='padding: 15px; background: #1E3A5F; color: white; text-align: center; font-size: 12px;'>
            <p style='margin: 0;'>ACL GESTION - Système de gestion hôtelière</p>
        </div>
    </div>";
    
    // Filtrer les destinataires selon le type d'alerte
    $recipients = $managers;
    if ($type === 'reminder_2days' || $type === 'reminder_5days') {
        // Pour les rappels, notifier uniquement groupe_manager et admin
        $recipients = array_filter($managers, function($m) {
            return in_array($m['role'], ['groupe_manager', 'admin']);
        });
    }
    
    // Envoyer les notifications à chaque responsable
    foreach ($recipients as $manager) {
        // 1. Notification en base
        db()->insert(
            "INSERT INTO notifications (user_id, type, title, message, created_at) VALUES (?, ?, ?, ?, NOW())",
            [$manager['id'], $notifType, $notifTitle, substr($messageContent, 0, 500)]
        );
        
        // 2. Message interne via le système de conversations
        $existingConv = db()->queryOne(
            "SELECT id FROM conversations 
             WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)",
            [$creator['id'], $manager['id'], $manager['id'], $creator['id']]
        );
        
        if ($existingConv) {
            $convId = $existingConv['id'];
            db()->execute("UPDATE conversations SET last_message = ?, last_at = NOW() WHERE id = ?", 
                [substr($messageContent, 0, 255), $convId]);
        } else {
            $convId = db()->insert(
                "INSERT INTO conversations (user1_id, user2_id, last_message, last_at, created_at) VALUES (?, ?, ?, NOW(), NOW())",
                [$creator['id'], $manager['id'], substr($messageContent, 0, 255)]
            );
        }
        
        // Ajouter le message dans conversation_messages
        db()->insert(
            "INSERT INTO conversation_messages (conversation_id, sender_id, content, created_at) VALUES (?, ?, ?, NOW())",
            [$convId, $creator['id'], $messageContent]
        );
        
        // 3. Email
        if (!empty($manager['email'])) {
            $headers = "MIME-Version: 1.0\r\n";
            $headers .= "Content-type: text/html; charset=UTF-8\r\n";
            $headers .= "From: ACL GESTION <noreply@acl-gestion.com>\r\n";
            
            @mail($manager['email'], $emailSubject, $emailBody, $headers);
        }
    }
}

/**
 * Notifier les personnes liées à un ticket maintenance lors d'une activité
 * (commentaire, prise en charge, résolution)
 *
 * Destinataires : commentateurs du ticket + hotel_manager + groupe_manager + admin
 * Configurable par hôtel via hotel_maintenance_config
 */
function notifyMaintenanceActivity($ticketId, $actor, $eventType, $extraMessage = '') {
    // Récupérer le ticket complet
    $ticket = db()->queryOne(
        "SELECT m.*, h.name as hotel_name
         FROM maintenance_tickets m
         LEFT JOIN hotels h ON m.hotel_id = h.id
         WHERE m.id = ?",
        [$ticketId]
    );
    if (!$ticket) return;

    $hotelId = $ticket['hotel_id'];
    $hotelName = $ticket['hotel_name'] ?: 'Hôtel #' . $hotelId;
    $actorName = $actor['first_name'] . ' ' . $actor['last_name'];

    // Charger la configuration des alertes pour cet hôtel
    $config = null;
    try {
        $config = db()->queryOne("SELECT * FROM hotel_maintenance_config WHERE hotel_id = ?", [$hotelId]);
    } catch (Exception $e) {}

    // Valeurs par défaut si pas de config
    $notifyOnComment = $config ? (int)$config['notify_on_comment'] : 1;
    $notifyOnStatusChange = $config ? (int)$config['notify_on_status_change'] : 1;
    $notifyOnResolution = $config ? (int)$config['notify_on_resolution'] : 1;
    $notifyCommenters = $config ? (int)$config['notify_commenters'] : 1;
    $notifyHotelManager = $config ? (int)$config['notify_hotel_manager'] : 1;
    $notifyGroupeManager = $config ? (int)$config['notify_groupe_manager'] : 1;
    $notifyAdmin = $config ? (int)$config['notify_admin'] : 1;

    // Vérifier si ce type d'événement doit déclencher une notification
    if ($eventType === 'comment' && !$notifyOnComment) return;
    if ($eventType === 'assignment' && !$notifyOnStatusChange) return;
    if ($eventType === 'resolution' && !$notifyOnResolution) return;

    // Collecter les destinataires (IDs uniques, excluant l'acteur)
    $recipientIds = [];

    // 1. Utilisateurs ayant commenté ce ticket
    if ($notifyCommenters) {
        $commenters = db()->query(
            "SELECT DISTINCT tc.user_id FROM ticket_comments tc WHERE tc.ticket_id = ? AND tc.user_id != ?",
            [$ticketId, $actor['id']]
        );
        foreach ($commenters as $c) {
            $recipientIds[$c['user_id']] = true;
        }
    }

    // 2. Le créateur du ticket
    if ($ticket['reported_by'] && $ticket['reported_by'] != $actor['id']) {
        $recipientIds[$ticket['reported_by']] = true;
    }

    // 3. La personne assignée au ticket
    if ($ticket['assigned_to'] && $ticket['assigned_to'] != $actor['id']) {
        $recipientIds[$ticket['assigned_to']] = true;
    }

    // 4. Responsables de l'hôtel selon la config
    $roleFilter = [];
    if ($notifyHotelManager) $roleFilter[] = "'hotel_manager'";
    if ($notifyGroupeManager) $roleFilter[] = "'groupe_manager'";
    if ($notifyAdmin) $roleFilter[] = "'admin'";

    if (!empty($roleFilter)) {
        $rolesIn = implode(',', $roleFilter);
        $managers = db()->query(
            "SELECT DISTINCT u.id FROM users u
             JOIN user_hotels uh ON u.id = uh.user_id
             WHERE uh.hotel_id = ? AND u.role IN ($rolesIn) AND u.status = 'active' AND u.id != ?",
            [$hotelId, $actor['id']]
        );
        foreach ($managers as $m) {
            $recipientIds[$m['id']] = true;
        }
    }

    // Admins globaux (pas forcément liés à l'hôtel)
    if ($notifyAdmin) {
        $admins = db()->query(
            "SELECT id FROM users WHERE role = 'admin' AND status = 'active' AND id != ?",
            [$actor['id']]
        );
        foreach ($admins as $a) {
            $recipientIds[$a['id']] = true;
        }
    }

    if (empty($recipientIds)) return;

    // Préparer le contenu de la notification selon le type
    $roomInfo = $ticket['room_number'] ?: 'Parties communes';
    switch ($eventType) {
        case 'comment':
            $notifTitle = "Commentaire - Ticket #{$ticketId}";
            $notifMessage = "{$actorName} a commenté le ticket #{$ticketId} ({$hotelName} - {$roomInfo})";
            if ($extraMessage) $notifMessage .= "\n\"{$extraMessage}\"";
            break;
        case 'assignment':
            $notifTitle = "Prise en charge - Ticket #{$ticketId}";
            $notifMessage = "{$actorName} a pris en charge le ticket #{$ticketId} ({$hotelName} - {$roomInfo})";
            break;
        case 'resolution':
            $notifTitle = "Résolu - Ticket #{$ticketId}";
            $notifMessage = "{$actorName} a résolu le ticket #{$ticketId} ({$hotelName} - {$roomInfo})";
            if ($extraMessage) $notifMessage .= "\nRésolution: {$extraMessage}";
            break;
        default:
            $notifTitle = "Mise à jour - Ticket #{$ticketId}";
            $notifMessage = "{$actorName} a mis à jour le ticket #{$ticketId} ({$hotelName} - {$roomInfo})";
    }

    // Envoyer les notifications en base à chaque destinataire
    foreach (array_keys($recipientIds) as $userId) {
        db()->insert(
            "INSERT INTO notifications (user_id, type, title, message, link, created_at) VALUES (?, 'info', ?, ?, ?, NOW())",
            [$userId, $notifTitle, substr($notifMessage, 0, 500), 'maintenance:' . $ticketId]
        );
    }
}

// Générer le contenu PDF pour les chambres bloquées
function generateBlockedRoomsPDFContent($rooms, $stats, $startDate, $endDate) {
    $categoryLabels = [
        'plomberie' => 'Plomberie', 'electricite' => 'Électricité', 'climatisation' => 'Climatisation',
        'mobilier' => 'Mobilier', 'serrurerie' => 'Serrurerie', 'peinture' => 'Peinture',
        'nettoyage' => 'Nettoyage', 'autre' => 'Autre'
    ];
    
    $startDateFR = date('d/m/Y', strtotime($startDate));
    $endDateFR = date('d/m/Y', strtotime($endDate));
    
    $html = '<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Rapport Chambres Bloquées</title>
    <style>
        body { font-family: Arial, sans-serif; font-size: 11px; color: #333; margin: 20px; }
        .header { background: #1E3A5F; color: white; padding: 20px; text-align: center; margin-bottom: 20px; }
        .header h1 { margin: 0; font-size: 18px; }
        .header p { margin: 5px 0 0 0; opacity: 0.8; }
        .kpi-grid { display: flex; justify-content: space-between; margin-bottom: 20px; }
        .kpi-box { background: #f5f5f5; padding: 15px; text-align: center; flex: 1; margin: 0 5px; border-radius: 5px; }
        .kpi-value { font-size: 24px; font-weight: bold; color: #1E3A5F; }
        .kpi-label { font-size: 10px; color: #666; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background: #1E3A5F; color: white; padding: 10px; text-align: left; font-size: 10px; }
        td { padding: 8px; border-bottom: 1px solid #ddd; font-size: 10px; }
        tr:nth-child(even) { background: #f9f9f9; }
        .status-blocked { color: #e74c3c; font-weight: bold; }
        .status-resolved { color: #27ae60; }
        .footer { margin-top: 30px; text-align: center; font-size: 9px; color: #999; border-top: 1px solid #ddd; padding-top: 10px; }
        @media print { body { margin: 0; } }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 Rapport des Chambres Bloquées</h1>
        <p>Période: ' . $startDateFR . ' au ' . $endDateFR . '</p>
        <p>Généré le: ' . date('d/m/Y H:i') . '</p>
    </div>
    
    <div class="kpi-grid">
        <div class="kpi-box">
            <div class="kpi-value">' . ($stats['total_blocked'] ?? 0) . '</div>
            <div class="kpi-label">Total incidents</div>
        </div>
        <div class="kpi-box">
            <div class="kpi-value">' . ($stats['still_blocked'] ?? 0) . '</div>
            <div class="kpi-label">Encore bloquées</div>
        </div>
        <div class="kpi-box">
            <div class="kpi-value">' . ($stats['resolved_count'] ?? 0) . '</div>
            <div class="kpi-label">Résolues</div>
        </div>
        <div class="kpi-box">
            <div class="kpi-value">' . ($stats['total_blocked_days'] ?? 0) . '</div>
            <div class="kpi-label">Jours-chambre perdus</div>
        </div>
    </div>
    
    <table>
        <thead>
            <tr>
                <th>Hôtel</th>
                <th>Chambre</th>
                <th>Ticket</th>
                <th>Catégorie</th>
                <th>Description</th>
                <th>Bloquée le</th>
                <th>Durée</th>
                <th>Statut</th>
            </tr>
        </thead>
        <tbody>';
    
    foreach ($rooms as $r) {
        $statusClass = $r['status'] === 'resolved' ? 'status-resolved' : 'status-blocked';
        $statusLabel = $r['status'] === 'resolved' ? 'Résolue' : 'Bloquée';
        $category = $categoryLabels[$r['category']] ?? $r['category'];
        $dateFR = date('d/m/Y', strtotime($r['created_at']));
        $description = htmlspecialchars(substr($r['description'], 0, 60));
        if (strlen($r['description']) > 60) $description .= '...';
        
        $html .= '
            <tr>
                <td>' . htmlspecialchars($r['hotel_name']) . '</td>
                <td><strong>' . htmlspecialchars($r['room_number']) . '</strong></td>
                <td>#' . $r['ticket_id'] . '</td>
                <td>' . $category . '</td>
                <td>' . $description . '</td>
                <td>' . $dateFR . '</td>
                <td>' . $r['days_blocked'] . ' j</td>
                <td class="' . $statusClass . '">' . $statusLabel . '</td>
            </tr>';
    }
    
    $html .= '
        </tbody>
    </table>
    
    <div class="footer">
        <p>ACL GESTION - Rapport généré automatiquement</p>
    </div>
</body>
</html>';
    
    // Utiliser une bibliothèque PDF si disponible, sinon retourner HTML comme PDF
    // Pour une vraie implémentation, installer dompdf ou tcpdf
    
    // Solution simple : générer un fichier HTML avec extension PDF
    // Le navigateur l'ouvrira avec le CSS print
    return $html;
}

// === ROUTING ===
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REQUEST_URI'] ?? '';
$path = strtok($path, '?');
$path = preg_replace('#^.*/api/index\.php/?#', '', $path);
$path = trim($path, '/');

$segments = $path ? explode('/', $path) : ['health'];
$endpoint = $segments[0];
$id = $segments[1] ?? null;
$action = $segments[2] ?? null;
$subId = $segments[3] ?? null;  // Pour les routes comme /tasks/1/columns/2
$subaction = $segments[4] ?? null;  // Pour les routes comme /tasks/1/tasks/2/checklist
$subSubId = $segments[5] ?? null;   // Pour les routes comme /tasks/1/tasks/2/assignees/3
$method = $_SERVER['REQUEST_METHOD'];

// === PROTECTION CSRF ===
checkCsrf();

// === ENDPOINTS ===
try {
    switch ($endpoint) {
        
        // --- HEALTH ---
        case 'health':
        case '':
            json_out(['status' => 'OK', 'time' => date('Y-m-d H:i:s')]);
        
        // --- CONTACT (public) ---
        case 'contact':
            if ($method === 'POST') {
                $data = get_input();
                
                // Validation
                if (empty($data['name']) || empty($data['firstname']) || empty($data['email']) || empty($data['company'])) {
                    json_error('Veuillez remplir tous les champs obligatoires');
                }
                
                if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
                    json_error('Email invalide');
                }
                
                // Rate limiting simple (basé sur IP)
                $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
                $rateLimitFile = sys_get_temp_dir() . '/acl_contact_' . md5($ip);
                if (file_exists($rateLimitFile)) {
                    $lastSubmit = (int)file_get_contents($rateLimitFile);
                    if (time() - $lastSubmit < 60) { // 1 minute entre chaque soumission
                        json_error('Veuillez patienter avant de soumettre une nouvelle demande');
                    }
                }
                file_put_contents($rateLimitFile, time());
                
                // Créer la table si elle n'existe pas
                try {
                    db()->execute("CREATE TABLE IF NOT EXISTS contact_requests (
                        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                        name VARCHAR(100) NOT NULL,
                        firstname VARCHAR(100) NOT NULL,
                        email VARCHAR(255) NOT NULL,
                        phone VARCHAR(50),
                        company VARCHAR(255) NOT NULL,
                        hotels_count VARCHAR(20),
                        message TEXT,
                        ip_address VARCHAR(45),
                        status ENUM('new', 'contacted', 'converted', 'rejected') DEFAULT 'new',
                        created_at DATETIME,
                        processed_at DATETIME,
                        processed_by INT UNSIGNED,
                        INDEX idx_status (status),
                        INDEX idx_created (created_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8");
                } catch (Exception $e) {}
                
                // Enregistrer la demande
                $contactId = db()->insert(
                    "INSERT INTO contact_requests (name, firstname, email, phone, company, hotels_count, message, ip_address, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                    [
                        $data['name'],
                        $data['firstname'],
                        $data['email'],
                        $data['phone'] ?? null,
                        $data['company'],
                        $data['hotels_count'] ?? null,
                        $data['message'] ?? null,
                        $ip
                    ]
                );
                
                // Préparer les données pour les emails
                $fullName = htmlspecialchars($data['firstname'] . ' ' . $data['name']);
                $company = htmlspecialchars($data['company']);
                $email = htmlspecialchars($data['email']);
                $phone = htmlspecialchars($data['phone'] ?? 'Non renseigné');
                $hotelsCount = htmlspecialchars($data['hotels_count'] ?? 'Non renseigné');
                $message = htmlspecialchars($data['message'] ?? 'Aucun message');
                $date = date('d/m/Y à H:i');
                
                // Email de notification à l'administrateur
                $adminSubject = "=?UTF-8?B?" . base64_encode("Nouvelle demande de contact - ACL GESTION") . "?=";
                $adminBody = "
<!DOCTYPE html>
<html>
<head><meta charset='UTF-8'></head>
<body style='font-family: Arial, sans-serif; line-height: 1.6; color: #333;'>
    <div style='max-width: 600px; margin: 0 auto; padding: 20px;'>
        <div style='background: linear-gradient(135deg, #1E3A5F, #0F2744); padding: 30px; border-radius: 10px 10px 0 0;'>
            <h1 style='color: white; margin: 0; font-size: 24px;'>🏨 Nouvelle demande de contact</h1>
        </div>
        <div style='background: #f8f9fa; padding: 30px; border: 1px solid #e9ecef;'>
            <h2 style='color: #1E3A5F; margin-top: 0;'>Informations du prospect</h2>
            <table style='width: 100%; border-collapse: collapse;'>
                <tr>
                    <td style='padding: 10px 0; border-bottom: 1px solid #dee2e6;'><strong>Nom complet :</strong></td>
                    <td style='padding: 10px 0; border-bottom: 1px solid #dee2e6;'>{$fullName}</td>
                </tr>
                <tr>
                    <td style='padding: 10px 0; border-bottom: 1px solid #dee2e6;'><strong>Email :</strong></td>
                    <td style='padding: 10px 0; border-bottom: 1px solid #dee2e6;'><a href='mailto:{$email}'>{$email}</a></td>
                </tr>
                <tr>
                    <td style='padding: 10px 0; border-bottom: 1px solid #dee2e6;'><strong>Téléphone :</strong></td>
                    <td style='padding: 10px 0; border-bottom: 1px solid #dee2e6;'>{$phone}</td>
                </tr>
                <tr>
                    <td style='padding: 10px 0; border-bottom: 1px solid #dee2e6;'><strong>Société :</strong></td>
                    <td style='padding: 10px 0; border-bottom: 1px solid #dee2e6;'>{$company}</td>
                </tr>
                <tr>
                    <td style='padding: 10px 0; border-bottom: 1px solid #dee2e6;'><strong>Nombre d'établissements :</strong></td>
                    <td style='padding: 10px 0; border-bottom: 1px solid #dee2e6;'>{$hotelsCount}</td>
                </tr>
            </table>
            <h3 style='color: #1E3A5F; margin-top: 25px;'>Message</h3>
            <div style='background: white; padding: 15px; border-radius: 5px; border-left: 4px solid #1E3A5F;'>
                {$message}
            </div>
            <p style='color: #6c757d; font-size: 12px; margin-top: 25px;'>
                Demande reçue le {$date} depuis l'IP {$ip}
            </p>
        </div>
        <div style='background: #1E3A5F; padding: 15px; border-radius: 0 0 10px 10px; text-align: center;'>
            <p style='color: white; margin: 0; font-size: 12px;'>ACL GESTION - Plateforme de gestion hôtelière</p>
        </div>
    </div>
</body>
</html>";
                
                $adminHeaders = "MIME-Version: 1.0\r\n";
                $adminHeaders .= "Content-Type: text/html; charset=UTF-8\r\n";
                $adminHeaders .= "From: ACL GESTION <noreply@acl-gestion.com>\r\n";
                $adminHeaders .= "Reply-To: {$data['email']}\r\n";
                
                @mail('avishka@acl-gestion.com', $adminSubject, $adminBody, $adminHeaders);
                
                // Email de confirmation au prospect
                $prospectSubject = "=?UTF-8?B?" . base64_encode("Merci pour votre demande - ACL GESTION") . "?=";
                $prospectBody = "
<!DOCTYPE html>
<html>
<head><meta charset='UTF-8'></head>
<body style='font-family: Arial, sans-serif; line-height: 1.6; color: #333;'>
    <div style='max-width: 600px; margin: 0 auto; padding: 20px;'>
        <div style='background: linear-gradient(135deg, #1E3A5F, #0F2744); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;'>
            <h1 style='color: white; margin: 0; font-size: 24px;'>🏨 ACL GESTION</h1>
            <p style='color: rgba(255,255,255,0.8); margin: 10px 0 0;'>Plateforme de gestion hôtelière</p>
        </div>
        <div style='background: #f8f9fa; padding: 30px; border: 1px solid #e9ecef;'>
            <h2 style='color: #1E3A5F; margin-top: 0;'>Bonjour {$data['firstname']},</h2>
            <p>Nous avons bien reçu votre demande d'information concernant notre solution de gestion hôtelière.</p>
            <p><strong>Merci pour l'intérêt que vous portez à ACL GESTION !</strong></p>
            <p>Notre équipe va étudier votre demande et reviendra vers vous dans les plus brefs délais pour vous proposer une démonstration personnalisée de notre plateforme.</p>
            
            <div style='background: white; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #e9ecef;'>
                <h3 style='color: #1E3A5F; margin-top: 0; font-size: 16px;'>Récapitulatif de votre demande</h3>
                <p style='margin: 5px 0;'><strong>Société :</strong> {$company}</p>
                <p style='margin: 5px 0;'><strong>Nombre d'établissements :</strong> {$hotelsCount}</p>
                <p style='margin: 5px 0;'><strong>Message :</strong> {$message}</p>
            </div>
            
            <p>En attendant, n'hésitez pas à nous contacter si vous avez des questions :</p>
            <p>📧 <a href='mailto:contact@acl-gestion.com' style='color: #1E3A5F;'>contact@acl-gestion.com</a></p>
            
            <p style='margin-top: 25px;'>À très bientôt,</p>
            <p><strong>L'équipe ACL GESTION</strong></p>
        </div>
        <div style='background: #1E3A5F; padding: 20px; border-radius: 0 0 10px 10px; text-align: center;'>
            <p style='color: rgba(255,255,255,0.7); margin: 0; font-size: 12px;'>
                Cet email a été envoyé automatiquement suite à votre demande sur acl-gestion.com<br>
                © " . date('Y') . " ACL GESTION - Tous droits réservés
            </p>
        </div>
    </div>
</body>
</html>";
                
                $prospectHeaders = "MIME-Version: 1.0\r\n";
                $prospectHeaders .= "Content-Type: text/html; charset=UTF-8\r\n";
                $prospectHeaders .= "From: ACL GESTION <noreply@acl-gestion.com>\r\n";
                
                @mail($data['email'], $prospectSubject, $prospectBody, $prospectHeaders);
                
                json_out(['success' => true, 'id' => $contactId], 201);
            }
            break;
        
        // --- AUTH ---
        case 'auth':
            if ($id === 'login' && $method === 'POST') {
                $data = get_input();
                if (empty($data['email']) || empty($data['password'])) {
                    json_error('Email et mot de passe requis');
                }

                // Rate limiting
                if (!checkRateLimit($data['email'])) {
                    json_error('Trop de tentatives de connexion. Reessayez dans ' . LOGIN_LOCKOUT_MINUTES . ' minutes.', 429);
                }

                $user = Auth::login($data['email'], $data['password']);
                if (!$user) {
                    // Enregistrer la tentative echouee
                    recordLoginAttempt($data['email']);
                    rgpdLog(null, 'login_failed', 'auth', null, "Tentative echouee pour: " . $data['email']);
                    json_error('Email ou mot de passe incorrect');
                }

                // Connexion reussie : effacer les tentatives
                clearLoginAttempts($data['email']);

                // Logger la connexion réussie
                rgpdLog($user['id'], 'login', 'auth', $user['id'], null);

                // Vérifier si le consentement RGPD a été donné
                $hasConsent = db()->queryOne(
                    "SELECT gdpr_consent FROM users WHERE id = ?",
                    [$user['id']]
                );
                $user['needs_gdpr_consent'] = !($hasConsent && $hasConsent['gdpr_consent']);

                $token = Auth::generateToken($user);
                json_out(['success' => true, 'user' => $user, 'token' => $token]);
            }
            
            if ($id === 'profile' && $method === 'GET') {
                $user = require_auth();
                json_out(['success' => true, 'user' => $user]);
            }
            
            // Mise à jour du profil
            if ($id === 'profile' && $method === 'PUT') {
                $user = require_auth();
                $data = get_input();
                
                $sets = [];
                $params = [];
                
                if (!empty($data['email'])) {
                    // Vérifier que l'email n'est pas déjà utilisé
                    $exists = db()->queryOne("SELECT id FROM users WHERE email = ? AND id != ?", [$data['email'], $user['id']]);
                    if ($exists) json_error('Cet email est déjà utilisé');
                    $sets[] = "email = ?";
                    $params[] = $data['email'];
                }
                if (isset($data['phone'])) {
                    $sets[] = "phone = ?";
                    $params[] = $data['phone'];
                }
                if (!empty($data['password'])) {
                    $pwError = validatePassword($data['password']);
                    if ($pwError) json_error($pwError);
                    $sets[] = "password = ?";
                    $params[] = password_hash($data['password'], PASSWORD_DEFAULT);
                }

                if (!empty($sets)) {
                    $sets[] = "updated_at = NOW()";
                    $params[] = $user['id'];
                    db()->execute("UPDATE users SET " . implode(', ', $sets) . " WHERE id = ?", $params);
                }

                // Retourner l'utilisateur mis à jour
                $updatedUser = db()->queryOne("SELECT id, email, first_name, last_name, phone, role, status FROM users WHERE id = ?", [$user['id']]);
                json_out(['success' => true, 'user' => $updatedUser]);
            }
            
            // Informations de gestion (rôles assignables, hôtels gérables)
            if ($id === 'management-info' && $method === 'GET') {
                $user = require_auth();
                
                $assignableRoles = getAssignableRoles($user);
                $manageableHotels = getManageableHotels($user);
                
                // Récupérer les infos des hôtels gérables
                $hotels = [];
                if (!empty($manageableHotels)) {
                    $placeholders = implode(',', array_fill(0, count($manageableHotels), '?'));
                    $hotels = db()->query(
                        "SELECT id, name FROM hotels WHERE id IN ($placeholders) ORDER BY name",
                        $manageableHotels
                    );
                }
                
                json_out([
                    'success' => true,
                    'assignable_roles' => $assignableRoles,
                    'manageable_hotels' => $hotels,
                    'can_manage_users' => !empty($assignableRoles)
                ]);
            }
            break;
        
        // --- NOTIFICATIONS ---
        case 'notifications':
            // Liste des notifications - GET /notifications
            if ($method === 'GET' && !$id) {
                $user = require_auth();
                try {
                    $query = "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC";
                    $params = [$user['id']];
                    $countQuery = "SELECT COUNT(*) FROM notifications WHERE user_id = ?";
                    $result = paginate($query, $params, $countQuery, $params);
                    $unreadCount = db()->count("SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0", [$user['id']]);
                } catch (Exception $e) {
                    $result = ['data' => [], 'pagination' => ['page' => 1, 'per_page' => 25, 'total' => 0, 'total_pages' => 0, 'has_next' => false, 'has_prev' => false]];
                    $unreadCount = 0;
                }
                json_out(['success' => true, 'notifications' => $result['data'], 'pagination' => $result['pagination'], 'unread_count' => $unreadCount]);
            }
            
            // Marquer une notification comme lue - PUT /notifications/{id}/read
            if ($method === 'PUT' && $id && is_numeric($id) && $action === 'read') {
                $user = require_auth();
                db()->execute("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?", [$id, $user['id']]);
                json_out(['success' => true]);
            }
            
            // Marquer toutes comme lues - PUT /notifications/read-all
            if ($method === 'PUT' && $id === 'read-all') {
                $user = require_auth();
                db()->execute("UPDATE notifications SET is_read = 1 WHERE user_id = ?", [$user['id']]);
                json_out(['success' => true]);
            }
            
            // Supprimer une notification - DELETE /notifications/{id}
            if ($method === 'DELETE' && $id && is_numeric($id)) {
                $user = require_auth();
                db()->execute("DELETE FROM notifications WHERE id = ? AND user_id = ?", [$id, $user['id']]);
                json_out(['success' => true]);
            }
            
            // Supprimer toutes les notifications - DELETE /notifications/all
            if ($method === 'DELETE' && $id === 'all') {
                $user = require_auth();
                db()->execute("DELETE FROM notifications WHERE user_id = ?", [$user['id']]);
                json_out(['success' => true]);
            }

            // --- POLLING: GET /notifications/poll?since=<timestamp> ---
            if ($method === 'GET' && $id === 'poll') {
                $user = require_auth();
                $since = $_GET['since'] ?? date('Y-m-d H:i:s', time() - 30);
                $maxWait = 25;
                $start = time();
                $unreadNotifs = 0;

                while (time() - $start < $maxWait) {
                    $newNotifs = db()->query(
                        "SELECT * FROM notifications WHERE user_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 20",
                        [$user['id'], $since]
                    );
                    $newMessages = db()->count(
                        "SELECT COUNT(*) FROM conversation_messages cm
                         JOIN conversations c ON cm.conversation_id = c.id
                         WHERE (c.user1_id = ? OR c.user2_id = ?) AND cm.sender_id != ? AND cm.is_read = 0 AND cm.created_at > ?",
                        [$user['id'], $user['id'], $user['id'], $since]
                    );
                    $unreadNotifs = db()->count(
                        "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0",
                        [$user['id']]
                    );

                    if (count($newNotifs) > 0 || $newMessages > 0) {
                        json_out([
                            'success' => true,
                            'has_updates' => true,
                            'notifications' => $newNotifs,
                            'unread_notifications' => (int)$unreadNotifs,
                            'unread_messages' => (int)$newMessages,
                            'timestamp' => date('Y-m-d H:i:s')
                        ]);
                    }
                    sleep(2);
                }

                json_out([
                    'success' => true,
                    'has_updates' => false,
                    'unread_notifications' => (int)$unreadNotifs,
                    'unread_messages' => 0,
                    'timestamp' => date('Y-m-d H:i:s')
                ]);
            }

            // ======== ADMIN: Historique des campagnes ========
            // GET /notifications/admin/history
            if ($method === 'GET' && $id === 'admin' && $action === 'history') {
                $user = require_auth();
                if (!in_array($user['role'], ['admin', 'groupe_manager', 'hotel_manager'])) json_error('Accès refusé', 403);

                try {
                    $campaigns = db()->query(
                        "SELECT nc.*, u.first_name, u.last_name,
                                CONCAT(u.first_name, ' ', u.last_name) as sender_name
                         FROM notification_campaigns nc
                         LEFT JOIN users u ON nc.sent_by = u.id
                         ORDER BY nc.created_at DESC
                         LIMIT 100"
                    );

                    $totalSent = db()->count("SELECT COUNT(*) FROM notification_campaigns");
                    $sentToday = db()->count("SELECT COUNT(*) FROM notification_campaigns WHERE DATE(created_at) = CURDATE()");
                    $sentWeek = db()->count("SELECT COUNT(*) FROM notification_campaigns WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)");
                } catch (Exception $e) {
                    $campaigns = [];
                    $totalSent = 0;
                    $sentToday = 0;
                    $sentWeek = 0;
                }

                json_out([
                    'success' => true,
                    'campaigns' => $campaigns,
                    'total_sent' => (int)$totalSent,
                    'sent_today' => (int)$sentToday,
                    'sent_week' => (int)$sentWeek
                ]);
            }

            // ======== ADMIN: Envoyer une notification ========
            // POST /notifications/admin/send
            if ($method === 'POST' && $id === 'admin' && $action === 'send') {
                $user = require_auth();
                if (!in_array($user['role'], ['admin', 'groupe_manager', 'hotel_manager'])) json_error('Accès refusé', 403);

                $data = get_input();
                if (empty($data['title'])) json_error('Titre requis');

                $targetType = $data['target_type'] ?? 'all';
                $title = $data['title'];
                $message = $data['message'] ?? '';
                $type = $data['type'] ?? 'info';
                if (!in_array($type, ['info', 'warning', 'danger', 'success'])) $type = 'info';

                // Déterminer les destinataires
                $userIds = [];
                $targetDetail = '';

                if ($targetType === 'all') {
                    $allUsers = db()->query("SELECT id FROM users WHERE status = 'active'");
                    $userIds = array_column($allUsers, 'id');
                    $targetDetail = 'Tous';
                } elseif ($targetType === 'hotel') {
                    $hotelIds = $data['hotel_ids'] ?? [];
                    if (empty($hotelIds)) json_error('Sélectionnez au moins un hôtel');
                    $placeholders = implode(',', array_fill(0, count($hotelIds), '?'));
                    $hotelUsers = db()->query(
                        "SELECT DISTINCT u.id FROM users u
                         JOIN user_hotels uh ON u.id = uh.user_id
                         WHERE uh.hotel_id IN ($placeholders) AND u.status = 'active'",
                        $hotelIds
                    );
                    $userIds = array_column($hotelUsers, 'id');
                    $hotelNames = db()->query("SELECT name FROM hotels WHERE id IN ($placeholders)", $hotelIds);
                    $targetDetail = implode(', ', array_column($hotelNames, 'name'));
                } elseif ($targetType === 'role') {
                    $roles = $data['roles'] ?? [];
                    if (empty($roles)) json_error('Sélectionnez au moins un rôle');
                    $placeholders = implode(',', array_fill(0, count($roles), '?'));
                    $roleUsers = db()->query("SELECT id FROM users WHERE role IN ($placeholders) AND status = 'active'", $roles);
                    $userIds = array_column($roleUsers, 'id');
                    $targetDetail = implode(', ', $roles);
                } elseif ($targetType === 'users') {
                    $userIds = array_map('intval', $data['user_ids'] ?? []);
                    if (empty($userIds)) json_error('Sélectionnez au moins un utilisateur');
                    $targetDetail = count($userIds) . ' utilisateur(s)';
                }

                if (empty($userIds)) json_error('Aucun destinataire trouvé');

                // Créer les notifications pour chaque utilisateur
                $count = 0;
                foreach ($userIds as $uid) {
                    try {
                        db()->insert(
                            "INSERT INTO notifications (user_id, type, title, message, is_read, created_at) VALUES (?, ?, ?, ?, 0, NOW())",
                            [$uid, $type, $title, $message]
                        );
                        $count++;
                    } catch (Exception $e) {}
                }

                // Sauvegarder la campagne dans l'historique
                try {
                    db()->insert(
                        "INSERT INTO notification_campaigns (sent_by, title, message, type, target_type, target_detail, recipients_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
                        [$user['id'], $title, $message, $type, $targetType, $targetDetail, $count]
                    );
                } catch (Exception $e) {}

                json_out(['success' => true, 'recipients_count' => $count]);
            }

            // ======== ADMIN: Renvoyer une campagne ========
            // POST /notifications/admin/resend/{id}
            if ($method === 'POST' && $id === 'admin' && $action === 'resend' && $subaction) {
                $user = require_auth();
                if (!in_array($user['role'], ['admin', 'groupe_manager', 'hotel_manager'])) json_error('Accès refusé', 403);

                $campaign = db()->queryOne("SELECT * FROM notification_campaigns WHERE id = ?", [$subaction]);
                if (!$campaign) json_error('Campagne introuvable', 404);

                // Re-déterminer les destinataires
                $userIds = [];
                $targetType = $campaign['target_type'];

                if ($targetType === 'all') {
                    $allUsers = db()->query("SELECT id FROM users WHERE status = 'active'");
                    $userIds = array_column($allUsers, 'id');
                } elseif ($targetType === 'hotel') {
                    // On renvoie à tous les utilisateurs de tous les hôtels gérables
                    $allUsers = db()->query("SELECT id FROM users WHERE status = 'active'");
                    $userIds = array_column($allUsers, 'id');
                } elseif ($targetType === 'role') {
                    $roles = explode(', ', $campaign['target_detail']);
                    if (!empty($roles)) {
                        $placeholders = implode(',', array_fill(0, count($roles), '?'));
                        $roleUsers = db()->query("SELECT id FROM users WHERE role IN ($placeholders) AND status = 'active'", $roles);
                        $userIds = array_column($roleUsers, 'id');
                    }
                } else {
                    $allUsers = db()->query("SELECT id FROM users WHERE status = 'active'");
                    $userIds = array_column($allUsers, 'id');
                }

                $count = 0;
                foreach ($userIds as $uid) {
                    try {
                        db()->insert(
                            "INSERT INTO notifications (user_id, type, title, message, is_read, created_at) VALUES (?, ?, ?, ?, 0, NOW())",
                            [$uid, $campaign['type'], $campaign['title'], $campaign['message']]
                        );
                        $count++;
                    } catch (Exception $e) {}
                }

                json_out(['success' => true, 'recipients_count' => $count]);
            }

            // ======== ADMIN: Supprimer une campagne ========
            // DELETE /notifications/admin/campaigns/{id}
            if ($method === 'DELETE' && $id === 'admin' && $action === 'campaigns' && $subaction) {
                $user = require_auth();
                if (!in_array($user['role'], ['admin', 'groupe_manager', 'hotel_manager'])) json_error('Accès refusé', 403);

                db()->execute("DELETE FROM notification_campaigns WHERE id = ?", [$subaction]);
                json_out(['success' => true]);
            }

            break;

        // --- MODULES CONFIG ---
        case 'modules':
            // Récupérer la config des modules - GET /modules
            if ($method === 'GET' && !$id) {
                require_auth();
                $modules = new stdClass(); // Objet vide par défaut
                
                try {
                    // Essayer de créer la table si elle n'existe pas
                    db()->execute("CREATE TABLE IF NOT EXISTS system_config (
                        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                        config_key VARCHAR(100) UNIQUE NOT NULL,
                        config_value TEXT,
                        created_at DATETIME,
                        updated_at DATETIME
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8");
                    
                    $config = db()->queryOne("SELECT config_value FROM system_config WHERE config_key = 'modules'");
                    if ($config && !empty($config['config_value'])) {
                        $decoded = json_decode($config['config_value']);
                        if ($decoded !== null) {
                            $modules = $decoded;
                        }
                    }
                } catch (Exception $e) {
                    // Log error for debugging
                    error_log("Modules GET error: " . $e->getMessage());
                }
                json_out(['success' => true, 'modules' => $modules]);
            }
            
            // Sauvegarder la config des modules - PUT /modules
            if ($method === 'PUT' && !$id) {
                $user = require_auth();
                if ($user['role'] !== 'admin') {
                    json_error('Accès refusé', 403);
                }
                
                // Utiliser get_input() qui cache l'input
                $data = get_input();
                error_log("Modules PUT data: " . print_r($data, true));
                
                if (empty($data) || !is_array($data)) {
                    json_error('Données invalides');
                }
                
                // Encoder en JSON
                $modulesJson = json_encode($data, JSON_FORCE_OBJECT);
                error_log("Modules JSON to save: " . $modulesJson);
                
                try {
                    // Créer la table si elle n'existe pas
                    db()->execute("CREATE TABLE IF NOT EXISTS system_config (
                        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                        config_key VARCHAR(100) UNIQUE NOT NULL,
                        config_value TEXT,
                        created_at DATETIME,
                        updated_at DATETIME
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8");
                    
                    // Utiliser INSERT ON DUPLICATE KEY UPDATE
                    db()->execute(
                        "INSERT INTO system_config (config_key, config_value, created_at, updated_at) 
                         VALUES ('modules', ?, NOW(), NOW())
                         ON DUPLICATE KEY UPDATE config_value = ?, updated_at = NOW()",
                        [$modulesJson, $modulesJson]
                    );
                    
                    error_log("Modules saved successfully");
                    
                } catch (Exception $e) {
                    error_log("Modules PUT error: " . $e->getMessage());
                    json_error('Erreur sauvegarde: ' . $e->getMessage());
                }
                
                json_out(['success' => true, 'saved' => $data]);
            }
            
            break;
        
        // --- DASHBOARD ---
        case 'dashboard':
            if ($id === 'stats') {
                $user = require_auth();
                $today = date('Y-m-d');
                
                // Admin voit tout, les autres voient seulement leurs hôtels
                if ($user['role'] === 'admin') {
                    $hotelIds = [];
                    $hotelFilter = "";
                    $hotelFilterWhere = "1=1";
                } else {
                    // Récupérer les hôtels assignés à l'utilisateur
                    $userHotels = db()->query("SELECT hotel_id FROM user_hotels WHERE user_id = ?", [$user['id']]);
                    $hotelIds = array_column($userHotels, 'hotel_id');
                    
                    if (empty($hotelIds)) {
                        json_out(['success' => true, 'stats' => [
                            'hotels' => 0, 'rooms' => 0,
                            'maintenance_open' => 0, 'maintenance_critical' => 0,
                            'leaves_pending' => 0, 'leaves_approved_month' => 0,
                            'dispatch_today' => 0, 'dispatch_done' => 0,
                            'tasks_pending' => 0, 'tasks_overdue' => 0,
                            'evaluations_month' => 0,
                            'linen_pending' => 0,
                            'messages_unread' => 0
                        ], 'recent' => []]);
                    }
                    
                    $placeholders = implode(',', array_fill(0, count($hotelIds), '?'));
                    $hotelFilter = " AND hotel_id IN ($placeholders)";
                    $hotelFilterWhere = "hotel_id IN ($placeholders)";
                }
                
                // Stats générales - avec try-catch pour chaque requête
                $stats = [];
                
                // Hôtels & Chambres
                try {
                    $stats['hotels'] = db()->count(
                        "SELECT COUNT(*) FROM hotels WHERE status = 'active'" . ($hotelIds ? " AND id IN (" . implode(',', array_fill(0, count($hotelIds), '?')) . ")" : ""),
                        $hotelIds
                    );
                } catch (Exception $e) { $stats['hotels'] = 0; }
                
                try {
                    $stats['rooms'] = db()->count(
                        "SELECT COUNT(*) FROM rooms WHERE 1=1" . ($hotelIds ? " AND hotel_id IN (" . implode(',', array_fill(0, count($hotelIds), '?')) . ")" : ""),
                        $hotelIds
                    );
                } catch (Exception $e) { $stats['rooms'] = 0; }
                
                // Maintenance
                try {
                    $stats['maintenance_open'] = db()->count(
                        "SELECT COUNT(*) FROM maintenance_tickets WHERE status IN ('open','in_progress')" . $hotelFilter,
                        $hotelIds
                    );
                } catch (Exception $e) { $stats['maintenance_open'] = 0; }
                
                try {
                    $stats['maintenance_critical'] = db()->count(
                        "SELECT COUNT(*) FROM maintenance_tickets WHERE priority = 'critical' AND status != 'resolved'" . $hotelFilter,
                        $hotelIds
                    );
                } catch (Exception $e) { $stats['maintenance_critical'] = 0; }
                
                // Congés
                try {
                    $stats['leaves_pending'] = db()->count("SELECT COUNT(*) FROM leave_requests WHERE status = 'pending'" . $hotelFilter, $hotelIds);
                } catch (Exception $e) { $stats['leaves_pending'] = 0; }
                
                try {
                    $stats['leaves_approved_month'] = db()->count(
                        "SELECT COUNT(*) FROM leave_requests WHERE status = 'approved' AND MONTH(start_date) = MONTH(CURDATE()) AND YEAR(start_date) = YEAR(CURDATE())" . $hotelFilter,
                        $hotelIds
                    );
                } catch (Exception $e) { $stats['leaves_approved_month'] = 0; }
                
                // Dispatch Gouvernante
                try {
                    $stats['dispatch_today'] = db()->count(
                        "SELECT COUNT(*) FROM room_dispatch d JOIN rooms r ON d.room_id = r.id WHERE d.dispatch_date = CURDATE()" . ($hotelIds ? " AND r.hotel_id IN (" . implode(',', array_fill(0, count($hotelIds), '?')) . ")" : ""),
                        $hotelIds
                    );
                } catch (Exception $e) { $stats['dispatch_today'] = 0; }
                
                try {
                    $stats['dispatch_done'] = db()->count(
                        "SELECT COUNT(*) FROM room_dispatch d JOIN rooms r ON d.room_id = r.id WHERE d.dispatch_date = CURDATE() AND d.status IN ('completed','controlled')" . ($hotelIds ? " AND r.hotel_id IN (" . implode(',', array_fill(0, count($hotelIds), '?')) . ")" : ""),
                        $hotelIds
                    );
                } catch (Exception $e) { $stats['dispatch_done'] = 0; }
                
                // Tâches
                try {
                    $stats['tasks_pending'] = db()->count(
                        "SELECT COUNT(*) FROM tasks WHERE is_completed = 0" . 
                        ($user['role'] !== 'admin' ? " AND (assigned_to = ? OR created_by = ?)" : ""),
                        $user['role'] !== 'admin' ? [$user['id'], $user['id']] : []
                    );
                } catch (Exception $e) { $stats['tasks_pending'] = 0; }
                
                try {
                    $stats['tasks_overdue'] = db()->count(
                        "SELECT COUNT(*) FROM tasks WHERE is_completed = 0 AND due_date IS NOT NULL AND due_date < CURDATE()" .
                        ($user['role'] !== 'admin' ? " AND (assigned_to = ? OR created_by = ?)" : ""),
                        $user['role'] !== 'admin' ? [$user['id'], $user['id']] : []
                    );
                } catch (Exception $e) { $stats['tasks_overdue'] = 0; }
                
                // Évaluations
                try {
                    $stats['evaluations_month'] = db()->count(
                        "SELECT COUNT(*) FROM evaluations WHERE MONTH(evaluation_date) = MONTH(CURDATE()) AND YEAR(evaluation_date) = YEAR(CURDATE())" . $hotelFilter,
                        $hotelIds
                    );
                } catch (Exception $e) { $stats['evaluations_month'] = 0; }
                
                // Blanchisserie
                try {
                    $stats['linen_pending'] = db()->count(
                        "SELECT COUNT(*) FROM linen_transactions WHERE transaction_type = 'collecte' AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)" . $hotelFilter,
                        $hotelIds
                    );
                } catch (Exception $e) { $stats['linen_pending'] = 0; }
                
                // Messages non lus
                try {
                    $stats['messages_unread'] = db()->count(
                        "SELECT COUNT(*) FROM messages WHERE recipient_id = ? AND is_read = 0",
                        [$user['id']]
                    );
                } catch (Exception $e) { $stats['messages_unread'] = 0; }
                
                // Clôtures en attente
                try {
                    $stats['closures_pending'] = db()->count(
                        "SELECT COUNT(DISTINCT h.id) FROM hotels h 
                         WHERE h.status = 'active' 
                         AND NOT EXISTS (
                             SELECT 1 FROM daily_closures dc 
                             WHERE dc.hotel_id = h.id 
                             AND dc.closure_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
                             AND dc.status IN ('submitted', 'validated')
                         )" . ($hotelIds ? " AND h.id IN (" . implode(',', array_fill(0, count($hotelIds), '?')) . ")" : ""),
                        $hotelIds
                    );
                } catch (Exception $e) { $stats['closures_pending'] = 0; }
                
                // Clôtures en retard
                try {
                    $stats['closures_late'] = db()->count(
                        "SELECT COUNT(DISTINCT h.id) FROM hotels h 
                         WHERE h.status = 'active' 
                         AND NOT EXISTS (
                             SELECT 1 FROM daily_closures dc 
                             WHERE dc.hotel_id = h.id 
                             AND dc.closure_date = DATE_SUB(CURDATE(), INTERVAL 2 DAY)
                             AND dc.status IN ('submitted', 'validated')
                         )" . ($hotelIds ? " AND h.id IN (" . implode(',', array_fill(0, count($hotelIds), '?')) . ")" : ""),
                        $hotelIds
                    );
                } catch (Exception $e) { $stats['closures_late'] = 0; }
                
                // Solde caisse
                try {
                    $balance = db()->queryOne(
                        "SELECT SUM(cash_received) - SUM(COALESCE(remise_banque, 0) + COALESCE(achats, 0) + COALESCE(autres_depenses, 0)) as total
                         FROM daily_closures WHERE status IN ('submitted', 'validated')" . $hotelFilter,
                        $hotelIds
                    );
                    $stats['cash_balance'] = $balance ? floatval($balance['total']) : 0;
                } catch (Exception $e) { $stats['cash_balance'] = 0; }
                
                // Audits
                try {
                    $stats['audits_month'] = db()->count(
                        "SELECT COUNT(*) FROM audits WHERE MONTH(completed_at) = MONTH(CURDATE()) AND YEAR(completed_at) = YEAR(CURDATE()) AND status = 'completed'" . $hotelFilter,
                        $hotelIds
                    );
                } catch (Exception $e) { $stats['audits_month'] = 0; }
                
                try {
                    $avg = db()->queryOne(
                        "SELECT AVG(score_percentage) as avg_score FROM audits 
                         WHERE status = 'completed' AND MONTH(completed_at) = MONTH(CURDATE()) AND YEAR(completed_at) = YEAR(CURDATE())" . $hotelFilter,
                        $hotelIds
                    );
                    $stats['audits_avg_score'] = $avg ? floatval($avg['avg_score']) : null;
                } catch (Exception $e) { $stats['audits_avg_score'] = null; }
                
                // RGPD (admin only)
                $stats['rgpd_pending'] = 0;
                $stats['rgpd_completed'] = 0;
                $stats['users_with_consent'] = 0;
                
                if ($user['role'] === 'admin') {
                    try {
                        $stats['rgpd_pending'] = db()->count("SELECT COUNT(*) FROM gdpr_requests WHERE status = 'pending'");
                    } catch (Exception $e) {}
                    
                    try {
                        $stats['rgpd_completed'] = db()->count("SELECT COUNT(*) FROM gdpr_requests WHERE status = 'completed' AND MONTH(processed_at) = MONTH(CURDATE())");
                    } catch (Exception $e) {}
                    
                    try {
                        $total = db()->count("SELECT COUNT(*) FROM users WHERE status = 'active'");
                        $consented = db()->count("SELECT COUNT(*) FROM users WHERE status = 'active' AND gdpr_consent = 1");
                        $stats['users_with_consent'] = $total > 0 ? round(($consented / $total) * 100) : 0;
                    } catch (Exception $e) {}
                }
                
                // Récupérer les données récentes pour chaque module
                $recent = [];
                
                // Derniers tickets maintenance
                try {
                    $recent['maintenance'] = db()->query(
                        "SELECT t.*, h.name as hotel_name FROM maintenance_tickets t 
                         LEFT JOIN hotels h ON t.hotel_id = h.id 
                         WHERE 1=1" . $hotelFilter . " 
                         ORDER BY t.created_at DESC LIMIT 5",
                        $hotelIds
                    );
                } catch (Exception $e) { $recent['maintenance'] = []; }
                
                // Dernières demandes de congés
                try {
                    $recent['leaves'] = db()->query(
                        "SELECT lr.*, CONCAT(u.first_name, ' ', u.last_name) as employee_name 
                         FROM leave_requests lr 
                         JOIN users u ON lr.employee_id = u.id 
                         ORDER BY lr.created_at DESC LIMIT 5"
                    );
                } catch (Exception $e) { $recent['leaves'] = []; }
                
                // Tâches récentes
                try {
                    $recent['tasks'] = db()->query(
                        "SELECT t.*, b.name as board_name, c.name as column_name,
                                CONCAT(u.first_name, ' ', u.last_name) as assigned_name
                         FROM tasks t 
                         LEFT JOIN task_boards b ON t.board_id = b.id 
                         LEFT JOIN task_columns c ON t.column_id = c.id
                         LEFT JOIN users u ON t.assigned_to = u.id 
                         WHERE t.is_completed = 0" .
                         ($user['role'] !== 'admin' ? " AND (t.assigned_to = ? OR t.created_by = ?)" : "") .
                        " ORDER BY t.due_date ASC, t.created_at DESC LIMIT 5",
                        $user['role'] !== 'admin' ? [$user['id'], $user['id']] : []
                    );
                } catch (Exception $e) { $recent['tasks'] = []; }
                
                // Dernières évaluations
                try {
                    $recent['evaluations'] = db()->query(
                        "SELECT e.*, g.name as grid_name,
                                CONCAT(emp.first_name, ' ', emp.last_name) as employee_name,
                                CONCAT(ev.first_name, ' ', ev.last_name) as evaluator_name
                         FROM evaluations e
                         LEFT JOIN evaluation_grids g ON e.grid_id = g.id
                         LEFT JOIN users emp ON e.evaluated_user_id = emp.id
                         LEFT JOIN users ev ON e.evaluator_id = ev.id
                         ORDER BY e.evaluation_date DESC LIMIT 5"
                    );
                } catch (Exception $e) { $recent['evaluations'] = []; }
                
                // Dispatch du jour
                try {
                    $recent['dispatch'] = db()->query(
                        "SELECT d.*, r.room_number, r.floor, h.name as hotel_name,
                                CONCAT(u.first_name, ' ', u.last_name) as assigned_name
                         FROM room_dispatch d
                         JOIN rooms r ON d.room_id = r.id
                         JOIN hotels h ON r.hotel_id = h.id
                         LEFT JOIN users u ON d.assigned_to = u.id
                         WHERE d.dispatch_date = CURDATE()" . 
                         ($hotelIds ? " AND r.hotel_id IN (" . implode(',', array_fill(0, count($hotelIds), '?')) . ")" : "") .
                        " ORDER BY d.status ASC, r.floor, r.room_number LIMIT 10",
                        $hotelIds
                    );
                } catch (Exception $e) { $recent['dispatch'] = []; }
                
                // Dernières transactions blanchisserie
                try {
                    $recent['linen'] = db()->query(
                        "SELECT lt.*, h.name as hotel_name,
                                CONCAT(u.first_name, ' ', u.last_name) as created_by_name
                         FROM linen_transactions lt
                         JOIN hotels h ON lt.hotel_id = h.id
                         LEFT JOIN users u ON lt.created_by = u.id
                         WHERE 1=1" . $hotelFilter .
                        " ORDER BY lt.transaction_date DESC, lt.id DESC LIMIT 5",
                        $hotelIds
                    );
                } catch (Exception $e) { $recent['linen'] = []; }
                
                // Hôtels de l'utilisateur
                try {
                    if ($user['role'] === 'admin') {
                        $recent['hotels'] = db()->query(
                            "SELECT h.*, (SELECT COUNT(*) FROM rooms WHERE hotel_id = h.id) as room_count 
                             FROM hotels h WHERE h.status = 'active' ORDER BY h.name LIMIT 5"
                        );
                    } else {
                        $recent['hotels'] = db()->query(
                            "SELECT h.*, (SELECT COUNT(*) FROM rooms WHERE hotel_id = h.id) as room_count 
                             FROM hotels h 
                             JOIN user_hotels uh ON h.id = uh.hotel_id 
                             WHERE uh.user_id = ? AND h.status = 'active'
                             ORDER BY h.name LIMIT 5",
                            [$user['id']]
                        );
                    }
                } catch (Exception $e) { $recent['hotels'] = []; }
                
                // Dernières clôtures journalières
                try {
                    $recent['closures'] = db()->query(
                        "SELECT dc.*, h.name as hotel_name 
                         FROM daily_closures dc
                         JOIN hotels h ON dc.hotel_id = h.id
                         WHERE 1=1" . $hotelFilter .
                        " ORDER BY dc.closure_date DESC LIMIT 5",
                        $hotelIds
                    );
                } catch (Exception $e) { $recent['closures'] = []; }
                
                // Derniers audits
                try {
                    $recent['audits'] = db()->query(
                        "SELECT a.*, h.name as hotel_name, ag.name as grid_name
                         FROM audits a
                         JOIN hotels h ON a.hotel_id = h.id
                         LEFT JOIN audit_grids ag ON a.grid_id = ag.id
                         WHERE 1=1" . $hotelFilter .
                        " ORDER BY a.completed_at DESC, a.created_at DESC LIMIT 5",
                        $hotelIds
                    );
                } catch (Exception $e) { $recent['audits'] = []; }
                
                json_out(['success' => true, 'stats' => $stats, 'recent' => $recent]);
            }
            break;
        
        // --- HOTELS ---
        case 'hotels':
            if ($method === 'GET' && !$id) {
                $user = require_auth();
                
                // Admin voit tous les hôtels, les autres voient seulement leurs hôtels assignés
                if ($user['role'] === 'admin') {
                    $hotels = db()->query("SELECT h.*, (SELECT COUNT(*) FROM rooms WHERE hotel_id = h.id) as room_count FROM hotels h ORDER BY h.name");
                } else {
                    $hotels = db()->query(
                        "SELECT h.*, (SELECT COUNT(*) FROM rooms WHERE hotel_id = h.id) as room_count 
                         FROM hotels h 
                         JOIN user_hotels uh ON h.id = uh.hotel_id 
                         WHERE uh.user_id = ? 
                         ORDER BY h.name",
                        [$user['id']]
                    );
                }
                json_out(['success' => true, 'hotels' => $hotels]);
            }
            
            // GET /hotels/{id}/rooms - Liste des chambres d'un hôtel (doit être avant GET /hotels/{id})
            if ($method === 'GET' && $id && is_numeric($id) && $action === 'rooms') {
                $user = require_auth();
                
                // Vérifier accès à cet hôtel (sauf admin)
                if ($user['role'] !== 'admin') {
                    $hasAccess = db()->count("SELECT COUNT(*) FROM user_hotels WHERE user_id = ? AND hotel_id = ?", [$user['id'], $id]);
                    if (!$hasAccess) json_error('Accès non autorisé à cet hôtel', 403);
                }
                
                $rooms = db()->query("SELECT * FROM rooms WHERE hotel_id = ? ORDER BY floor, room_number", [$id]);
                json_out(['success' => true, 'rooms' => $rooms]);
            }
            
            // GET /hotels/{id} - Détail d'un hôtel
            if ($method === 'GET' && $id && is_numeric($id) && !$action) {
                $user = require_auth();
                
                // Vérifier accès à cet hôtel (sauf admin)
                if ($user['role'] !== 'admin') {
                    $hasAccess = db()->count("SELECT COUNT(*) FROM user_hotels WHERE user_id = ? AND hotel_id = ?", [$user['id'], $id]);
                    if (!$hasAccess) json_error('Accès non autorisé à cet hôtel', 403);
                }
                
                $hotel = db()->queryOne("SELECT * FROM hotels WHERE id = ?", [$id]);
                if (!$hotel) json_error('Hôtel non trouvé', 404);
                $hotel['rooms'] = db()->query("SELECT * FROM rooms WHERE hotel_id = ? ORDER BY floor, room_number", [$id]);
                json_out(['success' => true, 'hotel' => $hotel]);
            }
            
            if ($method === 'POST' && !$id) {
                $user = require_auth();
                if (!hasPermission($user['role'], 'hotels.create')) json_error('Permission refusée', 403);
                
                $data = get_input();
                if (empty($data['name'])) json_error('Nom requis');
                
                // Générer un slug unique pour la réservation en ligne
                $slug = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', $data['name']));
                $slug = trim($slug, '-');
                $slugBase = $slug;
                $i = 1;
                while (db()->count("SELECT COUNT(*) FROM hotels WHERE booking_slug = ?", [$slug]) > 0) {
                    $slug = $slugBase . '-' . $i++;
                }

                $id = db()->insert(
                    "INSERT INTO hotels (name, address, city, postal_code, phone, email, stars, total_floors, checkin_time, checkout_time, category, pms_type, pms_ip, pms_port, pms_api_key, pms_username, pms_password, stripe_public_key, stripe_secret_key, stripe_webhook_secret, booking_enabled, booking_slug, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                    [
                        $data['name'],
                        $data['address'] ?? '',
                        $data['city'] ?? '',
                        $data['postal_code'] ?? '',
                        $data['phone'] ?? '',
                        $data['email'] ?? '',
                        $data['stars'] ?? 3,
                        $data['total_floors'] ?? 1,
                        $data['checkin_time'] ?? '15:00:00',
                        $data['checkout_time'] ?? '11:00:00',
                        $data['category'] ?? null,
                        $data['pms_type'] ?? null,
                        $data['pms_ip'] ?? null,
                        !empty($data['pms_port']) ? (int)$data['pms_port'] : null,
                        $data['pms_api_key'] ?? null,
                        $data['pms_username'] ?? null,
                        $data['pms_password'] ?? null,
                        $data['stripe_public_key'] ?? null,
                        $data['stripe_secret_key'] ?? null,
                        $data['stripe_webhook_secret'] ?? null,
                        !empty($data['booking_enabled']) ? 1 : 0,
                        $slug
                    ]
                );
                json_out(['success' => true, 'id' => $id], 201);
            }
            
            if ($method === 'PUT' && $id && is_numeric($id) && !$action) {
                $user = require_auth();
                if (!hasPermission($user['role'], 'hotels.edit')) json_error('Permission refusée', 403);
                
                $data = get_input();
                $hotel = db()->queryOne("SELECT * FROM hotels WHERE id = ?", [$id]);
                if (!$hotel) json_error('Hôtel non trouvé', 404);
                
                $sets = [];
                $params = [];
                
                if (isset($data['name'])) { $sets[] = "name = ?"; $params[] = $data['name']; }
                if (isset($data['address'])) { $sets[] = "address = ?"; $params[] = $data['address']; }
                if (isset($data['city'])) { $sets[] = "city = ?"; $params[] = $data['city']; }
                if (isset($data['postal_code'])) { $sets[] = "postal_code = ?"; $params[] = $data['postal_code']; }
                if (isset($data['phone'])) { $sets[] = "phone = ?"; $params[] = $data['phone']; }
                if (isset($data['on_call_phone'])) { $sets[] = "on_call_phone = ?"; $params[] = $data['on_call_phone'] ?: null; }
                if (isset($data['email'])) { $sets[] = "email = ?"; $params[] = $data['email']; }
                if (isset($data['stars'])) { $sets[] = "stars = ?"; $params[] = $data['stars']; }
                if (isset($data['total_floors'])) { $sets[] = "total_floors = ?"; $params[] = $data['total_floors']; }
                if (isset($data['checkin_time'])) { $sets[] = "checkin_time = ?"; $params[] = $data['checkin_time']; }
                if (isset($data['checkout_time'])) { $sets[] = "checkout_time = ?"; $params[] = $data['checkout_time']; }
                if (isset($data['status'])) { $sets[] = "status = ?"; $params[] = $data['status']; }
                if (isset($data['category'])) { $sets[] = "category = ?"; $params[] = $data['category'] ?: null; }

                // Xotelo hotel key
                if (isset($data['xotelo_hotel_key'])) {
                    $sets[] = "xotelo_hotel_key = ?";
                    $params[] = $data['xotelo_hotel_key'];
                }

                // PMS fields
                if (isset($data['pms_type'])) { $sets[] = "pms_type = ?"; $params[] = $data['pms_type'] ?: null; }
                if (isset($data['pms_ip'])) { $sets[] = "pms_ip = ?"; $params[] = $data['pms_ip'] ?: null; }
                if (isset($data['pms_port'])) { $sets[] = "pms_port = ?"; $params[] = !empty($data['pms_port']) ? (int)$data['pms_port'] : null; }
                if (isset($data['pms_api_key'])) { $sets[] = "pms_api_key = ?"; $params[] = $data['pms_api_key'] ?: null; }
                if (isset($data['pms_username'])) { $sets[] = "pms_username = ?"; $params[] = $data['pms_username'] ?: null; }
                if (isset($data['pms_password'])) { $sets[] = "pms_password = ?"; $params[] = $data['pms_password'] ?: null; }
                if (isset($data['pms_connection_mode'])) { $sets[] = "pms_connection_mode = ?"; $params[] = in_array($data['pms_connection_mode'], ['direct', 'relay']) ? $data['pms_connection_mode'] : 'direct'; }

                // Stripe fields
                if (isset($data['stripe_public_key'])) { $sets[] = "stripe_public_key = ?"; $params[] = $data['stripe_public_key'] ?: null; }
                if (isset($data['stripe_secret_key'])) { $sets[] = "stripe_secret_key = ?"; $params[] = $data['stripe_secret_key'] ?: null; }
                if (isset($data['stripe_webhook_secret'])) { $sets[] = "stripe_webhook_secret = ?"; $params[] = $data['stripe_webhook_secret'] ?: null; }
                if (isset($data['booking_enabled'])) { $sets[] = "booking_enabled = ?"; $params[] = !empty($data['booking_enabled']) ? 1 : 0; }
                if (isset($data['booking_slug'])) {
                    // Vérifier unicité du slug
                    $existing = db()->queryOne("SELECT id FROM hotels WHERE booking_slug = ? AND id != ?", [$data['booking_slug'], $id]);
                    if ($existing) json_error('Ce slug de réservation est déjà utilisé');
                    $sets[] = "booking_slug = ?"; $params[] = $data['booking_slug'];
                }

                // Self check-in fields
                if (isset($data['selfcheckin_enabled'])) { $sets[] = "selfcheckin_enabled = ?"; $params[] = !empty($data['selfcheckin_enabled']) ? 1 : 0; }
                if (isset($data['walkin_enabled'])) { $sets[] = "walkin_enabled = ?"; $params[] = !empty($data['walkin_enabled']) ? 1 : 0; }
                if (isset($data['default_night_price'])) { $sets[] = "default_night_price = ?"; $params[] = (float)$data['default_night_price']; }
                if (isset($data['default_breakfast_price'])) { $sets[] = "default_breakfast_price = ?"; $params[] = (float)$data['default_breakfast_price']; }
                if (isset($data['default_tourist_tax'])) { $sets[] = "default_tourist_tax = ?"; $params[] = (float)$data['default_tourist_tax']; }
                if (isset($data['breakfast_start'])) { $sets[] = "breakfast_start = ?"; $params[] = $data['breakfast_start']; }
                if (isset($data['breakfast_end'])) { $sets[] = "breakfast_end = ?"; $params[] = $data['breakfast_end']; }
                if (isset($data['night_cutoff_hour'])) { $sets[] = "night_cutoff_hour = ?"; $params[] = (int)$data['night_cutoff_hour']; }

                if (!empty($sets)) {
                    $sets[] = "updated_at = NOW()";
                    $params[] = $id;
                    try {
                        db()->execute("UPDATE hotels SET " . implode(', ', $sets) . " WHERE id = ?", $params);
                    } catch (Exception $e) {
                        json_error('Erreur SQL: ' . $e->getMessage());
                    }
                }
                
                json_out(['success' => true]);
            }
            
            // GET /hotels/{id}/breakfast-schedules - Horaires petit-déjeuner par jour de la semaine
            if ($method === 'GET' && $id && is_numeric($id) && $action === 'breakfast-schedules') {
                require_auth();
                $schedules = [];
                try {
                    $schedules = db()->query("SELECT * FROM hotel_breakfast_schedules WHERE hotel_id = ? ORDER BY day_of_week", [$id]);
                } catch (Exception $e) {}
                json_out(['success' => true, 'schedules' => $schedules]);
            }

            // PUT /hotels/{id}/breakfast-schedules - Sauvegarder horaires petit-déjeuner par jour
            if ($method === 'PUT' && $id && is_numeric($id) && $action === 'breakfast-schedules') {
                $user = require_auth();
                if (!in_array($user['role'], ['admin', 'groupe_manager', 'hotel_manager'])) json_error('Permission refusée', 403);

                $data = get_input();
                $days = $data['days'] ?? [];
                if (!is_array($days)) json_error('Format invalide : days doit être un tableau');

                foreach ($days as $day) {
                    $dow = (int)($day['day_of_week'] ?? -1);
                    if ($dow < 0 || $dow > 6) continue;

                    $start = $day['breakfast_start'] ?? '07:00:00';
                    $end = $day['breakfast_end'] ?? '10:30:00';
                    $enabled = isset($day['enabled']) ? (int)$day['enabled'] : 1;

                    $existing = db()->queryOne(
                        "SELECT id FROM hotel_breakfast_schedules WHERE hotel_id = ? AND day_of_week = ?",
                        [$id, $dow]
                    );

                    if ($existing) {
                        db()->execute(
                            "UPDATE hotel_breakfast_schedules SET breakfast_start = ?, breakfast_end = ?, enabled = ? WHERE id = ?",
                            [$start, $end, $enabled, $existing['id']]
                        );
                    } else {
                        db()->insert('hotel_breakfast_schedules', [
                            'hotel_id' => (int)$id,
                            'day_of_week' => $dow,
                            'breakfast_start' => $start,
                            'breakfast_end' => $end,
                            'enabled' => $enabled
                        ]);
                    }
                }
                json_out(['success' => true, 'message' => 'Horaires petit-déjeuner enregistrés']);
            }

            // GET /hotels/{id}/selfcheckin-services - Liste des services complémentaires
            if ($method === 'GET' && $id && is_numeric($id) && $action === 'selfcheckin-services' && !$subaction) {
                require_auth();
                $services = db()->query(
                    "SELECT * FROM hotel_selfcheckin_services WHERE hotel_id = ? ORDER BY sort_order, name",
                    [$id]
                );
                json_out(['success' => true, 'services' => $services]);
            }

            // GET /hotels/{id}/selfcheckin-services/{serviceId} - Détail d'un service
            if ($method === 'GET' && $id && is_numeric($id) && $action === 'selfcheckin-services' && $subaction && is_numeric($subaction)) {
                require_auth();
                $service = db()->queryOne(
                    "SELECT * FROM hotel_selfcheckin_services WHERE id = ? AND hotel_id = ?",
                    [$subaction, $id]
                );
                if (!$service) json_error('Service non trouvé', 404);
                json_out(['success' => true, 'service' => $service]);
            }

            // POST /hotels/{id}/selfcheckin-services - Créer un service complémentaire
            if ($method === 'POST' && $id && is_numeric($id) && $action === 'selfcheckin-services') {
                $user = require_auth();
                if (!in_array($user['role'], ['admin', 'groupe_manager', 'hotel_manager'])) json_error('Permission refusée', 403);

                $data = get_input();
                if (empty($data['name'])) json_error('Le nom du service est requis');

                $insertId = db()->insert(
                    "INSERT INTO hotel_selfcheckin_services (hotel_id, name, description, price, icon, is_active, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
                    [
                        (int)$id,
                        $data['name'],
                        $data['description'] ?? null,
                        (float)($data['price'] ?? 0),
                        $data['icon'] ?? 'concierge-bell',
                        isset($data['is_active']) ? (int)$data['is_active'] : 1,
                        (int)($data['sort_order'] ?? 0)
                    ]
                );
                json_out(['success' => true, 'id' => $insertId], 201);
            }

            // PUT /hotels/{id}/selfcheckin-services/{serviceId} - Modifier un service
            if ($method === 'PUT' && $id && is_numeric($id) && $action === 'selfcheckin-services' && $subaction && is_numeric($subaction)) {
                $user = require_auth();
                if (!in_array($user['role'], ['admin', 'groupe_manager', 'hotel_manager'])) json_error('Permission refusée', 403);

                $service = db()->queryOne("SELECT * FROM hotel_selfcheckin_services WHERE id = ? AND hotel_id = ?", [$subaction, $id]);
                if (!$service) json_error('Service non trouvé', 404);

                $data = get_input();
                $sets = [];
                $params = [];

                if (isset($data['name'])) { $sets[] = "name = ?"; $params[] = $data['name']; }
                if (isset($data['description'])) { $sets[] = "description = ?"; $params[] = $data['description']; }
                if (isset($data['price'])) { $sets[] = "price = ?"; $params[] = (float)$data['price']; }
                if (isset($data['icon'])) { $sets[] = "icon = ?"; $params[] = $data['icon']; }
                if (isset($data['is_active'])) { $sets[] = "is_active = ?"; $params[] = (int)$data['is_active']; }
                if (isset($data['sort_order'])) { $sets[] = "sort_order = ?"; $params[] = (int)$data['sort_order']; }

                if (!empty($sets)) {
                    $sets[] = "updated_at = NOW()";
                    $params[] = $subaction;
                    db()->execute("UPDATE hotel_selfcheckin_services SET " . implode(', ', $sets) . " WHERE id = ?", $params);
                }
                json_out(['success' => true]);
            }

            // DELETE /hotels/{id}/selfcheckin-services/{serviceId} - Supprimer un service
            if ($method === 'DELETE' && $id && is_numeric($id) && $action === 'selfcheckin-services' && $subaction && is_numeric($subaction)) {
                $user = require_auth();
                if (!in_array($user['role'], ['admin', 'groupe_manager', 'hotel_manager'])) json_error('Permission refusée', 403);

                $service = db()->queryOne("SELECT * FROM hotel_selfcheckin_services WHERE id = ? AND hotel_id = ?", [$subaction, $id]);
                if (!$service) json_error('Service non trouvé', 404);

                db()->execute("DELETE FROM hotel_selfcheckin_services WHERE id = ?", [$subaction]);
                json_out(['success' => true]);
            }

            // GET /hotels/{id}/leave-config - Configuration congés de l'hôtel
            if ($method === 'GET' && $id && is_numeric($id) && $action === 'leave-config') {
                require_auth();
                try {
                    $config = db()->queryOne("SELECT * FROM hotel_leave_config WHERE hotel_id = ?", [$id]);
                } catch (Exception $e) {
                    $config = null;
                }
                json_out(['success' => true, 'config' => $config ?: new stdClass()]);
            }

            // PUT /hotels/{id}/leave-config - Sauvegarder configuration congés
            if ($method === 'PUT' && $id && is_numeric($id) && $action === 'leave-config') {
                $user = require_auth();
                if (!in_array($user['role'], ['admin', 'groupe_manager'])) json_error('Permission refusée', 403);

                $data = get_input();
                $existing = null;
                try {
                    $existing = db()->queryOne("SELECT id FROM hotel_leave_config WHERE hotel_id = ?", [$id]);
                } catch (Exception $e) {}

                if ($existing) {
                    db()->execute(
                        "UPDATE hotel_leave_config SET leave_min_delay = ?, default_annual_days = ?, t1_deadline = ?, t2_deadline = ?, t3_deadline = ?, t4_deadline = ?, updated_at = NOW() WHERE hotel_id = ?",
                        [
                            (int)($data['leave_min_delay'] ?? 2),
                            (int)($data['default_annual_days'] ?? 25),
                            $data['t1_deadline'] ?? '11-01',
                            $data['t2_deadline'] ?? '02-01',
                            $data['t3_deadline'] ?? '05-01',
                            $data['t4_deadline'] ?? '08-01',
                            $id
                        ]
                    );
                } else {
                    db()->insert(
                        "INSERT INTO hotel_leave_config (hotel_id, leave_min_delay, default_annual_days, t1_deadline, t2_deadline, t3_deadline, t4_deadline, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
                        [
                            $id,
                            (int)($data['leave_min_delay'] ?? 2),
                            (int)($data['default_annual_days'] ?? 25),
                            $data['t1_deadline'] ?? '11-01',
                            $data['t2_deadline'] ?? '02-01',
                            $data['t3_deadline'] ?? '05-01',
                            $data['t4_deadline'] ?? '08-01'
                        ]
                    );
                }
                json_out(['success' => true]);
            }

            // GET /hotels/{id}/maintenance-config - Configuration alertes maintenance
            if ($method === 'GET' && $id && is_numeric($id) && $action === 'maintenance-config') {
                require_auth();
                $config = null;
                try {
                    $config = db()->queryOne("SELECT * FROM hotel_maintenance_config WHERE hotel_id = ?", [$id]);
                } catch (Exception $e) {}
                json_out(['success' => true, 'config' => $config ?: new stdClass()]);
            }

            // PUT /hotels/{id}/maintenance-config - Sauvegarder configuration alertes maintenance
            if ($method === 'PUT' && $id && is_numeric($id) && $action === 'maintenance-config') {
                $user = require_auth();
                if (!in_array($user['role'], ['admin', 'groupe_manager', 'hotel_manager'])) json_error('Permission refusée', 403);

                $data = get_input();
                $existing = null;
                try {
                    $existing = db()->queryOne("SELECT id FROM hotel_maintenance_config WHERE hotel_id = ?", [$id]);
                } catch (Exception $e) {}

                $fields = [
                    'notify_on_comment' => (int)($data['notify_on_comment'] ?? 1),
                    'notify_on_status_change' => (int)($data['notify_on_status_change'] ?? 1),
                    'notify_on_resolution' => (int)($data['notify_on_resolution'] ?? 1),
                    'notify_commenters' => (int)($data['notify_commenters'] ?? 1),
                    'notify_hotel_manager' => (int)($data['notify_hotel_manager'] ?? 1),
                    'notify_groupe_manager' => (int)($data['notify_groupe_manager'] ?? 1),
                    'notify_admin' => (int)($data['notify_admin'] ?? 1)
                ];

                if ($existing) {
                    $setParts = [];
                    $params = [];
                    foreach ($fields as $col => $val) {
                        $setParts[] = "$col = ?";
                        $params[] = $val;
                    }
                    $params[] = $id;
                    db()->execute(
                        "UPDATE hotel_maintenance_config SET " . implode(', ', $setParts) . ", updated_at = NOW() WHERE hotel_id = ?",
                        $params
                    );
                } else {
                    $cols = array_keys($fields);
                    $vals = array_values($fields);
                    $placeholders = implode(',', array_fill(0, count($cols), '?'));
                    db()->insert(
                        "INSERT INTO hotel_maintenance_config (hotel_id, " . implode(',', $cols) . ", created_at, updated_at) VALUES (?, $placeholders, NOW(), NOW())",
                        array_merge([$id], $vals)
                    );
                }
                json_out(['success' => true]);
            }

            // GET /hotels/check-slug?slug=xxx&exclude_id=Y - Vérifier unicité du slug
            if ($method === 'GET' && $id === 'check-slug') {
                require_auth();
                $slug = trim($_GET['slug'] ?? '');
                $exclude_id = intval($_GET['exclude_id'] ?? 0);
                if ($slug === '') {
                    json_out(['available' => true]);
                }
                $existing = db()->queryOne(
                    "SELECT id FROM hotels WHERE booking_slug = ?" . ($exclude_id ? " AND id != ?" : ""),
                    $exclude_id ? [$slug, $exclude_id] : [$slug]
                );
                json_out(['available' => !$existing, 'slug' => $slug]);
            }

            // GET /hotels/{id}/competitors - Liste des concurrents
            if ($method === 'GET' && $id && is_numeric($id) && $action === 'competitors') {
                $user = require_auth();
                
                // Vérifier accès
                if (!in_array($user['role'], ['admin', 'groupe_manager'])) {
                    $hasAccess = db()->count("SELECT COUNT(*) FROM user_hotels WHERE user_id = ? AND hotel_id = ?", [$user['id'], $id]);
                    if (!$hasAccess) json_error('Accès non autorisé', 403);
                }
                
                try {
                    $competitors = db()->query(
                        "SELECT * FROM hotel_competitors WHERE hotel_id = ? AND is_active = 1 ORDER BY display_order",
                        [$id]
                    );
                } catch (Exception $e) {
                    // Table n'existe pas encore
                    $competitors = [];
                }
                
                json_out(['success' => true, 'competitors' => $competitors]);
            }
            
            // POST /hotels/{id}/competitors - Sauvegarder les concurrents
            if ($method === 'POST' && $id && is_numeric($id) && $action === 'competitors') {
                $user = require_auth();
                if (!in_array($user['role'], ['admin', 'groupe_manager'])) {
                    json_error('Accès refusé', 403);
                }
                
                $data = get_input();
                $competitors = $data['competitors'] ?? [];
                
                // Debug : retourner les données reçues si vide
                if (empty($competitors)) {
                    json_out([
                        'success' => false, 
                        'error' => 'Aucun concurrent reçu',
                        'debug_data_received' => $data,
                        'debug_raw_input' => file_get_contents('php://input')
                    ]);
                }
                
                // Créer la table si nécessaire
                try {
                    db()->execute("CREATE TABLE IF NOT EXISTS `hotel_competitors` (
                        `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
                        `hotel_id` INT(10) UNSIGNED NOT NULL,
                        `competitor_name` VARCHAR(255) NOT NULL,
                        `xotelo_hotel_key` VARCHAR(100) NOT NULL,
                        `competitor_stars` TINYINT(3) UNSIGNED DEFAULT 3,
                        `competitor_city` VARCHAR(100) DEFAULT NULL,
                        `display_order` INT(11) DEFAULT 0,
                        `is_active` TINYINT(1) DEFAULT 1,
                        `created_at` DATETIME DEFAULT NULL,
                        `updated_at` DATETIME DEFAULT NULL,
                        PRIMARY KEY (`id`),
                        UNIQUE KEY `unique_competitor` (`hotel_id`, `xotelo_hotel_key`),
                        KEY `idx_hotel` (`hotel_id`)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
                } catch (Exception $e) {
                    // Table existe déjà, OK
                }
                
                // Désactiver tous les anciens concurrents
                try {
                    db()->execute("UPDATE hotel_competitors SET is_active = 0 WHERE hotel_id = ?", [$id]);
                } catch (Exception $e) {
                    // Ignorer si table n'existe pas encore
                }
                
                $savedCount = 0;
                $errors = [];
                
                // Insérer/réactiver les concurrents
                foreach ($competitors as $index => $comp) {
                    if (empty($comp['competitor_name']) || empty($comp['xotelo_hotel_key'])) {
                        continue;
                    }
                    
                    try {
                        // Essayer d'abord un UPDATE
                        $affected = db()->execute(
                            "UPDATE hotel_competitors SET competitor_name = ?, competitor_stars = ?, display_order = ?, is_active = 1, updated_at = NOW() WHERE hotel_id = ? AND xotelo_hotel_key = ?",
                            [$comp['competitor_name'], $comp['competitor_stars'] ?? 3, $comp['display_order'] ?? 0, $id, $comp['xotelo_hotel_key']]
                        );
                        
                        // Si aucune ligne affectée, faire un INSERT
                        if ($affected == 0) {
                            db()->insert(
                                "INSERT INTO hotel_competitors (hotel_id, competitor_name, xotelo_hotel_key, competitor_stars, display_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())",
                                [$id, $comp['competitor_name'], $comp['xotelo_hotel_key'], $comp['competitor_stars'] ?? 3, $comp['display_order'] ?? 0]
                            );
                        }
                        $savedCount++;
                    } catch (Exception $e) {
                        $errors[] = "Concurrent $index: " . $e->getMessage();
                    }
                }
                
                json_out(['success' => true, 'saved' => $savedCount, 'errors' => $errors, 'received_count' => count($competitors)]);
            }
            
            if ($method === 'DELETE' && $id && is_numeric($id)) {
                $user = require_auth();
                if (!hasPermission($user['role'], 'hotels.delete')) json_error('Permission refusée', 403);
                
                // Vérifier qu'il n'y a pas de chambres
                $roomCount = db()->count("SELECT COUNT(*) FROM rooms WHERE hotel_id = ?", [$id]);
                if ($roomCount > 0) json_error('Impossible de supprimer : des chambres sont liées à cet hôtel');
                
                db()->execute("DELETE FROM hotels WHERE id = ?", [$id]);
                json_out(['success' => true]);
            }
            break;
        
        // --- ROOMS ---
        case 'rooms':
            // Récupérer une chambre
            if ($method === 'GET' && $id && is_numeric($id)) {
                require_auth();
                $room = db()->queryOne("SELECT * FROM rooms WHERE id = ?", [$id]);
                if (!$room) json_error('Chambre non trouvée', 404);
                json_out(['success' => true, 'room' => $room]);
            }
            
            // Créer une chambre
            if ($method === 'POST') {
                require_role('admin', 'groupe_manager', 'hotel_manager');
                $data = get_input();
                if (empty($data['hotel_id']) || empty($data['room_number'])) json_error('Données manquantes');
                
                // Vérifier que le numéro n'existe pas déjà
                $exists = db()->queryOne(
                    "SELECT id FROM rooms WHERE hotel_id = ? AND room_number = ?",
                    [$data['hotel_id'], $data['room_number']]
                );
                if ($exists) json_error('Ce numéro de chambre existe déjà');
                
                $maxAdults = isset($data['max_adults']) ? (int)$data['max_adults'] : 2;
                $id = db()->insert(
                    "INSERT INTO rooms (hotel_id, room_number, floor, room_type, bed_type, max_adults, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
                    [$data['hotel_id'], $data['room_number'], $data['floor'] ?? 1, $data['room_type'] ?? 'standard', $data['bed_type'] ?? 'double', $maxAdults, $data['status'] ?? 'active']
                );
                json_out(['success' => true, 'id' => $id], 201);
            }
            
            // Modifier une chambre
            if ($method === 'PUT' && $id && is_numeric($id)) {
                require_role('admin', 'groupe_manager', 'hotel_manager');
                $data = get_input();
                
                $room = db()->queryOne("SELECT * FROM rooms WHERE id = ?", [$id]);
                if (!$room) json_error('Chambre non trouvée', 404);
                
                // Si changement de numéro, vérifier qu'il n'existe pas
                if (!empty($data['room_number']) && $data['room_number'] !== $room['room_number']) {
                    $exists = db()->queryOne(
                        "SELECT id FROM rooms WHERE hotel_id = ? AND room_number = ? AND id != ?",
                        [$room['hotel_id'], $data['room_number'], $id]
                    );
                    if ($exists) json_error('Ce numéro de chambre existe déjà');
                }
                
                $sets = [];
                $params = [];
                
                if (isset($data['room_number'])) { $sets[] = "room_number = ?"; $params[] = $data['room_number']; }
                if (isset($data['floor'])) { $sets[] = "floor = ?"; $params[] = $data['floor']; }
                if (isset($data['room_type'])) { $sets[] = "room_type = ?"; $params[] = $data['room_type']; }
                if (isset($data['bed_type'])) { $sets[] = "bed_type = ?"; $params[] = $data['bed_type']; }
                if (isset($data['max_adults'])) { $sets[] = "max_adults = ?"; $params[] = (int)$data['max_adults']; }
                if (isset($data['status'])) { $sets[] = "status = ?"; $params[] = $data['status']; }
                
                if (!empty($sets)) {
                    $sets[] = "updated_at = NOW()";
                    $params[] = $id;
                    db()->execute("UPDATE rooms SET " . implode(', ', $sets) . " WHERE id = ?", $params);
                }
                
                json_out(['success' => true]);
            }
            
            // Supprimer une chambre
            if ($method === 'DELETE' && $id && is_numeric($id)) {
                require_role('admin', 'groupe_manager', 'hotel_manager');
                
                $room = db()->queryOne("SELECT * FROM rooms WHERE id = ?", [$id]);
                if (!$room) json_error('Chambre non trouvée', 404);
                
                // Vérifier qu'il n'y a pas de dispatch en cours
                $hasDispatch = db()->count(
                    "SELECT COUNT(*) FROM room_dispatch WHERE room_id = ? AND dispatch_date >= CURDATE() AND status NOT IN ('controlled', 'completed')",
                    [$id]
                );
                if ($hasDispatch > 0) {
                    json_error('Impossible de supprimer : des tâches sont en cours pour cette chambre');
                }
                
                db()->execute("DELETE FROM rooms WHERE id = ?", [$id]);
                json_out(['success' => true]);
            }
            break;
        
        // --- MAINTENANCE ---
        case 'maintenance':
            if ($method === 'GET' && $id === 'stats') {
                $user = require_auth();
                
                // Admin voit tout, les autres voient seulement leurs hôtels
                if ($user['role'] === 'admin') {
                    $hotelFilter = "";
                    $hotelIds = [];
                } else {
                    $userHotels = db()->query("SELECT hotel_id FROM user_hotels WHERE user_id = ?", [$user['id']]);
                    $hotelIds = array_column($userHotels, 'hotel_id');
                    
                    if (empty($hotelIds)) {
                        json_out(['success' => true, 'stats' => ['open' => 0, 'resolved' => 0, 'critical' => 0]]);
                    }
                    
                    $placeholders = implode(',', array_fill(0, count($hotelIds), '?'));
                    $hotelFilter = " AND hotel_id IN ($placeholders)";
                }
                
                json_out(['success' => true, 'stats' => [
                    'open' => db()->count("SELECT COUNT(*) FROM maintenance_tickets WHERE status IN ('open', 'in_progress')" . $hotelFilter, $hotelIds),
                    'resolved' => db()->count("SELECT COUNT(*) FROM maintenance_tickets WHERE status = 'resolved'" . $hotelFilter, $hotelIds),
                    'critical' => db()->count("SELECT COUNT(*) FROM maintenance_tickets WHERE priority = 'critical' AND status != 'resolved'" . $hotelFilter, $hotelIds)
                ]]);
            }
            
            // Statistiques chambres bloquées du mois en cours
            if ($method === 'GET' && $id === 'blocked-rooms' && $action === 'stats') {
                $user = require_auth();
                
                // Récupérer les hôtels de l'utilisateur
                $hotelIds = [];
                if ($user['role'] !== 'admin') {
                    $userHotels = db()->query("SELECT hotel_id FROM user_hotels WHERE user_id = ?", [$user['id']]);
                    $hotelIds = array_column($userHotels, 'hotel_id');
                }
                
                $hotelFilter = "";
                $hotelParams = [];
                if (!empty($hotelIds)) {
                    $placeholders = implode(',', array_fill(0, count($hotelIds), '?'));
                    $hotelFilter = " AND m.hotel_id IN ($placeholders)";
                    $hotelParams = $hotelIds;
                }
                
                // Dates du mois en cours
                $monthStart = date('Y-m-01');
                $monthEnd = date('Y-m-t');
                $today = date('Y-m-d');
                $daysInMonth = date('t');
                
                // Nombre total de chambres
                $totalRooms = db()->count(
                    "SELECT COUNT(*) FROM rooms r 
                     JOIN hotels h ON r.hotel_id = h.id 
                     WHERE h.status = 'active'" . str_replace('m.hotel_id', 'r.hotel_id', $hotelFilter),
                    $hotelParams
                );
                
                // Total jours-chambre possibles dans le mois
                $totalRoomDays = $totalRooms * $daysInMonth;
                
                // Chambres actuellement bloquées
                $currentlyBlocked = db()->count(
                    "SELECT COUNT(*) FROM maintenance_tickets m 
                     WHERE m.room_blocked = 1 AND m.status != 'resolved'" . $hotelFilter,
                    $hotelParams
                );
                
                // Calculer les jours-chambre bloqués ce mois
                // Pour chaque ticket avec room_blocked = 1, calculer les jours de blocage dans le mois
                $blockedTickets = db()->query(
                    "SELECT m.id, m.created_at, m.resolved_at, m.status 
                     FROM maintenance_tickets m 
                     WHERE m.room_blocked = 1 
                       AND (
                           (m.status != 'resolved' AND m.created_at <= ?) OR
                           (m.status = 'resolved' AND m.resolved_at >= ? AND m.created_at <= ?)
                       )" . $hotelFilter,
                    array_merge([$monthEnd, $monthStart, $monthEnd], $hotelParams)
                );
                
                $blockedRoomDays = 0;
                foreach ($blockedTickets as $t) {
                    $startBlock = max(strtotime($monthStart), strtotime($t['created_at']));
                    if ($t['status'] === 'resolved' && $t['resolved_at']) {
                        $endBlock = min(strtotime($monthEnd), strtotime($t['resolved_at']));
                    } else {
                        $endBlock = min(strtotime($monthEnd), strtotime($today));
                    }
                    $days = max(0, ceil(($endBlock - $startBlock) / 86400) + 1);
                    $blockedRoomDays += $days;
                }
                
                json_out(['success' => true, 'stats' => [
                    'currently_blocked' => $currentlyBlocked,
                    'blocked_room_days' => $blockedRoomDays,
                    'total_room_days' => $totalRoomDays,
                    'total_rooms' => $totalRooms,
                    'month' => date('Y-m')
                ]]);
            }
            
            // Liste détaillée des chambres bloquées (avec filtres)
            if ($method === 'GET' && $id === 'blocked-rooms' && !$action) {
                $user = require_auth();
                
                // Récupérer les hôtels de l'utilisateur
                $hotelIds = [];
                if ($user['role'] !== 'admin') {
                    $userHotels = db()->query("SELECT hotel_id FROM user_hotels WHERE user_id = ?", [$user['id']]);
                    $hotelIds = array_column($userHotels, 'hotel_id');
                }
                
                $where = "m.room_blocked = 1";
                $params = [];
                
                // Filtre par hôtels de l'utilisateur
                if (!empty($hotelIds)) {
                    $placeholders = implode(',', array_fill(0, count($hotelIds), '?'));
                    $where .= " AND m.hotel_id IN ($placeholders)";
                    $params = array_merge($params, $hotelIds);
                }
                
                // Filtre par hôtel spécifique
                if (!empty($_GET['hotel_id'])) {
                    $where .= " AND m.hotel_id = ?";
                    $params[] = $_GET['hotel_id'];
                }
                
                // Filtre par période
                $startDate = $_GET['start_date'] ?? date('Y-m-01');
                $endDate = $_GET['end_date'] ?? date('Y-m-d');
                
                $where .= " AND m.created_at <= ?";
                $params[] = $endDate . ' 23:59:59';
                
                // Filtre par statut
                if (!empty($_GET['status'])) {
                    if ($_GET['status'] === 'blocked') {
                        $where .= " AND m.status != 'resolved'";
                    } elseif ($_GET['status'] === 'resolved') {
                        $where .= " AND m.status = 'resolved'";
                    }
                }
                
                // Récupérer les tickets avec chambres bloquées
                $rooms = db()->query(
                    "SELECT m.id as ticket_id, m.hotel_id, m.room_number, m.category, m.description,
                            m.priority, m.status, m.created_at, m.resolved_at, m.room_blocked,
                            h.name as hotel_name,
                            CASE 
                                WHEN m.status = 'resolved' THEN DATEDIFF(m.resolved_at, m.created_at) + 1
                                ELSE DATEDIFF(NOW(), m.created_at) + 1
                            END as days_blocked
                     FROM maintenance_tickets m
                     JOIN hotels h ON m.hotel_id = h.id
                     WHERE $where
                     ORDER BY m.status ASC, m.created_at DESC",
                    $params
                );
                
                // Calculer les statistiques
                $totalBlocked = count($rooms);
                $stillBlocked = 0;
                $resolvedCount = 0;
                $totalBlockedDays = 0;
                $resolutionDays = [];
                
                foreach ($rooms as $r) {
                    if ($r['status'] === 'resolved') {
                        $resolvedCount++;
                        $resolutionDays[] = $r['days_blocked'];
                    } else {
                        $stillBlocked++;
                    }
                    $totalBlockedDays += $r['days_blocked'];
                }
                
                $avgResolutionDays = count($resolutionDays) > 0 ? array_sum($resolutionDays) / count($resolutionDays) : null;
                
                json_out(['success' => true, 'rooms' => $rooms, 'stats' => [
                    'total_blocked' => $totalBlocked,
                    'still_blocked' => $stillBlocked,
                    'resolved_count' => $resolvedCount,
                    'total_blocked_days' => $totalBlockedDays,
                    'avg_resolution_days' => $avgResolutionDays
                ]]);
            }
            
            // Export PDF des chambres bloquées
            if ($method === 'POST' && $id === 'blocked-rooms' && $action === 'export-pdf') {
                $user = require_auth();
                $data = get_input();
                
                $rooms = $data['rooms'] ?? [];
                $stats = $data['stats'] ?? [];
                $startDate = $data['start_date'] ?? date('Y-m-01');
                $endDate = $data['end_date'] ?? date('Y-m-d');
                
                // Générer le PDF
                $html = generateBlockedRoomsPDF($rooms, $stats, $startDate, $endDate, $user);
                
                // Convertir HTML en PDF avec une librairie simple ou renvoyer HTML
                header('Content-Type: application/pdf');
                header('Content-Disposition: attachment; filename="chambres_bloquees_' . $startDate . '_' . $endDate . '.pdf"');
                
                // Utiliser une approche simple avec HTML + CSS print
                // Pour une vraie solution, utiliser TCPDF ou Dompdf
                echo generateBlockedRoomsPDFContent($rooms, $stats, $startDate, $endDate);
                exit;
            }
            
            if ($method === 'GET' && !$id) {
                $user = require_auth();
                $where = "1=1";
                $params = [];
                
                // Filtrer par hôtels de l'utilisateur (sauf admin)
                if ($user['role'] !== 'admin') {
                    $userHotels = db()->query("SELECT hotel_id FROM user_hotels WHERE user_id = ?", [$user['id']]);
                    $hotelIds = array_column($userHotels, 'hotel_id');
                    
                    if (empty($hotelIds)) {
                        json_out(['success' => true, 'tickets' => []]);
                    }
                    
                    $placeholders = implode(',', array_fill(0, count($hotelIds), '?'));
                    $where .= " AND m.hotel_id IN ($placeholders)";
                    $params = array_merge($params, $hotelIds);
                }
                
                if (!empty($_GET['hotel_id'])) { $where .= " AND m.hotel_id = ?"; $params[] = $_GET['hotel_id']; }
                if (!empty($_GET['status'])) {
                    if ($_GET['status'] === 'open') {
                        $where .= " AND m.status IN ('open', 'in_progress')";
                    } else {
                        $where .= " AND m.status = ?"; $params[] = $_GET['status'];
                    }
                }
                if (!empty($_GET['priority'])) { $where .= " AND m.priority = ?"; $params[] = $_GET['priority']; }
                
                $query = "SELECT m.*, h.name as hotel_name,
                            CONCAT(ua.first_name, ' ', ua.last_name) as assigned_to_name,
                            DATEDIFF(NOW(), m.assigned_at) as days_in_progress
                     FROM maintenance_tickets m
                     LEFT JOIN hotels h ON m.hotel_id = h.id
                     LEFT JOIN users ua ON m.assigned_to = ua.id
                     WHERE $where
                     ORDER BY FIELD(m.priority,'critical','high','medium','low'), m.created_at DESC";
                $countQuery = "SELECT COUNT(*) FROM maintenance_tickets m WHERE $where";

                $result = paginate($query, $params, $countQuery, $params);

                // Calculer is_overdue pour chaque ticket
                foreach ($result['data'] as &$ticket) {
                    $ticket['is_overdue'] = (in_array($ticket['status'], ['open', 'in_progress']) && $ticket['days_in_progress'] >= 7);
                }

                json_out(['success' => true, 'tickets' => $result['data'], 'pagination' => $result['pagination']]);
            }
            
            // Récupérer un ticket spécifique
            if ($method === 'GET' && $id && is_numeric($id)) {
                $user = require_auth();
                $ticket = db()->queryOne(
                    "SELECT m.*, h.name as hotel_name,
                            CONCAT(ur.first_name, ' ', ur.last_name) as reporter_name,
                            CONCAT(ua.first_name, ' ', ua.last_name) as assigned_to_name,
                            CONCAT(ures.first_name, ' ', ures.last_name) as resolved_by_name
                     FROM maintenance_tickets m 
                     LEFT JOIN hotels h ON m.hotel_id = h.id 
                     LEFT JOIN users ur ON m.reported_by = ur.id
                     LEFT JOIN users ua ON m.assigned_to = ua.id
                     LEFT JOIN users ures ON m.resolved_by = ures.id
                     WHERE m.id = ?",
                    [$id]
                );
                
                // Vérifier accès à cet hôtel (sauf admin)
                if ($ticket && $user['role'] !== 'admin') {
                    $hasAccess = db()->count("SELECT COUNT(*) FROM user_hotels WHERE user_id = ? AND hotel_id = ?", [$user['id'], $ticket['hotel_id']]);
                    if (!$hasAccess) json_error('Accès non autorisé', 403);
                }
                
                if (!$ticket) {
                    json_error('Ticket non trouvé', 404);
                }
                
                // Ajouter l'URL de la photo si présente
                if ($ticket['photo']) {
                    $ticket['photo_url'] = 'uploads/maintenance/' . $ticket['photo'];
                }
                
                // Calculer si le ticket est en retard (plus d'une semaine en cours)
                $ticket['is_overdue'] = false;
                if (in_array($ticket['status'], ['open', 'in_progress']) && $ticket['assigned_at']) {
                    $assignedDate = new DateTime($ticket['assigned_at']);
                    $now = new DateTime();
                    $diff = $now->diff($assignedDate);
                    $ticket['is_overdue'] = $diff->days >= 7;
                    $ticket['days_in_progress'] = $diff->days;
                }
                
                // Récupérer les commentaires/historique depuis la table ticket_comments
                $comments = [];
                try {
                    $comments = db()->query(
                        "SELECT tc.*, CONCAT(u.first_name, ' ', u.last_name) as user_name, u.role as user_role
                         FROM ticket_comments tc
                         LEFT JOIN users u ON tc.user_id = u.id
                         WHERE tc.ticket_id = ?
                         ORDER BY tc.created_at ASC",
                        [$id]
                    );
                } catch (Exception $e) {
                    // Table might not exist yet, return empty array
                    $comments = [];
                }
                
                json_out(['success' => true, 'ticket' => $ticket, 'comments' => $comments]);
            }
            
            // Ajouter un commentaire (managers uniquement) - DOIT ÊTRE AVANT la création de ticket
            if ($method === 'POST' && $id && $action === 'comment') {
                $user = require_auth();
                
                // Vérifier que l'utilisateur est manager ou plus
                if (!in_array($user['role'], ['admin', 'groupe_manager', 'hotel_manager'])) {
                    json_error('Seuls les responsables peuvent ajouter des commentaires', 403);
                }
                
                $data = get_input();
                
                if (empty($data['comment'])) {
                    json_error('Le commentaire est requis');
                }
                
                // Vérifier que le ticket existe
                $ticket = db()->queryOne("SELECT id FROM maintenance_tickets WHERE id = ?", [$id]);
                if (!$ticket) json_error('Ticket non trouvé', 404);
                
                // Ajouter le commentaire
                $commentId = db()->insert(
                    "INSERT INTO ticket_comments (ticket_id, user_id, comment, comment_type, created_at) VALUES (?, ?, ?, 'comment', NOW())",
                    [$id, $user['id'], $data['comment']]
                );
                
                // Mettre à jour updated_at du ticket
                db()->execute("UPDATE maintenance_tickets SET updated_at = NOW() WHERE id = ?", [$id]);

                // Notifier les personnes liées au ticket
                notifyMaintenanceActivity($id, $user, 'comment', $data['comment']);

                json_out(['success' => true, 'id' => $commentId], 201);
            }
            
            // Créer un nouveau ticket (seulement si pas d'ID)
            if ($method === 'POST' && !$id) {
                $user = require_auth();
                
                // Récupérer les données (FormData ou JSON)
                if (!empty($_POST)) {
                    $data = $_POST;
                } else {
                    $data = get_input();
                }
                
                if (empty($data['hotel_id']) || empty($data['category']) || empty($data['description'])) {
                    json_error('Données manquantes: hotel_id, category et description sont requis');
                }
                
                // Gerer l'upload de photo si presente
                $photoFilename = null;
                if (isset($_FILES['photo']) && $_FILES['photo']['error'] === UPLOAD_ERR_OK) {
                    $uploadError = validateUpload($_FILES['photo'], 'image');
                    if ($uploadError) json_error($uploadError);

                    $uploadDir = __DIR__ . '/../uploads/maintenance/';
                    if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

                    $ext = strtolower(pathinfo($_FILES['photo']['name'], PATHINFO_EXTENSION));
                    $photoFilename = 'ticket_' . time() . '_' . uniqid() . '.' . $ext;

                    if (!move_uploaded_file($_FILES['photo']['tmp_name'], $uploadDir . $photoFilename)) {
                        json_error('Erreur lors de l\'upload de la photo');
                    }
                }
                
                $ticketId = db()->insert(
                    "INSERT INTO maintenance_tickets (hotel_id, room_number, category, description, priority, photo, room_blocked, reported_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                    [
                        $data['hotel_id'], 
                        isset($data['room_number']) && $data['room_number'] !== '' ? $data['room_number'] : null, 
                        $data['category'], 
                        $data['description'], 
                        isset($data['priority']) ? $data['priority'] : 'medium', 
                        $photoFilename,
                        isset($data['room_blocked']) && $data['room_blocked'] ? 1 : 0,
                        $user['id']
                    ]
                );
                
                // === NOTIFICATIONS AUX RESPONSABLES ===
                notifyMaintenanceTicket($ticketId, $data, $user, 'created');
                
                json_out(['success' => true, 'id' => $ticketId], 201);
            }
            
            // Prendre en charge un ticket (managers uniquement)
            if ($method === 'PUT' && $id && $action === 'assign') {
                $user = require_auth();
                
                // Vérifier que l'utilisateur est manager ou plus
                if (!in_array($user['role'], ['admin', 'groupe_manager', 'hotel_manager'])) {
                    json_error('Seuls les responsables peuvent prendre en charge un ticket', 403);
                }
                
                // Récupérer l'ancien statut
                $ticket = db()->queryOne("SELECT status FROM maintenance_tickets WHERE id = ?", [$id]);
                if (!$ticket) json_error('Ticket non trouvé', 404);
                
                db()->execute("UPDATE maintenance_tickets SET status = 'in_progress', assigned_to = ?, assigned_at = NOW(), updated_at = NOW() WHERE id = ?", [$user['id'], $id]);
                
                // Ajouter un commentaire de suivi
                db()->insert(
                    "INSERT INTO ticket_comments (ticket_id, user_id, comment, comment_type, old_status, new_status, created_at) VALUES (?, ?, ?, 'assignment', ?, 'in_progress', NOW())",
                    [$id, $user['id'], 'Ticket pris en charge', $ticket['status']]
                );

                // Notifier les personnes liées au ticket
                notifyMaintenanceActivity($id, $user, 'assignment');

                json_out(['success' => true]);
            }

            // Résoudre un ticket (managers uniquement)
            if ($method === 'PUT' && $id && $action === 'resolve') {
                $user = require_auth();
                
                // Vérifier que l'utilisateur est manager ou plus
                if (!in_array($user['role'], ['admin', 'groupe_manager', 'hotel_manager'])) {
                    json_error('Seuls les responsables peuvent clôturer un ticket', 403);
                }
                
                $data = get_input();
                
                // Récupérer l'ancien statut
                $ticket = db()->queryOne("SELECT status FROM maintenance_tickets WHERE id = ?", [$id]);
                if (!$ticket) json_error('Ticket non trouvé', 404);
                
                $notes = $data['notes'] ?? '';
                
                db()->execute("UPDATE maintenance_tickets SET status = 'resolved', resolved_by = ?, resolution_notes = ?, resolved_at = NOW(), updated_at = NOW() WHERE id = ?", 
                    [$user['id'], $notes, $id]);
                
                // Ajouter un commentaire de suivi
                $comment = 'Ticket résolu' . ($notes ? ": $notes" : '');
                db()->insert(
                    "INSERT INTO ticket_comments (ticket_id, user_id, comment, comment_type, old_status, new_status, created_at) VALUES (?, ?, ?, 'resolution', ?, 'resolved', NOW())",
                    [$id, $user['id'], $comment, $ticket['status']]
                );

                // Notifier les personnes liées au ticket
                notifyMaintenanceActivity($id, $user, 'resolution', $notes);

                json_out(['success' => true]);
            }

            // Récupérer les commentaires d'un ticket
            if ($method === 'GET' && $id && $action === 'comments') {
                $user = require_auth();
                
                $comments = db()->query(
                    "SELECT tc.*, CONCAT(u.first_name, ' ', u.last_name) as user_name, u.role as user_role
                     FROM ticket_comments tc
                     LEFT JOIN users u ON tc.user_id = u.id
                     WHERE tc.ticket_id = ?
                     ORDER BY tc.created_at ASC",
                    [$id]
                );
                
                json_out(['success' => true, 'comments' => $comments]);
            }
            
            // Supprimer un ticket - DELETE /maintenance/{id}
            if ($method === 'DELETE' && $id && is_numeric($id)) {
                $user = require_role('admin', 'groupe_manager');
                
                $ticket = db()->queryOne("SELECT * FROM maintenance_tickets WHERE id = ?", [$id]);
                if (!$ticket) json_error('Ticket non trouvé', 404);
                
                // Vérifier que groupe_manager a accès à cet hôtel
                if ($user['role'] === 'groupe_manager') {
                    $hasAccess = db()->queryOne(
                        "SELECT 1 FROM user_hotels WHERE user_id = ? AND hotel_id = ?",
                        [$user['id'], $ticket['hotel_id']]
                    );
                    if (!$hasAccess) json_error('Accès non autorisé à ce ticket', 403);
                }
                
                // Supprimer la photo associée si elle existe
                if (!empty($ticket['photo'])) {
                    $filePath = __DIR__ . '/../' . $ticket['photo'];
                    if (file_exists($filePath)) unlink($filePath);
                }
                
                // Supprimer les commentaires associés
                db()->execute("DELETE FROM ticket_comments WHERE ticket_id = ?", [$id]);
                
                // Supprimer le ticket
                db()->execute("DELETE FROM maintenance_tickets WHERE id = ?", [$id]);
                
                json_out(['success' => true]);
            }
            break;
        
        // --- TASKS (Kanban) ---
        case 'tasks':
            // Membres disponibles pour un/plusieurs hôtels - GET /tasks/available-members?hotel_ids=1,2,3
            if ($method === 'GET' && $id === 'available-members') {
                $user = require_auth();
                $hotelIdsParam = isset($_GET['hotel_ids']) ? $_GET['hotel_ids'] : '';
                $hotelIds = array_filter(explode(',', $hotelIdsParam));
                
                if (empty($hotelIds)) {
                    json_out(['success' => true, 'users' => []]);
                }
                
                // Vérifier que l'utilisateur a accès à ces hôtels (sauf admin)
                if ($user['role'] !== 'admin') {
                    $userHotels = db()->query("SELECT hotel_id FROM user_hotels WHERE user_id = ?", [$user['id']]);
                    $userHotelIds = array_column($userHotels, 'hotel_id');
                    $hotelIds = array_intersect($hotelIds, $userHotelIds);
                }
                
                if (empty($hotelIds)) {
                    json_out(['success' => true, 'users' => []]);
                }
                
                $placeholders = implode(',', array_fill(0, count($hotelIds), '?'));
                
                $users = db()->query(
                    "SELECT DISTINCT u.id, u.first_name, u.last_name, u.role
                     FROM users u
                     JOIN user_hotels uh ON u.id = uh.user_id
                     WHERE uh.hotel_id IN ($placeholders) AND u.status = 'active'
                     ORDER BY FIELD(u.role, 'admin', 'groupe_manager', 'hotel_manager', 'comptabilite', 'rh', 'receptionniste', 'employee'), u.first_name",
                    array_values($hotelIds)
                );
                
                json_out(['success' => true, 'users' => $users]);
            }
            
            // Liste des tableaux (boards) - GET /tasks/boards
            if ($method === 'GET' && $id === 'boards') {
                $user = require_auth();
                
                $hotelId = $_GET['hotel_id'] ?? null;
                
                try {
                    // Admin voit tous les tableaux
                    if ($user['role'] === 'admin') {
                        if ($hotelId) {
                            $boards = db()->query(
                                "SELECT b.*, h.name as hotel_name, h.name as hotels,
                                        CONCAT(u.first_name, ' ', u.last_name) as created_by_name,
                                        (SELECT COUNT(*) FROM tasks t WHERE t.board_id = b.id) as task_count,
                                        (SELECT COUNT(*) FROM task_board_members tbm WHERE tbm.board_id = b.id) as member_count
                                 FROM task_boards b
                                 LEFT JOIN hotels h ON b.hotel_id = h.id
                                 LEFT JOIN users u ON b.created_by = u.id
                                 WHERE b.hotel_id = ? AND b.is_archived = 0
                                 ORDER BY b.created_at DESC",
                                [$hotelId]
                            );
                        } else {
                            $boards = db()->query(
                                "SELECT b.*, h.name as hotel_name, h.name as hotels,
                                        CONCAT(u.first_name, ' ', u.last_name) as created_by_name,
                                        (SELECT COUNT(*) FROM tasks t WHERE t.board_id = b.id) as task_count,
                                        (SELECT COUNT(*) FROM task_board_members tbm WHERE tbm.board_id = b.id) as member_count
                                 FROM task_boards b
                                 LEFT JOIN hotels h ON b.hotel_id = h.id
                                 LEFT JOIN users u ON b.created_by = u.id
                                 WHERE b.is_archived = 0
                                 ORDER BY h.name, b.created_at DESC"
                            );
                        }
                    } else {
                        // Les autres utilisateurs ne voient que les tableaux dont ils sont membres
                        if ($hotelId) {
                            $boards = db()->query(
                                "SELECT DISTINCT b.*, h.name as hotel_name, h.name as hotels,
                                        CONCAT(u.first_name, ' ', u.last_name) as created_by_name,
                                        (SELECT COUNT(*) FROM tasks t WHERE t.board_id = b.id) as task_count,
                                        (SELECT COUNT(*) FROM task_board_members tbm WHERE tbm.board_id = b.id) as member_count
                                 FROM task_boards b
                                 LEFT JOIN hotels h ON b.hotel_id = h.id
                                 LEFT JOIN users u ON b.created_by = u.id
                                 JOIN task_board_members tbm ON b.id = tbm.board_id AND tbm.user_id = ?
                                 WHERE b.hotel_id = ? AND b.is_archived = 0
                                 ORDER BY b.created_at DESC",
                                [$user['id'], $hotelId]
                            );
                        } else {
                            $boards = db()->query(
                                "SELECT DISTINCT b.*, h.name as hotel_name, h.name as hotels,
                                        CONCAT(u.first_name, ' ', u.last_name) as created_by_name,
                                        (SELECT COUNT(*) FROM tasks t WHERE t.board_id = b.id) as task_count,
                                        (SELECT COUNT(*) FROM task_board_members tbm WHERE tbm.board_id = b.id) as member_count
                                 FROM task_boards b
                                 LEFT JOIN hotels h ON b.hotel_id = h.id
                                 LEFT JOIN users u ON b.created_by = u.id
                                 JOIN task_board_members tbm ON b.id = tbm.board_id AND tbm.user_id = ?
                                 WHERE b.is_archived = 0
                                 ORDER BY h.name, b.created_at DESC",
                                [$user['id']]
                            );
                        }
                    }
                } catch (Exception $e) {
                    // Si les tables n'existent pas encore, retourner un tableau vide
                    $boards = [];
                }
                
                json_out(['success' => true, 'boards' => $boards]);
            }
            
            // Créer un tableau - POST /tasks/boards
            if ($method === 'POST' && $id === 'boards') {
                $user = require_auth();
                $data = get_input();
                
                // Supporter hotel_ids (tableau) ou hotel_id (singulier)
                $hotelIds = [];
                if (!empty($data['hotel_ids']) && is_array($data['hotel_ids'])) {
                    $hotelIds = $data['hotel_ids'];
                } elseif (!empty($data['hotel_id'])) {
                    $hotelIds = [$data['hotel_id']];
                }
                
                if (empty($hotelIds) || empty($data['name'])) {
                    json_error('Hôtel et nom requis');
                }
                
                // Utiliser le premier hôtel comme hôtel principal
                $primaryHotelId = $hotelIds[0];
                
                $boardId = db()->insert(
                    "INSERT INTO task_boards (hotel_id, name, description, color, created_by, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
                    [$primaryHotelId, $data['name'], $data['description'] ?? '', $data['color'] ?? '#1E3A5F', $user['id']]
                );
                
                // Ajouter les hôtels supplémentaires si la table task_board_hotels existe
                if (count($hotelIds) > 0) {
                    try {
                        foreach ($hotelIds as $hId) {
                            db()->insert(
                                "INSERT IGNORE INTO task_board_hotels (board_id, hotel_id) VALUES (?, ?)",
                                [$boardId, $hId]
                            );
                        }
                    } catch (Exception $e) {
                        // Table n'existe pas, ignorer
                    }
                }
                
                // Toujours ajouter le créateur comme propriétaire du tableau
                try {
                    db()->insert(
                        "INSERT IGNORE INTO task_board_members (board_id, user_id, role, added_by, added_at) VALUES (?, ?, 'owner', ?, NOW())",
                        [$boardId, $user['id'], $user['id']]
                    );
                } catch (Exception $e) {
                    // Table n'existe pas, ignorer
                }
                
                // Ajouter les membres supplémentaires si fournis
                if (!empty($data['member_ids']) && is_array($data['member_ids'])) {
                    try {
                        foreach ($data['member_ids'] as $memberId) {
                            // Ne pas re-ajouter le créateur
                            if ($memberId == $user['id']) continue;
                            db()->insert(
                                "INSERT IGNORE INTO task_board_members (board_id, user_id, role, added_by, added_at) VALUES (?, ?, 'member', ?, NOW())",
                                [$boardId, $memberId, $user['id']]
                            );
                        }
                    } catch (Exception $e) {
                        // Table n'existe pas, ignorer
                    }
                }
                
                // Créer les colonnes par défaut
                $defaultColumns = [
                    ['À faire', '#6B7280', 0],
                    ['En cours', '#F59E0B', 1],
                    ['Terminé', '#10B981', 2]
                ];
                
                foreach ($defaultColumns as $col) {
                    db()->insert(
                        "INSERT INTO task_columns (board_id, name, color, position, created_at) VALUES (?, ?, ?, ?, NOW())",
                        [$boardId, $col[0], $col[1], $col[2]]
                    );
                }
                
                json_out(['success' => true, 'id' => $boardId], 201);
            }
            
            // Récupérer un tableau avec ses colonnes et tâches
            if ($method === 'GET' && $id && is_numeric($id) && !$action) {
                $user = require_auth();
                
                $board = db()->queryOne(
                    "SELECT b.*, h.name as hotel_name FROM task_boards b
                     LEFT JOIN hotels h ON b.hotel_id = h.id
                     WHERE b.id = ?",
                    [$id]
                );
                
                if (!$board) json_error('Tableau non trouvé', 404);
                
                // Vérifier l'accès : admin ou membre du tableau
                if ($user['role'] !== 'admin') {
                    $isMember = db()->queryOne(
                        "SELECT 1 FROM task_board_members WHERE board_id = ? AND user_id = ?",
                        [$id, $user['id']]
                    );
                    if (!$isMember) {
                        json_error('Vous n\'avez pas accès à ce tableau', 403);
                    }
                }
                
                // Colonnes
                $columns = db()->query(
                    "SELECT * FROM task_columns WHERE board_id = ? ORDER BY position",
                    [$id]
                );
                
                // Tâches avec assignés (exclure les archivées)
                $tasks = db()->query(
                    "SELECT t.*, CONCAT(u.first_name, ' ', u.last_name) as assigned_to_name,
                            CONCAT(uc.first_name, ' ', uc.last_name) as created_by_name,
                            (SELECT COUNT(*) FROM task_checklists WHERE task_id = t.id) as checklist_total,
                            (SELECT COUNT(*) FROM task_checklists WHERE task_id = t.id AND is_checked = 1) as checklist_done
                     FROM tasks t
                     LEFT JOIN users u ON t.assigned_to = u.id
                     LEFT JOIN users uc ON t.created_by = uc.id
                     WHERE t.board_id = ? AND (t.is_archived = 0 OR t.is_archived IS NULL)
                     ORDER BY t.position",
                    [$id]
                );
                
                // Labels du tableau
                $labels = [];
                try {
                    $labels = db()->query("SELECT * FROM task_labels WHERE board_id = ?", [$id]);
                } catch (Exception $e) {}
                
                // Membres du tableau (priorité) ou tous les membres de l'hôtel (fallback)
                $members = [];
                try {
                    // D'abord essayer de récupérer les membres assignés au tableau
                    $boardMembers = db()->query(
                        "SELECT u.id, u.first_name, u.last_name, u.role, tbm.role as board_role,
                                (CASE WHEN b.created_by = u.id THEN 1 ELSE 0 END) as is_owner
                         FROM task_board_members tbm
                         JOIN users u ON tbm.user_id = u.id
                         JOIN task_boards b ON tbm.board_id = b.id
                         WHERE tbm.board_id = ? AND u.status = 'active'
                         ORDER BY is_owner DESC, u.first_name",
                        [$id]
                    );
                    
                    if (!empty($boardMembers)) {
                        $members = $boardMembers;
                    }
                } catch (Exception $e) {
                    // Table n'existe pas, on ignore
                }
                
                // Hôtels associés au tableau
                $hotels = [];
                try {
                    $hotels = db()->query(
                        "SELECT h.id, h.name FROM task_board_hotels tbh
                         JOIN hotels h ON tbh.hotel_id = h.id
                         WHERE tbh.board_id = ?",
                        [$id]
                    );
                } catch (Exception $e) {}
                
                // Fallback sur l'hôtel principal si pas de multi-hôtels
                if (empty($hotels) && $board['hotel_id']) {
                    $hotels = [['id' => $board['hotel_id'], 'name' => $board['hotel_name']]];
                }
                
                // Vérifier si l'utilisateur peut gérer le tableau (admin ou permission tasks.manage)
                $canManage = ($user['role'] === 'admin') || hasPermission($user['role'], 'tasks.manage');
                
                json_out([
                    'success' => true, 
                    'board' => $board, 
                    'columns' => $columns, 
                    'tasks' => $tasks,
                    'labels' => $labels,
                    'members' => $members,
                    'hotels' => $hotels,
                    'can_manage' => $canManage
                ]);
            }
            
            // Mettre à jour un tableau
            if ($method === 'PUT' && $id && is_numeric($id) && !$action) {
                $user = require_auth();
                $data = get_input();
                
                $updates = [];
                $params = [];
                
                if (isset($data['name'])) { $updates[] = "name = ?"; $params[] = $data['name']; }
                if (isset($data['description'])) { $updates[] = "description = ?"; $params[] = $data['description']; }
                if (isset($data['color'])) { $updates[] = "color = ?"; $params[] = $data['color']; }
                if (isset($data['is_archived'])) { $updates[] = "is_archived = ?"; $params[] = $data['is_archived']; }
                
                if (!empty($updates)) {
                    $updates[] = "updated_at = NOW()";
                    $params[] = $id;
                    db()->execute("UPDATE task_boards SET " . implode(', ', $updates) . " WHERE id = ?", $params);
                }
                
                json_out(['success' => true]);
            }
            
            // Supprimer un tableau
            if ($method === 'DELETE' && $id && is_numeric($id) && !$action) {
                $user = require_auth();
                
                // Supprimer en cascade
                db()->execute("DELETE FROM task_checklists WHERE task_id IN (SELECT id FROM tasks WHERE board_id = ?)", [$id]);
                db()->execute("DELETE FROM task_comments WHERE task_id IN (SELECT id FROM tasks WHERE board_id = ?)", [$id]);
                db()->execute("DELETE FROM task_label_assignments WHERE task_id IN (SELECT id FROM tasks WHERE board_id = ?)", [$id]);
                db()->execute("DELETE FROM tasks WHERE board_id = ?", [$id]);
                db()->execute("DELETE FROM task_labels WHERE board_id = ?", [$id]);
                db()->execute("DELETE FROM task_columns WHERE board_id = ?", [$id]);
                db()->execute("DELETE FROM task_boards WHERE id = ?", [$id]);
                
                json_out(['success' => true]);
            }
            
            // Ajouter des membres au tableau - POST /tasks/{boardId}/members
            if ($method === 'POST' && $id && is_numeric($id) && $action === 'members') {
                $user = require_auth();
                $data = get_input();
                
                if (empty($data['user_ids']) || !is_array($data['user_ids'])) {
                    json_error('Liste d\'utilisateurs requise');
                }
                
                // Vérifier que l'utilisateur a le droit de gérer ce tableau
                $board = db()->queryOne("SELECT * FROM task_boards WHERE id = ?", [$id]);
                if (!$board) json_error('Tableau non trouvé', 404);
                
                $added = 0;
                foreach ($data['user_ids'] as $userId) {
                    try {
                        db()->insert(
                            "INSERT IGNORE INTO task_board_members (board_id, user_id, role, added_by, added_at) VALUES (?, ?, 'member', ?, NOW())",
                            [$id, $userId, $user['id']]
                        );
                        $added++;
                    } catch (Exception $e) {
                        // Ignorer les doublons
                    }
                }
                
                json_out(['success' => true, 'added' => $added], 201);
            }
            
            // Retirer un membre du tableau - DELETE /tasks/{boardId}/members/{userId}
            if ($method === 'DELETE' && $id && is_numeric($id) && $action === 'members' && $subId) {
                $user = require_auth();
                
                // Vérifier que l'utilisateur a le droit de gérer ce tableau
                $board = db()->queryOne("SELECT * FROM task_boards WHERE id = ?", [$id]);
                if (!$board) json_error('Tableau non trouvé', 404);
                
                // Ne pas permettre de retirer le propriétaire
                if ($board['created_by'] == $subId) {
                    json_error('Impossible de retirer le propriétaire du tableau');
                }
                
                db()->execute("DELETE FROM task_board_members WHERE board_id = ? AND user_id = ?", [$id, $subId]);
                
                // Retirer aussi les assignations de ce membre sur les tâches de ce tableau
                db()->execute(
                    "DELETE FROM task_assignees WHERE user_id = ? AND task_id IN (SELECT id FROM tasks WHERE board_id = ?)",
                    [$subId, $id]
                );
                
                json_out(['success' => true]);
            }
            
            // Ajouter une colonne
            if ($method === 'POST' && $id && $action === 'columns') {
                $user = require_auth();
                $data = get_input();
                
                if (empty($data['name'])) json_error('Nom requis');
                
                $maxPos = db()->queryOne("SELECT MAX(position) as max_pos FROM task_columns WHERE board_id = ?", [$id]);
                $position = ($maxPos['max_pos'] ?? -1) + 1;
                
                $colId = db()->insert(
                    "INSERT INTO task_columns (board_id, name, color, position, created_at) VALUES (?, ?, ?, ?, NOW())",
                    [$id, $data['name'], $data['color'] ?? '#6B7280', $position]
                );
                
                json_out(['success' => true, 'id' => $colId], 201);
            }
            
            // Mettre à jour une colonne
            if ($method === 'PUT' && $id && $action === 'columns' && $subId) {
                $user = require_auth();
                $data = get_input();
                
                $updates = [];
                $params = [];
                
                if (isset($data['name'])) { $updates[] = "name = ?"; $params[] = $data['name']; }
                if (isset($data['color'])) { $updates[] = "color = ?"; $params[] = $data['color']; }
                if (isset($data['position'])) { $updates[] = "position = ?"; $params[] = $data['position']; }
                
                if (!empty($updates)) {
                    $params[] = $subId;
                    db()->execute("UPDATE task_columns SET " . implode(', ', $updates) . " WHERE id = ?", $params);
                }
                
                json_out(['success' => true]);
            }
            
            // Supprimer une colonne
            if ($method === 'DELETE' && $id && $action === 'columns' && $subId) {
                $user = require_auth();
                
                // Déplacer les tâches vers la première colonne
                $firstCol = db()->queryOne("SELECT id FROM task_columns WHERE board_id = ? AND id != ? ORDER BY position LIMIT 1", [$id, $subId]);
                if ($firstCol) {
                    db()->execute("UPDATE tasks SET column_id = ? WHERE column_id = ?", [$firstCol['id'], $subId]);
                }
                
                db()->execute("DELETE FROM task_columns WHERE id = ?", [$subId]);
                
                json_out(['success' => true]);
            }
            
            // Créer une tâche - POST /tasks/{boardId}/tasks (sans subId ni subaction)
            if ($method === 'POST' && $id && $action === 'tasks' && !$subId) {
                $user = require_auth();
                
                // Supporter JSON et FormData
                $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
                if (strpos($contentType, 'multipart/form-data') !== false || !empty($_POST)) {
                    $data = $_POST;
                } else {
                    $data = get_input();
                }
                
                if (empty($data['title']) || empty($data['column_id'])) {
                    json_error('Titre et colonne requis');
                }
                
                $maxPos = db()->queryOne("SELECT MAX(position) as max_pos FROM tasks WHERE column_id = ?", [$data['column_id']]);
                $position = ($maxPos['max_pos'] ?? -1) + 1;
                
                $taskId = db()->insert(
                    "INSERT INTO tasks (board_id, column_id, title, description, priority, due_date, assigned_to, position, created_by, created_at) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                    [
                        $id, 
                        $data['column_id'], 
                        $data['title'], 
                        $data['description'] ?? '',
                        $data['priority'] ?? 'medium',
                        !empty($data['due_date']) ? $data['due_date'] : null,
                        !empty($data['assigned_to']) ? $data['assigned_to'] : null,
                        $position,
                        $user['id']
                    ]
                );
                
                // Gérer les assignations multiples
                if (!empty($data['assignee_ids'])) {
                    $assigneeIds = is_string($data['assignee_ids']) ? json_decode($data['assignee_ids'], true) : $data['assignee_ids'];
                    if (is_array($assigneeIds)) {
                        foreach ($assigneeIds as $assigneeId) {
                            try {
                                db()->insert(
                                    "INSERT IGNORE INTO task_assignees (task_id, user_id, assigned_by, assigned_at) VALUES (?, ?, ?, NOW())",
                                    [$taskId, $assigneeId, $user['id']]
                                );
                            } catch (Exception $e) {
                                // Table n'existe peut-être pas, ignorer
                            }
                        }
                    }
                }
                
                // Gérer les pièces jointes
                if (!empty($_FILES['attachments'])) {
                    $uploadDir = __DIR__ . '/../uploads/tasks/';
                    if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
                    
                    $files = $_FILES['attachments'];
                    $fileCount = is_array($files['name']) ? count($files['name']) : 1;
                    
                    for ($i = 0; $i < $fileCount; $i++) {
                        $name = is_array($files['name']) ? $files['name'][$i] : $files['name'];
                        $tmpName = is_array($files['tmp_name']) ? $files['tmp_name'][$i] : $files['tmp_name'];
                        $size = is_array($files['size']) ? $files['size'][$i] : $files['size'];
                        $type = is_array($files['type']) ? $files['type'][$i] : $files['type'];
                        $error = is_array($files['error']) ? $files['error'][$i] : $files['error'];
                        
                        if ($error === UPLOAD_ERR_OK && $size > 0) {
                            $singleFile = ['name' => $name, 'tmp_name' => $tmpName, 'size' => $size, 'type' => $type, 'error' => $error];
                            $uploadError = validateUpload($singleFile, 'any');
                            if ($uploadError) continue;

                            $ext = pathinfo($name, PATHINFO_EXTENSION);
                            $filename = 'task_' . $taskId . '_' . time() . '_' . uniqid() . '.' . $ext;
                            
                            if (move_uploaded_file($tmpName, $uploadDir . $filename)) {
                                try {
                                    db()->insert(
                                        "INSERT INTO task_attachments (task_id, filename, original_name, file_size, mime_type, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
                                        [$taskId, $filename, $name, $size, $type, $user['id']]
                                    );
                                } catch (Exception $e) {
                                    // Table n'existe peut-être pas, ignorer
                                }
                            }
                        }
                    }
                }
                
                // Notification si assigné à quelqu'un
                if (!empty($data['assigned_to']) && $data['assigned_to'] != $user['id']) {
                    $board = db()->queryOne("SELECT name FROM task_boards WHERE id = ?", [$id]);
                    try {
                        db()->insert(
                            "INSERT INTO notifications (user_id, type, title, message, created_at) VALUES (?, 'info', 'Nouvelle tâche assignée', ?, NOW())",
                            [$data['assigned_to'], "Tâche \"{$data['title']}\" dans le tableau " . ($board['name'] ?? '')]
                        );
                    } catch (Exception $e) {}
                }
                
                json_out(['success' => true, 'id' => $taskId], 201);
            }
            
            // Mettre à jour une tâche
            if ($method === 'PUT' && $id && $action === 'tasks' && $subId && !isset($_GET['move'])) {
                $user = require_auth();
                $data = get_input();
                
                // Récupérer la tâche actuelle pour comparer
                $currentTask = db()->queryOne("SELECT * FROM tasks WHERE id = ?", [$subId]);
                
                $updates = [];
                $params = [];
                
                if (isset($data['title'])) { $updates[] = "title = ?"; $params[] = $data['title']; }
                if (isset($data['description'])) { $updates[] = "description = ?"; $params[] = $data['description']; }
                if (isset($data['priority'])) { $updates[] = "priority = ?"; $params[] = $data['priority']; }
                if (isset($data['due_date'])) { $updates[] = "due_date = ?"; $params[] = $data['due_date'] ?: null; }
                if (isset($data['assigned_to'])) { $updates[] = "assigned_to = ?"; $params[] = $data['assigned_to'] ?: null; }
                if (isset($data['column_id'])) { $updates[] = "column_id = ?"; $params[] = $data['column_id']; }
                if (isset($data['position'])) { $updates[] = "position = ?"; $params[] = $data['position']; }
                
                if (isset($data['is_completed'])) {
                    $updates[] = "is_completed = ?";
                    $params[] = $data['is_completed'];
                    if ($data['is_completed']) {
                        $updates[] = "completed_at = NOW()";
                        $updates[] = "completed_by = ?";
                        $params[] = $user['id'];
                    } else {
                        $updates[] = "completed_at = NULL";
                        $updates[] = "completed_by = NULL";
                    }
                }
                
                if (isset($data['is_archived'])) {
                    $updates[] = "is_archived = ?";
                    $params[] = $data['is_archived'] ? 1 : 0;
                    if ($data['is_archived']) {
                        $updates[] = "archived_at = NOW()";
                        $updates[] = "archived_by = ?";
                        $params[] = $user['id'];
                    } else {
                        $updates[] = "archived_at = NULL";
                        $updates[] = "archived_by = NULL";
                    }
                }
                
                // Gérer les assignés multiples si fournis
                if (isset($data['assignee_ids'])) {
                    $assigneeIds = is_string($data['assignee_ids']) ? json_decode($data['assignee_ids'], true) : $data['assignee_ids'];
                    if (is_array($assigneeIds)) {
                        db()->execute("DELETE FROM task_assignees WHERE task_id = ?", [$subId]);
                        foreach ($assigneeIds as $aId) {
                            if ($aId) {
                                db()->insert(
                                    "INSERT IGNORE INTO task_assignees (task_id, user_id, assigned_at, assigned_by) VALUES (?, ?, NOW(), ?)",
                                    [$subId, $aId, $user['id']]
                                );
                            }
                        }
                        // Mettre à jour le champ legacy assigned_to
                        $updates[] = "assigned_to = ?";
                        $params[] = !empty($assigneeIds) ? $assigneeIds[0] : null;
                    }
                }

                if (!empty($updates)) {
                    $updates[] = "updated_at = NOW()";
                    $params[] = $subId;
                    db()->execute("UPDATE tasks SET " . implode(', ', $updates) . " WHERE id = ?", $params);
                }

                // Notification si assignation changée
                if (isset($data['assigned_to']) && $data['assigned_to'] != $currentTask['assigned_to'] && $data['assigned_to'] != $user['id'] && !empty($data['assigned_to'])) {
                    $board = db()->queryOne("SELECT name FROM task_boards WHERE id = ?", [$id]);
                    createNotification(
                        $data['assigned_to'],
                        'task_assigned',
                        'Tâche assignée',
                        "Tâche \"{$currentTask['title']}\" vous a été assignée",
                        'tasks',
                        $subId
                    );
                }
                
                json_out(['success' => true]);
            }
            
            // Déplacer une tâche (drag & drop)
            if ($method === 'PUT' && $id && $action === 'tasks' && $subId && isset($_GET['move'])) {
                $user = require_auth();
                $data = get_input();
                
                if (!isset($data['column_id']) || !isset($data['position'])) {
                    json_error('Colonne et position requises');
                }
                
                db()->execute(
                    "UPDATE tasks SET column_id = ?, position = ?, updated_at = NOW() WHERE id = ?",
                    [$data['column_id'], $data['position'], $subId]
                );
                
                json_out(['success' => true]);
            }
            
            // Ajouter un assigné - POST /tasks/{boardId}/tasks/{taskId}/assignees
            if ($method === 'POST' && $id && $action === 'tasks' && $subId && $subaction === 'assignees') {
                $user = require_auth();
                $data = get_input();
                $userId = $data['user_id'] ?? null;
                if (!$userId) json_error('user_id requis');

                // Vérifier que la tâche existe
                $task = db()->queryOne("SELECT id FROM tasks WHERE id = ? AND board_id = ?", [$subId, $id]);
                if (!$task) json_error('Tâche non trouvée', 404);

                db()->insert(
                    "INSERT IGNORE INTO task_assignees (task_id, user_id, assigned_at, assigned_by) VALUES (?, ?, NOW(), ?)",
                    [$subId, $userId, $user['id']]
                );

                // Mettre à jour le champ legacy assigned_to
                db()->execute("UPDATE tasks SET assigned_to = ?, updated_at = NOW() WHERE id = ?", [$userId, $subId]);

                json_out(['success' => true], 201);
            }

            // Retirer un assigné - DELETE /tasks/{boardId}/tasks/{taskId}/assignees/{userId}
            if ($method === 'DELETE' && $id && $action === 'tasks' && $subId && $subaction === 'assignees') {
                $user = require_auth();
                $removeUserId = $subSubId ?? ($_GET['user_id'] ?? null);
                if (!$removeUserId) json_error('user_id requis');

                db()->execute(
                    "DELETE FROM task_assignees WHERE task_id = ? AND user_id = ?",
                    [$subId, $removeUserId]
                );

                // Mettre à jour le champ legacy assigned_to
                $remaining = db()->queryOne("SELECT user_id FROM task_assignees WHERE task_id = ? LIMIT 1", [$subId]);
                db()->execute("UPDATE tasks SET assigned_to = ?, updated_at = NOW() WHERE id = ?",
                    [$remaining ? $remaining['user_id'] : null, $subId]);

                json_out(['success' => true]);
            }

            // Supprimer une tâche (seulement si pas de subaction, pour ne pas confondre avec assignees)
            if ($method === 'DELETE' && $id && $action === 'tasks' && $subId && !$subaction) {
                $user = require_auth();

                db()->execute("DELETE FROM task_assignees WHERE task_id = ?", [$subId]);
                db()->execute("DELETE FROM task_checklists WHERE task_id = ?", [$subId]);
                db()->execute("DELETE FROM task_comments WHERE task_id = ?", [$subId]);
                db()->execute("DELETE FROM task_label_assignments WHERE task_id = ?", [$subId]);
                db()->execute("DELETE FROM tasks WHERE id = ?", [$subId]);

                json_out(['success' => true]);
            }
            
            // Récupérer les tâches archivées - GET /tasks/{boardId}/archived
            if ($method === 'GET' && $id && is_numeric($id) && $action === 'archived') {
                $user = require_auth();
                
                $tasks = db()->query(
                    "SELECT t.*, CONCAT(u.first_name, ' ', u.last_name) as created_by_name
                     FROM tasks t
                     LEFT JOIN users u ON t.created_by = u.id
                     WHERE t.board_id = ? AND t.is_archived = 1
                     ORDER BY t.archived_at DESC",
                    [$id]
                );
                
                json_out(['success' => true, 'tasks' => $tasks]);
            }
            
            // Récupérer une tâche avec détails
            if ($method === 'GET' && $id && $action === 'tasks' && $subId) {
                $user = require_auth();
                
                $task = db()->queryOne(
                    "SELECT t.*, CONCAT(u.first_name, ' ', u.last_name) as assigned_to_name,
                            CONCAT(uc.first_name, ' ', uc.last_name) as created_by_name
                     FROM tasks t
                     LEFT JOIN users u ON t.assigned_to = u.id
                     LEFT JOIN users uc ON t.created_by = uc.id
                     WHERE t.id = ?",
                    [$subId]
                );
                
                if (!$task) json_error('Tâche non trouvée', 404);
                
                // Commentaires
                $comments = [];
                try {
                    $comments = db()->query(
                        "SELECT c.*, CONCAT(u.first_name, ' ', u.last_name) as user_name
                         FROM task_comments c
                         LEFT JOIN users u ON c.user_id = u.id
                         WHERE c.task_id = ?
                         ORDER BY c.created_at ASC",
                        [$subId]
                    );
                } catch (Exception $e) {}
                
                // Checklist
                $checklist = [];
                try {
                    $checklist = db()->query(
                        "SELECT * FROM task_checklists WHERE task_id = ? ORDER BY position",
                        [$subId]
                    );
                } catch (Exception $e) {}
                
                // Assignés multiples
                $assignees = [];
                try {
                    $assignees = db()->query(
                        "SELECT u.id, u.first_name, u.last_name
                         FROM task_assignees ta
                         JOIN users u ON ta.user_id = u.id
                         WHERE ta.task_id = ?",
                        [$subId]
                    );
                } catch (Exception $e) {}
                
                // Pièces jointes
                $attachments = [];
                try {
                    $attachments = db()->query(
                        "SELECT * FROM task_attachments WHERE task_id = ? ORDER BY uploaded_at",
                        [$subId]
                    );
                } catch (Exception $e) {}
                
                json_out([
                    'success' => true,
                    'task' => $task,
                    'comments' => $comments,
                    'checklist' => $checklist,
                    'assignees' => $assignees,
                    'attachments' => $attachments
                ]);
            }
            
            // Ajouter un commentaire à une tâche - POST /tasks/{boardId}/tasks/{taskId}/comments
            if ($method === 'POST' && $id && $action === 'tasks' && $subId && $subaction === 'comments') {
                $user = require_auth();
                $data = get_input();
                
                if (empty($data['comment'])) json_error('Commentaire requis');
                
                $commentId = db()->insert(
                    "INSERT INTO task_comments (task_id, user_id, comment, created_at) VALUES (?, ?, ?, NOW())",
                    [$subId, $user['id'], $data['comment']]
                );
                
                json_out(['success' => true, 'id' => $commentId], 201);
            }
            
            // Gérer la checklist - POST /tasks/{boardId}/tasks/{taskId}/checklist
            if ($method === 'POST' && $id && $action === 'tasks' && $subId && $subaction === 'checklist') {
                $user = require_auth();
                $data = get_input();
                
                if (empty($data['item_text'])) json_error('Texte requis');
                
                $maxPos = db()->queryOne("SELECT MAX(position) as max_pos FROM task_checklists WHERE task_id = ?", [$subId]);
                $position = ($maxPos['max_pos'] ?? -1) + 1;
                
                $itemId = db()->insert(
                    "INSERT INTO task_checklists (task_id, item_text, position, created_at) VALUES (?, ?, ?, NOW())",
                    [$subId, $data['item_text'], $position]
                );
                
                json_out(['success' => true, 'id' => $itemId], 201);
            }
            
            // Cocher/décocher ou modifier un item de checklist
            if ($method === 'PUT' && $id && $action === 'checklist' && $subId) {
                $user = require_auth();
                $data = get_input();
                
                $updates = [];
                $params = [];
                
                // Mise à jour du texte
                if (isset($data['item_text'])) {
                    $updates[] = "item_text = ?";
                    $params[] = $data['item_text'];
                }
                
                // Mise à jour du statut coché
                if (isset($data['is_checked'])) {
                    $isChecked = $data['is_checked'];
                    $updates[] = "is_checked = ?";
                    $params[] = $isChecked ? 1 : 0;
                    $updates[] = "checked_by = ?";
                    $params[] = $isChecked ? $user['id'] : null;
                    $updates[] = "checked_at = ?";
                    $params[] = $isChecked ? date('Y-m-d H:i:s') : null;
                }
                
                if (!empty($updates)) {
                    $params[] = $subId;
                    db()->execute(
                        "UPDATE task_checklists SET " . implode(', ', $updates) . " WHERE id = ?",
                        $params
                    );
                }
                
                json_out(['success' => true]);
            }
            
            // Supprimer un item de checklist
            if ($method === 'DELETE' && $id && $action === 'checklist' && $subId) {
                $user = require_auth();
                db()->execute("DELETE FROM task_checklists WHERE id = ?", [$subId]);
                json_out(['success' => true]);
            }
            
            break;
        
        // --- EVALUATIONS ---
        case 'evaluations':
            // Liste des grilles - GET /evaluations/grids
            if ($method === 'GET' && $id === 'grids' && !$action) {
                $user = require_auth();
                if (!hasPermission($user['role'], 'evaluations.grids')) json_error('Accès refusé', 403);
                try {
                    if ($user['role'] === 'admin') {
                        $grids = db()->query("SELECT g.*, h.name as hotel_name, (SELECT COUNT(*) FROM evaluation_questions q WHERE q.grid_id = g.id) as question_count FROM evaluation_grids g LEFT JOIN hotels h ON g.hotel_id = h.id ORDER BY g.created_at DESC");
                    } else {
                        // Pour les autres rôles, montrer les grilles globales + celles de leurs hôtels
                        $grids = db()->query("SELECT g.*, h.name as hotel_name, (SELECT COUNT(*) FROM evaluation_questions q WHERE q.grid_id = g.id) as question_count FROM evaluation_grids g LEFT JOIN hotels h ON g.hotel_id = h.id WHERE g.hotel_id IS NULL OR g.hotel_id IN (SELECT hotel_id FROM user_hotels WHERE user_id = ?) ORDER BY g.created_at DESC", [$user['id']]);
                    }
                } catch (Exception $e) { $grids = []; }
                json_out(['success' => true, 'grids' => $grids]);
            }
            
            // Créer une grille complète avec questions - POST /evaluations/grids/full
            if ($method === 'POST' && $id === 'grids' && $action === 'full') {
                $user = require_auth();
                if (!hasPermission($user['role'], 'evaluations.grids')) json_error('Accès refusé', 403);
                $data = get_input();
                if (empty($data['name']) || empty($data['target_role'])) json_error('Nom et rôle cible requis');
                
                $gridId = db()->insert(
                    "INSERT INTO evaluation_grids (name, hotel_id, target_role, periodicity, instructions, is_active, created_by, created_at) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
                    [$data['name'], $data['hotel_id'] ?: null, $data['target_role'], 
                     $data['periodicity'] ?? 'quarterly', $data['instructions'] ?? '', 
                     $data['is_active'] ?? 1, $user['id']]
                );
                
                // Ajouter les questions
                if (!empty($data['questions'])) {
                    foreach ($data['questions'] as $idx => $q) {
                        if (empty($q['question_text'])) continue;
                        db()->insert(
                            "INSERT INTO evaluation_questions (grid_id, question_text, category, weight, response_type, min_score, max_score, choices, multiple_selection, position, comment_required, file_optional, file_required, created_at) 
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                            [$gridId, $q['question_text'], $q['category'] ?? null, 
                             $q['weight'] ?? 1, $q['response_type'] ?? 'score',
                             $q['min_score'] ?? 1, $q['max_score'] ?? 10,
                             $q['choices'] ?? null, $q['multiple_selection'] ?? 0,
                             $idx, $q['comment_required'] ?? 0,
                             $q['file_optional'] ?? 0, $q['file_required'] ?? 0]
                        );
                    }
                }
                json_out(['success' => true, 'id' => $gridId], 201);
            }
            
            // Créer une grille - POST /evaluations/grids
            if ($method === 'POST' && $id === 'grids' && !$action) {
                $user = require_auth();
                if (!hasPermission($user['role'], 'evaluations.grids')) json_error('Accès refusé', 403);
                $data = get_input();
                if (empty($data['name']) || empty($data['target_role'])) json_error('Nom et rôle cible requis');
                $gridId = db()->insert("INSERT INTO evaluation_grids (name, hotel_id, target_role, periodicity, instructions, allow_attachment, is_active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())", [$data['name'], $data['hotel_id'] ?: null, $data['target_role'], $data['periodicity'] ?? 'quarterly', $data['instructions'] ?? '', $data['allow_attachment'] ?? 0, $data['is_active'] ?? 1, $user['id']]);
                json_out(['success' => true, 'id' => $gridId], 201);
            }
            // Récupérer une grille - GET /evaluations/grids/{id}
            if ($method === 'GET' && $id === 'grids' && $action && is_numeric($action)) {
                $user = require_auth();
                $grid = db()->queryOne("SELECT g.*, h.name as hotel_name FROM evaluation_grids g LEFT JOIN hotels h ON g.hotel_id = h.id WHERE g.id = ?", [$action]);
                if (!$grid) json_error('Grille non trouvée', 404);
                $questions = db()->query("SELECT * FROM evaluation_questions WHERE grid_id = ? ORDER BY position, id", [$action]);
                json_out(['success' => true, 'grid' => $grid, 'questions' => $questions]);
            }
            
            // Mettre à jour une grille complète - PUT /evaluations/grids/{id}/full
            if ($method === 'PUT' && $id === 'grids' && $action && is_numeric($action) && $subaction === 'full') {
                $user = require_auth();
                if (!hasPermission($user['role'], 'evaluations.grids')) json_error('Accès refusé', 403);
                $data = get_input();
                
                // Mettre à jour la grille
                db()->execute(
                    "UPDATE evaluation_grids SET name = ?, hotel_id = ?, target_role = ?, periodicity = ?, 
                     instructions = ?, is_active = ?, updated_at = NOW() WHERE id = ?",
                    [$data['name'], $data['hotel_id'] ?: null, $data['target_role'], 
                     $data['periodicity'] ?? 'quarterly', $data['instructions'] ?? '', 
                     $data['is_active'] ?? 1, $action]
                );
                
                // Supprimer les anciennes questions et recréer
                if (isset($data['questions'])) {
                    db()->execute("DELETE FROM evaluation_questions WHERE grid_id = ?", [$action]);
                    foreach ($data['questions'] as $idx => $q) {
                        if (empty($q['question_text'])) continue;
                        db()->insert(
                            "INSERT INTO evaluation_questions (grid_id, question_text, category, weight, response_type, min_score, max_score, choices, multiple_selection, position, comment_required, file_optional, file_required, created_at) 
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                            [$action, $q['question_text'], $q['category'] ?? null, 
                             $q['weight'] ?? 1, $q['response_type'] ?? 'score',
                             $q['min_score'] ?? 1, $q['max_score'] ?? 10,
                             $q['choices'] ?? null, $q['multiple_selection'] ?? 0,
                             $idx, $q['comment_required'] ?? 0,
                             $q['file_optional'] ?? 0, $q['file_required'] ?? 0]
                        );
                    }
                }
                json_out(['success' => true]);
            }
            
            // Mettre à jour une grille - PUT /evaluations/grids/{id}
            if ($method === 'PUT' && $id === 'grids' && $action && is_numeric($action) && !$subaction) {
                $user = require_auth();
                if (!hasPermission($user['role'], 'evaluations.grids')) json_error('Accès refusé', 403);
                $data = get_input(); $updates = []; $params = [];
                if (isset($data['name'])) { $updates[] = "name = ?"; $params[] = $data['name']; }
                if (isset($data['hotel_id'])) { $updates[] = "hotel_id = ?"; $params[] = $data['hotel_id'] ?: null; }
                if (isset($data['target_role'])) { $updates[] = "target_role = ?"; $params[] = $data['target_role']; }
                if (isset($data['periodicity'])) { $updates[] = "periodicity = ?"; $params[] = $data['periodicity']; }
                if (isset($data['instructions'])) { $updates[] = "instructions = ?"; $params[] = $data['instructions']; }
                if (isset($data['allow_attachment'])) { $updates[] = "allow_attachment = ?"; $params[] = $data['allow_attachment']; }
                if (isset($data['is_active'])) { $updates[] = "is_active = ?"; $params[] = $data['is_active']; }
                if (!empty($updates)) { $updates[] = "updated_at = NOW()"; $params[] = $action; db()->execute("UPDATE evaluation_grids SET " . implode(', ', $updates) . " WHERE id = ?", $params); }
                json_out(['success' => true]);
            }
            // Dupliquer une grille - POST /evaluations/grids/{id}/duplicate
            if ($method === 'POST' && $id === 'grids' && $action && is_numeric($action) && $subId === 'duplicate') {
                $user = require_auth();
                if (!hasPermission($user['role'], 'evaluations.grids')) json_error('Accès refusé', 403);
                $data = get_input();
                $original = db()->queryOne("SELECT * FROM evaluation_grids WHERE id = ?", [$action]);
                if (!$original) json_error('Grille non trouvée', 404);
                $newGridId = db()->insert("INSERT INTO evaluation_grids (name, hotel_id, target_role, periodicity, instructions, allow_attachment, is_active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, NOW())", [($data['name'] ?? $original['name'] . ' (copie)'), $original['hotel_id'], $original['target_role'], $original['periodicity'], $original['instructions'], $original['allow_attachment'], $user['id']]);
                $questions = db()->query("SELECT * FROM evaluation_questions WHERE grid_id = ?", [$action]);
                foreach ($questions as $q) { db()->insert("INSERT INTO evaluation_questions (grid_id, question_text, category, weight, position, is_required, comment_required, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())", [$newGridId, $q['question_text'], $q['category'], $q['weight'], $q['position'], $q['is_required'], $q['comment_required']]); }
                json_out(['success' => true, 'id' => $newGridId], 201);
            }
            // Supprimer une grille - DELETE /evaluations/grids/{id}
            if ($method === 'DELETE' && $id === 'grids' && $action && is_numeric($action)) {
                $user = require_auth();
                if (!hasPermission($user['role'], 'evaluations.grids')) json_error('Accès refusé', 403);
                db()->execute("DELETE FROM evaluation_questions WHERE grid_id = ?", [$action]);
                db()->execute("DELETE FROM evaluation_grids WHERE id = ?", [$action]);
                json_out(['success' => true]);
            }
            // Ajouter une question - POST /evaluations/grids/{id}/questions
            if ($method === 'POST' && $id === 'grids' && $action && is_numeric($action) && $subId === 'questions') {
                $user = require_auth();
                if (!hasPermission($user['role'], 'evaluations.grids')) json_error('Accès refusé', 403);
                $data = get_input();
                if (empty($data['question_text'])) json_error('Intitulé requis');
                $maxPos = db()->queryOne("SELECT MAX(position) as max_pos FROM evaluation_questions WHERE grid_id = ?", [$action]);
                $questionId = db()->insert("INSERT INTO evaluation_questions (grid_id, question_text, category, weight, position, is_required, comment_required, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())", [$action, $data['question_text'], $data['category'] ?? null, $data['weight'] ?? 1.0, ($maxPos['max_pos'] ?? -1) + 1, $data['is_required'] ?? 1, $data['comment_required'] ?? 0]);
                json_out(['success' => true, 'id' => $questionId], 201);
            }
            // Mettre à jour une question - PUT /evaluations/questions/{id}
            if ($method === 'PUT' && $id === 'questions' && $action && is_numeric($action)) {
                $user = require_auth();
                if (!hasPermission($user['role'], 'evaluations.grids')) json_error('Accès refusé', 403);
                $data = get_input(); $updates = []; $params = [];
                if (isset($data['question_text'])) { $updates[] = "question_text = ?"; $params[] = $data['question_text']; }
                if (isset($data['category'])) { $updates[] = "category = ?"; $params[] = $data['category']; }
                if (isset($data['weight'])) { $updates[] = "weight = ?"; $params[] = $data['weight']; }
                if (isset($data['position'])) { $updates[] = "position = ?"; $params[] = $data['position']; }
                if (!empty($updates)) { $params[] = $action; db()->execute("UPDATE evaluation_questions SET " . implode(', ', $updates) . " WHERE id = ?", $params); }
                json_out(['success' => true]);
            }
            // Supprimer une question - DELETE /evaluations/questions/{id}
            if ($method === 'DELETE' && $id === 'questions' && $action && is_numeric($action)) {
                $user = require_auth();
                if (!hasPermission($user['role'], 'evaluations.grids')) json_error('Accès refusé', 403);
                db()->execute("DELETE FROM evaluation_questions WHERE id = ?", [$action]);
                json_out(['success' => true]);
            }
            // Liste des évaluations - GET /evaluations
            if ($method === 'GET' && !$id) {
                $user = require_auth();
                
                // Vérifier les permissions
                $canView = hasPermission($user['role'], 'evaluations.view');
                $canViewTeam = hasPermission($user['role'], 'evaluations.view_team');
                
                if (!$canView && !$canViewTeam) {
                    json_error('Accès refusé', 403);
                }
                
                $where = "1=1"; 
                $params = [];
                
                // Filtrage selon les permissions
                if ($user['role'] !== 'admin') {
                    // Limiter aux hôtels de l'utilisateur
                    $where .= " AND e.hotel_id IN (SELECT hotel_id FROM user_hotels WHERE user_id = ?)";
                    $params[] = $user['id'];
                }
                
                // Filtres optionnels
                if (!empty($_GET['hotel_id'])) { 
                    $where .= " AND e.hotel_id = ?"; 
                    $params[] = $_GET['hotel_id']; 
                }
                if (!empty($_GET['user_id'])) { 
                    $where .= " AND e.evaluated_user_id = ?"; 
                    $params[] = $_GET['user_id']; 
                }
                if (!empty($_GET['grid_id'])) { 
                    $where .= " AND e.grid_id = ?"; 
                    $params[] = $_GET['grid_id']; 
                }
                if (!empty($_GET['status'])) { 
                    $where .= " AND e.status = ?"; 
                    $params[] = $_GET['status']; 
                }
                if (!empty($_GET['date_from'])) { 
                    $where .= " AND e.evaluation_date >= ?"; 
                    $params[] = $_GET['date_from']; 
                }
                if (!empty($_GET['date_to'])) { 
                    $where .= " AND e.evaluation_date <= ?"; 
                    $params[] = $_GET['date_to']; 
                }
                
                try { 
                    $evaluations = db()->query(
                        "SELECT e.*, g.name as grid_name, h.name as hotel_name, 
                         CONCAT(eu.first_name, ' ', eu.last_name) as evaluated_name, 
                         eu.role as evaluated_role, eu.id as evaluated_user_id,
                         CONCAT(ev.first_name, ' ', ev.last_name) as evaluator_name 
                         FROM evaluations e 
                         JOIN evaluation_grids g ON e.grid_id = g.id 
                         JOIN hotels h ON e.hotel_id = h.id 
                         JOIN users eu ON e.evaluated_user_id = eu.id 
                         JOIN users ev ON e.evaluator_id = ev.id 
                         WHERE $where 
                         ORDER BY e.evaluation_date DESC", 
                        $params
                    ); 
                } catch (Exception $e) { 
                    $evaluations = []; 
                }
                
                json_out(['success' => true, 'evaluations' => $evaluations]);
            }
            // Mes évaluations - GET /evaluations/mine
            if ($method === 'GET' && $id === 'mine') {
                $user = require_auth();
                try { $evaluations = db()->query("SELECT e.*, g.name as grid_name, h.name as hotel_name, CONCAT(ev.first_name, ' ', ev.last_name) as evaluator_name FROM evaluations e JOIN evaluation_grids g ON e.grid_id = g.id JOIN hotels h ON e.hotel_id = h.id JOIN users ev ON e.evaluator_id = ev.id WHERE e.evaluated_user_id = ? AND e.status = 'validated' ORDER BY e.evaluation_date DESC", [$user['id']]); } catch (Exception $e) { $evaluations = []; }
                json_out(['success' => true, 'evaluations' => $evaluations]);
            }
            // Utilisateurs évaluables - GET /evaluations/users
            if ($method === 'GET' && $id === 'users') {
                $user = require_auth();
                if (!in_array($user['role'], ['admin', 'groupe_manager', 'hotel_manager', 'rh'])) json_error('Accès refusé', 403);
                $where = "u.status = 'active'"; $params = [];
                if ($user['role'] !== 'admin') { $where .= " AND uh.hotel_id IN (SELECT hotel_id FROM user_hotels WHERE user_id = ?) AND u.role != 'admin'"; $params[] = $user['id']; }
                if (!empty($_GET['hotel_id'])) { $where .= " AND uh.hotel_id = ?"; $params[] = $_GET['hotel_id']; }
                if (!empty($_GET['role'])) { $where .= " AND u.role = ?"; $params[] = $_GET['role']; }
                $users = db()->query("SELECT DISTINCT u.id, u.first_name, u.last_name, u.email, u.role, h.name as hotel_name, h.id as hotel_id FROM users u JOIN user_hotels uh ON u.id = uh.user_id JOIN hotels h ON uh.hotel_id = h.id WHERE $where ORDER BY h.name, u.last_name", $params);
                json_out(['success' => true, 'users' => $users]);
            }
            // Créer une évaluation - POST /evaluations
            if ($method === 'POST' && !$id) {
                $user = require_auth();
                if (!in_array($user['role'], ['admin', 'groupe_manager', 'hotel_manager', 'rh'])) json_error('Accès refusé', 403);
                $data = get_input();
                if (empty($data['grid_id']) || empty($data['hotel_id']) || empty($data['evaluated_user_id'])) json_error('Données manquantes');
                $evaluatorId = !empty($data['evaluator_id']) ? $data['evaluator_id'] : $user['id'];
                $evalId = db()->insert("INSERT INTO evaluations (grid_id, hotel_id, evaluated_user_id, evaluator_id, evaluation_date, period_start, period_end, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', NOW())", [$data['grid_id'], $data['hotel_id'], $data['evaluated_user_id'], $evaluatorId, $data['evaluation_date'] ?? date('Y-m-d'), $data['period_start'] ?? null, $data['period_end'] ?? null]);
                json_out(['success' => true, 'id' => $evalId], 201);
            }
            // Récupérer une évaluation - GET /evaluations/{id}
            if ($method === 'GET' && $id && is_numeric($id) && !$action) {
                $user = require_auth();
                $evaluation = db()->queryOne("SELECT e.*, g.name as grid_name, g.instructions, g.allow_attachment, h.name as hotel_name, CONCAT(eu.first_name, ' ', eu.last_name) as evaluated_name, eu.role as evaluated_role, CONCAT(ev.first_name, ' ', ev.last_name) as evaluator_name FROM evaluations e JOIN evaluation_grids g ON e.grid_id = g.id JOIN hotels h ON e.hotel_id = h.id JOIN users eu ON e.evaluated_user_id = eu.id JOIN users ev ON e.evaluator_id = ev.id WHERE e.id = ?", [$id]);
                if (!$evaluation) json_error('Évaluation non trouvée', 404);
                $questions = db()->query("SELECT q.*, a.score, a.answer_yesno, a.answer_choice, a.comment as answer_comment, a.file_url FROM evaluation_questions q LEFT JOIN evaluation_answers a ON q.id = a.question_id AND a.evaluation_id = ? WHERE q.grid_id = ? ORDER BY q.position, q.id", [$id, $evaluation['grid_id']]);
                json_out(['success' => true, 'evaluation' => $evaluation, 'questions' => $questions]);
            }
            // Sauvegarder une évaluation - PUT /evaluations/{id}
            if ($method === 'PUT' && $id && is_numeric($id) && !$action) {
                $user = require_auth();
                $evaluation = db()->queryOne("SELECT * FROM evaluations WHERE id = ?", [$id]);
                if (!$evaluation) json_error('Évaluation non trouvée', 404);
                $data = get_input(); $updates = []; $params = [];
                if (isset($data['global_comment'])) { $updates[] = "global_comment = ?"; $params[] = $data['global_comment']; }
                if (isset($data['conclusion'])) { $updates[] = "conclusion = ?"; $params[] = $data['conclusion']; }
                if (isset($data['status'])) { $updates[] = "status = ?"; $params[] = $data['status']; if ($data['status'] === 'validated') { $updates[] = "validated_at = NOW()"; } }
                if (!empty($data['answers'])) {
                    foreach ($data['answers'] as $questionId => $answer) {
                        $existing = db()->queryOne("SELECT id FROM evaluation_answers WHERE evaluation_id = ? AND question_id = ?", [$id, $questionId]);
                        if ($existing) { db()->execute("UPDATE evaluation_answers SET score = ?, comment = ? WHERE id = ?", [$answer['score'], $answer['comment'] ?? '', $existing['id']]); }
                        else { db()->insert("INSERT INTO evaluation_answers (evaluation_id, question_id, score, comment) VALUES (?, ?, ?, ?)", [$id, $questionId, $answer['score'], $answer['comment'] ?? '']); }
                    }
                    $scoreData = db()->queryOne("SELECT AVG(a.score) as simple_avg, SUM(a.score * q.weight) / SUM(q.weight) as weighted_avg FROM evaluation_answers a JOIN evaluation_questions q ON a.question_id = q.id WHERE a.evaluation_id = ?", [$id]);
                    $updates[] = "score_simple = ?"; $params[] = round($scoreData['simple_avg'], 2);
                    $updates[] = "score_weighted = ?"; $params[] = round($scoreData['weighted_avg'], 2);
                }
                if (!empty($updates)) { $updates[] = "updated_at = NOW()"; $params[] = $id; db()->execute("UPDATE evaluations SET " . implode(', ', $updates) . " WHERE id = ?", $params); }
                json_out(['success' => true]);
            }
            
            // Sauvegarder une évaluation avec fichiers - POST /evaluations/{id}/save
            if ($method === 'POST' && $id && is_numeric($id) && $action === 'save') {
                $user = require_auth();
                $evaluation = db()->queryOne("SELECT * FROM evaluations WHERE id = ?", [$id]);
                if (!$evaluation) json_error('Évaluation non trouvée', 404);
                
                $updates = []; $params = [];
                if (isset($_POST['global_comment'])) { $updates[] = "global_comment = ?"; $params[] = $_POST['global_comment']; }
                if (isset($_POST['conclusion'])) { $updates[] = "conclusion = ?"; $params[] = $_POST['conclusion']; }
                if (isset($_POST['status'])) { 
                    $updates[] = "status = ?"; $params[] = $_POST['status']; 
                    if ($_POST['status'] === 'validated') { $updates[] = "validated_at = NOW()"; } 
                }
                
                // Traiter les réponses JSON
                $answers = [];
                if (!empty($_POST['answers_json'])) {
                    $answers = json_decode($_POST['answers_json'], true) ?: [];
                }
                
                // Créer le dossier uploads si nécessaire
                $uploadDir = __DIR__ . '/../uploads/evaluations/';
                if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
                
                // Supprimer les fichiers marqués
                if (!empty($_POST['remove_files'])) {
                    $removeIds = explode(',', $_POST['remove_files']);
                    foreach ($removeIds as $qId) {
                        $existing = db()->queryOne("SELECT file_url FROM evaluation_answers WHERE evaluation_id = ? AND question_id = ?", [$id, $qId]);
                        if ($existing && $existing['file_url']) {
                            $filePath = __DIR__ . '/../' . $existing['file_url'];
                            if (file_exists($filePath)) unlink($filePath);
                            db()->execute("UPDATE evaluation_answers SET file_url = NULL WHERE evaluation_id = ? AND question_id = ?", [$id, $qId]);
                        }
                    }
                }
                
                // Traiter chaque réponse
                foreach ($answers as $questionId => $answer) {
                    $existing = db()->queryOne("SELECT id, file_url FROM evaluation_answers WHERE evaluation_id = ? AND question_id = ?", [$id, $questionId]);
                    
                    $fileUrl = $existing ? $existing['file_url'] : null;
                    
                    // Upload fichier si présent
                    if (isset($_FILES['files']) && isset($_FILES['files']['name'][$questionId]) && $_FILES['files']['error'][$questionId] === UPLOAD_ERR_OK) {
                        $tmpName = $_FILES['files']['tmp_name'][$questionId];
                        $originalName = $_FILES['files']['name'][$questionId];
                        $evalFile = ['name' => $originalName, 'tmp_name' => $tmpName, 'size' => $_FILES['files']['size'][$questionId], 'type' => $_FILES['files']['type'][$questionId], 'error' => $_FILES['files']['error'][$questionId]];
                        $uploadError = validateUpload($evalFile, 'image');
                        if ($uploadError) json_error($uploadError);

                        $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
                        
                        if (in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'])) {
                            // Supprimer ancien fichier
                            if ($fileUrl) {
                                $oldPath = __DIR__ . '/../' . $fileUrl;
                                if (file_exists($oldPath)) unlink($oldPath);
                            }
                            
                            $newFileName = 'eval_' . $id . '_q' . $questionId . '_' . time() . '.' . $ext;
                            $newPath = $uploadDir . $newFileName;
                            
                            if (move_uploaded_file($tmpName, $newPath)) {
                                $fileUrl = 'uploads/evaluations/' . $newFileName;
                            }
                        }
                    }
                    
                    if ($existing) {
                        db()->execute(
                            "UPDATE evaluation_answers SET score = ?, answer_yesno = ?, answer_choice = ?, comment = ?, file_url = ? WHERE id = ?", 
                            [$answer['score'] ?? null, $answer['yesno'] ?? null, $answer['choice'] ?? null, $answer['comment'] ?? '', $fileUrl, $existing['id']]
                        );
                    } else {
                        db()->insert(
                            "INSERT INTO evaluation_answers (evaluation_id, question_id, score, answer_yesno, answer_choice, comment, file_url) VALUES (?, ?, ?, ?, ?, ?, ?)", 
                            [$id, $questionId, $answer['score'] ?? null, $answer['yesno'] ?? null, $answer['choice'] ?? null, $answer['comment'] ?? '', $fileUrl]
                        );
                    }
                }
                
                // Calculer les scores (incluant yesno: yes=max, no=0, na=exclus)
                $scoreData = db()->queryOne(
                    "SELECT 
                        AVG(CASE 
                            WHEN q.response_type = 'yesno' AND a.answer_yesno = 'yes' THEN q.max_score
                            WHEN q.response_type = 'yesno' AND a.answer_yesno = 'no' THEN 0
                            WHEN q.response_type = 'score' THEN a.score
                            ELSE NULL
                        END) as simple_avg,
                        SUM(CASE 
                            WHEN q.response_type = 'yesno' AND a.answer_yesno = 'yes' THEN q.max_score * q.weight
                            WHEN q.response_type = 'yesno' AND a.answer_yesno = 'no' THEN 0
                            WHEN q.response_type = 'score' THEN a.score * q.weight
                            ELSE 0
                        END) / NULLIF(SUM(CASE 
                            WHEN q.response_type = 'yesno' AND a.answer_yesno IN ('yes', 'no') THEN q.max_score * q.weight
                            WHEN q.response_type = 'score' AND a.score IS NOT NULL THEN q.max_score * q.weight
                            ELSE 0
                        END), 0) * 100 as weighted_percent
                     FROM evaluation_answers a 
                     JOIN evaluation_questions q ON a.question_id = q.id 
                     WHERE a.evaluation_id = ? AND (a.score IS NOT NULL OR a.answer_yesno IN ('yes', 'no'))", 
                    [$id]
                );
                if ($scoreData['simple_avg']) {
                    $updates[] = "score_simple = ?"; $params[] = round($scoreData['simple_avg'], 2);
                }
                if ($scoreData['weighted_percent']) {
                    $updates[] = "score_weighted = ?"; $params[] = round($scoreData['weighted_percent'], 2);
                }
                
                if (!empty($updates)) { 
                    $updates[] = "updated_at = NOW()"; 
                    $params[] = $id; 
                    db()->execute("UPDATE evaluations SET " . implode(', ', $updates) . " WHERE id = ?", $params); 
                }
                
                json_out(['success' => true]);
            }
            // Supprimer une évaluation - DELETE /evaluations/{id}
            if ($method === 'DELETE' && $id && is_numeric($id) && !$action) {
                $user = require_auth();
                if (!in_array($user['role'], ['admin', 'groupe_manager'])) json_error('Accès refusé', 403);
                db()->execute("DELETE FROM evaluation_answers WHERE evaluation_id = ?", [$id]);
                db()->execute("DELETE FROM evaluations WHERE id = ?", [$id]);
                json_out(['success' => true]);
            }
            // Statistiques - GET /evaluations/stats
            if ($method === 'GET' && $id === 'stats') {
                $user = require_auth();
                $where = "e.status = 'validated'"; $params = [];
                if ($user['role'] !== 'admin') { $where .= " AND e.hotel_id IN (SELECT hotel_id FROM user_hotels WHERE user_id = ?)"; $params[] = $user['id']; }
                if (!empty($_GET['hotel_id'])) { $where .= " AND e.hotel_id = ?"; $params[] = $_GET['hotel_id']; }
                if (!empty($_GET['user_id'])) { $where .= " AND e.evaluated_user_id = ?"; $params[] = $_GET['user_id']; }
                try {
                    $stats = db()->queryOne("SELECT COUNT(*) as total, AVG(score_simple) as avg_score, MIN(score_simple) as min_score, MAX(score_simple) as max_score FROM evaluations e WHERE $where", $params);
                    $byCategory = db()->query("SELECT q.category, AVG(a.score) as avg_score FROM evaluation_answers a JOIN evaluation_questions q ON a.question_id = q.id JOIN evaluations e ON a.evaluation_id = e.id WHERE $where AND q.category IS NOT NULL GROUP BY q.category", $params);
                } catch (Exception $e) { $stats = ['total' => 0]; $byCategory = []; }
                json_out(['success' => true, 'stats' => $stats, 'by_category' => $byCategory]);
            }
            break;
        
        // --- DISPATCH (Gouvernante) ---
        case 'dispatch':
            // Liste des dispatches
            if ($method === 'GET' && !$id) {
                require_auth();
                $date = $_GET['date'] ?? date('Y-m-d');
                $where = "d.dispatch_date = ?";
                $params = [$date];
                
                if (!empty($_GET['hotel_id'])) {
                    $where .= " AND r.hotel_id = ?";
                    $params[] = $_GET['hotel_id'];
                }
                
                $dispatches = db()->query(
                    "SELECT d.*, r.room_number, r.floor, r.room_type, h.name as hotel_name, h.id as hotel_id,
                     CONCAT(u.first_name, ' ', u.last_name) as assigned_to_name,
                     CONCAT(uc.first_name, ' ', uc.last_name) as controlled_by_name
                     FROM room_dispatch d
                     JOIN rooms r ON d.room_id = r.id
                     JOIN hotels h ON r.hotel_id = h.id
                     LEFT JOIN users u ON d.assigned_to = u.id
                     LEFT JOIN users uc ON d.controlled_by = uc.id
                     WHERE $where
                     ORDER BY r.floor, r.room_number",
                    $params
                );
                json_out(['success' => true, 'dispatches' => $dispatches, 'date' => $date]);
            }
            
            // Détail d'un dispatch
            if ($method === 'GET' && $id && is_numeric($id)) {
                require_auth();
                $dispatch = db()->queryOne(
                    "SELECT d.*, r.room_number, r.floor, h.name as hotel_name,
                            CONCAT(uc.first_name, ' ', uc.last_name) as created_by_name,
                            CONCAT(ucomp.first_name, ' ', ucomp.last_name) as completed_by_name,
                            CONCAT(uctrl.first_name, ' ', uctrl.last_name) as controlled_by_name
                     FROM room_dispatch d
                     JOIN rooms r ON d.room_id = r.id
                     JOIN hotels h ON r.hotel_id = h.id
                     LEFT JOIN users uc ON d.created_by = uc.id
                     LEFT JOIN users ucomp ON d.completed_by = ucomp.id
                     LEFT JOIN users uctrl ON d.controlled_by = uctrl.id
                     WHERE d.id = ?",
                    [$id]
                );
                if (!$dispatch) json_error('Dispatch non trouvé', 404);
                json_out(['success' => true, 'dispatch' => $dispatch]);
            }
            
            // Alertes d'un hôtel
            if ($method === 'GET' && $id === 'alerts') {
                require_auth();
                $hotelId = isset($_GET['hotel_id']) ? $_GET['hotel_id'] : null;
                
                $where = "1=1";
                $params = [];
                if ($hotelId) {
                    $where = "hotel_id = ?";
                    $params[] = $hotelId;
                }
                
                $alerts = db()->query(
                    "SELECT * FROM dispatch_alerts WHERE $where ORDER BY alert_date DESC LIMIT 30",
                    $params
                );
                json_out(['success' => true, 'alerts' => $alerts]);
            }
            
            // Rapport des chambres mal nettoyées (control_status = 'not_ok')
            if ($method === 'GET' && $id === 'report') {
                require_auth();
                $hotelId = isset($_GET['hotel_id']) ? $_GET['hotel_id'] : null;
                $startDate = isset($_GET['start_date']) ? $_GET['start_date'] : date('Y-m-01');
                $endDate = isset($_GET['end_date']) ? $_GET['end_date'] : date('Y-m-d');
                
                if (!$hotelId) {
                    json_error('hotel_id requis');
                }
                
                $data = db()->query(
                    "SELECT d.*, r.room_number, r.floor, r.room_type, h.name as hotel_name,
                            CONCAT(u.first_name, ' ', u.last_name) as controlled_by_name
                     FROM room_dispatch d
                     JOIN rooms r ON d.room_id = r.id
                     JOIN hotels h ON r.hotel_id = h.id
                     LEFT JOIN users u ON d.controlled_by = u.id
                     WHERE r.hotel_id = ? 
                       AND d.dispatch_date BETWEEN ? AND ?
                       AND d.status = 'controlled'
                       AND d.control_status = 'not_ok'
                     ORDER BY d.dispatch_date DESC, r.room_number ASC",
                    [$hotelId, $startDate, $endDate]
                );
                
                json_out(['success' => true, 'data' => $data, 'hotel_id' => $hotelId, 'start_date' => $startDate, 'end_date' => $endDate]);
            }
            
            // Rapport d'activité complet (tous les dispatches avec intervenants)
            if ($method === 'GET' && $id === 'activity') {
                require_auth();
                $hotelId = isset($_GET['hotel_id']) ? $_GET['hotel_id'] : null;
                $startDate = isset($_GET['start_date']) ? $_GET['start_date'] : date('Y-m-01');
                $endDate = isset($_GET['end_date']) ? $_GET['end_date'] : date('Y-m-d');
                
                if (!$hotelId) {
                    json_error('hotel_id requis');
                }
                
                $data = db()->query(
                    "SELECT d.*, 
                            r.room_number, r.floor, r.room_type, 
                            h.name as hotel_name,
                            CONCAT(uc.first_name, ' ', uc.last_name) as created_by_name,
                            CONCAT(ucomp.first_name, ' ', ucomp.last_name) as completed_by_name,
                            CONCAT(uctrl.first_name, ' ', uctrl.last_name) as controlled_by_name
                     FROM room_dispatch d
                     JOIN rooms r ON d.room_id = r.id
                     JOIN hotels h ON r.hotel_id = h.id
                     LEFT JOIN users uc ON d.created_by = uc.id
                     LEFT JOIN users ucomp ON d.completed_by = ucomp.id
                     LEFT JOIN users uctrl ON d.controlled_by = uctrl.id
                     WHERE r.hotel_id = ? 
                       AND d.dispatch_date BETWEEN ? AND ?
                     ORDER BY d.dispatch_date ASC, r.floor ASC, r.room_number ASC",
                    [$hotelId, $startDate, $endDate]
                );
                
                json_out(['success' => true, 'data' => $data, 'hotel_id' => $hotelId, 'start_date' => $startDate, 'end_date' => $endDate]);
            }
            
            // Créer/Mettre à jour un dispatch (seulement si pas d'id ni d'action)
            if ($method === 'POST' && !$id && !$action) {
                $user = require_auth();
                $data = get_input();
                if (empty($data['room_id']) || empty($data['dispatch_date']) || empty($data['cleaning_type'])) {
                    json_error('Données manquantes');
                }
                
                // Vérifier que le type est valide
                if (!in_array($data['cleaning_type'], ['blanc', 'recouche'])) {
                    json_error('Type de nettoyage invalide');
                }
                
                // Vérifier si existe déjà
                $existing = db()->queryOne("SELECT id, status FROM room_dispatch WHERE room_id = ? AND dispatch_date = ?", 
                    [$data['room_id'], $data['dispatch_date']]);
                
                if ($existing) {
                    // Ne pas modifier si déjà complété ou contrôlé
                    if (in_array($existing['status'], ['completed', 'controlled'])) {
                        json_error('Ce dispatch est déjà terminé');
                    }
                    db()->execute("UPDATE room_dispatch SET cleaning_type = ?, priority = ?, updated_at = NOW() WHERE id = ?",
                        [$data['cleaning_type'], isset($data['priority']) ? $data['priority'] : 'normal', $existing['id']]);
                    json_out(['success' => true, 'id' => $existing['id']]);
                } else {
                    $priority = isset($data['priority']) ? $data['priority'] : 'normal';
                    $id = db()->insert(
                        "INSERT INTO room_dispatch (room_id, dispatch_date, cleaning_type, priority, status, created_by, created_at) VALUES (?, ?, ?, ?, 'pending', ?, NOW())",
                        [$data['room_id'], $data['dispatch_date'], $data['cleaning_type'], $priority, $user['id']]
                    );
                    json_out(['success' => true, 'id' => $id], 201);
                }
            }
            
            // Marquer comme terminé
            if ($method === 'PUT' && $id && $action === 'complete') {
                $user = require_auth();
                db()->execute(
                    "UPDATE room_dispatch SET status = 'completed', completed_at = NOW(), completed_by = ? WHERE id = ? AND status = 'pending'",
                    [$user['id'], $id]
                );
                json_out(['success' => true]);
            }
            
            // Contrôler une chambre (avec ou sans photos)
            if (($method === 'PUT' || $method === 'POST') && $id && $action === 'control') {
                $user = require_auth();
                
                // Récupérer les données (POST avec FormData ou PUT avec JSON)
                if ($method === 'POST' && !empty($_POST)) {
                    $data = $_POST;
                } else {
                    $data = get_input();
                }
                
                // Vérifier que le dispatch existe et n'est pas déjà contrôlé
                $dispatch = db()->queryOne("SELECT id, status, control_photos FROM room_dispatch WHERE id = ?", [$id]);
                if (!$dispatch) {
                    json_error('Dispatch non trouvé', 404);
                }
                if ($dispatch['status'] === 'controlled') {
                    json_error('Ce contrôle a déjà été validé et ne peut plus être modifié', 403);
                }
                
                $uploadDir = __DIR__ . '/../uploads/control/';
                if (!is_dir($uploadDir)) {
                    mkdir($uploadDir, 0755, true);
                }
                
                // Récupérer les photos existantes
                $existingPhotos = [];
                if ($dispatch['control_photos']) {
                    $existingPhotos = json_decode($dispatch['control_photos'], true);
                    if (!is_array($existingPhotos)) $existingPhotos = [];
                }
                
                // Supprimer les photos marquées pour suppression
                if (isset($data['photos_to_remove'])) {
                    $photosToRemove = json_decode($data['photos_to_remove'], true);
                    if (is_array($photosToRemove)) {
                        foreach ($photosToRemove as $photoName) {
                            $photoPath = $uploadDir . $photoName;
                            if (file_exists($photoPath)) {
                                unlink($photoPath);
                            }
                            $existingPhotos = array_filter($existingPhotos, function($p) use ($photoName) {
                                return $p !== $photoName;
                            });
                        }
                        $existingPhotos = array_values($existingPhotos); // Reindex array
                    }
                }
                
                // Ajouter les nouvelles photos
                if (isset($_FILES['control_photos']) && is_array($_FILES['control_photos']['name'])) {
                    $fileCount = count($_FILES['control_photos']['name']);
                    
                    for ($i = 0; $i < $fileCount; $i++) {
                        if ($_FILES['control_photos']['error'][$i] === UPLOAD_ERR_OK) {
                            $controlFile = ['name' => $_FILES['control_photos']['name'][$i], 'tmp_name' => $_FILES['control_photos']['tmp_name'][$i], 'size' => $_FILES['control_photos']['size'][$i], 'type' => $_FILES['control_photos']['type'][$i], 'error' => $_FILES['control_photos']['error'][$i]];
                            $uploadError = validateUpload($controlFile, 'image');
                            if ($uploadError) continue;

                            $ext = strtolower(pathinfo($_FILES['control_photos']['name'][$i], PATHINFO_EXTENSION));
                            if (!in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp'])) {
                                continue; // Skip invalid format
                            }
                            
                            $photoFilename = 'ctrl_' . $id . '_' . time() . '_' . $i . '.' . $ext;
                            
                            if (move_uploaded_file($_FILES['control_photos']['tmp_name'][$i], $uploadDir . $photoFilename)) {
                                $existingPhotos[] = $photoFilename;
                            }
                        }
                    }
                }
                
                // Convertir en JSON
                $photosJson = !empty($existingPhotos) ? json_encode(array_values($existingPhotos)) : null;
                
                // Construire la requête avec la grille de contrôle
                $sets = [
                    "status = 'controlled'",
                    "controlled_by = ?",
                    "controlled_at = NOW()",
                    "control_status = ?",
                    "control_notes = ?",
                    "control_photos = ?"
                ];
                $params = [
                    $user['id'],
                    isset($data['control_status']) ? $data['control_status'] : 'ok',
                    isset($data['control_notes']) ? $data['control_notes'] : '',
                    $photosJson
                ];
                
                // Ajouter les critères de contrôle
                $criteria = ['ctrl_literie', 'ctrl_salle_bain', 'ctrl_sol_surfaces', 'ctrl_equipements', 'ctrl_ambiance', 'ctrl_proprete'];
                foreach ($criteria as $c) {
                    if (isset($data[$c])) {
                        $sets[] = "$c = ?";
                        $params[] = (int)$data[$c];
                    }
                }
                
                $params[] = $id;
                db()->execute("UPDATE room_dispatch SET " . implode(', ', $sets) . " WHERE id = ?", $params);
                json_out(['success' => true]);
            }
            
            // Supprimer un dispatch (seulement si pending)
            if ($method === 'DELETE' && $id && is_numeric($id)) {
                require_auth();
                $dispatch = db()->queryOne("SELECT status FROM room_dispatch WHERE id = ?", [$id]);
                if (!$dispatch) json_error('Dispatch non trouvé', 404);
                if ($dispatch['status'] !== 'pending') json_error('Impossible de supprimer un dispatch déjà traité');
                
                db()->execute("DELETE FROM room_dispatch WHERE id = ?", [$id]);
                json_out(['success' => true]);
            }
            break;
        
        // --- LEAVES (Congés) ---
        case 'leaves':
            if ($method === 'GET' && $id === 'balance') {
                $user = require_auth();
                $year = date('Y');
                $balance = db()->queryOne("SELECT * FROM leave_balance WHERE employee_id = ? AND year = ?", [$user['id'], $year]);
                if (!$balance) {
                    $balance = ['total_days' => 25, 'used_days' => 0, 'pending_days' => 0];
                }
                $balance['remaining_days'] = $balance['total_days'] - $balance['used_days'] - $balance['pending_days'];
                json_out(['success' => true, 'balance' => $balance]);
            }
            
            // Congés en attente de validation (pour les responsables)
            if ($method === 'GET' && $id === 'pending') {
                $user = require_auth();
                
                // Seuls les responsables peuvent voir les demandes en attente
                if (!in_array($user['role'], ['admin', 'groupe_manager', 'hotel_manager'])) {
                    json_out(['success' => true, 'leaves' => []]);
                }
                
                $where = "l.status = 'pending'";
                $params = [];
                
                // Filtrer selon le rôle et les hôtels gérés
                if ($user['role'] === 'hotel_manager') {
                    // Voir seulement les demandes des employés de ses hôtels
                    $hotelIds = getManageableHotels($user);
                    if (empty($hotelIds)) {
                        json_out(['success' => true, 'leaves' => []]);
                    }
                    $placeholders = implode(',', array_fill(0, count($hotelIds), '?'));
                    $where .= " AND (l.hotel_id IN ($placeholders) OR e.id IN (SELECT user_id FROM user_hotels WHERE hotel_id IN ($placeholders)))";
                    $params = array_merge($params, $hotelIds, $hotelIds);
                } elseif ($user['role'] === 'groupe_manager') {
                    // Voir les demandes des employés et resp. hôtel de ses hôtels
                    $hotelIds = getManageableHotels($user);
                    if (empty($hotelIds)) {
                        json_out(['success' => true, 'leaves' => []]);
                    }
                    $placeholders = implode(',', array_fill(0, count($hotelIds), '?'));
                    $where .= " AND (l.hotel_id IN ($placeholders) OR e.id IN (SELECT user_id FROM user_hotels WHERE hotel_id IN ($placeholders)))";
                    $params = array_merge($params, $hotelIds, $hotelIds);
                }
                // Admin voit tout
                
                $leaves = db()->query(
                    "SELECT l.*, CONCAT(e.first_name, ' ', e.last_name) as employee_name, e.role as employee_role,
                     CONCAT(v.first_name, ' ', v.last_name) as validated_by_name
                     FROM leave_requests l 
                     JOIN users e ON l.employee_id = e.id 
                     LEFT JOIN users v ON l.validated_by = v.id
                     WHERE $where 
                     ORDER BY l.start_date ASC",
                    $params
                );
                json_out(['success' => true, 'leaves' => $leaves]);
            }
            
            // Congés validés sur mes hôtels (pour voir les absences des collègues)
            if ($method === 'GET' && $id === 'hotel') {
                $user = require_auth();
                
                // Récupérer les hôtels de l'utilisateur
                $userHotels = db()->query("SELECT hotel_id FROM user_hotels WHERE user_id = ?", [$user['id']]);
                $hotelIds = array_column($userHotels, 'hotel_id');
                
                if (empty($hotelIds)) {
                    json_out(['success' => true, 'leaves' => []]);
                }
                
                $placeholders = implode(',', array_fill(0, count($hotelIds), '?'));
                
                // Filtres optionnels
                $where = "l.status = 'approved'";
                $params = [];
                
                // Filtrer par hôtel spécifique si demandé
                if (!empty($_GET['hotel_id']) && in_array($_GET['hotel_id'], $hotelIds)) {
                    $where .= " AND uh.hotel_id = ?";
                    $params[] = $_GET['hotel_id'];
                } else {
                    $where .= " AND uh.hotel_id IN ($placeholders)";
                    $params = array_merge($params, $hotelIds);
                }
                
                // Filtrer par période (par défaut: à partir d'aujourd'hui)
                $startDate = $_GET['start_date'] ?? date('Y-m-d');
                $endDate = $_GET['end_date'] ?? date('Y-m-d', strtotime('+3 months'));
                
                $where .= " AND l.end_date >= ? AND l.start_date <= ?";
                $params[] = $startDate;
                $params[] = $endDate;
                
                $leaves = db()->query(
                    "SELECT DISTINCT l.*, 
                            CONCAT(e.first_name, ' ', e.last_name) as employee_name,
                            e.role as employee_role,
                            h.name as hotel_name,
                            h.id as hotel_id
                     FROM leave_requests l 
                     JOIN users e ON l.employee_id = e.id 
                     JOIN user_hotels uh ON e.id = uh.user_id
                     JOIN hotels h ON uh.hotel_id = h.id
                     WHERE $where AND l.employee_id != ?
                     ORDER BY l.start_date ASC",
                    array_merge($params, [$user['id']])
                );
                
                json_out(['success' => true, 'leaves' => $leaves]);
            }
            
            // Liste des congés (mes demandes ou toutes selon rôle)
            if ($method === 'GET' && !$id) {
                $user = require_auth();
                
                $leaves = db()->query(
                    "SELECT l.*, CONCAT(e.first_name, ' ', e.last_name) as employee_name,
                     CONCAT(v.first_name, ' ', v.last_name) as validated_by_name
                     FROM leave_requests l 
                     JOIN users e ON l.employee_id = e.id 
                     LEFT JOIN users v ON l.validated_by = v.id
                     WHERE l.employee_id = ?
                     ORDER BY l.created_at DESC",
                    [$user['id']]
                );
                json_out(['success' => true, 'leaves' => $leaves]);
            }
            
            // Créer une demande de congés (pour soi-même) - avec upload justificatif
            if ($method === 'POST' && !$id) {
                $user = require_auth();
                
                // Récupérer les données (form data ou JSON)
                $data = [];
                if (!empty($_POST)) {
                    $data = $_POST;
                } else {
                    $data = get_input();
                }
                
                if (empty($data['start_date']) || empty($data['end_date'])) json_error('Dates requises');
                if (empty($data['leave_type'])) json_error('Type de congé requis');
                
                $leaveType = $data['leave_type'];
                
                // Validation justificatif obligatoire pour arrêt maladie
                $justificatifUrl = null;
                if ($leaveType === 'maladie') {
                    if (empty($_FILES['justificatif']) || $_FILES['justificatif']['error'] !== UPLOAD_ERR_OK) {
                        json_error('Un justificatif médical est obligatoire pour un arrêt maladie');
                    }
                    
                    $file = $_FILES['justificatif'];
                    $uploadError = validateUpload($file, 'document');
                    if ($uploadError) json_error($uploadError);

                    // Vérifier le type de fichier
                    $finfo = finfo_open(FILEINFO_MIME_TYPE);
                    $mimeType = finfo_file($finfo, $file['tmp_name']);
                    finfo_close($finfo);

                    if ($mimeType !== 'application/pdf') {
                        json_error('Seuls les fichiers PDF sont acceptés pour le justificatif');
                    }

                    // Vérifier la taille (5Mo max)
                    if ($file['size'] > 5 * 1024 * 1024) {
                        json_error('Le fichier ne doit pas dépasser 5Mo');
                    }

                    // Sauvegarder le fichier
                    $uploadDir = __DIR__ . '/../uploads/leaves/';
                    if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
                    
                    $filename = 'justif_' . $user['id'] . '_' . date('Ymd_His') . '.pdf';
                    $filepath = $uploadDir . $filename;
                    
                    if (!move_uploaded_file($file['tmp_name'], $filepath)) {
                        json_error('Erreur lors de l\'upload du fichier');
                    }
                    
                    $justificatifUrl = 'uploads/leaves/' . $filename;
                }
                
                $start = new DateTime($data['start_date']);
                $end = new DateTime($data['end_date']);
                $days = $start->diff($end)->days + 1;
                $quarter = 'T' . ceil($start->format('n') / 3);
                $year = $start->format('Y');
                
                // Vérifier le délai minimum UNIQUEMENT pour les congés payés
                if ($leaveType === 'cp' && !in_array($user['role'], ['admin', 'groupe_manager', 'hotel_manager'])) {
                    // Charger la config congés de l'hôtel (si disponible)
                    $leaveMinDelay = 2; // défaut: 2 mois
                    $hotelId = $data['hotel_id'] ?? null;
                    if (!$hotelId && !empty($user['hotel_ids'])) {
                        $hotelId = $user['hotel_ids'][0];
                    }
                    if ($hotelId) {
                        try {
                            $lcfg = db()->queryOne("SELECT leave_min_delay FROM hotel_leave_config WHERE hotel_id = ?", [$hotelId]);
                            if ($lcfg && $lcfg['leave_min_delay'] !== null) {
                                $leaveMinDelay = (int)$lcfg['leave_min_delay'];
                            }
                        } catch (Exception $e) {}
                    }
                    if ($leaveMinDelay > 0) {
                        $minDate = new DateTime();
                        $minDate->modify("+{$leaveMinDelay} months");
                        if ($start < $minDate) {
                            json_error("Les congés payés doivent être posés au minimum {$leaveMinDelay} mois à l'avance");
                        }
                    }
                }
                
                $leaveId = db()->insert(
                    "INSERT INTO leave_requests (employee_id, start_date, end_date, days_count, leave_type, comment, quarter, year, status, justificatif_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW())",
                    [$user['id'], $data['start_date'], $data['end_date'], $days, $leaveType, $data['comment'] ?? '', $quarter, $year, $justificatifUrl]
                );
                
                // Envoyer des notifications aux responsables (manager hôtel, groupe, admin, RH)
                notifyManagersForLeaveRequest($user, $leaveId, $data['start_date'], $data['end_date'], $days, $leaveType);
                
                json_out(['success' => true, 'id' => $leaveId], 201);
            }
            
            // Créer des congés pour un autre (responsables seulement) - avec upload justificatif
            if ($method === 'POST' && $id === 'for-other') {
                $user = require_role('admin', 'groupe_manager', 'hotel_manager', 'rh');
                
                // Récupérer les données
                $data = [];
                if (!empty($_POST)) {
                    $data = $_POST;
                } else {
                    $data = get_input();
                }
                
                if (empty($data['employee_id']) || empty($data['start_date']) || empty($data['end_date'])) {
                    json_error('Données manquantes');
                }
                
                $leaveType = $data['leave_type'] ?? 'cp';
                
                // Validation justificatif obligatoire pour arrêt maladie
                $justificatifUrl = null;
                if ($leaveType === 'maladie') {
                    if (empty($_FILES['justificatif']) || $_FILES['justificatif']['error'] !== UPLOAD_ERR_OK) {
                        json_error('Un justificatif médical est obligatoire pour un arrêt maladie');
                    }
                    
                    $file = $_FILES['justificatif'];
                    $uploadError = validateUpload($file, 'document');
                    if ($uploadError) json_error($uploadError);

                    // Vérifier le type
                    $finfo = finfo_open(FILEINFO_MIME_TYPE);
                    $mimeType = finfo_file($finfo, $file['tmp_name']);
                    finfo_close($finfo);

                    if ($mimeType !== 'application/pdf') {
                        json_error('Seuls les fichiers PDF sont acceptés');
                    }

                    // Sauvegarder
                    $uploadDir = __DIR__ . '/../uploads/leaves/';
                    if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
                    
                    $filename = 'justif_' . $data['employee_id'] . '_' . date('Ymd_His') . '.pdf';
                    $filepath = $uploadDir . $filename;
                    
                    if (!move_uploaded_file($file['tmp_name'], $filepath)) {
                        json_error('Erreur lors de l\'upload');
                    }
                    
                    $justificatifUrl = 'uploads/leaves/' . $filename;
                }
                
                $start = new DateTime($data['start_date']);
                $end = new DateTime($data['end_date']);
                $days = $start->diff($end)->days + 1;
                $quarter = 'T' . ceil($start->format('n') / 3);
                $year = $start->format('Y');
                
                // Créer directement approuvé si c'est un responsable qui le fait
                $leaveId = db()->insert(
                    "INSERT INTO leave_requests (employee_id, start_date, end_date, days_count, leave_type, comment, quarter, year, status, is_manual, created_by, validated_by, validated_at, justificatif_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', 1, ?, ?, NOW(), ?, NOW())",
                    [$data['employee_id'], $data['start_date'], $data['end_date'], $days, $leaveType, $data['comment'] ?? '', $quarter, $year, $user['id'], $user['id'], $justificatifUrl]
                );
                
                json_out(['success' => true, 'id' => $leaveId], 201);
            }
            
            // Historique des absences (pour managers) - GET /leaves/history
            if ($method === 'GET' && $id === 'history') {
                $user = require_role('admin', 'groupe_manager', 'hotel_manager', 'rh');
                
                $hotelId = $_GET['hotel_id'] ?? null;
                $leaveType = $_GET['leave_type'] ?? null;
                $employeeId = $_GET['employee_id'] ?? null;
                $startDate = $_GET['start_date'] ?? date('Y-01-01');
                $endDate = $_GET['end_date'] ?? date('Y-m-d');
                $status = $_GET['status'] ?? null;
                
                // Récupérer les hôtels gérables
                $manageableHotels = getManageableHotels($user);
                if (empty($manageableHotels) && $user['role'] !== 'admin') {
                    json_out(['success' => true, 'leaves' => [], 'stats' => [], 'employees' => []]);
                }
                
                // Construire la requête
                $where = "1=1";
                $params = [];
                
                // Filtre par hôtels gérables
                if ($user['role'] !== 'admin') {
                    $placeholders = implode(',', array_fill(0, count($manageableHotels), '?'));
                    $where .= " AND uh.hotel_id IN ($placeholders)";
                    $params = array_merge($params, $manageableHotels);
                }
                
                // Filtre par hôtel spécifique
                if ($hotelId) {
                    $where .= " AND uh.hotel_id = ?";
                    $params[] = $hotelId;
                }
                
                // Filtre par type
                if ($leaveType) {
                    $where .= " AND l.leave_type = ?";
                    $params[] = $leaveType;
                }
                
                // Filtre par employé
                if ($employeeId) {
                    $where .= " AND l.employee_id = ?";
                    $params[] = $employeeId;
                }
                
                // Filtre par période
                if ($startDate) {
                    $where .= " AND l.end_date >= ?";
                    $params[] = $startDate;
                }
                if ($endDate) {
                    $where .= " AND l.start_date <= ?";
                    $params[] = $endDate;
                }
                
                // Filtre par statut
                if ($status) {
                    $where .= " AND l.status = ?";
                    $params[] = $status;
                }
                
                // Récupérer les congés
                $leaves = db()->query(
                    "SELECT DISTINCT l.*, 
                            CONCAT(e.first_name, ' ', e.last_name) as employee_name,
                            e.role as employee_role,
                            CONCAT(v.first_name, ' ', v.last_name) as validated_by_name,
                            h.name as hotel_name
                     FROM leave_requests l 
                     JOIN users e ON l.employee_id = e.id 
                     JOIN user_hotels uh ON e.id = uh.user_id
                     JOIN hotels h ON uh.hotel_id = h.id
                     LEFT JOIN users v ON l.validated_by = v.id
                     WHERE $where
                     ORDER BY l.start_date DESC
                     LIMIT 500",
                    $params
                );
                
                // Calculer les statistiques
                $statsParams = $params;
                $statsWhere = str_replace("l.status = ?", "l.status = 'approved'", $where);
                if (!$status) {
                    // Si pas de filtre statut, calculer sur les approuvés
                    $statsWhere = $where . " AND l.status = 'approved'";
                }
                
                $stats = db()->queryOne(
                    "SELECT 
                        SUM(CASE WHEN l.leave_type = 'cp' THEN l.days_count ELSE 0 END) as total_cp,
                        SUM(CASE WHEN l.leave_type = 'maladie' THEN l.days_count ELSE 0 END) as total_maladie,
                        COUNT(DISTINCT l.employee_id) as employees_count
                     FROM leave_requests l 
                     JOIN users e ON l.employee_id = e.id 
                     JOIN user_hotels uh ON e.id = uh.user_id
                     WHERE $where",
                    $params
                );
                
                // Récupérer la liste des employés pour le filtre
                $employeeParams = [];
                $employeeWhere = "1=1";
                if ($user['role'] !== 'admin') {
                    $placeholders = implode(',', array_fill(0, count($manageableHotels), '?'));
                    $employeeWhere .= " AND uh.hotel_id IN ($placeholders)";
                    $employeeParams = $manageableHotels;
                }
                if ($hotelId) {
                    $employeeWhere .= " AND uh.hotel_id = ?";
                    $employeeParams[] = $hotelId;
                }
                
                $employees = db()->query(
                    "SELECT DISTINCT e.id, CONCAT(e.first_name, ' ', e.last_name) as name
                     FROM users e
                     JOIN user_hotels uh ON e.id = uh.user_id
                     WHERE $employeeWhere AND e.status = 'active'
                     ORDER BY e.last_name, e.first_name",
                    $employeeParams
                );
                
                json_out([
                    'success' => true, 
                    'leaves' => $leaves,
                    'stats' => $stats ?: ['total_cp' => 0, 'total_maladie' => 0, 'employees_count' => 0],
                    'employees' => $employees
                ]);
            }
            
            // Export CSV historique - GET /leaves/history-export
            if ($method === 'GET' && $id === 'history-export') {
                $user = require_role('admin', 'groupe_manager', 'hotel_manager', 'rh');
                
                $hotelId = $_GET['hotel_id'] ?? null;
                $leaveType = $_GET['leave_type'] ?? null;
                $employeeId = $_GET['employee_id'] ?? null;
                $startDate = $_GET['start_date'] ?? date('Y-01-01');
                $endDate = $_GET['end_date'] ?? date('Y-m-d');
                $status = $_GET['status'] ?? null;
                
                $manageableHotels = getManageableHotels($user);
                
                $where = "1=1";
                $params = [];
                
                if ($user['role'] !== 'admin' && !empty($manageableHotels)) {
                    $placeholders = implode(',', array_fill(0, count($manageableHotels), '?'));
                    $where .= " AND uh.hotel_id IN ($placeholders)";
                    $params = array_merge($params, $manageableHotels);
                }
                
                if ($hotelId) { $where .= " AND uh.hotel_id = ?"; $params[] = $hotelId; }
                if ($leaveType) { $where .= " AND l.leave_type = ?"; $params[] = $leaveType; }
                if ($employeeId) { $where .= " AND l.employee_id = ?"; $params[] = $employeeId; }
                if ($startDate) { $where .= " AND l.end_date >= ?"; $params[] = $startDate; }
                if ($endDate) { $where .= " AND l.start_date <= ?"; $params[] = $endDate; }
                if ($status) { $where .= " AND l.status = ?"; $params[] = $status; }
                
                $leaves = db()->query(
                    "SELECT DISTINCT l.*, 
                            CONCAT(e.first_name, ' ', e.last_name) as employee_name,
                            e.role as employee_role,
                            CONCAT(v.first_name, ' ', v.last_name) as validated_by_name,
                            h.name as hotel_name
                     FROM leave_requests l 
                     JOIN users e ON l.employee_id = e.id 
                     JOIN user_hotels uh ON e.id = uh.user_id
                     JOIN hotels h ON uh.hotel_id = h.id
                     LEFT JOIN users v ON l.validated_by = v.id
                     WHERE $where
                     ORDER BY l.start_date DESC",
                    $params
                );
                
                $typeLabels = ['cp' => 'Congés payés', 'maladie' => 'Arrêt maladie'];
                $statusLabels = ['pending' => 'En attente', 'approved' => 'Validé', 'rejected' => 'Refusé', 'cancelled' => 'Annulé'];
                
                header('Content-Type: text/csv; charset=utf-8');
                header('Content-Disposition: attachment; filename="historique_absences_' . $startDate . '_' . $endDate . '.csv"');
                
                $output = fopen('php://output', 'w');
                fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF)); // BOM UTF-8
                
                fputcsv($output, ['Collaborateur', 'Hôtel', 'Type', 'Date début', 'Date fin', 'Nb jours', 'Statut', 'Validé par', 'Commentaire'], ';');
                
                foreach ($leaves as $l) {
                    fputcsv($output, [
                        $l['employee_name'],
                        $l['hotel_name'] ?? '',
                        $typeLabels[$l['leave_type']] ?? $l['leave_type'],
                        date('d/m/Y', strtotime($l['start_date'])),
                        date('d/m/Y', strtotime($l['end_date'])),
                        $l['days_count'],
                        $statusLabels[$l['status']] ?? $l['status'],
                        $l['validated_by_name'] ?? '',
                        $l['comment'] ?? ''
                    ], ';');
                }
                
                fclose($output);
                exit;
            }
            
            // Rapport PDF des congés validés par trimestre
            if ($method === 'GET' && $id === 'report') {
                $user = require_role('admin', 'groupe_manager', 'hotel_manager');
                
                $year = isset($_GET['year']) ? intval($_GET['year']) : date('Y');
                $quarter = isset($_GET['quarter']) ? $_GET['quarter'] : null;
                $hotelId = isset($_GET['hotel_id']) ? intval($_GET['hotel_id']) : null;
                
                if (!$quarter || !in_array($quarter, ['T1', 'T2', 'T3', 'T4'])) {
                    json_error('Trimestre requis (T1, T2, T3 ou T4)');
                }
                
                // Charger les deadlines configurées pour l'hôtel (sinon valeurs par défaut)
                $t1d = '11-01'; $t2d = '02-01'; $t3d = '05-01'; $t4d = '08-01';
                if ($hotelId) {
                    try {
                        $lcfg = db()->queryOne("SELECT t1_deadline, t2_deadline, t3_deadline, t4_deadline FROM hotel_leave_config WHERE hotel_id = ?", [$hotelId]);
                        if ($lcfg) {
                            if (!empty($lcfg['t1_deadline'])) $t1d = $lcfg['t1_deadline'];
                            if (!empty($lcfg['t2_deadline'])) $t2d = $lcfg['t2_deadline'];
                            if (!empty($lcfg['t3_deadline'])) $t3d = $lcfg['t3_deadline'];
                            if (!empty($lcfg['t4_deadline'])) $t4d = $lcfg['t4_deadline'];
                        }
                    } catch (Exception $e) {}
                }

                // Définir les dates du trimestre et la deadline
                $quarterDates = [
                    'T1' => ['start' => "$year-01-01", 'end' => "$year-03-31", 'deadline' => ($year - 1) . "-$t1d"],
                    'T2' => ['start' => "$year-04-01", 'end' => "$year-06-30", 'deadline' => "$year-$t2d"],
                    'T3' => ['start' => "$year-07-01", 'end' => "$year-09-30", 'deadline' => "$year-$t3d"],
                    'T4' => ['start' => "$year-10-01", 'end' => "$year-12-31", 'deadline' => "$year-$t4d"]
                ];
                
                $qInfo = $quarterDates[$quarter];
                $deadline = $qInfo['deadline'];
                $today = date('Y-m-d');
                
                // Vérifier que la deadline est passée
                if ($today < $deadline) {
                    json_error("La date limite de dépôt ({$deadline}) n'est pas encore passée. Le rapport ne peut pas être généré.");
                }
                
                // Préparer la requête
                $where = "l.quarter = ? AND l.year = ?";
                $params = [$quarter, $year];
                
                // Filtrer par hôtel si spécifié ou selon les droits de l'utilisateur
                if ($hotelId) {
                    $where .= " AND (l.hotel_id = ? OR e.id IN (SELECT user_id FROM user_hotels WHERE hotel_id = ?))";
                    $params[] = $hotelId;
                    $params[] = $hotelId;
                } elseif ($user['role'] !== 'admin') {
                    $hotelIds = getManageableHotels($user);
                    if (!empty($hotelIds)) {
                        $placeholders = implode(',', array_fill(0, count($hotelIds), '?'));
                        $where .= " AND (l.hotel_id IN ($placeholders) OR e.id IN (SELECT user_id FROM user_hotels WHERE hotel_id IN ($placeholders)))";
                        $params = array_merge($params, $hotelIds, $hotelIds);
                    }
                }
                
                // Vérifier qu'il n'y a pas de demandes en attente
                $pendingCount = db()->count(
                    "SELECT COUNT(*) FROM leave_requests l 
                     JOIN users e ON l.employee_id = e.id
                     WHERE l.status = 'pending' AND $where",
                    $params
                );
                
                if ($pendingCount > 0) {
                    json_error("Il reste {$pendingCount} demande(s) en attente pour ce trimestre. Toutes les demandes doivent être traitées avant de générer le rapport.");
                }
                
                // Récupérer les congés validés
                $leaves = db()->query(
                    "SELECT l.*, 
                            CONCAT(e.first_name, ' ', e.last_name) as employee_name,
                            e.role as employee_role,
                            CONCAT(v.first_name, ' ', v.last_name) as validated_by_name,
                            CONCAT(c.first_name, ' ', c.last_name) as created_by_name
                     FROM leave_requests l 
                     JOIN users e ON l.employee_id = e.id 
                     LEFT JOIN users v ON l.validated_by = v.id
                     LEFT JOIN users c ON l.created_by = c.id
                     WHERE l.status = 'approved' AND $where
                     ORDER BY e.last_name, e.first_name, l.start_date",
                    $params
                );
                
                // Récupérer le nom de l'hôtel si filtré
                $hotelName = null;
                if ($hotelId) {
                    $hotel = db()->queryOne("SELECT name FROM hotels WHERE id = ?", [$hotelId]);
                    $hotelName = $hotel ? $hotel['name'] : null;
                }
                
                // Statistiques
                $stats = [
                    'total_requests' => count($leaves),
                    'total_days' => array_sum(array_column($leaves, 'days_count')),
                    'manual_count' => count(array_filter($leaves, function($l) { return $l['is_manual']; })),
                    'by_type' => []
                ];
                
                foreach ($leaves as $l) {
                    $type = $l['leave_type'];
                    if (!isset($stats['by_type'][$type])) {
                        $stats['by_type'][$type] = ['count' => 0, 'days' => 0];
                    }
                    $stats['by_type'][$type]['count']++;
                    $stats['by_type'][$type]['days'] += $l['days_count'];
                }
                
                json_out([
                    'success' => true,
                    'can_generate' => true,
                    'quarter' => $quarter,
                    'year' => $year,
                    'deadline' => $deadline,
                    'hotel_name' => $hotelName,
                    'leaves' => $leaves,
                    'stats' => $stats
                ]);
            }
            
            if ($method === 'PUT' && $id && $action === 'approve') {
                $user = require_role('admin', 'groupe_manager', 'hotel_manager');
                $data = get_input();
                $leave = db()->queryOne("SELECT l.*, CONCAT(e.first_name, ' ', e.last_name) as employee_name, e.id as emp_id 
                                         FROM leave_requests l 
                                         JOIN users e ON l.employee_id = e.id 
                                         WHERE l.id = ?", [$id]);
                if (!$leave) json_error('Non trouvé', 404);
                
                $approvalComment = $data['comment'] ?? '';
                
                db()->execute(
                    "UPDATE leave_requests SET status = 'approved', validated_by = ?, validated_at = NOW(), approval_comment = ? WHERE id = ?", 
                    [$user['id'], $approvalComment, $id]
                );
                
                // Notifier l'employé de l'approbation
                $message = "Votre demande de congés du " . date('d/m/Y', strtotime($leave['start_date'])) . 
                           " au " . date('d/m/Y', strtotime($leave['end_date'])) . " a été approuvée.";
                if ($approvalComment) {
                    $message .= " Commentaire: " . $approvalComment;
                }
                
                db()->insert(
                    "INSERT INTO notifications (user_id, type, title, message, created_at) VALUES (?, 'success', 'Congés approuvés', ?, NOW())",
                    [$leave['emp_id'], $message]
                );
                
                json_out(['success' => true]);
            }
            
            if ($method === 'PUT' && $id && $action === 'reject') {
                $user = require_role('admin', 'groupe_manager', 'hotel_manager');
                $data = get_input();
                $leave = db()->queryOne("SELECT l.*, CONCAT(e.first_name, ' ', e.last_name) as employee_name, e.id as emp_id 
                                         FROM leave_requests l 
                                         JOIN users e ON l.employee_id = e.id 
                                         WHERE l.id = ?", [$id]);
                if (!$leave) json_error('Non trouvé', 404);
                
                $rejectionReason = $data['reason'] ?? '';
                
                db()->execute(
                    "UPDATE leave_requests SET status = 'rejected', validated_by = ?, rejection_reason = ?, validated_at = NOW() WHERE id = ?", 
                    [$user['id'], $rejectionReason, $id]
                );
                
                // Notifier l'employé du refus
                $message = "Votre demande de congés du " . date('d/m/Y', strtotime($leave['start_date'])) . 
                           " au " . date('d/m/Y', strtotime($leave['end_date'])) . " a été refusée.";
                if ($rejectionReason) {
                    $message .= " Motif: " . $rejectionReason;
                }
                
                db()->insert(
                    "INSERT INTO notifications (user_id, type, title, message, created_at) VALUES (?, 'danger', 'Congés refusés', ?, NOW())",
                    [$leave['emp_id'], $message]
                );
                
                json_out(['success' => true]);
            }
            break;
        
        // --- LINEN / BLANCHISSERIE ---
        case 'linen':
            // Configuration linge par hôtel
            if ($id === 'config' && $action && is_numeric($action) && $method === 'GET') {
                require_auth();
                $hotelId = $action;
                
                $config = db()->queryOne("SELECT * FROM linen_config WHERE hotel_id = ?", [$hotelId]);
                if (!$config) {
                    // Config par défaut
                    $config = [
                        'hotel_id' => $hotelId,
                        'petit_draps' => 1,
                        'petite_housse' => 1,
                        'grand_draps' => 1,
                        'grande_housse' => 1
                    ];
                }
                json_out(['success' => true, 'config' => $config]);
            }
            
            if ($id === 'config' && $action && is_numeric($action) && $method === 'PUT') {
                $user = require_role('admin', 'groupe_manager');
                $hotelId = $action;
                $data = get_input();
                
                // Vérifier si config existe
                $existing = db()->queryOne("SELECT id FROM linen_config WHERE hotel_id = ?", [$hotelId]);
                
                if ($existing) {
                    db()->execute(
                        "UPDATE linen_config SET petit_draps = ?, petite_housse = ?, grand_draps = ?, grande_housse = ?, updated_at = NOW() WHERE hotel_id = ?",
                        [
                            $data['petit_draps'] ?? 1,
                            $data['petite_housse'] ?? 1,
                            $data['grand_draps'] ?? 1,
                            $data['grande_housse'] ?? 1,
                            $hotelId
                        ]
                    );
                } else {
                    db()->insert(
                        "INSERT INTO linen_config (hotel_id, petit_draps, petite_housse, grand_draps, grande_housse, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
                        [
                            $hotelId,
                            $data['petit_draps'] ?? 1,
                            $data['petite_housse'] ?? 1,
                            $data['grand_draps'] ?? 1,
                            $data['grande_housse'] ?? 1
                        ]
                    );
                }
                
                json_out(['success' => true]);
            }
            
            // Récupérer une transaction individuelle - GET /linen/transactions/{id}
            if ($id === 'transactions' && $action && is_numeric($action) && $method === 'GET') {
                require_auth();
                $transactionId = (int)$action;
                $transaction = db()->queryOne(
                    "SELECT t.*, COALESCE(h.name, 'Hôtel inconnu') as hotel_name, CONCAT(u.first_name, ' ', u.last_name) as user_name
                     FROM linen_transactions t 
                     LEFT JOIN hotels h ON t.hotel_id = h.id 
                     LEFT JOIN users u ON t.created_by = u.id
                     WHERE t.id = ?",
                    [$transactionId]
                );
                if (!$transaction) json_error('Transaction non trouvée', 404);
                json_out(['success' => true, 'transaction' => $transaction]);
            }
            
            // Transactions - Liste (filtrer par hotels de l'utilisateur)
            if ($id === 'transactions' && !$action && $method === 'GET') {
                $user = require_auth();
                // Filtrer par les hotels accessibles a l'utilisateur
                $userHotels = array_column(
                    db()->query("SELECT hotel_id FROM user_hotels WHERE user_id = ?", [$user['id']]),
                    'hotel_id'
                );
                if ($user['role'] !== 'admin' && empty($userHotels)) {
                    json_out(['success' => true, 'transactions' => [], 'summary' => []]);
                }
                $where = "1=1";
                $params = [];
                if ($user['role'] !== 'admin') {
                    $placeholders = implode(',', array_fill(0, count($userHotels), '?'));
                    $where .= " AND t.hotel_id IN ($placeholders)";
                    $params = array_merge($params, $userHotels);
                }
                
                if (!empty($_GET['hotel_id'])) { 
                    $where .= " AND t.hotel_id = ?"; 
                    $params[] = $_GET['hotel_id']; 
                }
                if (!empty($_GET['start_date'])) { 
                    $where .= " AND t.transaction_date >= ?"; 
                    $params[] = $_GET['start_date']; 
                }
                if (!empty($_GET['end_date'])) { 
                    $where .= " AND t.transaction_date <= ?"; 
                    $params[] = $_GET['end_date']; 
                }
                
                $query = "SELECT t.*, h.name as hotel_name, CONCAT(u.first_name, ' ', u.last_name) as user_name
                     FROM linen_transactions t
                     JOIN hotels h ON t.hotel_id = h.id
                     LEFT JOIN users u ON t.created_by = u.id
                     WHERE $where
                     ORDER BY t.transaction_date DESC, t.id DESC";
                $countQuery = "SELECT COUNT(*) FROM linen_transactions t JOIN hotels h ON t.hotel_id = h.id WHERE $where";
                $result = paginate($query, $params, $countQuery, $params);

                // Calculer le résumé
                $summary = [];
                $hotelId = $_GET['hotel_id'] ?? null;
                
                if ($hotelId) {
                    $types = ['petit_draps', 'petite_housse', 'grand_draps', 'grande_housse'];
                    foreach ($types as $type) {
                        $sent = db()->count(
                            "SELECT COALESCE(SUM($type), 0) FROM linen_transactions WHERE hotel_id = ? AND transaction_type = 'collecte' AND transaction_date >= ? AND transaction_date <= ?",
                            [$hotelId, $_GET['start_date'] ?? '2000-01-01', $_GET['end_date'] ?? date('Y-m-d')]
                        );
                        $received = db()->count(
                            "SELECT COALESCE(SUM($type), 0) FROM linen_transactions WHERE hotel_id = ? AND transaction_type = 'reception' AND transaction_date >= ? AND transaction_date <= ?",
                            [$hotelId, $_GET['start_date'] ?? '2000-01-01', $_GET['end_date'] ?? date('Y-m-d')]
                        );
                        // Dernier stock enregistré
                        $stockRow = db()->queryOne(
                            "SELECT $type FROM linen_transactions WHERE hotel_id = ? AND transaction_type = 'stock' ORDER BY transaction_date DESC, id DESC LIMIT 1",
                            [$hotelId]
                        );
                        $stock = $stockRow ? $stockRow[$type] : 0;
                        
                        $summary[$type] = [
                            'sent' => (int)$sent,
                            'received' => (int)$received,
                            'stock' => (int)$stock
                        ];
                    }
                }
                
                json_out(['success' => true, 'transactions' => $result['data'], 'pagination' => $result['pagination'], 'summary' => $summary]);
            }
            
            if ($id === 'transactions' && $method === 'POST') {
                $user = require_auth();
                
                // Gestion upload fichier
                $documentUrl = null;
                if (!empty($_FILES['document']) && $_FILES['document']['error'] === UPLOAD_ERR_OK) {
                    $uploadError = validateUpload($_FILES['document'], 'any');
                    if ($uploadError) json_error($uploadError);

                    $uploadDir = __DIR__ . '/../uploads/linen/';
                    if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

                    $ext = strtolower(pathinfo($_FILES['document']['name'], PATHINFO_EXTENSION));
                    $filename = 'linen_' . time() . '_' . uniqid() . '.' . $ext;
                    move_uploaded_file($_FILES['document']['tmp_name'], $uploadDir . $filename);
                    $documentUrl = 'uploads/linen/' . $filename;
                }
                
                $hotelId = $_POST['hotel_id'] ?? null;
                $transactionType = $_POST['transaction_type'] ?? null;
                $transactionDate = $_POST['transaction_date'] ?? date('Y-m-d');
                
                if (!$hotelId || !$transactionType) {
                    json_error('Données manquantes');
                }
                
                $id = db()->insert(
                    "INSERT INTO linen_transactions (hotel_id, transaction_type, transaction_date, petit_draps, petite_housse, grand_draps, grande_housse, document_url, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                    [
                        $hotelId,
                        $transactionType,
                        $transactionDate,
                        $_POST['petit_draps'] ?? 0,
                        $_POST['petite_housse'] ?? 0,
                        $_POST['grand_draps'] ?? 0,
                        $_POST['grande_housse'] ?? 0,
                        $documentUrl,
                        $user['id']
                    ]
                );
                json_out(['success' => true, 'id' => $id], 201);
            }
            
            // Modifier une transaction - PUT /linen/transactions/{id}
            if ($id === 'transactions' && $action && is_numeric($action) && $method === 'PUT') {
                $user = require_auth();
                
                // Vérifier que l'utilisateur peut modifier (hotel_manager ou supérieur assigné à l'hôtel)
                $transaction = db()->queryOne("SELECT * FROM linen_transactions WHERE id = ?", [$action]);
                if (!$transaction) json_error('Transaction non trouvée', 404);
                
                // Vérifier les droits : admin, groupe_manager, ou hotel_manager assigné à cet hôtel
                $canEdit = false;
                if (in_array($user['role'], ['admin', 'groupe_manager'])) {
                    $canEdit = true;
                } elseif ($user['role'] === 'hotel_manager') {
                    $isAssigned = db()->queryOne(
                        "SELECT 1 FROM user_hotels WHERE user_id = ? AND hotel_id = ?",
                        [$user['id'], $transaction['hotel_id']]
                    );
                    $canEdit = !!$isAssigned;
                }
                
                if (!$canEdit) {
                    json_error('Vous n\'avez pas les droits pour modifier cette saisie', 403);
                }
                
                $data = get_input();
                
                $updates = [];
                $params = [];
                
                if (isset($data['transaction_type'])) { $updates[] = "transaction_type = ?"; $params[] = $data['transaction_type']; }
                if (isset($data['transaction_date'])) { $updates[] = "transaction_date = ?"; $params[] = $data['transaction_date']; }
                if (isset($data['petit_draps'])) { $updates[] = "petit_draps = ?"; $params[] = $data['petit_draps']; }
                if (isset($data['petite_housse'])) { $updates[] = "petite_housse = ?"; $params[] = $data['petite_housse']; }
                if (isset($data['grand_draps'])) { $updates[] = "grand_draps = ?"; $params[] = $data['grand_draps']; }
                if (isset($data['grande_housse'])) { $updates[] = "grande_housse = ?"; $params[] = $data['grande_housse']; }
                
                if (!empty($updates)) {
                    $params[] = $action;
                    db()->execute("UPDATE linen_transactions SET " . implode(', ', $updates) . " WHERE id = ?", $params);
                }
                
                json_out(['success' => true]);
            }
            
            // Supprimer une transaction - DELETE /linen/transactions/{id}
            if ($id === 'transactions' && $action && is_numeric($action) && $method === 'DELETE') {
                try {
                    $user = require_auth();
                    
                    $transactionId = (int)$action;
                    $transaction = db()->queryOne("SELECT * FROM linen_transactions WHERE id = ?", [$transactionId]);
                    if (!$transaction) json_error('Transaction non trouvée', 404);
                    
                    // Vérifier les droits
                    $canDelete = false;
                    
                    // Admin et groupe_manager peuvent toujours supprimer
                    if (in_array($user['role'], ['admin', 'groupe_manager'])) {
                        $canDelete = true;
                    } 
                    // hotel_manager, receptionniste, rh, employee peuvent supprimer si assignés à l'hôtel
                    elseif (in_array($user['role'], ['hotel_manager', 'receptionniste', 'rh', 'employee'])) {
                        $isAssigned = db()->queryOne(
                            "SELECT 1 FROM user_hotels WHERE user_id = ? AND hotel_id = ?",
                            [$user['id'], $transaction['hotel_id']]
                        );
                        if ($isAssigned) {
                            $canDelete = true;
                        }
                    }
                    
                    if (!$canDelete) {
                        json_error('Vous n\'avez pas les droits pour supprimer cette saisie', 403);
                    }
                    
                    // Supprimer le document associé si existe
                    if (!empty($transaction['document_url'])) {
                        $filePath = __DIR__ . '/../' . $transaction['document_url'];
                        if (file_exists($filePath)) {
                            @unlink($filePath);
                        }
                    }
                    
                    db()->execute("DELETE FROM linen_transactions WHERE id = ?", [$transactionId]);
                    json_out(['success' => true]);
                } catch (Exception $e) {
                    json_error('Erreur suppression: ' . $e->getMessage(), 500);
                }
            }
            
            break;
        
        // --- USERS ---
        case 'users':
            if ($method === 'GET' && !$id) {
                $user = require_auth();
                
                // Vérifier les droits de gestion utilisateurs
                if (!in_array($user['role'], ['admin', 'groupe_manager', 'hotel_manager'])) {
                    json_error('Accès refusé', 403);
                }
                
                // Filtrer les utilisateurs selon le rôle
                if ($user['role'] === 'admin') {
                    // Admin voit tout le monde
                    $users = db()->query(
                        "SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.role, u.status, u.last_login, u.created_at,
                         GROUP_CONCAT(h.name SEPARATOR ', ') as hotels
                         FROM users u
                         LEFT JOIN user_hotels uh ON u.id = uh.user_id
                         LEFT JOIN hotels h ON uh.hotel_id = h.id
                         GROUP BY u.id
                         ORDER BY u.last_name, u.first_name"
                    );
                } elseif ($user['role'] === 'groupe_manager') {
                    // Groupe manager voit hotel_manager, comptabilite, rh, receptionniste et employee
                    $users = db()->query(
                        "SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.role, u.status, u.last_login, u.created_at,
                         GROUP_CONCAT(h.name SEPARATOR ', ') as hotels
                         FROM users u
                         LEFT JOIN user_hotels uh ON u.id = uh.user_id
                         LEFT JOIN hotels h ON uh.hotel_id = h.id
                         WHERE u.role IN ('hotel_manager', 'comptabilite', 'rh', 'receptionniste', 'employee')
                         GROUP BY u.id
                         ORDER BY u.last_name, u.first_name"
                    );
                } else {
                    // Hotel manager voit les réceptionnistes et employés de ses hôtels
                    $users = db()->query(
                        "SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.role, u.status, u.last_login, u.created_at,
                         GROUP_CONCAT(DISTINCT h.name SEPARATOR ', ') as hotels
                         FROM users u
                         INNER JOIN user_hotels uh ON u.id = uh.user_id
                         INNER JOIN hotels h ON uh.hotel_id = h.id
                         WHERE u.role IN ('receptionniste', 'employee')
                         AND uh.hotel_id IN (SELECT hotel_id FROM user_hotels WHERE user_id = ?)
                         GROUP BY u.id
                         ORDER BY u.last_name, u.first_name",
                        [$user['id']]
                    );
                }
                
                json_out(['success' => true, 'users' => $users]);
            }
            
            // Récupérer un utilisateur avec ses hôtels
            if ($method === 'GET' && $id && is_numeric($id)) {
                $user = require_auth();
                $targetUser = db()->queryOne("SELECT id, email, first_name, last_name, phone, role, status FROM users WHERE id = ?", [$id]);
                if (!$targetUser) json_error('Utilisateur non trouvé', 404);
                
                // Vérifier le droit d'accès
                if (!canManageUser($user, $targetUser)) {
                    json_error('Accès refusé', 403);
                }
                
                // Récupérer les hôtels assignés
                $targetUser['hotel_ids'] = array_column(
                    db()->query("SELECT hotel_id FROM user_hotels WHERE user_id = ?", [$id]),
                    'hotel_id'
                );
                
                json_out(['success' => true, 'user' => $targetUser]);
            }
            
            // Hotels assignes a un utilisateur (verifier droits d'acces)
            if ($method === 'GET' && $id && $action === 'hotels') {
                $user = require_auth();
                // Seuls les managers/admins ou l'utilisateur lui-meme peuvent voir ses hotels
                if ($user['id'] != $id && !in_array($user['role'], ['admin', 'groupe_manager', 'hotel_manager'])) {
                    json_error('Acces refuse', 403);
                }
                $hotels = db()->query(
                    "SELECT h.* FROM hotels h
                     INNER JOIN user_hotels uh ON h.id = uh.hotel_id
                     WHERE uh.user_id = ?",
                    [$id]
                );
                json_out(['success' => true, 'hotels' => $hotels]);
            }
            
            if ($method === 'POST') {
                $user = require_auth();
                $data = get_input();
                
                if (empty($data['email']) || empty($data['password']) || empty($data['first_name']) || empty($data['last_name'])) {
                    json_error('Données manquantes');
                }
                
                $newRole = $data['role'] ?? 'employee';
                
                // Vérifier le droit de créer ce rôle
                if (!canAssignRole($user, $newRole)) {
                    json_error('Vous ne pouvez pas créer un utilisateur avec ce rôle', 403);
                }
                
                // Validation mot de passe
                $pwError = validatePassword($data['password']);
                if ($pwError) json_error($pwError);

                $exists = db()->queryOne("SELECT id FROM users WHERE email = ?", [$data['email']]);
                if ($exists) json_error('Email déjà utilisé');

                $hash = password_hash($data['password'], PASSWORD_DEFAULT);
                $newUserId = db()->insert(
                    "INSERT INTO users (email, password, first_name, last_name, phone, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
                    [$data['email'], $hash, $data['first_name'], $data['last_name'], $data['phone'] ?? '', $newRole, $data['status'] ?? 'active']
                );
                
                // Assigner les hôtels si fournis
                if (!empty($data['hotel_ids']) && is_array($data['hotel_ids'])) {
                    $allowedHotels = getManageableHotels($user);
                    foreach ($data['hotel_ids'] as $hotelId) {
                        if (in_array($hotelId, $allowedHotels) || $user['role'] === 'admin') {
                            db()->insert(
                                "INSERT INTO user_hotels (user_id, hotel_id, assigned_at, assigned_by) VALUES (?, ?, NOW(), ?)",
                                [$newUserId, $hotelId, $user['id']]
                            );
                        }
                    }
                }
                
                json_out(['success' => true, 'id' => $newUserId], 201);
            }
            
            if ($method === 'PUT' && $id && !$action) {
                $user = require_auth();
                $data = get_input();
                
                $targetUser = db()->queryOne("SELECT * FROM users WHERE id = ?", [$id]);
                if (!$targetUser) json_error('Utilisateur non trouvé', 404);
                
                // Vérifier le droit de modifier cet utilisateur
                if (!canManageUser($user, $targetUser)) {
                    json_error('Vous ne pouvez pas modifier cet utilisateur', 403);
                }
                
                $sets = [];
                $params = [];
                
                if (isset($data['first_name'])) { $sets[] = "first_name = ?"; $params[] = $data['first_name']; }
                if (isset($data['last_name'])) { $sets[] = "last_name = ?"; $params[] = $data['last_name']; }
                if (isset($data['email'])) {
                    // Vérifier que l'email n'est pas déjà utilisé par un autre utilisateur
                    $existingEmail = db()->queryOne("SELECT id FROM users WHERE email = ? AND id != ?", [$data['email'], $id]);
                    if ($existingEmail) {
                        json_error('Cet email est déjà utilisé par un autre utilisateur');
                    }
                    $sets[] = "email = ?";
                    $params[] = $data['email'];
                }
                if (isset($data['phone'])) { $sets[] = "phone = ?"; $params[] = $data['phone']; }
                if (isset($data['status'])) { $sets[] = "status = ?"; $params[] = $data['status']; }
                if (!empty($data['password'])) { $sets[] = "password = ?"; $params[] = password_hash($data['password'], PASSWORD_DEFAULT); }
                
                // Changement de rôle - vérifier les droits
                if (isset($data['role']) && $data['role'] !== $targetUser['role']) {
                    if (!canAssignRole($user, $data['role'])) {
                        json_error('Vous ne pouvez pas assigner ce rôle', 403);
                    }
                    $sets[] = "role = ?";
                    $params[] = $data['role'];
                }
                
                if (!empty($sets)) {
                    $sets[] = "updated_at = NOW()";
                    $params[] = $id;
                    db()->execute("UPDATE users SET " . implode(', ', $sets) . " WHERE id = ?", $params);
                }
                
                json_out(['success' => true]);
            }
            
            // Assigner/modifier les hôtels d'un utilisateur
            if ($method === 'PUT' && $id && $action === 'hotels') {
                $user = require_auth();
                $data = get_input();
                
                $targetUser = db()->queryOne("SELECT * FROM users WHERE id = ?", [$id]);
                if (!$targetUser) json_error('Utilisateur non trouvé', 404);
                
                if (!canManageUser($user, $targetUser)) {
                    json_error('Vous ne pouvez pas modifier cet utilisateur', 403);
                }
                
                $hotelIds = $data['hotel_ids'] ?? [];
                $allowedHotels = getManageableHotels($user);
                
                // Supprimer les anciennes assignations (seulement pour les hôtels que l'utilisateur peut gérer)
                if ($user['role'] === 'admin') {
                    db()->execute("DELETE FROM user_hotels WHERE user_id = ?", [$id]);
                } else {
                    // Supprimer seulement les assignations aux hôtels gérables
                    if (!empty($allowedHotels)) {
                        $placeholders = implode(',', array_fill(0, count($allowedHotels), '?'));
                        db()->execute(
                            "DELETE FROM user_hotels WHERE user_id = ? AND hotel_id IN ($placeholders)",
                            array_merge([$id], $allowedHotels)
                        );
                    }
                }
                
                // Ajouter les nouvelles assignations
                foreach ($hotelIds as $hotelId) {
                    if (in_array($hotelId, $allowedHotels) || $user['role'] === 'admin') {
                        // Éviter les doublons
                        $exists = db()->queryOne("SELECT id FROM user_hotels WHERE user_id = ? AND hotel_id = ?", [$id, $hotelId]);
                        if (!$exists) {
                            db()->insert(
                                "INSERT INTO user_hotels (user_id, hotel_id, assigned_at, assigned_by) VALUES (?, ?, NOW(), ?)",
                                [$id, $hotelId, $user['id']]
                            );
                        }
                    }
                }
                
                json_out(['success' => true]);
            }
            break;
        
        // --- MESSAGES ---
        case 'messages':
            // Statistiques messages non lus
            if ($id === 'unread-count' && $method === 'GET') {
                $user = require_auth();
                $count = db()->count(
                    "SELECT COUNT(*) FROM messages WHERE (recipient_id = ? OR (is_broadcast = 1 AND (hotel_id IS NULL OR hotel_id IN (SELECT hotel_id FROM rooms r JOIN room_dispatch rd ON r.id = rd.room_id WHERE rd.assigned_to = ?)))) AND is_read = 0",
                    [$user['id'], $user['id']]
                );
                json_out(['success' => true, 'count' => $count]);
            }
            
            // Liste des messages reçus
            if ($method === 'GET' && !$id) {
                $user = require_auth();
                $query = "SELECT m.*,
                     CONCAT(s.first_name, ' ', s.last_name) as sender_name,
                     s.role as sender_role
                     FROM messages m
                     LEFT JOIN users s ON m.sender_id = s.id
                     WHERE m.recipient_id = ? OR (m.is_broadcast = 1 AND (m.hotel_id IS NULL OR m.hotel_id IN (SELECT DISTINCT r.hotel_id FROM rooms r JOIN room_dispatch rd ON r.id = rd.room_id WHERE rd.assigned_to = ?)))
                     ORDER BY m.created_at DESC";
                $params = [$user['id'], $user['id']];
                $countQuery = "SELECT COUNT(*) FROM messages m WHERE m.recipient_id = ? OR (m.is_broadcast = 1 AND (m.hotel_id IS NULL OR m.hotel_id IN (SELECT DISTINCT r.hotel_id FROM rooms r JOIN room_dispatch rd ON r.id = rd.room_id WHERE rd.assigned_to = ?)))";
                $result = paginate($query, $params, $countQuery, $params);
                json_out(['success' => true, 'messages' => $result['data'], 'pagination' => $result['pagination']]);
            }
            
            // Messages envoyés
            if ($id === 'sent' && $method === 'GET') {
                $user = require_auth();
                $query = "SELECT m.*,
                     CONCAT(r.first_name, ' ', r.last_name) as recipient_name,
                     h.name as hotel_name
                     FROM messages m
                     LEFT JOIN users r ON m.recipient_id = r.id
                     LEFT JOIN hotels h ON m.hotel_id = h.id
                     WHERE m.sender_id = ?
                     ORDER BY m.created_at DESC";
                $params = [$user['id']];
                $countQuery = "SELECT COUNT(*) FROM messages m WHERE m.sender_id = ?";
                $result = paginate($query, $params, $countQuery, $params);
                json_out(['success' => true, 'messages' => $result['data'], 'pagination' => $result['pagination']]);
            }
            
            // Lire un message (verifier que l'utilisateur est l'expediteur ou le destinataire)
            if ($method === 'GET' && $id && is_numeric($id)) {
                $user = require_auth();
                $message = db()->queryOne(
                    "SELECT m.*,
                     CONCAT(s.first_name, ' ', s.last_name) as sender_name,
                     CONCAT(r.first_name, ' ', r.last_name) as recipient_name
                     FROM messages m
                     LEFT JOIN users s ON m.sender_id = s.id
                     LEFT JOIN users r ON m.recipient_id = r.id
                     WHERE m.id = ? AND (m.sender_id = ? OR m.recipient_id = ? OR m.is_broadcast = 1)",
                    [$id, $user['id'], $user['id']]
                );
                if (!$message) json_error('Message non trouvé', 404);
                
                // Marquer comme lu si c'est le destinataire
                if ($message['recipient_id'] == $user['id'] && !$message['is_read']) {
                    db()->execute("UPDATE messages SET is_read = 1, read_at = NOW() WHERE id = ?", [$id]);
                    $message['is_read'] = 1;
                }
                
                json_out(['success' => true, 'message' => $message]);
            }
            
            // Envoyer un message
            if ($method === 'POST') {
                $user = require_auth();
                $data = get_input();
                
                if (empty($data['subject']) || empty($data['body'])) {
                    json_error('Sujet et contenu requis');
                }
                
                $isBroadcast = !empty($data['is_broadcast']);
                $recipientId = $data['recipient_id'] ?? null;
                $hotelId = $data['hotel_id'] ?? null;
                
                if (!$isBroadcast && !$recipientId) {
                    json_error('Destinataire requis');
                }
                
                $msgId = db()->insert(
                    "INSERT INTO messages (sender_id, recipient_id, hotel_id, subject, content, priority, is_broadcast, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
                    [$user['id'], $recipientId, $hotelId, $data['subject'], $data['content'] ?? $data['body'] ?? '', $data['priority'] ?? 'normal', $isBroadcast ? 1 : 0]
                );
                
                json_out(['success' => true, 'id' => $msgId], 201);
            }
            
            // Marquer comme lu
            if ($method === 'PUT' && $id && $action === 'read') {
                $user = require_auth();
                db()->execute("UPDATE messages SET is_read = 1, read_at = NOW() WHERE id = ? AND recipient_id = ?", [$id, $user['id']]);
                json_out(['success' => true]);
            }
            
            // Supprimer un message
            if ($method === 'DELETE' && $id) {
                $user = require_auth();
                db()->execute("DELETE FROM messages WHERE id = ? AND (sender_id = ? OR recipient_id = ?)", [$id, $user['id'], $user['id']]);
                json_out(['success' => true]);
            }
            break;
        
        // --- MESSAGING (Messenger-style) ---
        case 'messaging':
            // Liste des utilisateurs avec qui on peut discuter (mêmes hôtels)
            if ($id === 'users' && $method === 'GET') {
                $user = require_auth();
                
                if ($user['role'] === 'admin') {
                    $users = db()->query(
                        "SELECT id, first_name, last_name, role FROM users WHERE status = 'active' AND id != ? ORDER BY first_name",
                        [$user['id']]
                    );
                } else {
                    // Utilisateurs des mêmes hôtels
                    $users = db()->query(
                        "SELECT DISTINCT u.id, u.first_name, u.last_name, u.role 
                         FROM users u
                         INNER JOIN user_hotels uh ON u.id = uh.user_id
                         WHERE u.status = 'active' AND u.id != ?
                         AND uh.hotel_id IN (SELECT hotel_id FROM user_hotels WHERE user_id = ?)
                         ORDER BY u.first_name",
                        [$user['id'], $user['id']]
                    );
                }
                json_out(['success' => true, 'users' => $users]);
            }
            
            // Nombre de messages non lus
            if ($id === 'unread-count' && $method === 'GET') {
                $user = require_auth();
                
                $count = db()->count(
                    "SELECT COUNT(*) FROM conversation_messages cm
                     JOIN conversations c ON cm.conversation_id = c.id
                     WHERE (c.user1_id = ? OR c.user2_id = ?) AND cm.sender_id != ? AND cm.is_read = 0",
                    [$user['id'], $user['id'], $user['id']]
                );
                
                json_out(['success' => true, 'count' => $count]);
            }
            
            // Envoyer un message dans une conversation: POST /messaging/conversations/{id}/messages
            if ($id === 'conversations' && $action && is_numeric($action) && $subId === 'messages' && $method === 'POST') {
                $user = require_auth();
                $convId = (int)$action;
                $data = get_input();
                
                if (empty($data['content'])) json_error('Message requis');
                
                // Vérifier accès
                $conv = db()->queryOne(
                    "SELECT * FROM conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)",
                    [$convId, $user['id'], $user['id']]
                );
                if (!$conv) json_error('Conversation non trouvée', 404);
                
                db()->execute(
                    "INSERT INTO conversation_messages (conversation_id, sender_id, content, created_at) VALUES (?, ?, ?, NOW())",
                    [$convId, $user['id'], $data['content']]
                );
                
                db()->execute(
                    "UPDATE conversations SET last_message = ?, last_at = NOW() WHERE id = ?",
                    [substr($data['content'], 0, 100), $convId]
                );
                
                // Notification au destinataire
                $recipientId = ($conv['user1_id'] == $user['id']) ? $conv['user2_id'] : $conv['user1_id'];
                $senderName = $user['first_name'] . ' ' . $user['last_name'];
                createNotification(
                    $recipientId,
                    'message',
                    'Nouveau message',
                    "Message de {$senderName}: " . substr($data['content'], 0, 50) . (strlen($data['content']) > 50 ? '...' : ''),
                    'messages',
                    $convId
                );
                
                json_out(['success' => true]);
            }
            
            // Marquer conversation comme lue: PUT /messaging/conversations/{id}/read
            if ($id === 'conversations' && $action && is_numeric($action) && $subId === 'read' && $method === 'PUT') {
                $user = require_auth();
                $convId = (int)$action;
                
                db()->execute(
                    "UPDATE conversation_messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ?",
                    [$convId, $user['id']]
                );
                
                json_out(['success' => true]);
            }
            
            // Messages d'une conversation: GET /messaging/conversations/{id}
            if ($id === 'conversations' && $action && is_numeric($action) && $method === 'GET') {
                $user = require_auth();
                $convId = (int)$action;
                
                // Vérifier accès
                $conv = db()->queryOne(
                    "SELECT * FROM conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)",
                    [$convId, $user['id'], $user['id']]
                );
                if (!$conv) json_error('Conversation non trouvée', 404);
                
                $messages = db()->query(
                    "SELECT cm.id, cm.conversation_id, cm.sender_id, cm.content, cm.is_read, cm.created_at,
                            CONCAT(u.first_name, ' ', u.last_name) as sender_name
                     FROM conversation_messages cm
                     LEFT JOIN users u ON cm.sender_id = u.id
                     WHERE cm.conversation_id = ?
                     ORDER BY cm.created_at ASC",
                    [$convId]
                );
                
                json_out(['success' => true, 'messages' => $messages]);
            }
            
            // Liste des conversations: GET /messaging/conversations
            if ($id === 'conversations' && !$action && $method === 'GET') {
                $user = require_auth();
                
                $conversations = db()->query(
                    "SELECT 
                        c.id,
                        c.user1_id,
                        c.user2_id,
                        c.last_message,
                        c.last_at,
                        CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END as other_id,
                        CASE WHEN c.user1_id = ? THEN CONCAT(u2.first_name, ' ', u2.last_name) ELSE CONCAT(u1.first_name, ' ', u1.last_name) END as other_name,
                        CASE WHEN c.user1_id = ? THEN u2.role ELSE u1.role END as other_role,
                        (SELECT COUNT(*) FROM conversation_messages cm WHERE cm.conversation_id = c.id AND cm.sender_id != ? AND cm.is_read = 0) as unread
                     FROM conversations c
                     JOIN users u1 ON c.user1_id = u1.id
                     JOIN users u2 ON c.user2_id = u2.id
                     WHERE c.user1_id = ? OR c.user2_id = ?
                     ORDER BY c.last_at DESC",
                    [$user['id'], $user['id'], $user['id'], $user['id'], $user['id'], $user['id']]
                );
                
                json_out(['success' => true, 'conversations' => $conversations]);
            }
            
            // Créer une nouvelle conversation: POST /messaging/conversations
            if ($id === 'conversations' && !$action && $method === 'POST') {
                $user = require_auth();
                $data = get_input();
                
                if (empty($data['recipient_id']) || empty($data['content'])) {
                    json_error('Destinataire et message requis');
                }
                
                $recipientId = (int)$data['recipient_id'];
                
                // Vérifier que le destinataire existe
                $recipient = db()->queryOne("SELECT id FROM users WHERE id = ?", [$recipientId]);
                if (!$recipient) json_error('Destinataire non trouvé');
                
                // Vérifier si conversation existe déjà
                $existing = db()->queryOne(
                    "SELECT id FROM conversations WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)",
                    [$user['id'], $recipientId, $recipientId, $user['id']]
                );
                
                if ($existing) {
                    $convId = (int)$existing['id'];
                } else {
                    // Créer la conversation
                    db()->execute(
                        "INSERT INTO conversations (user1_id, user2_id, last_message, last_at, created_at) VALUES (?, ?, ?, NOW(), NOW())",
                        [$user['id'], $recipientId, substr($data['content'], 0, 100)]
                    );
                    $convId = (int)db()->queryOne("SELECT LAST_INSERT_ID() as id")['id'];
                    
                    if (!$convId) {
                        json_error('Erreur création conversation');
                    }
                }
                
                // Ajouter le message
                db()->execute(
                    "INSERT INTO conversation_messages (conversation_id, sender_id, content, created_at) VALUES (?, ?, ?, NOW())",
                    [$convId, $user['id'], $data['content']]
                );
                
                // Mettre à jour last_message
                db()->execute(
                    "UPDATE conversations SET last_message = ?, last_at = NOW() WHERE id = ?",
                    [substr($data['content'], 0, 100), $convId]
                );
                
                json_out(['success' => true, 'conversation_id' => $convId]);
            }
            break;
        
        // --- PERMISSIONS ---
        case 'permissions':
            // Mes permissions (pour le frontend) - DOIT être en premier
            if ($method === 'GET' && $id === 'me') {
                $user = require_auth();
                $perms = getRolePermissions($user['role']);
                json_out(['success' => true, 'role' => $user['role'], 'permissions' => $perms]);
            }
            
            // Liste toutes les permissions par rôle
            if ($method === 'GET' && !$id) {
                $user = require_auth();
                if (!hasPermission($user['role'], 'permissions.manage') && $user['role'] !== 'admin') {
                    json_error('Permission refusée', 403);
                }
                
                $roles = ['admin', 'groupe_manager', 'hotel_manager', 'comptabilite', 'rh', 'receptionniste', 'employee'];
                $permissions = [];
                
                foreach ($roles as $role) {
                    $perms = db()->query("SELECT permission, allowed FROM role_permissions WHERE role = ?", [$role]);
                    $permissions[$role] = [];
                    foreach ($perms as $p) {
                        $permissions[$role][$p['permission']] = (bool)$p['allowed'];
                    }
                }
                
                json_out(['success' => true, 'permissions' => $permissions]);
            }
            
            // Permissions d'un rôle spécifique
            if ($method === 'GET' && $id && $id !== 'me') {
                $user = require_auth();
                $perms = db()->query("SELECT permission, allowed FROM role_permissions WHERE role = ?", [$id]);
                $result = [];
                foreach ($perms as $p) {
                    $result[$p['permission']] = (bool)$p['allowed'];
                }
                json_out(['success' => true, 'role' => $id, 'permissions' => $result]);
            }
            
            // Modifier les permissions d'un rôle
            if ($method === 'PUT' && $id) {
                $user = require_auth();
                if ($user['role'] !== 'admin') {
                    json_error('Seul l\'admin peut modifier les permissions', 403);
                }
                
                // Ne pas permettre de modifier les permissions admin
                if ($id === 'admin') {
                    json_error('Les permissions admin ne peuvent pas être modifiées', 400);
                }
                
                $data = get_input();
                if (empty($data['permissions']) || !is_array($data['permissions'])) {
                    json_error('Permissions requises');
                }
                
                foreach ($data['permissions'] as $permission => $allowed) {
                    $exists = db()->queryOne(
                        "SELECT id FROM role_permissions WHERE role = ? AND permission = ?",
                        [$id, $permission]
                    );
                    
                    if ($exists) {
                        db()->execute(
                            "UPDATE role_permissions SET allowed = ?, updated_at = NOW() WHERE role = ? AND permission = ?",
                            [$allowed ? 1 : 0, $id, $permission]
                        );
                    } else {
                        db()->insert(
                            "INSERT INTO role_permissions (role, permission, allowed, updated_at) VALUES (?, ?, ?, NOW())",
                            [$id, $permission, $allowed ? 1 : 0]
                        );
                    }
                }
                
                json_out(['success' => true]);
            }
            break;
        
        // =============================================
        // MODULE TIME - Planning, Émargement, Gestion Temps
        // =============================================
        

        case 'time':
            // Pour TIME: $id = type de ressource (services, templates, etc.)
            // $action = ID numérique pour PUT/DELETE
            $resourceType = $id;
            $resourceId = $action;
            
            // === SERVICES ===
            if ($resourceType === 'services') {
                if ($method === 'GET' && !$resourceId) {
                    require_auth();
                    $hotelId = $_GET['hotel_id'] ?? null;
                    $where = "1=1";
                    $params = [];
                    if ($hotelId) {
                        $where .= " AND ts.hotel_id = ?";
                        $params[] = $hotelId;
                    }
                    $services = db()->query(
                        "SELECT ts.*, h.name as hotel_name FROM time_services ts
                         JOIN hotels h ON ts.hotel_id = h.id WHERE $where ORDER BY h.name, ts.name", $params
                    );
                    json_out(['success' => true, 'services' => $services]);
                }
                if ($method === 'POST' && !$resourceId) {
                    require_role('admin', 'groupe_manager', 'hotel_manager');
                    $data = get_input();
                    if (empty($data['hotel_id']) || empty($data['name'])) json_error('Hôtel et nom requis');
                    $newId = db()->insert(
                        "INSERT INTO time_services (hotel_id, name, code, color, sort_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, NOW())",
                        [$data['hotel_id'], $data['name'], $data['code'] ?? null, $data['color'] ?? '#1E3A5F', $data['sort_order'] ?? 0]
                    );
                    json_out(['success' => true, 'id' => $newId], 201);
                }
                if ($method === 'PUT' && $resourceId) {
                    require_role('admin', 'groupe_manager', 'hotel_manager');
                    $data = get_input();
                    $sets = []; $params = [];
                    foreach (['name', 'code', 'color', 'sort_order', 'is_active'] as $field) {
                        if (isset($data[$field])) { $sets[] = "$field = ?"; $params[] = $data[$field]; }
                    }
                    if ($sets) { $params[] = $resourceId; db()->execute("UPDATE time_services SET " . implode(', ', $sets) . ", updated_at = NOW() WHERE id = ?", $params); }
                    json_out(['success' => true]);
                }
                if ($method === 'DELETE' && $resourceId) {
                    require_role('admin', 'groupe_manager', 'hotel_manager');
                    db()->execute("DELETE FROM time_services WHERE id = ?", [$resourceId]);
                    json_out(['success' => true]);
                }
            }
            
            // === POSITIONS ===
            if ($resourceType === 'positions') {
                if ($method === 'GET' && !$resourceId) {
                    require_auth();
                    $hotelId = $_GET['hotel_id'] ?? null;
                    $where = "1=1"; $params = [];
                    if ($hotelId) { $where .= " AND tp.hotel_id = ?"; $params[] = $hotelId; }
                    $positions = db()->query(
                        "SELECT tp.*, h.name as hotel_name, ts.name as service_name FROM time_positions tp
                         JOIN hotels h ON tp.hotel_id = h.id LEFT JOIN time_services ts ON tp.service_id = ts.id
                         WHERE $where ORDER BY h.name, ts.name, tp.name", $params
                    );
                    json_out(['success' => true, 'positions' => $positions]);
                }
                if ($method === 'POST' && !$resourceId) {
                    require_role('admin', 'groupe_manager', 'hotel_manager');
                    $data = get_input();
                    if (empty($data['hotel_id']) || empty($data['name'])) json_error('Hôtel et nom requis');
                    $newId = db()->insert(
                        "INSERT INTO time_positions (hotel_id, service_id, name, code, color, sort_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, NOW())",
                        [$data['hotel_id'], $data['service_id'] ?? null, $data['name'], $data['code'] ?? null, $data['color'] ?? '#2D8B6F', $data['sort_order'] ?? 0]
                    );
                    json_out(['success' => true, 'id' => $newId], 201);
                }
                if ($method === 'DELETE' && $resourceId) {
                    require_role('admin', 'groupe_manager', 'hotel_manager');
                    db()->execute("DELETE FROM time_positions WHERE id = ?", [$resourceId]);
                    json_out(['success' => true]);
                }
            }
            
            // === CONTRACTS ===
            if ($resourceType === 'contracts') {
                if ($method === 'GET' && !$resourceId) {
                    require_auth();
                    $userId = $_GET['user_id'] ?? null;
                    $hotelId = $_GET['hotel_id'] ?? null;
                    $where = "1=1"; $params = [];
                    if ($userId) { $where .= " AND tc.user_id = ?"; $params[] = $userId; }
                    if ($hotelId) { $where .= " AND tc.hotel_id = ?"; $params[] = $hotelId; }
                    $contracts = db()->query(
                        "SELECT tc.*, CONCAT(u.first_name, ' ', u.last_name) as user_name, h.name as hotel_name
                         FROM time_contracts tc JOIN users u ON tc.user_id = u.id JOIN hotels h ON tc.hotel_id = h.id
                         WHERE $where ORDER BY tc.is_active DESC, tc.start_date DESC", $params
                    );
                    json_out(['success' => true, 'contracts' => $contracts]);
                }
                if ($method === 'POST' && !$resourceId) {
                    require_role('admin', 'groupe_manager', 'hotel_manager', 'rh');
                    $data = get_input();
                    if (empty($data['user_id']) || empty($data['hotel_id'])) json_error('Utilisateur et hôtel requis');
                    $newId = db()->insert(
                        "INSERT INTO time_contracts (user_id, hotel_id, contract_type, start_date, end_date, weekly_hours, hourly_rate, is_active, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW())",
                        [$data['user_id'], $data['hotel_id'], $data['contract_type'] ?? 'cdi', $data['start_date'] ?? date('Y-m-d'),
                         $data['end_date'] ?? null, $data['weekly_hours'] ?? 35, $data['hourly_rate'] ?? null]
                    );
                    json_out(['success' => true, 'id' => $newId], 201);
                }
                if ($method === 'PUT' && $resourceId) {
                    require_auth();
                    $data = get_input();
                    $sets = []; $params = [];
                    foreach (['contract_type', 'start_date', 'end_date', 'weekly_hours', 'hourly_rate', 'is_active'] as $field) {
                        if (isset($data[$field])) { $sets[] = "$field = ?"; $params[] = $data[$field]; }
                    }
                    if ($sets) { $params[] = $resourceId; db()->execute("UPDATE time_contracts SET " . implode(', ', $sets) . ", updated_at = NOW() WHERE id = ?", $params); }
                    json_out(['success' => true]);
                }
                if ($method === 'DELETE' && $resourceId) {
                    require_auth();
                    db()->execute("DELETE FROM time_contracts WHERE id = ?", [$resourceId]);
                    json_out(['success' => true]);
                }
            }
            
            // === TEMPLATES ===
            if ($resourceType === 'templates') {
                if ($method === 'GET') {
                    require_auth();
                    $hotelId = $_GET['hotel_id'] ?? null;
                    $templates = db()->query(
                        "SELECT tt.*, h.name as hotel_name FROM time_templates tt
                         LEFT JOIN hotels h ON tt.hotel_id = h.id
                         WHERE tt.is_global = 1 OR tt.hotel_id = ? OR tt.hotel_id IS NULL
                         ORDER BY tt.is_global DESC, tt.name", [$hotelId]
                    );
                    json_out(['success' => true, 'templates' => $templates]);
                }
                if ($method === 'POST') {
                    $user = require_auth();
                    $data = get_input();
                    if (empty($data['name']) || empty($data['start_time']) || empty($data['end_time'])) json_error('Nom et horaires requis');
                    $newId = db()->insert(
                        "INSERT INTO time_templates (hotel_id, name, start_time, end_time, break_minutes, color, is_global, created_by, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                        [$data['hotel_id'] ?? null, $data['name'], $data['start_time'], $data['end_time'],
                         $data['break_minutes'] ?? 60, $data['color'] ?? '#1E3A5F', $data['is_global'] ?? 0, $user['id']]
                    );
                    json_out(['success' => true, 'id' => $newId], 201);
                }
                if ($method === 'DELETE' && $resourceId) {
                    require_auth();
                    db()->execute("DELETE FROM time_templates WHERE id = ?", [$resourceId]);
                    json_out(['success' => true]);
                }
            }
            
            // === HOLIDAYS ===
            if ($resourceType === 'holidays') {
                if ($method === 'GET') {
                    require_auth();
                    $year = $_GET['year'] ?? date('Y');
                    $holidays = db()->query("SELECT * FROM time_holidays WHERE YEAR(holiday_date) = ? ORDER BY holiday_date", [$year]);
                    json_out(['success' => true, 'holidays' => $holidays]);
                }
            }
            
            // === SCHEDULES ===
            if ($resourceType === 'schedules' || !$resourceType) {
                if ($method === 'GET' && !$resourceId) {
                    require_auth();
                    $hotelId = $_GET['hotel_id'] ?? null;
                    $weekStart = $_GET['week_start'] ?? null;
                    if (!$hotelId) json_error('hotel_id requis');
                    if (!$weekStart) json_error('week_start requis');
                    
                    // Get or create schedule
                    $schedule = db()->queryOne(
                        "SELECT s.*, h.name as hotel_name FROM time_schedules s JOIN hotels h ON s.hotel_id = h.id WHERE s.hotel_id = ? AND s.week_start = ?",
                        [$hotelId, $weekStart]
                    );
                    if (!$schedule) {
                        $scheduleId = db()->insert("INSERT INTO time_schedules (hotel_id, week_start, status, created_at) VALUES (?, ?, 'draft', NOW())", [$hotelId, $weekStart]);
                        $schedule = db()->queryOne("SELECT s.*, h.name as hotel_name FROM time_schedules s JOIN hotels h ON s.hotel_id = h.id WHERE s.id = ?", [$scheduleId]);
                    }
                    
                    // Get entries
                    $entries = db()->query(
                        "SELECT se.*, CONCAT(u.first_name, ' ', u.last_name) as user_name, tp.name as position_name, tp.color as position_color
                         FROM time_schedule_entries se JOIN users u ON se.user_id = u.id LEFT JOIN time_positions tp ON se.position_id = tp.id
                         WHERE se.schedule_id = ? ORDER BY se.work_date, u.last_name", [$schedule['id']]
                    );
                    
                    // Get employees - tous les utilisateurs assignés à l'hôtel OU ayant un contrat actif pour cet hôtel
                    $employees = db()->query(
                        "SELECT DISTINCT u.id, u.first_name, u.last_name, u.role, tc.weekly_hours, tc.contract_type,
                         tp.name as position_name, tp.color as position_color, ts.name as service_name
                         FROM users u 
                         LEFT JOIN user_hotels uh ON u.id = uh.user_id AND uh.hotel_id = ?
                         LEFT JOIN time_contracts tc ON u.id = tc.user_id AND tc.hotel_id = ? AND tc.is_active = 1
                         LEFT JOIN time_user_positions tup ON u.id = tup.user_id AND tup.is_primary = 1
                         LEFT JOIN time_positions tp ON tup.position_id = tp.id
                         LEFT JOIN time_services ts ON tp.service_id = ts.id
                         WHERE u.status = 'active' AND (uh.hotel_id IS NOT NULL OR tc.id IS NOT NULL)
                         ORDER BY ts.name, u.last_name", [$hotelId, $hotelId]
                    );
                    
                    // Get leaves
                    $weekEnd = date('Y-m-d', strtotime($weekStart . ' +6 days'));
                    $leaves = db()->query(
                        "SELECT employee_id, start_date, end_date, leave_type FROM leave_requests
                         WHERE hotel_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ?",
                        [$hotelId, $weekEnd, $weekStart]
                    );
                    
                    json_out(['success' => true, 'schedule' => $schedule, 'entries' => $entries, 'employees' => $employees, 'leaves' => $leaves]);
                }
                if ($method === 'PUT' && $resourceId) {
                    $user = require_auth();
                    $data = get_input();
                    $sets = []; $params = [];
                    if (isset($data['status'])) {
                        $sets[] = "status = ?"; $params[] = $data['status'];
                        if ($data['status'] === 'published') { $sets[] = "published_at = NOW()"; $sets[] = "published_by = ?"; $params[] = $user['id']; }
                        if ($data['status'] === 'locked') { $sets[] = "locked_at = NOW()"; $sets[] = "locked_by = ?"; $params[] = $user['id']; }
                    }
                    if ($sets) { $params[] = $resourceId; db()->execute("UPDATE time_schedules SET " . implode(', ', $sets) . " WHERE id = ?", $params); }
                    json_out(['success' => true]);
                }
            }
            
            // === ENTRIES (Schedule entries) ===
            if ($resourceType === 'entries') {
                if ($method === 'POST' && !$resourceId) {
                    require_auth();
                    $data = get_input();
                    if (empty($data['schedule_id']) || empty($data['user_id']) || empty($data['work_date'])) json_error('Données manquantes');
                    
                    // Delete existing entry for same day/user
                    db()->execute("DELETE FROM time_schedule_entries WHERE schedule_id = ? AND user_id = ? AND work_date = ?",
                        [$data['schedule_id'], $data['user_id'], $data['work_date']]);
                    
                    // Calculate worked minutes
                    $workedMinutes = 0;
                    if ($data['entry_type'] === 'work' && !empty($data['start_time']) && !empty($data['end_time'])) {
                        $start = strtotime($data['start_time']);
                        $end = strtotime($data['end_time']);
                        if ($end < $start) $end += 86400;
                        $workedMinutes = ($end - $start) / 60 - ($data['break_minutes'] ?? 0);
                    }
                    
                    $newId = db()->insert(
                        "INSERT INTO time_schedule_entries (schedule_id, user_id, work_date, entry_type, start_time, end_time, break_minutes, worked_minutes, position_id, absence_type, notes, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                        [$data['schedule_id'], $data['user_id'], $data['work_date'], $data['entry_type'] ?? 'work',
                         $data['start_time'] ?? null, $data['end_time'] ?? null, $data['break_minutes'] ?? 0, $workedMinutes,
                         $data['position_id'] ?? null, $data['absence_type'] ?? null, $data['notes'] ?? null]
                    );
                    json_out(['success' => true, 'id' => $newId], 201);
                }
                if ($method === 'DELETE' && $resourceId) {
                    require_auth();
                    db()->execute("DELETE FROM time_schedule_entries WHERE id = ?", [$resourceId]);
                    json_out(['success' => true]);
                }
            }
            
            // === MY-SCHEDULE ===
            if ($resourceType === 'my-schedule') {
                $user = require_auth();
                $month = $_GET['month'] ?? date('Y-m');
                $startDate = $month . '-01';
                $endDate = date('Y-m-t', strtotime($startDate));
                
                $entries = db()->query(
                    "SELECT se.* FROM time_schedule_entries se
                     JOIN time_schedules s ON se.schedule_id = s.id
                     WHERE se.user_id = ? AND se.work_date BETWEEN ? AND ?
                     ORDER BY se.work_date", [$user['id'], $startDate, $endDate]
                );
                
                $contract = db()->queryOne("SELECT * FROM time_contracts WHERE user_id = ? AND is_active = 1 LIMIT 1", [$user['id']]);
                
                $leaves = db()->query(
                    "SELECT * FROM leave_requests WHERE employee_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ?",
                    [$user['id'], $endDate, $startDate]
                );
                
                json_out(['success' => true, 'entries' => $entries, 'contract' => $contract, 'leaves' => $leaves]);
            }
            
            // === TIMESHEET ===
            if ($resourceType === 'timesheet') {
                // Transfer from schedule
                if ($method === 'POST' && $resourceId === 'transfer') {
                    require_auth();
                    $data = get_input();
                    if (empty($data['schedule_id'])) json_error('schedule_id requis');
                    
                    $scheduleEntries = db()->query(
                        "SELECT se.*, s.hotel_id FROM time_schedule_entries se JOIN time_schedules s ON se.schedule_id = s.id
                         WHERE se.schedule_id = ? AND se.entry_type = 'work'", [$data['schedule_id']]
                    );
                    
                    $count = 0;
                    foreach ($scheduleEntries as $se) {
                        $existing = db()->queryOne("SELECT id FROM time_entries WHERE user_id = ? AND work_date = ?", [$se['user_id'], $se['work_date']]);
                        if (!$existing) {
                            db()->insert(
                                "INSERT INTO time_entries (user_id, hotel_id, work_date, entry_type, planned_start, planned_end, planned_break, planned_minutes, status, created_at)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())",
                                [$se['user_id'], $se['hotel_id'], $se['work_date'], $se['entry_type'], $se['start_time'], $se['end_time'], $se['break_minutes'], $se['worked_minutes']]
                            );
                            $count++;
                        }
                    }
                    json_out(['success' => true, 'transferred' => $count]);
                }
                
                // Validate entries
                if ($method === 'POST' && $resourceId === 'validate') {
                    $user = require_auth();
                    $data = get_input();
                    if (empty($data['entry_ids'])) json_error('entry_ids requis');
                    $ids_array = array_filter(array_map('intval', $data['entry_ids']));
                    if (empty($ids_array)) json_error('entry_ids invalides');
                    $ids = implode(',', $ids_array);
                    db()->execute("UPDATE time_entries SET status = 'validated', validated_by = ?, validated_at = NOW() WHERE id IN ($ids)", [$user['id']]);
                    json_out(['success' => true]);
                }
                
                // Get timesheet
                if ($method === 'GET' && !$resourceId) {
                    require_auth();
                    $hotelId = $_GET['hotel_id'] ?? null;
                    $weekStart = $_GET['week_start'] ?? null;
                    $where = "1=1"; $params = [];
                    if ($hotelId) { $where .= " AND te.hotel_id = ?"; $params[] = $hotelId; }
                    if ($weekStart) {
                        $weekEnd = date('Y-m-d', strtotime($weekStart . ' +6 days'));
                        $where .= " AND te.work_date BETWEEN ? AND ?";
                        $params[] = $weekStart; $params[] = $weekEnd;
                    }
                    $entries = db()->query(
                        "SELECT te.*, CONCAT(u.first_name, ' ', u.last_name) as user_name FROM time_entries te
                         JOIN users u ON te.user_id = u.id WHERE $where ORDER BY te.work_date, u.last_name", $params
                    );
                    json_out(['success' => true, 'entries' => $entries]);
                }
                
                // Update entry
                if ($method === 'PUT' && $resourceId && $resourceId !== 'transfer' && $resourceId !== 'validate') {
                    require_auth();
                    $data = get_input();
                    $actualMinutes = 0;
                    if (!empty($data['actual_start']) && !empty($data['actual_end'])) {
                        $start = strtotime($data['actual_start']);
                        $end = strtotime($data['actual_end']);
                        if ($end < $start) $end += 86400;
                        $actualMinutes = ($end - $start) / 60 - ($data['actual_break'] ?? 0);
                    }
                    $entry = db()->queryOne("SELECT planned_minutes FROM time_entries WHERE id = ?", [$resourceId]);
                    $diffMinutes = $actualMinutes - ($entry['planned_minutes'] ?? 0);
                    db()->execute(
                        "UPDATE time_entries SET actual_start = ?, actual_end = ?, actual_break = ?, actual_minutes = ?, diff_minutes = ?, updated_at = NOW() WHERE id = ?",
                        [$data['actual_start'] ?? null, $data['actual_end'] ?? null, $data['actual_break'] ?? 0, $actualMinutes, $diffMinutes, $resourceId]
                    );
                    json_out(['success' => true]);
                }
            }
            
            // === COUNTERS ===
            if ($resourceType === 'counters') {
                require_auth();
                $hotelId = $_GET['hotel_id'] ?? null;
                $periodType = $_GET['period_type'] ?? 'monthly';
                $year = $_GET['year'] ?? date('Y');
                $where = "tc.period_type = ? AND YEAR(tc.period_start) = ?";
                $params = [$periodType, $year];
                if ($hotelId) { $where .= " AND tc.hotel_id = ?"; $params[] = $hotelId; }
                $counters = db()->query(
                    "SELECT tc.*, CONCAT(u.first_name, ' ', u.last_name) as user_name, h.name as hotel_name
                     FROM time_counters tc JOIN users u ON tc.user_id = u.id JOIN hotels h ON tc.hotel_id = h.id
                     WHERE $where ORDER BY tc.period_start DESC, u.last_name", $params
                );
                json_out(['success' => true, 'counters' => $counters]);
            }
            
            // === EMPLOYEES ===
            if ($resourceType === 'employees') {
                require_auth();
                $hotelId = $_GET['hotel_id'] ?? null;
                if (!$hotelId) json_error('hotel_id requis');
                $employees = db()->query(
                    "SELECT DISTINCT u.id, u.first_name, u.last_name, u.role, tc.weekly_hours, tc.contract_type,
                     tp.name as position_name, tp.color as position_color, ts.name as service_name
                     FROM users u 
                     LEFT JOIN user_hotels uh ON u.id = uh.user_id AND uh.hotel_id = ?
                     LEFT JOIN time_contracts tc ON u.id = tc.user_id AND tc.hotel_id = ? AND tc.is_active = 1
                     LEFT JOIN time_user_positions tup ON u.id = tup.user_id AND tup.is_primary = 1
                     LEFT JOIN time_positions tp ON tup.position_id = tp.id
                     LEFT JOIN time_services ts ON tp.service_id = ts.id
                     WHERE u.status = 'active' AND (uh.hotel_id IS NOT NULL OR tc.id IS NOT NULL)
                     ORDER BY ts.name, u.last_name", [$hotelId, $hotelId]
                );
                json_out(['success' => true, 'employees' => $employees]);
            }
            
            // === USER-POSITIONS ===
            if ($resourceType === 'user-positions') {
                if ($method === 'GET') {
                    require_auth();
                    $userId = $_GET['user_id'] ?? null;
                    $where = "1=1"; $params = [];
                    if ($userId) { $where .= " AND tup.user_id = ?"; $params[] = $userId; }
                    $positions = db()->query(
                        "SELECT tup.*, CONCAT(u.first_name, ' ', u.last_name) as user_name, tp.name as position_name, tp.color as position_color
                         FROM time_user_positions tup JOIN users u ON tup.user_id = u.id JOIN time_positions tp ON tup.position_id = tp.id
                         WHERE $where ORDER BY tup.is_primary DESC", $params
                    );
                    json_out(['success' => true, 'positions' => $positions]);
                }
                if ($method === 'POST') {
                    require_auth();
                    $data = get_input();
                    if (empty($data['user_id']) || empty($data['position_id'])) json_error('user_id et position_id requis');
                    if (!empty($data['is_primary'])) {
                        db()->execute("UPDATE time_user_positions SET is_primary = 0 WHERE user_id = ?", [$data['user_id']]);
                    }
                    $newId = db()->insert(
                        "INSERT INTO time_user_positions (user_id, position_id, is_primary, start_date, end_date, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
                        [$data['user_id'], $data['position_id'], $data['is_primary'] ?? 0, $data['start_date'] ?? date('Y-m-d'), $data['end_date'] ?? null]
                    );
                    json_out(['success' => true, 'id' => $newId], 201);
                }
                if ($method === 'DELETE' && $resourceId) {
                    require_auth();
                    db()->execute("DELETE FROM time_user_positions WHERE id = ?", [$resourceId]);
                    json_out(['success' => true]);
                }
            }
            
            break;
        
        // --- AUDIT ---
        case 'audit':
            // Liste des grilles - GET /audit/grids
            if ($method === 'GET' && $id === 'grids' && !$action) {
                $user = require_auth();
                $hotelId = $_GET['hotel_id'] ?? null;
                $all = $_GET['all'] ?? false;
                
                $where = "ag.is_active = 1";
                $params = [];
                
                if (!$all && $hotelId) {
                    // Vérifier dans la table de liaison OU hotel_id direct (compatibilité)
                    $where .= " AND (ag.hotel_id IS NULL OR ag.hotel_id = ? OR ag.id IN (SELECT grid_id FROM audit_grid_hotels WHERE hotel_id = ?))";
                    $params[] = $hotelId;
                    $params[] = $hotelId;
                }
                
                // Filtrer par permissions si pas admin/groupe_manager
                if (!in_array($user['role'], ['admin', 'groupe_manager'])) {
                    $where .= " AND (ag.id IN (SELECT grid_id FROM audit_grid_permissions WHERE permission_type = 'execute' AND target_type = 'role' AND target_id = ?))";
                    $params[] = $user['role'];
                }
                
                try {
                    $grids = db()->query(
                        "SELECT ag.*, h.name as hotel_name,
                         (SELECT COUNT(*) FROM audit_questions WHERE grid_id = ag.id AND is_active = 1) as questions_count
                         FROM audit_grids ag
                         LEFT JOIN hotels h ON ag.hotel_id = h.id
                         WHERE $where
                         ORDER BY ag.name",
                        $params
                    );
                    
                    // Ajouter les noms des hôtels liés pour chaque grille
                    foreach ($grids as &$grid) {
                        try {
                            $linkedHotels = db()->query(
                                "SELECT h.id, h.name FROM audit_grid_hotels agh JOIN hotels h ON agh.hotel_id = h.id WHERE agh.grid_id = ?",
                                [$grid['id']]
                            );
                            if (!empty($linkedHotels)) {
                                $grid['hotels'] = $linkedHotels;
                                $grid['hotels_display'] = implode(', ', array_column($linkedHotels, 'name'));
                            } else if ($grid['hotel_name']) {
                                $grid['hotels_display'] = $grid['hotel_name'];
                            } else {
                                $grid['hotels_display'] = 'Tous les hôtels';
                            }
                        } catch (Exception $e) {
                            $grid['hotels_display'] = $grid['hotel_name'] ?: 'Tous les hôtels';
                        }
                    }
                } catch (Exception $e) { $grids = []; }
                json_out(['success' => true, 'grids' => $grids]);
            }
            
            // Détail d'une grille - GET /audit/grids/{id}
            if ($method === 'GET' && $id === 'grids' && $action && is_numeric($action)) {
                require_auth();
                $grid = db()->queryOne(
                    "SELECT ag.*, h.name as hotel_name FROM audit_grids ag LEFT JOIN hotels h ON ag.hotel_id = h.id WHERE ag.id = ?",
                    [$action]
                );
                if (!$grid) json_error('Grille non trouvée', 404);
                
                // Récupérer les hôtels liés
                $hotelIds = [];
                try {
                    $gridHotels = db()->query("SELECT hotel_id FROM audit_grid_hotels WHERE grid_id = ?", [$action]);
                    $hotelIds = array_map(function($h) { return (int)$h['hotel_id']; }, $gridHotels);
                } catch (Exception $e) {
                    // Table n'existe pas encore, utiliser l'ancien hotel_id
                    if ($grid['hotel_id']) {
                        $hotelIds = [(int)$grid['hotel_id']];
                    }
                }
                $grid['hotel_ids'] = $hotelIds;
                
                $questions = db()->query(
                    "SELECT * FROM audit_questions WHERE grid_id = ? AND is_active = 1 ORDER BY sort_order, id",
                    [$action]
                );
                
                $permissions = db()->query("SELECT * FROM audit_grid_permissions WHERE grid_id = ?", [$action]);
                $grid['permissions'] = $permissions;
                json_out(['success' => true, 'grid' => $grid, 'questions' => $questions]);
            }
            
            // Créer une grille - POST /audit/grids
            if ($method === 'POST' && $id === 'grids' && !$action) {
                $user = require_auth();
                if (!in_array($user['role'], ['admin', 'groupe_manager'])) json_error('Accès refusé', 403);
                $data = get_input();
                if (empty($data['name'])) json_error('Nom requis');
                
                // hotel_id sera NULL si tous les hôtels, sinon on stocke le premier pour compatibilité
                $hotelIds = $data['hotel_ids'] ?? [];
                $firstHotelId = !empty($hotelIds) ? $hotelIds[0] : null;
                
                $gridId = db()->insert(
                    "INSERT INTO audit_grids (name, description, hotel_id, is_mandatory, frequency, day_of_month, reminder_days, is_active, created_by, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW())",
                    [$data['name'], $data['description'] ?? null, $firstHotelId, 
                     $data['is_mandatory'] ?? 0, $data['frequency'] ?? 'monthly',
                     $data['day_of_month'] ?? 15, $data['reminder_days'] ?? 7, $user['id']]
                );
                
                // Créer la table audit_grid_hotels si elle n'existe pas
                try {
                    db()->execute("CREATE TABLE IF NOT EXISTS audit_grid_hotels (
                        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                        grid_id INT UNSIGNED NOT NULL,
                        hotel_id INT UNSIGNED NOT NULL,
                        created_at DATETIME,
                        UNIQUE KEY unique_grid_hotel (grid_id, hotel_id),
                        INDEX idx_grid (grid_id),
                        INDEX idx_hotel (hotel_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8");
                } catch (Exception $e) {}
                
                // Ajouter les hôtels liés
                if (!empty($hotelIds)) {
                    foreach ($hotelIds as $hotelId) {
                        db()->insert(
                            "INSERT INTO audit_grid_hotels (grid_id, hotel_id, created_at) VALUES (?, ?, NOW())",
                            [$gridId, $hotelId]
                        );
                    }
                }
                
                // Ajouter les questions
                if (!empty($data['questions'])) {
                    foreach ($data['questions'] as $idx => $q) {
                        if (empty($q['question'])) continue;
                        db()->insert(
                            "INSERT INTO audit_questions (grid_id, section, question, question_type, options, rating_min, rating_max, weight, comment_required, comment_optional, photo_required, photo_optional, sort_order, is_active, created_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())",
                            [$gridId, $q['section'] ?? null, $q['question'], $q['question_type'] ?? 'rating',
                             $q['options'] ?? null, $q['rating_min'] ?? 1, $q['rating_max'] ?? 10, $q['weight'] ?? 1,
                             $q['comment_required'] ?? 0, $q['comment_optional'] ?? 1,
                             $q['photo_required'] ?? 0, $q['photo_optional'] ?? 1, $idx]
                        );
                    }
                }
                
                // Permissions par défaut
                db()->insert("INSERT INTO audit_grid_permissions (grid_id, permission_type, target_type, target_id, created_at) VALUES (?, 'execute', 'role', 'admin', NOW())", [$gridId]);
                db()->insert("INSERT INTO audit_grid_permissions (grid_id, permission_type, target_type, target_id, created_at) VALUES (?, 'execute', 'role', 'groupe_manager', NOW())", [$gridId]);
                db()->insert("INSERT INTO audit_grid_permissions (grid_id, permission_type, target_type, target_id, created_at) VALUES (?, 'view', 'role', 'admin', NOW())", [$gridId]);
                db()->insert("INSERT INTO audit_grid_permissions (grid_id, permission_type, target_type, target_id, created_at) VALUES (?, 'view', 'role', 'groupe_manager', NOW())", [$gridId]);
                
                if (!empty($data['permissions'])) {
                    foreach ($data['permissions'] as $perm) {
                        if (in_array($perm['target_id'], ['admin', 'groupe_manager'])) continue;
                        db()->insert(
                            "INSERT INTO audit_grid_permissions (grid_id, permission_type, target_type, target_id, created_at) VALUES (?, ?, ?, ?, NOW())",
                            [$gridId, $perm['permission_type'], $perm['target_type'], $perm['target_id']]
                        );
                    }
                }
                json_out(['success' => true, 'id' => $gridId], 201);
            }
            
            // Modifier une grille - PUT /audit/grids/{id}
            if ($method === 'PUT' && $id === 'grids' && $action && is_numeric($action)) {
                $user = require_auth();
                if (!in_array($user['role'], ['admin', 'groupe_manager'])) json_error('Accès refusé', 403);
                $data = get_input();
                
                // hotel_id sera NULL si tous les hôtels, sinon on stocke le premier pour compatibilité
                $hotelIds = $data['hotel_ids'] ?? [];
                $firstHotelId = !empty($hotelIds) ? $hotelIds[0] : null;
                
                db()->execute(
                    "UPDATE audit_grids SET name = ?, description = ?, hotel_id = ?, is_mandatory = ?, frequency = ?, day_of_month = ?, reminder_days = ?, updated_at = NOW() WHERE id = ?",
                    [$data['name'], $data['description'] ?? null, $firstHotelId,
                     $data['is_mandatory'] ?? 0, $data['frequency'] ?? 'monthly',
                     $data['day_of_month'] ?? 15, $data['reminder_days'] ?? 7, $action]
                );
                
                // Créer la table audit_grid_hotels si elle n'existe pas
                try {
                    db()->execute("CREATE TABLE IF NOT EXISTS audit_grid_hotels (
                        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                        grid_id INT UNSIGNED NOT NULL,
                        hotel_id INT UNSIGNED NOT NULL,
                        created_at DATETIME,
                        UNIQUE KEY unique_grid_hotel (grid_id, hotel_id),
                        INDEX idx_grid (grid_id),
                        INDEX idx_hotel (hotel_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8");
                } catch (Exception $e) {}
                
                // Mettre à jour les hôtels liés
                db()->execute("DELETE FROM audit_grid_hotels WHERE grid_id = ?", [$action]);
                if (!empty($hotelIds)) {
                    foreach ($hotelIds as $hotelId) {
                        db()->insert(
                            "INSERT INTO audit_grid_hotels (grid_id, hotel_id, created_at) VALUES (?, ?, NOW())",
                            [$action, $hotelId]
                        );
                    }
                }
                
                // Mettre à jour les questions
                if (isset($data['questions'])) {
                    db()->execute("UPDATE audit_questions SET is_active = 0 WHERE grid_id = ?", [$action]);
                    foreach ($data['questions'] as $idx => $q) {
                        if (empty($q['question'])) continue;
                        if (!empty($q['id'])) {
                            db()->execute(
                                "UPDATE audit_questions SET section = ?, question = ?, question_type = ?, options = ?, rating_min = ?, rating_max = ?, weight = ?, comment_required = ?, comment_optional = ?, photo_required = ?, photo_optional = ?, sort_order = ?, is_active = 1 WHERE id = ?",
                                [$q['section'] ?? null, $q['question'], $q['question_type'] ?? 'rating',
                                 $q['options'] ?? null, $q['rating_min'] ?? 1, $q['rating_max'] ?? 10, $q['weight'] ?? 1,
                                 $q['comment_required'] ?? 0, $q['comment_optional'] ?? 1,
                                 $q['photo_required'] ?? 0, $q['photo_optional'] ?? 1, $idx, $q['id']]
                            );
                        } else {
                            db()->insert(
                                "INSERT INTO audit_questions (grid_id, section, question, question_type, options, rating_min, rating_max, weight, comment_required, comment_optional, photo_required, photo_optional, sort_order, is_active, created_at)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())",
                                [$action, $q['section'] ?? null, $q['question'], $q['question_type'] ?? 'rating',
                                 $q['options'] ?? null, $q['rating_min'] ?? 1, $q['rating_max'] ?? 10, $q['weight'] ?? 1,
                                 $q['comment_required'] ?? 0, $q['comment_optional'] ?? 1,
                                 $q['photo_required'] ?? 0, $q['photo_optional'] ?? 1, $idx]
                            );
                        }
                    }
                }
                json_out(['success' => true]);
            }
            
            // Supprimer une grille - DELETE /audit/grids/{id}
            if ($method === 'DELETE' && $id === 'grids' && $action && is_numeric($action)) {
                $user = require_auth();
                if (!in_array($user['role'], ['admin', 'groupe_manager'])) json_error('Accès refusé', 403);
                db()->execute("UPDATE audit_grids SET is_active = 0 WHERE id = ?", [$action]);
                json_out(['success' => true]);
            }
            
            // Dupliquer une grille - POST /audit/grids/{id}/duplicate
            if ($method === 'POST' && $id === 'grids' && $action && is_numeric($action) && $subaction === 'duplicate') {
                $user = require_auth();
                if (!in_array($user['role'], ['admin', 'groupe_manager'])) json_error('Accès refusé', 403);
                
                $grid = db()->queryOne("SELECT * FROM audit_grids WHERE id = ?", [$action]);
                if (!$grid) json_error('Grille non trouvée', 404);
                
                $newId = db()->insert(
                    "INSERT INTO audit_grids (name, description, hotel_id, is_mandatory, frequency, day_of_month, reminder_days, is_active, created_by, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW())",
                    [$grid['name'] . ' (copie)', $grid['description'], $grid['hotel_id'],
                     $grid['is_mandatory'], $grid['frequency'], $grid['day_of_month'], $grid['reminder_days'], $user['id']]
                );
                
                $questions = db()->query("SELECT * FROM audit_questions WHERE grid_id = ? AND is_active = 1", [$action]);
                foreach ($questions as $q) {
                    db()->insert(
                        "INSERT INTO audit_questions (grid_id, section, question, question_type, options, rating_min, rating_max, weight, comment_required, comment_optional, photo_required, photo_optional, sort_order, is_active, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())",
                        [$newId, $q['section'], $q['question'], $q['question_type'], $q['options'],
                         $q['rating_min'], $q['rating_max'], $q['weight'], $q['comment_required'],
                         $q['comment_optional'], $q['photo_required'], $q['photo_optional'], $q['sort_order']]
                    );
                }
                json_out(['success' => true, 'id' => $newId]);
            }
            
            // Liste des audits - GET /audit/audits
            if ($method === 'GET' && $id === 'audits' && !$action) {
                $user = require_auth();
                $hotelId = $_GET['hotel_id'] ?? null;

                $where = "1=1";
                $params = [];

                if ($hotelId) {
                    $where .= " AND a.hotel_id = ?";
                    $params[] = $hotelId;
                }

                try {
                    $query = "SELECT a.*, ag.name as grid_name, h.name as hotel_name,
                         CONCAT(u.first_name, ' ', u.last_name) as performer_name
                         FROM audits a
                         JOIN audit_grids ag ON a.grid_id = ag.id
                         JOIN hotels h ON a.hotel_id = h.id
                         JOIN users u ON a.performed_by = u.id
                         WHERE $where
                         ORDER BY a.created_at DESC";
                    $countQuery = "SELECT COUNT(*) FROM audits a JOIN audit_grids ag ON a.grid_id = ag.id JOIN hotels h ON a.hotel_id = h.id JOIN users u ON a.performed_by = u.id WHERE $where";
                    $result = paginate($query, $params, $countQuery, $params);
                } catch (Exception $e) { $result = ['data' => [], 'pagination' => ['page' => 1, 'per_page' => 25, 'total' => 0, 'total_pages' => 0, 'has_next' => false, 'has_prev' => false]]; }
                json_out(['success' => true, 'audits' => $result['data'], 'pagination' => $result['pagination']]);
            }
            
            // Détail d'un audit - GET /audit/audits/{id}
            if ($method === 'GET' && $id === 'audits' && $action && is_numeric($action)) {
                require_auth();
                $audit = db()->queryOne(
                    "SELECT a.*, ag.name as grid_name, h.name as hotel_name,
                     CONCAT(u.first_name, ' ', u.last_name) as performer_name
                     FROM audits a
                     JOIN audit_grids ag ON a.grid_id = ag.id
                     JOIN hotels h ON a.hotel_id = h.id
                     JOIN users u ON a.performed_by = u.id
                     WHERE a.id = ?",
                    [$action]
                );
                if (!$audit) json_error('Audit non trouvé', 404);
                
                $questions = db()->query(
                    "SELECT * FROM audit_questions WHERE grid_id = ? AND is_active = 1 ORDER BY sort_order, id",
                    [$audit['grid_id']]
                );
                $answers = db()->query("SELECT * FROM audit_answers WHERE audit_id = ?", [$action]);
                json_out(['success' => true, 'audit' => $audit, 'questions' => $questions, 'answers' => $answers]);
            }
            
            // Créer un audit - POST /audit/audits
            if ($method === 'POST' && $id === 'audits' && !$action) {
                $user = require_auth();
                $data = get_input();
                if (empty($data['grid_id']) || empty($data['hotel_id'])) json_error('grid_id et hotel_id requis');
                
                $auditId = db()->insert(
                    "INSERT INTO audits (grid_id, hotel_id, status, performed_by, started_at, created_at)
                     VALUES (?, ?, 'in_progress', ?, NOW(), NOW())",
                    [$data['grid_id'], $data['hotel_id'], $user['id']]
                );
                
                if (!empty($data['schedule_id'])) {
                    db()->execute("UPDATE audit_schedules SET audit_id = ?, status = 'completed' WHERE id = ?", [$auditId, $data['schedule_id']]);
                }
                
                $audit = db()->queryOne("SELECT * FROM audits WHERE id = ?", [$auditId]);
                json_out(['success' => true, 'audit' => $audit], 201);
            }
            
            // Audits en attente - GET /audit/pending
            if ($method === 'GET' && $id === 'pending') {
                $user = require_auth();
                $hotelId = $_GET['hotel_id'] ?? null;
                
                // Mettre à jour les status overdue
                db()->execute("UPDATE audit_schedules SET status = 'overdue' WHERE status = 'pending' AND deadline_date < CURDATE()");
                
                $where = "s.status IN ('pending', 'overdue') AND s.audit_id IS NULL";
                $params = [];
                
                if ($hotelId) {
                    $where .= " AND s.hotel_id = ?";
                    $params[] = $hotelId;
                }
                
                try {
                    $pending = db()->query(
                        "SELECT s.*, ag.name as grid_name, h.name as hotel_name,
                         CASE WHEN s.deadline_date < CURDATE() THEN 1 ELSE 0 END as is_overdue
                         FROM audit_schedules s
                         JOIN audit_grids ag ON s.grid_id = ag.id
                         JOIN hotels h ON s.hotel_id = h.id
                         WHERE $where
                         ORDER BY s.deadline_date ASC",
                        $params
                    );
                } catch (Exception $e) { $pending = []; }
                json_out(['success' => true, 'pending' => $pending]);
            }
            
            // Sauvegarder les réponses - POST /audit/answers
            if ($method === 'POST' && $id === 'answers') {
                $user = require_auth();
                
                $auditId = $_POST['audit_id'] ?? null;
                $status = $_POST['status'] ?? 'in_progress';
                $notes = $_POST['notes'] ?? '';
                $answersJson = $_POST['answers'] ?? '[]';
                
                if (!$auditId) json_error('audit_id requis');
                
                $answers = json_decode($answersJson, true) ?: [];
                
                $uploadDir = __DIR__ . '/../uploads/audit/';
                if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
                
                $scoreTotal = 0;
                $scoreMax = 0;
                
                foreach ($answers as $ans) {
                    $questionId = $ans['question_id'];
                    $question = db()->queryOne("SELECT * FROM audit_questions WHERE id = ?", [$questionId]);
                    if (!$question) continue;
                    
                    // Upload photo
                    $photoUrl = null;
                    $photoKey = "photo_$questionId";
                    if (!empty($_FILES[$photoKey]) && $_FILES[$photoKey]['error'] === UPLOAD_ERR_OK) {
                        $uploadError = validateUpload($_FILES[$photoKey], 'image');
                        if (!$uploadError) {
                            $ext = strtolower(pathinfo($_FILES[$photoKey]['name'], PATHINFO_EXTENSION));
                            $filename = 'audit_' . $auditId . '_' . $questionId . '_' . time() . '.' . $ext;
                            move_uploaded_file($_FILES[$photoKey]['tmp_name'], $uploadDir . $filename);
                            $photoUrl = 'uploads/audit/' . $filename;
                        }
                    }
                    
                    // Calculer score
                    $score = 0;
                    if ($question['question_type'] === 'rating' && is_numeric($ans['answer_value'])) {
                        $score = (float)$ans['answer_value'] * (float)$question['weight'];
                        $scoreMax += (float)$question['rating_max'] * (float)$question['weight'];
                    } elseif ($question['question_type'] === 'yes_no') {
                        $score = ($ans['answer_value'] === 'yes') ? 10 * (float)$question['weight'] : 0;
                        $scoreMax += 10 * (float)$question['weight'];
                    }
                    $scoreTotal += $score;
                    
                    // Insérer ou maj réponse
                    $existing = db()->queryOne("SELECT id, photo_url FROM audit_answers WHERE audit_id = ? AND question_id = ?", [$auditId, $questionId]);
                    
                    if ($existing) {
                        db()->execute(
                            "UPDATE audit_answers SET answer_value = ?, answer_text = ?, photo_url = COALESCE(?, photo_url), score = ?, updated_at = NOW() WHERE id = ?",
                            [$ans['answer_value'], $ans['answer_text'] ?? null, $photoUrl, $score, $existing['id']]
                        );
                    } else {
                        db()->insert(
                            "INSERT INTO audit_answers (audit_id, question_id, answer_value, answer_text, photo_url, score, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
                            [$auditId, $questionId, $ans['answer_value'], $ans['answer_text'] ?? null, $photoUrl, $score]
                        );
                    }
                }
                
                $scorePercentage = $scoreMax > 0 ? ($scoreTotal / $scoreMax) * 100 : 0;
                
                $updateSql = "UPDATE audits SET status = ?, score_total = ?, score_max = ?, score_percentage = ?, notes = ?, updated_at = NOW()";
                $updateParams = [$status, $scoreTotal, $scoreMax, $scorePercentage, $notes];
                
                if ($status === 'completed') {
                    $updateSql .= ", completed_at = NOW()";
                }
                $updateSql .= " WHERE id = ?";
                $updateParams[] = $auditId;
                
                db()->execute($updateSql, $updateParams);
                
                json_out(['success' => true, 'score_percentage' => $scorePercentage]);
            }
            
            break;
        
        // =============================================
        // CLOSURES - Clôtures & Remises
        // =============================================
        case 'closures':
            
            // Configuration clôture par hôtel - GET /closures/config/{hotel_id}
            if ($method === 'GET' && $id === 'config' && $action && is_numeric($action)) {
                $user = require_auth();
                $hotelId = intval($action);
                
                $config = db()->query(
                    "SELECT * FROM closure_config WHERE hotel_id = ? AND is_active = 1 ORDER BY sort_order",
                    [$hotelId]
                );
                
                // Charger les champs pour chaque config
                foreach ($config as &$c) {
                    $c['fields'] = db()->query(
                        "SELECT id, field_name, field_type, field_options, is_required, sort_order 
                         FROM closure_config_fields WHERE config_id = ? ORDER BY sort_order",
                        [$c['id']]
                    );
                }
                
                json_out(['success' => true, 'config' => $config]);
            }
            
            // Sauvegarder configuration clôture - POST /closures/config/{hotel_id}
            if ($method === 'POST' && $id === 'config' && $action && is_numeric($action)) {
                $user = require_auth();
                if (!in_array($user['role'], ['admin', 'groupe_manager'])) json_error('Accès refusé', 403);
                
                $hotelId = intval($action);
                $data = get_input();
                $config = $data['config'] ?? [];
                
                // Supprimer l'ancienne config
                $oldConfig = db()->query("SELECT id FROM closure_config WHERE hotel_id = ?", [$hotelId]);
                foreach ($oldConfig as $old) {
                    db()->execute("DELETE FROM closure_config_fields WHERE config_id = ?", [$old['id']]);
                }
                db()->execute("DELETE FROM closure_config WHERE hotel_id = ?", [$hotelId]);
                
                // Créer la nouvelle config
                foreach ($config as $idx => $doc) {
                    if (empty($doc['document_name'])) continue;
                    
                    $configId = db()->insert(
                        "INSERT INTO closure_config (hotel_id, closure_type, document_name, is_required, sort_order, is_active, created_at) 
                         VALUES (?, ?, ?, ?, ?, 1, NOW())",
                        [$hotelId, $doc['closure_type'] ?? 'daily', $doc['document_name'], 
                         $doc['is_required'] ? 1 : 0, $idx]
                    );
                    
                    // Ajouter les champs
                    if (!empty($doc['fields'])) {
                        foreach ($doc['fields'] as $fIdx => $field) {
                            if (empty($field['field_name'])) continue;
                            
                            db()->insert(
                                "INSERT INTO closure_config_fields (config_id, field_name, field_type, field_options, is_required, sort_order, created_at) 
                                 VALUES (?, ?, ?, ?, ?, ?, NOW())",
                                [$configId, $field['field_name'], $field['field_type'] ?? 'text',
                                 $field['field_options'] ?? null, $field['is_required'] ? 1 : 0, $fIdx]
                            );
                        }
                    }
                }
                
                json_out(['success' => true]);
            }
            
            // Liste des clôtures mensuelles - GET /closures/monthly
            if ($method === 'GET' && $id === 'monthly' && !$action) {
                $user = require_auth();
                $hotelId = $_GET['hotel_id'] ?? $user['hotel_id'];
                
                try {
                    // Récupérer les clôtures groupées par mois
                    $closures = db()->query(
                        "SELECT 
                            YEAR(closure_date) as year,
                            MONTH(closure_date) as month,
                            COUNT(*) as closures_count,
                            SUM(COALESCE(cash_received, 0)) as total_received,
                            SUM(COALESCE(cash_spent, 0) + COALESCE(remise_banque, 0)) as total_spent,
                            SUM(COALESCE(cash_received, 0)) - SUM(COALESCE(cash_spent, 0) + COALESCE(remise_banque, 0)) as balance,
                            DAY(LAST_DAY(closure_date)) as days_in_month
                         FROM daily_closures
                         WHERE hotel_id = ? AND status IN ('submitted', 'validated')
                         GROUP BY YEAR(closure_date), MONTH(closure_date)
                         ORDER BY year DESC, month DESC
                         LIMIT 12",
                        [$hotelId]
                    );
                    
                    $months = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                               'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
                    
                    foreach ($closures as &$c) {
                        $c['month_name'] = $months[intval($c['month'])];
                        $c['is_complete'] = intval($c['closures_count']) >= intval($c['days_in_month']) * 0.8; // 80% des jours
                    }
                    
                    json_out(['success' => true, 'closures' => $closures]);
                } catch (Exception $e) {
                    json_out(['success' => true, 'closures' => []]);
                }
            }
            
            // Liste des clôtures journalières - GET /closures/daily
            if ($method === 'GET' && $id === 'daily' && !$action) {
                $user = require_auth();
                $hotelId = $_GET['hotel_id'] ?? $user['hotel_id'];
                
                $closures = db()->query(
                    "SELECT dc.*, 
                        CONCAT(u.first_name, ' ', u.last_name) as submitted_by_name,
                        (SELECT COUNT(*) FROM closure_documents cd WHERE cd.closure_id = dc.id) as documents_count,
                        (SELECT COUNT(*) FROM closure_config cc WHERE cc.hotel_id = dc.hotel_id AND cc.is_active = 1 AND cc.is_required = 1) as required_docs
                     FROM daily_closures dc
                     LEFT JOIN users u ON dc.submitted_by = u.id
                     WHERE dc.hotel_id = ?
                     ORDER BY dc.closure_date DESC
                     LIMIT 30",
                    [$hotelId]
                );
                
                // Vérifier si clôture en attente
                $yesterday = date('Y-m-d', strtotime('-1 day'));
                $pendingClosure = db()->queryOne(
                    "SELECT id FROM daily_closures WHERE hotel_id = ? AND closure_date = ? AND status IN ('submitted', 'validated')",
                    [$hotelId, $yesterday]
                );
                
                $config = db()->query(
                    "SELECT * FROM closure_config WHERE hotel_id = ? AND is_active = 1 ORDER BY sort_order",
                    [$hotelId]
                );
                
                json_out([
                    'success' => true, 
                    'closures' => $closures,
                    'pending_date' => $pendingClosure ? null : $yesterday,
                    'config' => $config
                ]);
            }
            
            // Détail clôture journalière - GET /closures/daily/{hotel_id}/{date}
            if ($method === 'GET' && $id === 'daily' && $action && is_numeric($action) && $subId) {
                $user = require_auth();
                $hotelId = intval($action);
                $dateStr = $subId;
                
                $closure = db()->queryOne(
                    "SELECT * FROM daily_closures WHERE hotel_id = ? AND closure_date = ?",
                    [$hotelId, $dateStr]
                );
                
                $config = db()->query(
                    "SELECT * FROM closure_config WHERE hotel_id = ? AND is_active = 1 ORDER BY sort_order",
                    [$hotelId]
                );
                
                // Charger les champs pour chaque config
                foreach ($config as &$c) {
                    $c['fields'] = db()->query(
                        "SELECT id, field_name, field_type, field_options, is_required 
                         FROM closure_config_fields WHERE config_id = ? ORDER BY sort_order",
                        [$c['id']]
                    );
                }
                
                $documents = [];
                $fieldValues = [];
                
                if ($closure) {
                    $documents = db()->query(
                        "SELECT * FROM closure_documents WHERE closure_id = ?",
                        [$closure['id']]
                    );
                    $fieldValues = db()->query(
                        "SELECT * FROM closure_field_values WHERE closure_id = ?",
                        [$closure['id']]
                    );
                }
                
                json_out([
                    'success' => true,
                    'closure' => $closure ?: [],
                    'config' => $config,
                    'documents' => $documents,
                    'field_values' => $fieldValues
                ]);
            }
            
            // Créer/Mettre à jour clôture journalière - POST /closures/daily
            if ($method === 'POST' && $id === 'daily' && !$action) {
                $user = require_auth();
                
                $hotelId = $_POST['hotel_id'] ?? null;
                $closureDate = $_POST['closure_date'] ?? null;
                $cashReceived = floatval($_POST['cash_received'] ?? 0);
                $cashSpent = floatval($_POST['cash_spent'] ?? 0);
                $notes = trim($_POST['notes'] ?? '');
                $status = $_POST['status'] ?? 'draft';
                
                if (!$hotelId || !$closureDate) json_error('Hôtel et date requis');
                
                // Validation si soumission et dépenses > 0
                if ($status === 'submitted' && $cashSpent > 0) {
                    if (empty($notes)) {
                        json_error('Un commentaire est obligatoire pour justifier les dépenses');
                    }
                }
                
                $cashBalance = $cashReceived - $cashSpent;
                
                // Vérifier si existe déjà
                $existing = db()->queryOne(
                    "SELECT id, expense_receipt FROM daily_closures WHERE hotel_id = ? AND closure_date = ?",
                    [$hotelId, $closureDate]
                );
                
                // Traiter le justificatif des dépenses
                $expenseReceipt = $existing['expense_receipt'] ?? null;
                $uploadDir = __DIR__ . '/../uploads/closures/';
                if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
                
                if (isset($_FILES['expense_receipt']) && $_FILES['expense_receipt']['error'] === UPLOAD_ERR_OK) {
                    $uploadError = validateUpload($_FILES['expense_receipt'], 'any');
                    if (!$uploadError) {
                        $ext = strtolower(pathinfo($_FILES['expense_receipt']['name'], PATHINFO_EXTENSION));
                        $fileName = 'expense_' . $hotelId . '_' . $closureDate . '_' . time() . '.' . $ext;
                        $filePath = $uploadDir . $fileName;

                        if (move_uploaded_file($_FILES['expense_receipt']['tmp_name'], $filePath)) {
                            $expenseReceipt = 'uploads/closures/' . $fileName;
                        }
                    }
                }
                
                // Validation justificatif si dépenses > 0 et soumission
                if ($status === 'submitted' && $cashSpent > 0 && empty($expenseReceipt)) {
                    json_error('Un justificatif est obligatoire pour les dépenses');
                }
                
                if ($existing) {
                    db()->execute(
                        "UPDATE daily_closures SET 
                            cash_received = ?, 
                            cash_spent = ?, 
                            cash_balance = ?, 
                            expense_receipt = ?,
                            notes = ?, 
                            status = ?, 
                            submitted_by = ?, 
                            submitted_at = IF(? = 'submitted', NOW(), submitted_at), 
                            updated_at = NOW() 
                        WHERE id = ?",
                        [$cashReceived, $cashSpent, $cashBalance, $expenseReceipt, $notes, $status, $user['id'], $status, $existing['id']]
                    );
                    $closureId = $existing['id'];
                } else {
                    $closureId = db()->insert(
                        "INSERT INTO daily_closures (
                            hotel_id, closure_date, cash_received, cash_spent, cash_balance, 
                            expense_receipt, notes, status, submitted_by, submitted_at, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, IF(? = 'submitted', NOW(), NULL), NOW())",
                        [$hotelId, $closureDate, $cashReceived, $cashSpent, $cashBalance, 
                         $expenseReceipt, $notes, $status, $user['id'], $status]
                    );
                }
                
                // Traiter les documents configurés
                foreach ($_FILES as $key => $file) {
                    if (strpos($key, 'doc_') === 0 && $file['error'] === UPLOAD_ERR_OK) {
                        $configId = intval(str_replace('doc_', '', $key));

                        $uploadError = validateUpload($file, 'any');
                        if ($uploadError) continue;

                        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
                        if (!in_array($ext, ['pdf', 'jpg', 'jpeg', 'png'])) continue;

                        $fileName = 'closure_' . $closureId . '_doc' . $configId . '_' . time() . '.' . $ext;
                        $filePath = $uploadDir . $fileName;

                        if (move_uploaded_file($file['tmp_name'], $filePath)) {
                            $fileUrl = 'uploads/closures/' . $fileName;

                            db()->execute(
                                "DELETE FROM closure_documents WHERE closure_id = ? AND config_id = ?",
                                [$closureId, $configId]
                            );

                            db()->insert(
                                "INSERT INTO closure_documents (closure_id, config_id, file_url, uploaded_at) VALUES (?, ?, ?, NOW())",
                                [$closureId, $configId, $fileUrl]
                            );
                        }
                    }
                }

                json_out(['success' => true, 'id' => $closureId]);
            }
            
            // Mettre à jour clôture existante - POST /closures/daily/{id}
            if ($method === 'POST' && $id === 'daily' && $action && is_numeric($action)) {
                $user = require_auth();
                $closureId = intval($action);
                
                // Récupérer la clôture existante
                $closure = db()->queryOne("SELECT * FROM daily_closures WHERE id = ?", [$closureId]);
                if (!$closure) json_error('Clôture non trouvée', 404);
                
                $_POST['hotel_id'] = $closure['hotel_id'];
                $_POST['closure_date'] = $closure['closure_date'];
                
                // Réutiliser la logique de création
                $cashReceived = floatval($_POST['cash_received'] ?? 0);
                $cashSpent = floatval($_POST['cash_spent'] ?? 0);
                $notes = $_POST['notes'] ?? '';
                $status = $_POST['status'] ?? 'draft';
                $cashBalance = $cashReceived - $cashSpent;
                
                db()->execute(
                    "UPDATE daily_closures SET cash_received = ?, cash_spent = ?, cash_balance = ?, notes = ?, status = ?, 
                     submitted_by = ?, submitted_at = IF(? = 'submitted' AND submitted_at IS NULL, NOW(), submitted_at), updated_at = NOW() WHERE id = ?",
                    [$cashReceived, $cashSpent, $cashBalance, $notes, $status, $user['id'], $status, $closureId]
                );
                
                // Traiter fichiers et champs (même logique)
                $uploadDir = __DIR__ . '/../uploads/closures/';
                if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
                
                foreach ($_FILES as $key => $file) {
                    if (strpos($key, 'doc_') === 0 && $file['error'] === UPLOAD_ERR_OK) {
                        $configId = intval(str_replace('doc_', '', $key));
                        $uploadError = validateUpload($file, 'any');
                        if ($uploadError) continue;

                        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
                        if (!in_array($ext, ['pdf', 'jpg', 'jpeg', 'png'])) continue;

                        $fileName = 'closure_' . $closureId . '_doc' . $configId . '_' . time() . '.' . $ext;
                        $filePath = $uploadDir . $fileName;

                        if (move_uploaded_file($file['tmp_name'], $filePath)) {
                            db()->execute("DELETE FROM closure_documents WHERE closure_id = ? AND config_id = ?", [$closureId, $configId]);
                            db()->insert(
                                "INSERT INTO closure_documents (closure_id, config_id, file_url, uploaded_at) VALUES (?, ?, ?, NOW())",
                                [$closureId, $configId, 'uploads/closures/' . $fileName]
                            );
                        }
                    }
                }
                
                foreach ($_POST as $key => $value) {
                    if (strpos($key, 'field_') === 0) {
                        $fieldId = intval(str_replace('field_', '', $key));
                        db()->execute("DELETE FROM closure_field_values WHERE closure_id = ? AND field_id = ?", [$closureId, $fieldId]);
                        if ($value !== '') {
                            db()->insert("INSERT INTO closure_field_values (closure_id, field_id, field_value) VALUES (?, ?, ?)", [$closureId, $fieldId, $value]);
                        }
                    }
                }
                
                json_out(['success' => true]);
            }
            
            // Valider clôture - PUT /closures/daily/{id}/validate
            if ($method === 'PUT' && $id === 'daily' && $action && is_numeric($action) && $subId === 'validate') {
                $user = require_auth();
                if (!in_array($user['role'], ['admin', 'groupe_manager'])) json_error('Accès refusé', 403);
                
                db()->execute(
                    "UPDATE daily_closures SET status = 'validated', validated_by = ?, validated_at = NOW() WHERE id = ?",
                    [$user['id'], $action]
                );
                
                json_out(['success' => true]);
            }
            
            // Créer une remise banque - POST /closures/bank-deposits
            if ($method === 'POST' && $id === 'bank-deposits') {
                $user = require_auth();
                $data = get_input();
                
                $hotelId = $data['hotel_id'] ?? null;
                $depositDate = $data['deposit_date'] ?? null;
                $amount = floatval($data['amount'] ?? 0);
                $reference = trim($data['reference'] ?? '');
                $notes = trim($data['notes'] ?? '');
                
                if (!$hotelId || !$depositDate || $amount <= 0) {
                    json_error('Hôtel, date et montant requis');
                }
                
                // Vérifier si une clôture existe pour cette date, sinon la créer
                $closure = db()->queryOne(
                    "SELECT id, remise_banque FROM daily_closures WHERE hotel_id = ? AND closure_date = ?",
                    [$hotelId, $depositDate]
                );
                
                if ($closure) {
                    // Ajouter au montant existant
                    $newRemise = floatval($closure['remise_banque']) + $amount;
                    db()->execute(
                        "UPDATE daily_closures SET remise_banque = ?, updated_at = NOW() WHERE id = ?",
                        [$newRemise, $closure['id']]
                    );
                } else {
                    // Créer une nouvelle clôture avec seulement la remise
                    db()->insert(
                        "INSERT INTO daily_closures (hotel_id, closure_date, cash_received, remise_banque, status, created_by, created_at) 
                         VALUES (?, ?, 0, ?, 'draft', ?, NOW())",
                        [$hotelId, $depositDate, $amount, $user['id']]
                    );
                }
                
                // Optionnel: enregistrer dans une table de log des remises
                try {
                    db()->insert(
                        "INSERT INTO bank_deposits (hotel_id, deposit_date, amount, reference, notes, created_by, created_at) 
                         VALUES (?, ?, ?, ?, ?, ?, NOW())",
                        [$hotelId, $depositDate, $amount, $reference, $notes, $user['id']]
                    );
                } catch (Exception $e) {
                    // Table n'existe pas, ignorer
                }
                
                json_out(['success' => true]);
            }
            
            // Suivi caisse - GET /closures/cash-tracking
            if ($method === 'GET' && $id === 'cash-tracking') {
                $user = require_auth();
                $hotelId = $_GET['hotel_id'] ?? $user['hotel_id'];
                
                try {
                    $tracking = db()->query(
                        "SELECT closure_date as tracking_date, cash_received, 
                                COALESCE(remise_banque, 0) + COALESCE(achats, 0) + COALESCE(autres_depenses, 0) as cash_spent,
                                cash_received - (COALESCE(remise_banque, 0) + COALESCE(achats, 0) + COALESCE(autres_depenses, 0)) as closing_balance
                         FROM daily_closures 
                         WHERE hotel_id = ? AND status IN ('submitted', 'validated')
                         ORDER BY closure_date DESC LIMIT 30",
                        [$hotelId]
                    );
                    
                    $currentBalance = db()->queryOne(
                        "SELECT SUM(cash_received) - SUM(COALESCE(remise_banque, 0) + COALESCE(achats, 0) + COALESCE(autres_depenses, 0)) as balance
                         FROM daily_closures WHERE hotel_id = ? AND status IN ('submitted', 'validated')",
                        [$hotelId]
                    );
                    
                    json_out([
                        'success' => true,
                        'tracking' => $tracking,
                        'current_balance' => $currentBalance ? floatval($currentBalance['balance']) : 0
                    ]);
                } catch (Exception $e) {
                    json_out([
                        'success' => true,
                        'tracking' => [],
                        'current_balance' => 0
                    ]);
                }
            }
            
            // Suivi caisse détaillé par mois - GET /closures/cash-tracking-detailed
            if ($method === 'GET' && $id === 'cash-tracking-detailed') {
                $user = require_auth();
                $hotelId = $_GET['hotel_id'] ?? $user['hotel_id'];
                $month = intval($_GET['month'] ?? date('n'));
                $year = intval($_GET['year'] ?? date('Y'));
                
                try {
                    $startDate = sprintf('%04d-%02d-01', $year, $month);
                    $endDate = date('Y-m-t', strtotime($startDate));
                    
                    // Récupérer les clôtures du mois avec remise_banque
                    $closures = db()->query(
                        "SELECT dc.closure_date as date, 
                                COALESCE(dc.cash_received, 0) as encaisse,
                                COALESCE(dc.remise_banque, 0) as remise_banque,
                                COALESCE(dc.cash_spent, 0) as depenses,
                                dc.notes as commentaire,
                                dc.status,
                                1 as has_closure
                         FROM daily_closures dc
                         WHERE dc.hotel_id = ? 
                           AND dc.closure_date >= ? 
                           AND dc.closure_date <= ?
                           AND dc.status IN ('submitted', 'validated')
                         ORDER BY dc.closure_date ASC",
                        [$hotelId, $startDate, $endDate]
                    );
                    
                    // Calculer solde mois précédent (encaisse - remise_banque - depenses)
                    $prevEndDate = date('Y-m-t', strtotime(sprintf('%04d-%02d-01', $month == 1 ? $year - 1 : $year, $month == 1 ? 12 : $month - 1)));
                    $prevBalance = db()->queryOne(
                        "SELECT SUM(COALESCE(cash_received, 0)) - SUM(COALESCE(remise_banque, 0)) - SUM(COALESCE(cash_spent, 0)) as balance
                         FROM daily_closures WHERE hotel_id = ? AND closure_date <= ? AND status IN ('submitted', 'validated')",
                        [$hotelId, $prevEndDate]
                    );
                    
                    // Calculer totaux du mois
                    $totals = db()->queryOne(
                        "SELECT 
                            SUM(COALESCE(cash_received, 0)) as total_encaisse,
                            SUM(COALESCE(remise_banque, 0)) as total_remise_banque,
                            SUM(COALESCE(cash_spent, 0)) as total_depenses
                         FROM daily_closures 
                         WHERE hotel_id = ? AND closure_date >= ? AND closure_date <= ? AND status IN ('submitted', 'validated')",
                        [$hotelId, $startDate, $endDate]
                    );
                    
                    $previousBalance = $prevBalance ? floatval($prevBalance['balance']) : 0;
                    $totalEncaisse = floatval($totals['total_encaisse'] ?? 0);
                    $totalRemise = floatval($totals['total_remise_banque'] ?? 0);
                    $totalDepenses = floatval($totals['total_depenses'] ?? 0);
                    $soldeFinMois = $previousBalance + $totalEncaisse - $totalRemise - $totalDepenses;
                    
                    json_out([
                        'success' => true,
                        'data' => $closures,
                        'previous_balance' => $previousBalance,
                        'summary' => [
                            'total_encaisse' => $totalEncaisse,
                            'total_remise_banque' => $totalRemise,
                            'total_depenses' => $totalDepenses,
                            'solde_fin_mois' => $soldeFinMois
                        ]
                    ]);
                } catch (Exception $e) {
                    json_out([
                        'success' => true,
                        'data' => [],
                        'previous_balance' => 0,
                        'summary' => [
                            'total_encaisse' => 0,
                            'total_remise_banque' => 0,
                            'total_depenses' => 0,
                            'solde_fin_mois' => 0
                        ]
                    ]);
                }
            }
            
            // Export CSV suivi caisse - GET /closures/cash-tracking-export
            if ($method === 'GET' && $id === 'cash-tracking-export') {
                $user = require_auth();
                $hotelId = $_GET['hotel_id'] ?? $user['hotel_id'];
                $month = intval($_GET['month'] ?? date('n'));
                $year = intval($_GET['year'] ?? date('Y'));
                
                $hotel = db()->queryOne("SELECT name FROM hotels WHERE id = ?", [$hotelId]);
                $hotelName = $hotel ? $hotel['name'] : 'Hotel';
                
                $startDate = sprintf('%04d-%02d-01', $year, $month);
                $endDate = date('Y-m-t', strtotime($startDate));
                
                $closures = db()->query(
                    "SELECT dc.closure_date, dc.cash_received, dc.remise_banque, dc.cash_spent, dc.notes
                     FROM daily_closures dc
                     WHERE dc.hotel_id = ? AND dc.closure_date >= ? AND dc.closure_date <= ? AND dc.status IN ('submitted', 'validated')
                     ORDER BY dc.closure_date ASC",
                    [$hotelId, $startDate, $endDate]
                );
                
                $prevMonth = $month - 1;
                $prevYear = $year;
                if ($prevMonth < 1) { $prevMonth = 12; $prevYear--; }
                $prevEndDate = date('Y-m-t', strtotime(sprintf('%04d-%02d-01', $prevYear, $prevMonth)));
                $prevBalance = db()->queryOne(
                    "SELECT SUM(cash_received) - SUM(COALESCE(remise_banque, 0)) - SUM(COALESCE(cash_spent, 0)) as balance
                     FROM daily_closures WHERE hotel_id = ? AND closure_date <= ? AND status IN ('submitted', 'validated')",
                    [$hotelId, $prevEndDate]
                );
                $previousBalance = floatval($prevBalance['balance'] ?? 0);
                
                // Générer CSV
                $months = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
                
                header('Content-Type: text/csv; charset=utf-8');
                header('Content-Disposition: attachment; filename="Suivi_Caisse_' . $months[$month] . '_' . $year . '.csv"');
                
                $output = fopen('php://output', 'w');
                fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF)); // BOM UTF-8
                
                // En-tête style Excel
                fputcsv($output, [$hotelName . ' - Suivi Caisse - ' . $months[$month] . ' ' . $year], ';');
                fputcsv($output, [], ';');
                fputcsv($output, ['Date', 'Encaissés', 'Remise Banque', 'Dépenses', 'Total Décaissés', 'Reste', 'Commentaire'], ';');
                
                // Ligne solde précédent
                fputcsv($output, ['Reste Mois -1', number_format($previousBalance, 2, ',', ' '), '', '', '', number_format($previousBalance, 2, ',', ' '), 'Report mois précédent'], ';');
                
                $totalEnc = 0; $totalRem = 0; $totalDep = 0;
                
                foreach ($closures as $c) {
                    $enc = floatval($c['cash_received'] ?? 0);
                    $rem = floatval($c['remise_banque'] ?? 0);
                    $dep = floatval($c['cash_spent'] ?? 0);
                    $totalDec = $rem + $dep;
                    $reste = $enc - $totalDec;
                    
                    $totalEnc += $enc;
                    $totalRem += $rem;
                    $totalDep += $dep;
                    
                    $date = date('d/m/Y', strtotime($c['closure_date']));
                    fputcsv($output, [
                        $date,
                        $enc > 0 ? number_format($enc, 2, ',', ' ') : '',
                        $rem > 0 ? number_format($rem, 2, ',', ' ') : '',
                        $dep > 0 ? number_format($dep, 2, ',', ' ') : '',
                        $totalDec > 0 ? number_format($totalDec, 2, ',', ' ') : '',
                        number_format($reste, 2, ',', ' '),
                        $c['notes'] ?? ''
                    ], ';');
                }
                
                // Ligne totaux
                fputcsv($output, [], ';');
                $totalDecTotal = $totalRem + $totalDep;
                $soldeFinMois = $previousBalance + $totalEnc - $totalDecTotal;
                fputcsv($output, [
                    'TOTAUX',
                    number_format($totalEnc, 2, ',', ' '),
                    number_format($totalRem, 2, ',', ' '),
                    number_format($totalDep, 2, ',', ' '),
                    number_format($totalDecTotal, 2, ',', ' '),
                    number_format($soldeFinMois, 2, ',', ' '),
                    ''
                ], ';');
                
                fclose($output);
                exit;
            }
            
            // Mise à jour inline suivi caisse - POST /closures/cash-tracking-update
            if ($method === 'POST' && $id === 'cash-tracking-update') {
                $user = require_auth();
                
                // Vérifier les permissions
                $allowedRoles = ['admin', 'groupe_manager', 'comptabilite', 'hotel_manager'];
                if (!in_array($user['role'], $allowedRoles)) {
                    json_error('Permission refusée');
                }
                
                $data = json_decode(file_get_contents('php://input'), true);
                $hotelId = $data['hotel_id'] ?? null;
                $date = $data['date'] ?? null;
                $field = $data['field'] ?? null;
                $value = $data['value'] ?? '';
                
                if (!$hotelId || !$date || !$field) {
                    json_error('Paramètres manquants');
                }
                
                try {
                    // Vérifier que l'utilisateur a accès à cet hôtel
                    if ($user['role'] !== 'admin' && $user['role'] !== 'comptabilite') {
                        $hasAccess = db()->queryOne(
                            "SELECT 1 FROM user_hotels WHERE user_id = ? AND hotel_id = ?",
                            [$user['id'], $hotelId]
                        );
                        if (!$hasAccess) json_error('Accès non autorisé à cet hôtel');
                    }
                    
                    // hotel_manager ne peut modifier que commentaire et remise_banque
                    if ($user['role'] === 'hotel_manager' && !in_array($field, ['commentaire', 'remise_banque'])) {
                        json_error('Vous ne pouvez modifier que les commentaires et remises banque');
                    }
                    
                    // Mapper le champ
                    switch($field) {
                        case 'encaisse': $dbField = 'cash_received'; break;
                        case 'remise_banque': $dbField = 'remise_banque'; break;
                        case 'achats': $dbField = 'achats'; break;
                        case 'autres': $dbField = 'autres_depenses'; break;
                        case 'commentaire': $dbField = 'notes'; break;
                        default: $dbField = null;
                    }
                    
                    if (!$dbField) json_error('Champ invalide');
                    
                    // Vérifier si une clôture existe pour cette date
                    $existing = db()->queryOne(
                        "SELECT id, notes FROM daily_closures WHERE hotel_id = ? AND closure_date = ?",
                        [$hotelId, $date]
                    );
                    
                    if ($existing) {
                        // Mettre à jour
                        db()->execute(
                            "UPDATE daily_closures SET $dbField = ?, updated_at = NOW() WHERE id = ?",
                            [$value, $existing['id']]
                        );
                        
                        // Logger la modification (ignorer si table n'existe pas)
                        try {
                            db()->insert(
                                "INSERT INTO cash_tracking_history (closure_id, user_id, field_changed, old_value, new_value, created_at) 
                                 VALUES (?, ?, ?, ?, ?, NOW())",
                                [$existing['id'], $user['id'], $field, $existing[$dbField] ?? '', $value]
                            );
                        } catch (Exception $e) {}
                    } else {
                        // Créer une nouvelle entrée
                        $closureId = db()->insert(
                            "INSERT INTO daily_closures (hotel_id, closure_date, $dbField, status, created_at) 
                             VALUES (?, ?, ?, 'submitted', NOW())",
                            [$hotelId, $date, $value]
                        );
                        
                        try {
                            db()->insert(
                                "INSERT INTO cash_tracking_history (closure_id, user_id, field_changed, old_value, new_value, created_at) 
                                 VALUES (?, ?, ?, '', ?, NOW())",
                                [$closureId, $user['id'], $field, $value]
                            );
                        } catch (Exception $e) {}
                    }
                    
                    json_out(['success' => true]);
                } catch (Exception $e) {
                    json_error('Erreur: ' . $e->getMessage());
                }
            }
            
            // Ajout remise banque avec justificatif - POST /closures/remise-banque
            if ($method === 'POST' && $id === 'remise-banque') {
                $user = require_auth();
                
                // Vérifier les permissions
                $allowedRoles = ['admin', 'groupe_manager', 'comptabilite', 'hotel_manager'];
                if (!in_array($user['role'], $allowedRoles)) {
                    json_error('Permission refusée');
                }
                
                $hotelId = $_POST['hotel_id'] ?? null;
                $date = $_POST['date'] ?? null;
                $montant = floatval($_POST['montant'] ?? 0);
                $commentaire = $_POST['commentaire'] ?? '';
                
                if (!$hotelId || !$date || $montant <= 0) {
                    json_error('Paramètres invalides');
                }
                
                try {
                    // Vérifier accès hôtel
                    if ($user['role'] !== 'admin' && $user['role'] !== 'comptabilite') {
                        $hasAccess = db()->queryOne(
                            "SELECT 1 FROM user_hotels WHERE user_id = ? AND hotel_id = ?",
                            [$user['id'], $hotelId]
                        );
                        if (!$hasAccess) json_error('Accès non autorisé à cet hôtel');
                    }
                    
                    // Traiter le justificatif
                    $justificatifUrl = null;
                    if (isset($_FILES['justificatif']) && $_FILES['justificatif']['error'] === UPLOAD_ERR_OK) {
                        $uploadDir = __DIR__ . '/../uploads/closures/remises/';
                        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

                        $uploadError = validateUpload($_FILES['justificatif'], 'any');
                        if ($uploadError) json_error($uploadError);

                        $ext = strtolower(pathinfo($_FILES['justificatif']['name'], PATHINFO_EXTENSION));
                        if (!in_array($ext, ['pdf', 'jpg', 'jpeg', 'png'])) {
                            json_error('Format de fichier non accepté');
                        }
                        
                        $fileName = 'remise_' . $hotelId . '_' . $date . '_' . time() . '.' . $ext;
                        $filePath = $uploadDir . $fileName;
                        
                        if (move_uploaded_file($_FILES['justificatif']['tmp_name'], $filePath)) {
                            $justificatifUrl = 'uploads/closures/remises/' . $fileName;
                        }
                    } else {
                        json_error('Justificatif obligatoire');
                    }
                    
                    // Vérifier si une clôture existe pour cette date
                    $existing = db()->queryOne(
                        "SELECT id, remise_banque, notes FROM daily_closures WHERE hotel_id = ? AND closure_date = ?",
                        [$hotelId, $date]
                    );
                    
                    $newComment = $commentaire ? "Remise banque: $commentaire" : "Remise banque";
                    
                    if ($existing) {
                        $newRemise = floatval($existing['remise_banque'] ?? 0) + $montant;
                        $newNotes = $existing['notes'] ? $existing['notes'] . ' | ' . $newComment : $newComment;
                        
                        db()->execute(
                            "UPDATE daily_closures SET remise_banque = ?, remise_justificatif = ?, notes = ?, updated_at = NOW() WHERE id = ?",
                            [$newRemise, $justificatifUrl, $newNotes, $existing['id']]
                        );
                        $closureId = $existing['id'];
                    } else {
                        $closureId = db()->insert(
                            "INSERT INTO daily_closures (hotel_id, closure_date, remise_banque, remise_justificatif, notes, status, created_at) 
                             VALUES (?, ?, ?, ?, ?, 'submitted', NOW())",
                            [$hotelId, $date, $montant, $justificatifUrl, $newComment]
                        );
                    }
                    
                    // Logger (ignorer si table n'existe pas)
                    try {
                        db()->insert(
                            "INSERT INTO cash_tracking_history (closure_id, user_id, field_changed, old_value, new_value, created_at) 
                             VALUES (?, ?, 'remise_banque', '0', ?, NOW())",
                            [$closureId, $user['id'], $montant]
                        );
                    } catch (Exception $e) {}
                    
                    json_out(['success' => true, 'closure_id' => $closureId]);
                } catch (Exception $e) {
                    json_error('Erreur: ' . $e->getMessage());
                }
            }
            
            // Détail d'une ligne - GET /closures/cash-tracking-row
            if ($method === 'GET' && $id === 'cash-tracking-row') {
                $user = require_auth();
                $hotelId = $_GET['hotel_id'] ?? null;
                $date = $_GET['date'] ?? null;
                
                if (!$hotelId || !$date) json_error('Paramètres manquants');
                
                try {
                    $row = db()->queryOne(
                        "SELECT dc.*, dc.cash_received as encaisse, 
                                COALESCE(dc.remise_banque, 0) as remise_banque,
                                COALESCE(dc.achats, 0) as achats,
                                COALESCE(dc.autres_depenses, 0) as autres,
                                dc.notes as commentaire, 
                                dc.remise_justificatif 
                         FROM daily_closures dc 
                         WHERE dc.hotel_id = ? AND dc.closure_date = ?",
                        [$hotelId, $date]
                    );
                    
                    // Historique des modifications
                    $history = [];
                    if ($row) {
                        try {
                            $history = db()->query(
                                "SELECT cth.*, CONCAT(u.first_name, ' ', u.last_name) as user_name,
                                        CONCAT('Modification: ', cth.field_changed, ' (', COALESCE(cth.old_value, '-'), ' → ', cth.new_value, ')') as action
                                 FROM cash_tracking_history cth
                                 JOIN users u ON cth.user_id = u.id
                                 WHERE cth.closure_id = ?
                                 ORDER BY cth.created_at DESC
                                 LIMIT 20",
                                [$row['id']]
                            );
                        } catch (Exception $e) { $history = []; }
                    }
                    
                    json_out([
                        'success' => true,
                        'row' => $row ?: ['date' => $date, 'encaisse' => 0, 'remise_banque' => 0, 'achats' => 0, 'autres' => 0, 'commentaire' => ''],
                        'history' => $history
                    ]);
                } catch (Exception $e) {
                    json_out([
                        'success' => true,
                        'row' => ['date' => $date, 'encaisse' => 0, 'remise_banque' => 0, 'achats' => 0, 'autres' => 0, 'commentaire' => ''],
                        'history' => []
                    ]);
                }
            }
            
            break;
        
        // =============================================
        // RGPD - Protection des données personnelles
        // =============================================
        case 'rgpd':
            
            // Mes données - GET /rgpd/my-data
            if ($method === 'GET' && $id === 'my-data') {
                $user = require_auth();
                
                // Données utilisateur
                $userData = db()->queryOne(
                    "SELECT u.*, h.name as hotel_name 
                     FROM users u 
                     LEFT JOIN user_hotels uh ON u.id = uh.user_id
                     LEFT JOIN hotels h ON uh.hotel_id = h.id 
                     WHERE u.id = ?",
                    [$user['id']]
                );
                unset($userData['password']); // Ne jamais exposer le mot de passe
                
                // Consentements
                $consents = db()->query(
                    "SELECT * FROM user_consents WHERE user_id = ? ORDER BY consent_type",
                    [$user['id']]
                );
                
                // Demandes RGPD
                $requests = db()->query(
                    "SELECT * FROM gdpr_requests WHERE user_id = ? ORDER BY requested_at DESC",
                    [$user['id']]
                );
                
                // Logs d'accès (50 derniers)
                $accessLogs = db()->query(
                    "SELECT * FROM access_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
                    [$user['id']]
                );
                
                json_out([
                    'success' => true,
                    'user' => $userData,
                    'consents' => $consents,
                    'requests' => $requests,
                    'access_logs' => $accessLogs
                ]);
            }
            
            // Mes consentements - GET /rgpd/my-consents
            if ($method === 'GET' && $id === 'my-consents') {
                $user = require_auth();
                $consents = db()->query(
                    "SELECT * FROM user_consents WHERE user_id = ?",
                    [$user['id']]
                );
                json_out(['success' => true, 'consents' => $consents]);
            }
            
            // Sauvegarder consentements - POST /rgpd/consents
            if ($method === 'POST' && $id === 'consents') {
                $user = require_auth();
                $data = get_input();
                $ip = $_SERVER['REMOTE_ADDR'] ?? '';
                $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
                
                foreach (['cookies', 'marketing'] as $type) {
                    if (isset($data[$type])) {
                        $existing = db()->queryOne(
                            "SELECT id FROM user_consents WHERE user_id = ? AND consent_type = ?",
                            [$user['id'], $type]
                        );
                        
                        if ($existing) {
                            if ($data[$type]) {
                                db()->execute(
                                    "UPDATE user_consents SET consented = 1, consented_at = NOW(), ip_address = ?, user_agent = ?, revoked_at = NULL WHERE id = ?",
                                    [$ip, $ua, $existing['id']]
                                );
                            } else {
                                db()->execute(
                                    "UPDATE user_consents SET consented = 0, revoked_at = NOW() WHERE id = ?",
                                    [$existing['id']]
                                );
                            }
                        } else {
                            db()->insert(
                                "INSERT INTO user_consents (user_id, consent_type, consented, ip_address, user_agent, consented_at) VALUES (?, ?, ?, ?, ?, NOW())",
                                [$user['id'], $type, $data[$type] ? 1 : 0, $ip, $ua]
                            );
                        }
                    }
                }
                
                // Logger l'action
                rgpdLog($user['id'], 'update', 'consents', null, 'Mise à jour des consentements');
                
                json_out(['success' => true]);
            }
            
            // Consentement initial - POST /rgpd/initial-consent
            if ($method === 'POST' && $id === 'initial-consent') {
                $user = require_auth();
                $data = get_input();
                $ip = $_SERVER['REMOTE_ADDR'] ?? '';
                $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
                
                // Enregistrer tous les consentements
                foreach (['privacy_policy', 'data_processing', 'cookies', 'marketing'] as $type) {
                    $consented = isset($data[$type]) && $data[$type];
                    
                    $existing = db()->queryOne(
                        "SELECT id FROM user_consents WHERE user_id = ? AND consent_type = ?",
                        [$user['id'], $type]
                    );
                    
                    if ($existing) {
                        db()->execute(
                            "UPDATE user_consents SET consented = ?, consented_at = IF(? = 1, NOW(), consented_at), ip_address = ?, user_agent = ? WHERE id = ?",
                            [$consented ? 1 : 0, $consented ? 1 : 0, $ip, $ua, $existing['id']]
                        );
                    } else {
                        db()->insert(
                            "INSERT INTO user_consents (user_id, consent_type, consented, ip_address, user_agent, consented_at) VALUES (?, ?, ?, ?, ?, IF(? = 1, NOW(), NULL))",
                            [$user['id'], $type, $consented ? 1 : 0, $ip, $ua, $consented ? 1 : 0]
                        );
                    }
                }
                
                // Mettre à jour le flag utilisateur
                db()->execute(
                    "UPDATE users SET gdpr_consent = 1, gdpr_consent_date = NOW() WHERE id = ?",
                    [$user['id']]
                );
                
                rgpdLog($user['id'], 'create', 'consents', null, 'Consentement initial accepté');
                
                json_out(['success' => true]);
            }
            
            // Export données - GET /rgpd/export
            if ($method === 'GET' && $id === 'export') {
                $user = require_auth();
                $format = $_GET['format'] ?? 'json';
                
                // Collecter toutes les données
                $userData = db()->queryOne(
                    "SELECT id, email, first_name, last_name, phone, role, created_at, last_login FROM users WHERE id = ?",
                    [$user['id']]
                );
                
                $consents = db()->query("SELECT * FROM user_consents WHERE user_id = ?", [$user['id']]);
                $accessLogs = db()->query("SELECT * FROM access_logs WHERE user_id = ? ORDER BY created_at DESC", [$user['id']]);
                $requests = db()->query("SELECT * FROM gdpr_requests WHERE user_id = ?", [$user['id']]);
                
                // Logger l'export
                rgpdLog($user['id'], 'export', 'user_data', $user['id'], "Export $format des données personnelles");
                
                json_out([
                    'success' => true,
                    'data' => [
                        'user' => $userData,
                        'consents' => $consents,
                        'access_logs' => $accessLogs,
                        'gdpr_requests' => $requests,
                        'export_date' => date('Y-m-d H:i:s'),
                        'export_format' => $format
                    ]
                ]);
            }
            
            // Créer demande RGPD - POST /rgpd/request
            if ($method === 'POST' && $id === 'request') {
                $user = require_auth();
                $data = get_input();
                
                $type = $data['type'] ?? '';
                $reason = $data['reason'] ?? '';
                
                if (!in_array($type, ['access', 'rectification', 'erasure', 'portability', 'restriction', 'objection'])) {
                    json_error('Type de demande invalide');
                }
                
                // Vérifier s'il n'y a pas déjà une demande en cours
                $pending = db()->queryOne(
                    "SELECT id FROM gdpr_requests WHERE user_id = ? AND request_type = ? AND status IN ('pending', 'processing')",
                    [$user['id'], $type]
                );
                
                if ($pending) {
                    json_error('Vous avez déjà une demande de ce type en cours');
                }
                
                $requestId = db()->insert(
                    "INSERT INTO gdpr_requests (user_id, request_type, reason, requested_at) VALUES (?, ?, ?, NOW())",
                    [$user['id'], $type, $reason]
                );
                
                rgpdLog($user['id'], 'create', 'gdpr_request', $requestId, "Demande RGPD: $type");
                
                // Notifier les admins
                $admins = db()->query("SELECT id FROM users WHERE role = 'admin' AND status = 'active'");
                foreach ($admins as $admin) {
                    db()->insert(
                        "INSERT INTO notifications (user_id, type, title, message, created_at) VALUES (?, 'warning', 'Nouvelle demande RGPD', ?, NOW())",
                        [$admin['id'], "Demande de type '$type' de {$user['first_name']} {$user['last_name']}"]
                    );
                }
                
                json_out(['success' => true, 'request_id' => $requestId]);
            }
            
            // === ADMIN RGPD ===
            
            // Liste demandes admin - GET /rgpd/admin/requests
            if ($method === 'GET' && $id === 'admin' && $action === 'requests' && !$subaction) {
                $user = require_auth();
                if ($user['role'] !== 'admin') json_error('Accès refusé', 403);
                
                $requests = db()->query(
                    "SELECT r.*, CONCAT(u.first_name, ' ', u.last_name) as user_name, u.email as user_email 
                     FROM gdpr_requests r 
                     JOIN users u ON r.user_id = u.id 
                     ORDER BY FIELD(r.status, 'pending', 'processing', 'completed', 'rejected'), r.requested_at DESC"
                );
                
                $stats = [
                    'pending' => db()->queryOne("SELECT COUNT(*) as c FROM gdpr_requests WHERE status = 'pending'")['c'],
                    'processing' => db()->queryOne("SELECT COUNT(*) as c FROM gdpr_requests WHERE status = 'processing'")['c'],
                    'completed' => db()->queryOne("SELECT COUNT(*) as c FROM gdpr_requests WHERE status = 'completed' AND processed_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)")['c']
                ];
                
                json_out(['success' => true, 'requests' => $requests, 'stats' => $stats]);
            }
            
            // Détail demande - GET /rgpd/admin/requests/{id}
            if ($method === 'GET' && $id === 'admin' && $action === 'requests' && $subaction && is_numeric($subaction)) {
                $user = require_auth();
                if ($user['role'] !== 'admin') json_error('Accès refusé', 403);
                
                $request = db()->queryOne(
                    "SELECT r.*, CONCAT(u.first_name, ' ', u.last_name) as user_name, u.email as user_email 
                     FROM gdpr_requests r JOIN users u ON r.user_id = u.id WHERE r.id = ?",
                    [$subaction]
                );
                
                if (!$request) json_error('Demande non trouvée', 404);
                
                json_out(['success' => true, 'request' => $request]);
            }
            
            // Mettre à jour demande - PUT /rgpd/admin/requests/{id}
            if ($method === 'PUT' && $id === 'admin' && $action === 'requests' && $subaction && is_numeric($subaction)) {
                $user = require_auth();
                if ($user['role'] !== 'admin') json_error('Accès refusé', 403);
                
                $data = get_input();
                $status = $data['status'] ?? '';
                $notes = $data['admin_notes'] ?? '';
                
                if (!in_array($status, ['processing', 'completed', 'rejected'])) {
                    json_error('Statut invalide');
                }
                
                $processedAt = in_array($status, ['completed', 'rejected']) ? 'NOW()' : 'NULL';
                
                db()->execute(
                    "UPDATE gdpr_requests SET status = ?, admin_notes = ?, processed_by = ?, processed_at = $processedAt WHERE id = ?",
                    [$status, $notes, $user['id'], $subaction]
                );
                
                // Si demande d'effacement complétée, désactiver le compte
                if ($status === 'completed') {
                    $request = db()->queryOne("SELECT * FROM gdpr_requests WHERE id = ?", [$subaction]);
                    if ($request && $request['request_type'] === 'erasure') {
                        db()->execute("UPDATE users SET status = 'inactive', email = CONCAT('deleted_', id, '@deleted.local') WHERE id = ?", [$request['user_id']]);
                        rgpdLog($user['id'], 'delete', 'user', $request['user_id'], 'Compte désactivé suite demande RGPD');
                    }
                }
                
                rgpdLog($user['id'], 'update', 'gdpr_request', $subaction, "Statut changé: $status");
                
                json_out(['success' => true]);
            }
            
            // Purge anciennes données - POST /rgpd/admin/purge
            if ($method === 'POST' && $id === 'admin' && $action === 'purge') {
                $user = require_auth();
                if ($user['role'] !== 'admin') json_error('Accès refusé', 403);
                
                $retentionDays = db()->queryOne("SELECT setting_value FROM gdpr_settings WHERE setting_key = 'data_retention_days'");
                $days = $retentionDays ? intval($retentionDays['setting_value']) : 1095; // 3 ans par défaut
                
                // Supprimer les vieux logs
                $deleted = 0;
                $result = db()->execute("DELETE FROM access_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)", [$days]);
                $deleted += $result;
                
                rgpdLog($user['id'], 'delete', 'access_logs', null, "Purge des logs > $days jours: $deleted supprimés");
                
                json_out(['success' => true, 'deleted' => $deleted]);
            }
            
            break;
        
        // --- REVENUE MANAGEMENT ---
        case 'revenue':
            // Récupérer les tarifs depuis Xotelo - POST /revenue/fetch-rates
            if ($method === 'POST' && $id === 'fetch-rates') {
                // Activer l'affichage des erreurs pour debug
                error_reporting(E_ALL);
                ini_set('display_errors', 0);
                
                try {
                $user = require_auth();
                if (!in_array($user['role'], ['admin', 'groupe_manager', 'hotel_manager'])) {
                    json_error('Accès refusé', 403);
                }
                
                $data = get_input();
                $hotelId = isset($data['hotel_id']) ? $data['hotel_id'] : null;
                $dateFrom = isset($data['date_from']) ? $data['date_from'] : date('Y-m-d');
                $dateTo = isset($data['date_to']) ? $data['date_to'] : date('Y-m-d', strtotime('+30 days'));
                $guests = isset($data['guests']) ? $data['guests'] : 2;
                $currency = isset($data['currency']) ? $data['currency'] : 'EUR';
                
                if (!$hotelId) json_error('Hotel ID requis');
                
                // Vérifier accès à l'hôtel
                if (!in_array($user['role'], ['admin', 'groupe_manager'])) {
                    $assigned = db()->queryOne("SELECT 1 FROM user_hotels WHERE user_id = ? AND hotel_id = ?", [$user['id'], $hotelId]);
                    if (!$assigned) json_error('Accès non autorisé à cet hôtel', 403);
                }
                
                // Récupérer la config de l'hôtel
                $hotel = db()->queryOne("SELECT * FROM hotels WHERE id = ?", [$hotelId]);
                if (!$hotel) json_error('Hôtel non trouvé', 404);
                
                // Vérifier si la colonne xotelo_hotel_key existe
                $xoteloKey = isset($hotel['xotelo_hotel_key']) ? $hotel['xotelo_hotel_key'] : null;
                if (empty($xoteloKey)) {
                    json_error('Clé Xotelo non configurée. Allez dans Hôtels > Modifier pour ajouter la clé Xotelo.');
                }
                
                // Vérifier si cURL est disponible
                if (!function_exists('curl_init')) {
                    json_error('cURL non disponible sur ce serveur. Contactez votre hébergeur.');
                }
                
                // Récupérer les concurrents
                $competitors = [];
                try {
                    $competitors = db()->query("SELECT * FROM hotel_competitors WHERE hotel_id = ? AND is_active = 1", [$hotelId]);
                } catch (Exception $e) {
                    $competitors = [];
                }

                // Construire la liste des clés UNIQUES à requêter
                $uniqueKeys = []; // key => ['name' => ..., 'type' => ...]
                $uniqueKeys[$xoteloKey] = ['name' => $hotel['name'], 'type' => 'own'];
                foreach ($competitors as $comp) {
                    if (!empty($comp['xotelo_hotel_key']) && !isset($uniqueKeys[$comp['xotelo_hotel_key']])) {
                        $uniqueKeys[$comp['xotelo_hotel_key']] = ['name' => $comp['competitor_name'], 'type' => 'competitor'];
                    }
                }

                $ratesCount = 0;
                $errors = [];
                $apiCallsCount = 0;

                // Devise unique EUR
                $currency = 'EUR';

                // Générer les dates à requêter (max 31 jours pour afficher un mois complet)
                $startDate = new DateTime($dateFrom);
                $endDate = new DateTime($dateTo);
                $maxDays = 31;
                $dayCount = 0;
                $dates = [];

                $currentDate = clone $startDate;
                while ($currentDate <= $endDate && $dayCount < $maxDays) {
                    $dates[] = $currentDate->format('Y-m-d');
                    $currentDate->modify('+1 day');
                    $dayCount++;
                }

                // Supprimer l'ancien cache GLOBAL pour ces clés et cette période
                $allKeysList = array_keys($uniqueKeys);
                $keyPlaceholders = implode(',', array_fill(0, count($allKeysList), '?'));
                try {
                    db()->execute(
                        "DELETE FROM xotelo_rates_global WHERE xotelo_hotel_key IN ($keyPlaceholders) AND check_date BETWEEN ? AND ?",
                        array_merge($allKeysList, [$dateFrom, $dateTo])
                    );
                } catch (Exception $e) {}

                // Appeler l'API Xotelo pour chaque clé unique et chaque date
                foreach ($uniqueKeys as $hotelKey => $keyInfo) {
                    foreach ($dates as $checkDate) {
                        $checkOut = date('Y-m-d', strtotime($checkDate . ' +1 day'));

                        $xoteloUrl = "https://data.xotelo.com/api/rates?" . http_build_query([
                            'hotel_key' => $hotelKey,
                            'chk_in' => $checkDate,
                            'chk_out' => $checkOut,
                            'adults' => $guests,
                            'currency' => $currency
                        ]);

                        $ch = curl_init();
                        curl_setopt_array($ch, [
                            CURLOPT_URL => $xoteloUrl,
                            CURLOPT_RETURNTRANSFER => true,
                            CURLOPT_TIMEOUT => 30,
                            CURLOPT_SSL_VERIFYPEER => true,
                            CURLOPT_SSL_VERIFYHOST => 2,
                            CURLOPT_HTTPHEADER => ['Accept: application/json'],
                            CURLOPT_USERAGENT => 'ACL-Gestion/1.0'
                        ]);

                        $response = curl_exec($ch);
                        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                        $curlError = curl_error($ch);
                        curl_close($ch);
                        $apiCallsCount++;

                        // Logger la requête
                        try {
                            db()->insert(
                                "INSERT INTO xotelo_api_logs (hotel_id, request_type, hotel_keys_requested, date_from, date_to, response_status, error_message, created_at) VALUES (?, 'rates', ?, ?, ?, ?, ?, NOW())",
                                [$hotelId, $hotelKey, $checkDate, $checkOut, $httpCode, $curlError ?: null]
                            );
                        } catch (Exception $e) {}

                        if ($curlError) {
                            $errors[] = "Erreur cURL pour $hotelKey ($checkDate): $curlError";
                            continue;
                        }

                        if ($httpCode == 200 && $response) {
                            $xoteloData = json_decode($response, true);

                            if ($xoteloData === null) {
                                $errors[] = "JSON invalide pour $hotelKey ($checkDate)";
                                continue;
                            }

                            if (!empty($xoteloData['result']['rates'])) {
                                foreach ($xoteloData['result']['rates'] as $rate) {
                                    $otaName = isset($rate['name']) ? $rate['name'] : (isset($rate['code']) ? $rate['code'] : 'unknown');
                                    $rateAmount = isset($rate['rate']) ? $rate['rate'] : 0;
                                    $tax = isset($rate['tax']) ? $rate['tax'] : 0;
                                    $totalRate = $rateAmount + $tax;

                                    if ($totalRate <= 0) continue;

                                    try {
                                        // Cache global
                                        db()->insert(
                                            "INSERT INTO xotelo_rates_global (xotelo_hotel_key, hotel_name, check_date, guests, room_type, ota_name, rate_amount, currency, is_available, raw_data, fetched_at) VALUES (?, ?, ?, ?, 'Standard', ?, ?, ?, 1, ?, NOW())",
                                            [$hotelKey, $keyInfo['name'], $checkDate, $guests, $otaName, $totalRate, $currency, json_encode($rate)]
                                        );

                                        // Historique global
                                        try {
                                            db()->insert(
                                                "INSERT INTO xotelo_rates_history_global (xotelo_hotel_key, hotel_name, check_date, ota_name, rate_amount, currency, fetched_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
                                                [$hotelKey, $keyInfo['name'], $checkDate, $otaName, $totalRate, $currency]
                                            );
                                        } catch (Exception $e) {}

                                        $ratesCount++;
                                    } catch (Exception $e) {
                                        $errors[] = "Insert error ($checkDate, $otaName): " . $e->getMessage();
                                    }
                                }
                            } elseif (!empty($xoteloData['error'])) {
                                $errors[] = "Xotelo ($hotelKey): " . $xoteloData['error'];
                            }
                        } elseif ($httpCode !== 200) {
                            $errors[] = "HTTP $httpCode pour $hotelKey ($checkDate)";
                        }

                        // Petite pause entre les appels API
                        usleep(50000); // 0.05 seconde
                    } // fin foreach dates
                } // fin foreach uniqueKeys

                $result = ['success' => true, 'rates_count' => $ratesCount];
                if (!empty($errors)) {
                    $result['warnings'] = $errors;
                }
                $result['debug'] = [
                    'hotel_key' => $xoteloKey,
                    'date_from' => $dateFrom,
                    'date_to' => $dateTo,
                    'dates_count' => count($dates),
                    'currency' => $currency,
                    'unique_keys' => count($uniqueKeys),
                    'api_calls_made' => $apiCallsCount
                ];
                json_out($result);

                } catch (Exception $e) {
                    json_error('Erreur fetch-rates: ' . $e->getMessage());
                } catch (Error $e) {
                    json_error('Erreur PHP: ' . $e->getMessage() . ' à la ligne ' . $e->getLine());
                }
            }
            
            // Récupérer les tarifs en cache global - GET /revenue/rates/{hotelId}
            if ($method === 'GET' && $id === 'rates' && $action && is_numeric($action)) {
                $user = require_auth();
                $hotelId = (int)$action;

                // Vérifier accès
                if (!in_array($user['role'], ['admin', 'groupe_manager'])) {
                    $assigned = db()->queryOne("SELECT 1 FROM user_hotels WHERE user_id = ? AND hotel_id = ?", [$user['id'], $hotelId]);
                    if (!$assigned) json_error('Accès non autorisé', 403);
                }

                $dateFrom = isset($_GET['date_from']) ? $_GET['date_from'] : date('Y-m-d');
                $dateTo = isset($_GET['date_to']) ? $_GET['date_to'] : date('Y-m-d', strtotime('+30 days'));
                $currency = isset($_GET['currency']) ? $_GET['currency'] : 'EUR';

                try {
                    $rates = db()->query(
                        "SELECT g.id,
                                ? as hotel_id,
                                CASE WHEN g.xotelo_hotel_key = h.xotelo_hotel_key THEN 'own' ELSE 'competitor' END as source_type,
                                g.xotelo_hotel_key as source_hotel_key,
                                CASE WHEN g.xotelo_hotel_key = h.xotelo_hotel_key THEN h.name ELSE COALESCE(hc.competitor_name, g.hotel_name) END as source_name,
                                g.check_date, g.guests, g.room_type, g.ota_name,
                                g.rate_amount, g.currency, g.is_available, g.raw_data, g.fetched_at
                         FROM xotelo_rates_global g
                         INNER JOIN hotels h ON h.id = ?
                         LEFT JOIN hotel_competitors hc ON hc.xotelo_hotel_key = g.xotelo_hotel_key AND hc.hotel_id = h.id AND hc.is_active = 1
                         WHERE (g.xotelo_hotel_key = h.xotelo_hotel_key OR hc.id IS NOT NULL)
                         AND g.check_date BETWEEN ? AND ?
                         AND g.currency = ?
                         ORDER BY g.check_date, CASE WHEN g.xotelo_hotel_key = h.xotelo_hotel_key THEN 0 ELSE 1 END, g.rate_amount",
                        [$hotelId, $hotelId, $dateFrom, $dateTo, $currency]
                    );
                } catch (Exception $e) {
                    $rates = [];
                }

                json_out(['success' => true, 'rates' => $rates, 'currency' => $currency]);
            }
            
            // Récupérer l'historique des prix global - GET /revenue/history/{hotelId}
            if ($method === 'GET' && $id === 'history' && $action && is_numeric($action)) {
                $user = require_auth();
                $hotelId = (int)$action;

                // Vérifier accès
                if (!in_array($user['role'], ['admin', 'groupe_manager'])) {
                    $assigned = db()->queryOne("SELECT 1 FROM user_hotels WHERE user_id = ? AND hotel_id = ?", [$user['id'], $hotelId]);
                    if (!$assigned) json_error('Accès non autorisé', 403);
                }

                $checkDate = isset($_GET['check_date']) ? $_GET['check_date'] : date('Y-m-d', strtotime('+7 days'));
                $currency = isset($_GET['currency']) ? $_GET['currency'] : 'EUR';
                $sourceKey = isset($_GET['source_key']) ? $_GET['source_key'] : null;
                $ota = isset($_GET['ota']) ? $_GET['ota'] : null;

                $where = "(g.xotelo_hotel_key = h.xotelo_hotel_key OR hc.id IS NOT NULL) AND g.check_date = ? AND g.currency = ?";
                $params = [$hotelId, $checkDate, $currency];

                if ($sourceKey && $sourceKey !== 'all') {
                    if ($sourceKey === 'own') {
                        $where .= " AND g.xotelo_hotel_key = h.xotelo_hotel_key";
                    } else {
                        $where .= " AND g.xotelo_hotel_key = ?";
                        $params[] = $sourceKey;
                    }
                }

                if ($ota) {
                    $where .= " AND g.ota_name = ?";
                    $params[] = $ota;
                }

                try {
                    $history = db()->query(
                        "SELECT CASE WHEN g.xotelo_hotel_key = h.xotelo_hotel_key THEN 'own' ELSE 'competitor' END as source_type,
                                g.xotelo_hotel_key as source_hotel_key,
                                CASE WHEN g.xotelo_hotel_key = h.xotelo_hotel_key THEN h.name ELSE COALESCE(hc.competitor_name, g.hotel_name) END as source_name,
                                g.ota_name, g.rate_amount, g.currency, g.fetched_at
                         FROM xotelo_rates_history_global g
                         INNER JOIN hotels h ON h.id = ?
                         LEFT JOIN hotel_competitors hc ON hc.xotelo_hotel_key = g.xotelo_hotel_key AND hc.hotel_id = h.id AND hc.is_active = 1
                         WHERE $where
                         ORDER BY g.fetched_at ASC",
                        $params
                    );
                } catch (Exception $e) {
                    $history = [];
                }

                // Grouper par source + OTA pour le graphique
                $grouped = [];
                foreach ($history as $h) {
                    $key = $h['source_hotel_key'] . '_' . $h['ota_name'];
                    if (!isset($grouped[$key])) {
                        $grouped[$key] = [
                            'source_key' => $h['source_hotel_key'],
                            'source_name' => $h['source_name'],
                            'source_type' => $h['source_type'],
                            'ota_name' => $h['ota_name'],
                            'data' => []
                        ];
                    }
                    $grouped[$key]['data'][] = [
                        'date' => $h['fetched_at'],
                        'rate' => (float)$h['rate_amount']
                    ];
                }

                json_out([
                    'success' => true,
                    'check_date' => $checkDate,
                    'currency' => $currency,
                    'history' => array_values($grouped)
                ]);
            }
            
            break;

        // ==================== ALERTES TARIFAIRES ====================
        case 'price_alerts':
            $user = require_auth();
            $userHotelIds = getManageableHotels($user);

            if ($method === 'GET') {
                if ($action === 'logs') {
                    // GET /price_alerts/logs?hotel_id=X&limit=50
                    $hotelId = intval($_GET['hotel_id'] ?? 0);
                    if ($hotelId && !in_array($hotelId, $userHotelIds)) {
                        json_error('Accès refusé', 403);
                    }
                    $limit = min(intval($_GET['limit'] ?? 50), 200);
                    $where = "pal.user_id = ?";
                    $params = [$user['id']];
                    if ($hotelId) {
                        $where .= " AND pal.hotel_id = ?";
                        $params[] = $hotelId;
                    }
                    $logs = db()->query(
                        "SELECT pal.*, h.name as hotel_name
                         FROM price_alert_logs pal
                         LEFT JOIN hotels h ON h.id = pal.hotel_id
                         WHERE $where
                         ORDER BY pal.created_at DESC
                         LIMIT $limit",
                        $params
                    );
                    json_out($logs);
                } elseif ($id) {
                    // GET /price_alerts/{id}
                    $alert = db()->queryOne(
                        "SELECT pa.*, hc.competitor_name
                         FROM price_alerts pa
                         LEFT JOIN hotel_competitors hc ON hc.id = pa.competitor_id
                         WHERE pa.id = ? AND pa.user_id = ?",
                        [$id, $user['id']]
                    );
                    if (!$alert) json_error('Alerte non trouvée', 404);
                    json_out($alert);
                } else {
                    // GET /price_alerts?hotel_id=X
                    $hotelId = intval($_GET['hotel_id'] ?? 0);
                    $where = "pa.user_id = ?";
                    $params = [$user['id']];
                    if ($hotelId) {
                        if (!in_array($hotelId, $userHotelIds)) {
                            json_error('Accès refusé', 403);
                        }
                        $where .= " AND pa.hotel_id = ?";
                        $params[] = $hotelId;
                    }
                    $alerts = db()->query(
                        "SELECT pa.*, hc.competitor_name, h.name as hotel_name
                         FROM price_alerts pa
                         LEFT JOIN hotel_competitors hc ON hc.id = pa.competitor_id
                         LEFT JOIN hotels h ON h.id = pa.hotel_id
                         WHERE $where
                         ORDER BY pa.created_at DESC",
                        $params
                    );
                    json_out($alerts);
                }
            } elseif ($method === 'POST') {
                // POST /price_alerts - Créer une alerte
                $data = get_input();
                $hotelId = intval($data['hotel_id'] ?? 0);
                if (!$hotelId || !in_array($hotelId, $userHotelIds)) {
                    json_error('Hôtel invalide ou accès refusé', 403);
                }
                $alertType = in_array($data['alert_type'] ?? '', ['delta_amount', 'delta_percent']) ? $data['alert_type'] : 'delta_percent';
                $direction = in_array($data['direction'] ?? '', ['any', 'up', 'down']) ? $data['direction'] : 'any';
                $threshold = floatval($data['threshold_value'] ?? 0);
                if ($threshold <= 0) {
                    json_error('Le seuil doit être supérieur à 0', 400);
                }
                $competitorId = !empty($data['competitor_id']) ? intval($data['competitor_id']) : null;
                $otaName = !empty($data['ota_name']) ? trim($data['ota_name']) : null;
                $notifyApp = intval($data['notify_app'] ?? 1);
                $notifyEmail = intval($data['notify_email'] ?? 0);

                $insertId = db()->insert(
                    "INSERT INTO price_alerts (user_id, hotel_id, competitor_id, ota_name, alert_type, threshold_value, direction, notify_app, notify_email, is_active, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())",
                    [$user['id'], $hotelId, $competitorId, $otaName, $alertType, $threshold, $direction, $notifyApp, $notifyEmail]
                );
                json_out(['id' => $insertId, 'message' => 'Alerte créée'], 201);

            } elseif ($method === 'PUT') {
                if (!$id) json_error('ID requis', 400);
                $data = get_input();

                // Vérifier propriété
                $alert = db()->queryOne("SELECT * FROM price_alerts WHERE id = ? AND user_id = ?", [$id, $user['id']]);
                if (!$alert) json_error('Alerte non trouvée', 404);

                if ($action === 'toggle') {
                    // PUT /price_alerts/{id}/toggle
                    $newStatus = $alert['is_active'] ? 0 : 1;
                    db()->execute("UPDATE price_alerts SET is_active = ?, updated_at = NOW() WHERE id = ?", [$newStatus, $id]);
                    json_out(['is_active' => $newStatus, 'message' => $newStatus ? 'Alerte activée' : 'Alerte désactivée']);
                } else {
                    // PUT /price_alerts/{id} - Modifier
                    $alertType = in_array($data['alert_type'] ?? '', ['delta_amount', 'delta_percent']) ? $data['alert_type'] : $alert['alert_type'];
                    $direction = in_array($data['direction'] ?? '', ['any', 'up', 'down']) ? $data['direction'] : $alert['direction'];
                    $threshold = floatval($data['threshold_value'] ?? $alert['threshold_value']);
                    if ($threshold <= 0) json_error('Le seuil doit être supérieur à 0', 400);
                    $competitorId = array_key_exists('competitor_id', $data) ? (!empty($data['competitor_id']) ? intval($data['competitor_id']) : null) : $alert['competitor_id'];
                    $otaName = array_key_exists('ota_name', $data) ? (!empty($data['ota_name']) ? trim($data['ota_name']) : null) : $alert['ota_name'];
                    $notifyApp = intval($data['notify_app'] ?? $alert['notify_app']);
                    $notifyEmail = intval($data['notify_email'] ?? $alert['notify_email']);

                    db()->execute(
                        "UPDATE price_alerts SET competitor_id = ?, ota_name = ?, alert_type = ?, threshold_value = ?, direction = ?, notify_app = ?, notify_email = ?, updated_at = NOW() WHERE id = ?",
                        [$competitorId, $otaName, $alertType, $threshold, $direction, $notifyApp, $notifyEmail, $id]
                    );
                    json_out(['message' => 'Alerte mise à jour']);
                }

            } elseif ($method === 'DELETE') {
                if (!$id) json_error('ID requis', 400);
                $alert = db()->queryOne("SELECT * FROM price_alerts WHERE id = ? AND user_id = ?", [$id, $user['id']]);
                if (!$alert) json_error('Alerte non trouvée', 404);
                db()->execute("DELETE FROM price_alerts WHERE id = ?", [$id]);
                json_out(['message' => 'Alerte supprimée']);
            }
            break;


        // ==================== SELF CHECK-IN (PUBLIC) ====================
        case 'booking':
            // Endpoints PUBLICS - pas d'auth requise (page self check-in client)

            // Helper: date effective (jour précédent si entre minuit et l'heure limite)
            $getEffectiveDate = function($hotel) {
                $cutoff = (int)($hotel['night_cutoff_hour'] ?? 7);
                $now = new DateTime('now', new DateTimeZone('Europe/Paris'));
                $hour = (int)$now->format('H');
                if ($hour >= 0 && $hour < $cutoff) {
                    $now->modify('-1 day');
                }
                return $now->format('Y-m-d');
            };

            // GET /booking/{slug} - Infos hôtel publiques pour le self check-in
            if ($method === 'GET' && $id && !$action) {
                $hotel = db()->queryOne(
                    "SELECT id, name, address, city, stars, checkin_time, checkout_time, booking_slug,
                            stripe_public_key, logo_url, selfcheckin_enabled, walkin_enabled,
                            default_night_price, default_breakfast_price, default_tourist_tax,
                            breakfast_start, breakfast_end, night_cutoff_hour, phone, on_call_phone
                     FROM hotels WHERE booking_slug = ? AND selfcheckin_enabled = 1 AND status = 'active'",
                    [$id]
                );
                if (!$hotel) json_error('Hôtel non trouvé ou self check-in désactivé', 404);

                // Tarif du jour (date effective)
                $effectiveDate = $getEffectiveDate($hotel);
                $pricing = db()->queryOne(
                    "SELECT * FROM selfcheckin_pricing WHERE hotel_id = ? AND date = ?",
                    [$hotel['id'], $effectiveDate]
                );
                if (!$pricing) $pricing = [];

                // Horaires PDJ : priorité = tarif jour > planning semaine > défaut hôtel
                $dow = (int)(new DateTime($effectiveDate))->format('w');
                $weekSchedule = null;
                try {
                    $weekSchedule = db()->queryOne(
                        "SELECT * FROM hotel_breakfast_schedules WHERE hotel_id = ? AND day_of_week = ?",
                        [$hotel['id'], $dow]
                    );
                } catch (Exception $e) {}

                $bfStart = $pricing['breakfast_start'] ?? ($weekSchedule['breakfast_start'] ?? $hotel['breakfast_start']);
                $bfEnd = $pricing['breakfast_end'] ?? ($weekSchedule['breakfast_end'] ?? $hotel['breakfast_end']);

                json_out([
                    'hotel' => [
                        'id' => $hotel['id'],
                        'name' => $hotel['name'],
                        'address' => $hotel['address'],
                        'city' => $hotel['city'],
                        'stars' => $hotel['stars'],
                        'checkin_time' => $hotel['checkin_time'],
                        'checkout_time' => $hotel['checkout_time'],
                        'logo_url' => $hotel['logo_url'],
                        'stripe_public_key' => $hotel['stripe_public_key'],
                        'walkin_enabled' => (bool)$hotel['walkin_enabled'],
                        'breakfast_start' => $bfStart,
                        'breakfast_end' => $bfEnd,
                        'phone' => $hotel['phone'],
                        'on_call_phone' => $hotel['on_call_phone'],
                    ],
                    'pricing' => [
                        'date' => $effectiveDate,
                        'night_price' => (float)($pricing['night_price'] ?? $hotel['default_night_price']),
                        'breakfast_price' => (float)($pricing['breakfast_price'] ?? $hotel['default_breakfast_price']),
                        'tourist_tax' => (float)($pricing['tourist_tax'] ?? $hotel['default_tourist_tax']),
                    ]
                ]);
            }

            // POST /booking/{slug}/lookup - Rechercher une réservation par nom ou numéro
            if ($method === 'POST' && $id && $action === 'lookup') {
                $hotel = db()->queryOne(
                    "SELECT * FROM hotels WHERE booking_slug = ? AND selfcheckin_enabled = 1 AND status = 'active'",
                    [$id]
                );
                if (!$hotel) json_error('Hôtel non trouvé', 404);

                $data = get_input();
                $reservation = null;

                if (!empty($data['reservation_number'])) {
                    $reservation = db()->queryOne(
                        "SELECT * FROM selfcheckin_reservations WHERE reservation_number = ? AND hotel_id = ? AND type = 'pre_booked' AND status IN ('pending', 'confirmed')",
                        [$data['reservation_number'], $hotel['id']]
                    );
                } elseif (!empty($data['last_name'])) {
                    $reservation = db()->queryOne(
                        "SELECT * FROM selfcheckin_reservations WHERE LOWER(guest_last_name) LIKE LOWER(?) AND hotel_id = ? AND type = 'pre_booked' AND status IN ('pending', 'confirmed') ORDER BY checkin_date DESC",
                        [$data['last_name'], $hotel['id']]
                    );
                }

                if (!$reservation) json_error('Réservation non trouvée. Vérifiez votre nom ou numéro de réservation.', 404);

                // Tarif petit-déjeuner actuel (pour ajout éventuel)
                $effectiveDate = $getEffectiveDate($hotel);
                $pricing = db()->queryOne(
                    "SELECT * FROM selfcheckin_pricing WHERE hotel_id = ? AND date = ?",
                    [$hotel['id'], $effectiveDate]
                );
                if (!$pricing) $pricing = [];

                // Récupérer la capacité de la chambre si assignée
                $roomMaxAdults = null;
                if ($reservation['room_id']) {
                    $room = db()->queryOne("SELECT max_adults FROM rooms WHERE id = ?", [$reservation['room_id']]);
                    $roomMaxAdults = $room ? (int)$room['max_adults'] : null;
                }

                json_out([
                    'reservation' => [
                        'id' => $reservation['id'],
                        'reservation_number' => $reservation['reservation_number'],
                        'guest_first_name' => $reservation['guest_first_name'],
                        'guest_last_name' => $reservation['guest_last_name'],
                        'guest_email' => $reservation['guest_email'],
                        'guest_phone' => $reservation['guest_phone'],
                        'nb_adults' => (int)$reservation['nb_adults'],
                        'nb_children' => (int)$reservation['nb_children'],
                        'checkin_date' => $reservation['checkin_date'],
                        'room_number' => $reservation['room_number'],
                        'room_max_adults' => $roomMaxAdults,
                        'accommodation_price' => (float)$reservation['accommodation_price'],
                        'tourist_tax_amount' => (float)$reservation['tourist_tax_amount'],
                        'breakfast_price' => (float)$reservation['breakfast_price'],
                        'breakfast_included' => (bool)$reservation['breakfast_included'],
                        'total_amount' => (float)$reservation['total_amount'],
                        'deposit_amount' => (float)$reservation['deposit_amount'],
                        'remaining_amount' => (float)$reservation['remaining_amount'],
                        'payment_status' => $reservation['payment_status'],
                        'status' => $reservation['status'],
                    ],
                    'breakfast_option' => [
                        'unit_price' => (float)($pricing['breakfast_price'] ?? $hotel['default_breakfast_price']),
                        'start' => $pricing['breakfast_start'] ?? $hotel['breakfast_start'],
                        'end' => $pricing['breakfast_end'] ?? $hotel['breakfast_end'],
                    ],
                    'locker_number' => $reservation['locker_number'],
                    'locker_code' => $reservation['locker_code']
                ]);
            }

            // POST /booking/{slug}/update-reservation - Modifier réservation (ajouter petit-déjeuner)
            if ($method === 'POST' && $id && $action === 'update-reservation') {
                $hotel = db()->queryOne(
                    "SELECT * FROM hotels WHERE booking_slug = ? AND selfcheckin_enabled = 1 AND status = 'active'",
                    [$id]
                );
                if (!$hotel) json_error('Hôtel non trouvé', 404);

                $data = get_input();
                if (empty($data['reservation_id'])) json_error('reservation_id requis');

                $reservation = db()->queryOne(
                    "SELECT * FROM selfcheckin_reservations WHERE id = ? AND hotel_id = ? AND status IN ('pending', 'confirmed')",
                    [$data['reservation_id'], $hotel['id']]
                );
                if (!$reservation) json_error('Réservation non trouvée', 404);

                $effectiveDate = $getEffectiveDate($hotel);
                $pricing = db()->queryOne(
                    "SELECT * FROM selfcheckin_pricing WHERE hotel_id = ? AND date = ?",
                    [$hotel['id'], $effectiveDate]
                );
                if (!$pricing) $pricing = [];

                // Modifier les infos client si fournies
                $guestUpdates = [];
                $guestParams = [];
                if (isset($data['guest_first_name'])) { $guestUpdates[] = "guest_first_name = ?"; $guestParams[] = $data['guest_first_name']; }
                if (isset($data['guest_last_name'])) { $guestUpdates[] = "guest_last_name = ?"; $guestParams[] = $data['guest_last_name']; }
                if (isset($data['guest_email'])) { $guestUpdates[] = "guest_email = ?"; $guestParams[] = $data['guest_email']; }
                if (isset($data['guest_phone'])) { $guestUpdates[] = "guest_phone = ?"; $guestParams[] = $data['guest_phone']; }

                // Modifier le nombre de personnes avec vérification de capacité
                if (isset($data['nb_adults'])) {
                    $newNbAdults = (int)$data['nb_adults'];
                    if ($newNbAdults < 1) json_error('Le nombre d\'adultes doit être au moins 1');

                    // Vérifier la capacité de la chambre
                    if ($reservation['room_id']) {
                        $room = db()->queryOne("SELECT max_adults FROM rooms WHERE id = ?", [$reservation['room_id']]);
                        if ($room && $newNbAdults > (int)$room['max_adults']) {
                            json_error('La chambre ' . $reservation['room_number'] . ' ne peut accueillir que ' . $room['max_adults'] . ' adulte(s) maximum');
                        }
                    }

                    $guestUpdates[] = "nb_adults = ?";
                    $guestParams[] = $newNbAdults;
                    $reservation['nb_adults'] = $newNbAdults;

                    // Recalculer la taxe de séjour
                    $touristTaxUnit = (float)($pricing['tourist_tax'] ?? $hotel['default_tourist_tax']);
                    $newTouristTax = $touristTaxUnit * $newNbAdults;
                    $guestUpdates[] = "tourist_tax_amount = ?";
                    $guestParams[] = $newTouristTax;
                    $reservation['tourist_tax_amount'] = $newTouristTax;
                }
                if (isset($data['nb_children'])) {
                    $guestUpdates[] = "nb_children = ?";
                    $guestParams[] = (int)$data['nb_children'];
                    $reservation['nb_children'] = (int)$data['nb_children'];
                }

                if (!empty($guestUpdates)) {
                    $guestUpdates[] = "updated_at = NOW()";
                    $guestParams[] = $reservation['id'];
                    db()->execute("UPDATE selfcheckin_reservations SET " . implode(', ', $guestUpdates) . " WHERE id = ?", $guestParams);
                    // Rafraîchir la réservation
                    $reservation = db()->queryOne("SELECT * FROM selfcheckin_reservations WHERE id = ?", [$reservation['id']]);
                }

                // Ajouter petit-déjeuner
                if (!empty($data['add_breakfast']) && !$reservation['breakfast_included']) {
                    $breakfastUnitPrice = (float)($pricing['breakfast_price'] ?? $hotel['default_breakfast_price']);
                    $nbPersons = (int)$reservation['nb_adults'] + (int)$reservation['nb_children'];
                    $breakfastTotal = $breakfastUnitPrice * $nbPersons;

                    $newTotal = (float)$reservation['total_amount'] + $breakfastTotal;
                    $newRemaining = $newTotal - (float)$reservation['deposit_amount'];

                    db()->execute(
                        "UPDATE selfcheckin_reservations SET breakfast_included = 1, breakfast_price = ?, total_amount = ?, remaining_amount = ?, updated_at = NOW() WHERE id = ?",
                        [$breakfastTotal, $newTotal, max(0, $newRemaining), $reservation['id']]
                    );

                    $reservation['breakfast_included'] = 1;
                    $reservation['breakfast_price'] = $breakfastTotal;
                    $reservation['total_amount'] = $newTotal;
                    $reservation['remaining_amount'] = max(0, $newRemaining);
                }

                // Recalculer le total si les personnes ont changé
                if (isset($data['nb_adults']) || isset($data['nb_children'])) {
                    $newTotal = (float)$reservation['accommodation_price'] + (float)$reservation['tourist_tax_amount'] + (float)$reservation['breakfast_price'];
                    $newRemaining = $newTotal - (float)$reservation['deposit_amount'];
                    db()->execute(
                        "UPDATE selfcheckin_reservations SET total_amount = ?, remaining_amount = ?, updated_at = NOW() WHERE id = ?",
                        [$newTotal, max(0, $newRemaining), $reservation['id']]
                    );
                    $reservation['total_amount'] = $newTotal;
                    $reservation['remaining_amount'] = max(0, $newRemaining);
                }

                json_out([
                    'reservation' => [
                        'id' => (int)$reservation['id'],
                        'reservation_number' => $reservation['reservation_number'],
                        'guest_first_name' => $reservation['guest_first_name'],
                        'guest_last_name' => $reservation['guest_last_name'],
                        'guest_email' => $reservation['guest_email'],
                        'guest_phone' => $reservation['guest_phone'],
                        'nb_adults' => (int)$reservation['nb_adults'],
                        'nb_children' => (int)$reservation['nb_children'],
                        'total_amount' => (float)$reservation['total_amount'],
                        'deposit_amount' => (float)$reservation['deposit_amount'],
                        'remaining_amount' => (float)$reservation['remaining_amount'],
                        'breakfast_included' => (bool)$reservation['breakfast_included'],
                        'breakfast_price' => (float)$reservation['breakfast_price'],
                        'tourist_tax_amount' => (float)$reservation['tourist_tax_amount'],
                    ]
                ]);
            }

            // POST /booking/{slug}/pay - Créer un PaymentIntent Stripe pour le restant à payer
            if ($method === 'POST' && $id && $action === 'pay') {
                $hotel = db()->queryOne(
                    "SELECT * FROM hotels WHERE booking_slug = ? AND selfcheckin_enabled = 1 AND status = 'active'",
                    [$id]
                );
                if (!$hotel) json_error('Hôtel non trouvé', 404);
                if (empty($hotel['stripe_secret_key'])) json_error('Paiement non configuré pour cet hôtel', 500);

                $data = get_input();
                if (empty($data['reservation_id'])) json_error('reservation_id requis');

                $reservation = db()->queryOne(
                    "SELECT * FROM selfcheckin_reservations WHERE id = ? AND hotel_id = ? AND payment_status != 'paid'",
                    [$data['reservation_id'], $hotel['id']]
                );
                if (!$reservation) json_error('Réservation non trouvée ou déjà payée', 404);

                $remainingAmount = (float)$reservation['remaining_amount'];

                // Si rien à payer (arrhes couvrent tout)
                if ($remainingAmount <= 0) {
                    db()->execute(
                        "UPDATE selfcheckin_reservations SET payment_status = 'paid', status = 'checked_in', updated_at = NOW() WHERE id = ?",
                        [$reservation['id']]
                    );
                    // Libérer le casier (le client a récupéré sa clé)
                    if ($reservation['locker_id']) {
                        db()->execute("UPDATE hotel_lockers SET status = 'available', updated_at = NOW() WHERE id = ?", [$reservation['locker_id']]);
                    }
                    json_out([
                        'no_payment_needed' => true,
                        'reservation' => selfcheckin_format_confirmation($reservation, $hotel)
                    ]);
                    break;
                }

                // Créer PaymentIntent Stripe
                $amountCents = (int)round($remainingAmount * 100);
                $guestName = trim(($reservation['guest_first_name'] ?? '') . ' ' . ($reservation['guest_last_name'] ?? ''));

                $ch = curl_init('https://api.stripe.com/v1/payment_intents');
                curl_setopt_array($ch, [
                    CURLOPT_POST => true,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $hotel['stripe_secret_key']],
                    CURLOPT_POSTFIELDS => http_build_query([
                        'amount' => $amountCents,
                        'currency' => 'eur',
                        'metadata[reservation_id]' => $reservation['id'],
                        'metadata[reservation_number]' => $reservation['reservation_number'],
                        'metadata[hotel_id]' => $hotel['id'],
                        'metadata[guest_name]' => $guestName,
                        'receipt_email' => $reservation['guest_email'] ?: ($data['email'] ?? ''),
                        'description' => "Check-in {$reservation['reservation_number']} - {$hotel['name']}"
                    ])
                ]);
                $stripeRaw = curl_exec($ch);
                $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);

                $stripeResponse = json_decode($stripeRaw, true);
                if ($httpCode !== 200 || empty($stripeResponse['client_secret'])) {
                    $stripeErr = $stripeResponse['error']['message'] ?? 'Erreur Stripe (HTTP ' . $httpCode . ')';
                    json_error('Erreur paiement: ' . $stripeErr, 500);
                }

                db()->execute(
                    "UPDATE selfcheckin_reservations SET stripe_payment_intent_id = ?, updated_at = NOW() WHERE id = ?",
                    [$stripeResponse['id'], $reservation['id']]
                );

                json_out([
                    'client_secret' => $stripeResponse['client_secret'],
                    'payment_intent_id' => $stripeResponse['id'],
                    'amount' => $remainingAmount
                ]);
            }

            // POST /booking/{slug}/confirm - Confirmer après paiement Stripe réussi
            if ($method === 'POST' && $id && $action === 'confirm') {
                $hotel = db()->queryOne(
                    "SELECT * FROM hotels WHERE booking_slug = ? AND selfcheckin_enabled = 1 AND status = 'active'",
                    [$id]
                );
                if (!$hotel) json_error('Hôtel non trouvé', 404);

                $data = get_input();
                if (empty($data['payment_intent_id'])) json_error('Données manquantes');

                // Support multi-room: reservation_ids (array) ou reservation_id (single)
                $reservationIds = [];
                if (!empty($data['reservation_ids']) && is_array($data['reservation_ids'])) {
                    $reservationIds = array_map('intval', $data['reservation_ids']);
                } elseif (!empty($data['reservation_id'])) {
                    $reservationIds = [(int)$data['reservation_id']];
                }
                if (empty($reservationIds)) json_error('Données manquantes');

                // Vérifier toutes les réservations
                $allReservations = [];
                foreach ($reservationIds as $resId) {
                    $reservation = db()->queryOne(
                        "SELECT * FROM selfcheckin_reservations WHERE id = ? AND hotel_id = ?",
                        [$resId, $hotel['id']]
                    );
                    if (!$reservation) json_error('Réservation non trouvée', 404);
                    $allReservations[] = $reservation;
                }

                // Vérifier le paiement Stripe (une seule fois)
                $ch = curl_init('https://api.stripe.com/v1/payment_intents/' . $data['payment_intent_id']);
                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $hotel['stripe_secret_key']]
                ]);
                $piResponse = json_decode(curl_exec($ch), true);
                curl_close($ch);

                if (empty($piResponse['status']) || $piResponse['status'] !== 'succeeded') {
                    foreach ($reservationIds as $resId) {
                        db()->execute(
                            "UPDATE selfcheckin_reservations SET payment_status = 'failed', updated_at = NOW() WHERE id = ?",
                            [$resId]
                        );
                    }
                    json_error('Paiement non confirmé. Veuillez réessayer.');
                }

                $chargeId = $piResponse['latest_charge'] ?? null;

                // Confirmer toutes les réservations et libérer les casiers
                $confirmations = [];
                $updatedReservations = [];
                foreach ($allReservations as $reservation) {
                    db()->execute(
                        "UPDATE selfcheckin_reservations SET payment_status = 'paid', status = 'checked_in', stripe_charge_id = ?, updated_at = NOW() WHERE id = ?",
                        [$chargeId, $reservation['id']]
                    );

                    // Libérer le casier (le client a récupéré sa clé, le casier est réutilisable)
                    if ($reservation['locker_id']) {
                        db()->execute("UPDATE hotel_lockers SET status = 'available', updated_at = NOW() WHERE id = ?", [$reservation['locker_id']]);
                    }

                    // Rafraîchir les données
                    $updated = db()->queryOne("SELECT * FROM selfcheckin_reservations WHERE id = ?", [$reservation['id']]);
                    $updatedReservations[] = $updated;
                    $confirmations[] = selfcheckin_format_confirmation($updated, $hotel);
                }

                // Envoyer l'email de confirmation au client
                sendBookingConfirmationEmail($updatedReservations, $hotel);

                // Pour rétrocompatibilité, 'reservation' contient la première (avec le total)
                json_out([
                    'success' => true,
                    'reservation' => $confirmations[0],
                    'reservations' => $confirmations,
                    'nb_rooms' => count($confirmations)
                ]);
            }

            // GET /booking/{slug}/available-rooms - Chambres disponibles pour walk-in
            if ($method === 'GET' && $id && $action === 'available-rooms') {
                $hotel = db()->queryOne(
                    "SELECT * FROM hotels WHERE booking_slug = ? AND selfcheckin_enabled = 1 AND walkin_enabled = 1 AND status = 'active'",
                    [$id]
                );
                if (!$hotel) json_error('Hôtel non trouvé ou réservation sans rendez-vous désactivée', 404);

                $effectiveDate = $getEffectiveDate($hotel);
                $nbPersonsFilter = isset($_GET['nb_persons']) ? (int)$_GET['nb_persons'] : (isset($_GET['nb_adults']) ? (int)$_GET['nb_adults'] : null);

                // Récupérer TOUS les slots walk-in disponibles (sans info client = pas encore pris)
                // Joindre avec rooms pour obtenir la capacité
                $sql = "SELECT r.id, r.reservation_number, r.checkin_date, r.room_id,
                               rm.room_type, rm.bed_type, rm.max_adults
                        FROM selfcheckin_reservations r
                        LEFT JOIN rooms rm ON rm.id = r.room_id
                        WHERE r.hotel_id = ? AND r.type = 'walkin' AND r.status = 'pending'
                           AND r.guest_last_name IS NULL AND r.checkin_date = ?";
                $params = [$hotel['id'], $effectiveDate];

                $sql .= " ORDER BY rm.max_adults DESC, r.room_number";
                $slots = db()->query($sql, $params);

                // Vérifier si une seule chambre peut accueillir tout le monde
                $singleRoomPossible = false;
                if ($nbPersonsFilter && $nbPersonsFilter > 0) {
                    foreach ($slots as $s) {
                        if ((int)($s['max_adults'] ?? 2) >= $nbPersonsFilter) {
                            $singleRoomPossible = true;
                            break;
                        }
                    }
                }

                $pricing = db()->queryOne(
                    "SELECT * FROM selfcheckin_pricing WHERE hotel_id = ? AND date = ?",
                    [$hotel['id'], $effectiveDate]
                );
                if (!$pricing) $pricing = [];

                // Horaires PDJ : priorité = tarif jour > planning semaine > défaut hôtel
                $dow = (int)(new DateTime($effectiveDate))->format('w');
                $weekSched = null;
                try { $weekSched = db()->queryOne("SELECT * FROM hotel_breakfast_schedules WHERE hotel_id = ? AND day_of_week = ?", [$hotel['id'], $dow]); } catch (Exception $e) {}

                // Ne pas renvoyer le room_number pour les walk-in (sera affiché après paiement)
                $slotsForClient = array_map(function($s) {
                    return [
                        'id' => $s['id'],
                        'reservation_number' => $s['reservation_number'],
                        'checkin_date' => $s['checkin_date'],
                        'room_type' => $s['room_type'] ?? 'standard',
                        'bed_type' => $s['bed_type'] ?? 'double',
                        'max_adults' => (int)($s['max_adults'] ?? 2),
                    ];
                }, $slots);

                json_out([
                    'rooms' => $slotsForClient,
                    'single_room_possible' => $singleRoomPossible,
                    'nb_persons' => $nbPersonsFilter ? (int)$nbPersonsFilter : null,
                    'pricing' => [
                        'date' => $effectiveDate,
                        'night_price' => (float)($pricing['night_price'] ?? $hotel['default_night_price']),
                        'breakfast_price' => (float)($pricing['breakfast_price'] ?? $hotel['default_breakfast_price']),
                        'tourist_tax' => (float)($pricing['tourist_tax'] ?? $hotel['default_tourist_tax']),
                        'breakfast_start' => $pricing['breakfast_start'] ?? ($weekSched['breakfast_start'] ?? $hotel['breakfast_start']),
                        'breakfast_end' => $pricing['breakfast_end'] ?? ($weekSched['breakfast_end'] ?? $hotel['breakfast_end']),
                    ]
                ]);
            }

            // POST /booking/{slug}/walkin - Créer réservation walk-in (client sans réservation)
            if ($method === 'POST' && $id && $action === 'walkin') {
                $hotel = db()->queryOne(
                    "SELECT * FROM hotels WHERE booking_slug = ? AND selfcheckin_enabled = 1 AND walkin_enabled = 1 AND status = 'active'",
                    [$id]
                );
                if (!$hotel) json_error('Hôtel non trouvé ou walk-in désactivé', 404);
                if (empty($hotel['stripe_secret_key'])) json_error('Paiement non configuré', 500);

                $data = get_input();

                // Support multi-room: reservation_ids (array) ou reservation_id (single)
                $reservationIds = [];
                if (!empty($data['reservation_ids']) && is_array($data['reservation_ids'])) {
                    $reservationIds = array_map('intval', $data['reservation_ids']);
                } elseif (!empty($data['reservation_id'])) {
                    $reservationIds = [(int)$data['reservation_id']];
                }
                if (empty($reservationIds)) json_error('Au moins une chambre doit être sélectionnée');

                // Validation des champs obligatoires
                $requiredFields = ['guest_first_name', 'guest_last_name', 'guest_email', 'guest_phone', 'nb_adults'];
                foreach ($requiredFields as $field) {
                    if (empty($data[$field])) json_error("Le champ $field est requis");
                }
                if (!filter_var($data['guest_email'], FILTER_VALIDATE_EMAIL)) json_error('Email invalide');

                // Vérifier tous les slots walk-in
                $reservations = [];
                $totalCapacity = 0;
                foreach ($reservationIds as $resId) {
                    $reservation = db()->queryOne(
                        "SELECT r.*, rm.max_adults as room_max_adults FROM selfcheckin_reservations r LEFT JOIN rooms rm ON rm.id = r.room_id WHERE r.id = ? AND r.hotel_id = ? AND r.type = 'walkin' AND r.status = 'pending' AND r.guest_last_name IS NULL",
                        [$resId, $hotel['id']]
                    );
                    if (!$reservation) json_error('Une des chambres sélectionnées n\'est plus disponible', 404);
                    $reservations[] = $reservation;
                    $totalCapacity += (int)($reservation['room_max_adults'] ?? 2);
                }

                $nbAdults = (int)$data['nb_adults'];
                $nbRooms = count($reservations);

                // Vérifier la capacité totale (toutes les chambres combinées)
                if ($nbAdults > $totalCapacity) {
                    json_error('La capacité totale des chambres sélectionnées (' . $totalCapacity . ' personnes) est insuffisante pour ' . $nbAdults . ' personnes');
                }

                // Pour une seule chambre, vérifier la capacité individuelle
                if ($nbRooms === 1 && $reservations[0]['room_id']) {
                    $roomMaxAdults = (int)($reservations[0]['room_max_adults'] ?? 2);
                    if ($nbAdults > $roomMaxAdults) {
                        json_error('Cette chambre ne peut accueillir que ' . $roomMaxAdults . ' personne(s) maximum');
                    }
                }

                // Calculer les tarifs
                $effectiveDate = $getEffectiveDate($hotel);
                $pricing = db()->queryOne(
                    "SELECT * FROM selfcheckin_pricing WHERE hotel_id = ? AND date = ?",
                    [$hotel['id'], $effectiveDate]
                );
                if (!$pricing) $pricing = [];

                $nightPrice = (float)($pricing['night_price'] ?? $hotel['default_night_price']);
                $touristTaxUnit = (float)($pricing['tourist_tax'] ?? $hotel['default_tourist_tax']);
                $breakfastUnitPrice = (float)($pricing['breakfast_price'] ?? $hotel['default_breakfast_price']);

                $nbChildren = (int)($data['nb_children'] ?? 0);
                $nbPersons = $nbAdults + $nbChildren;
                $wantsBreakfast = !empty($data['breakfast']);

                $accommodationPrice = $nightPrice * $nbRooms; // Prix par chambre * nombre de chambres
                $touristTaxTotal = $touristTaxUnit * $nbAdults; // Taxe par personne par nuit
                $breakfastTotal = $wantsBreakfast ? ($breakfastUnitPrice * $nbPersons) : 0;

                // Calculer les services complémentaires
                $servicesTotal = 0;
                $selectedServices = $data['services'] ?? [];
                if (!empty($selectedServices) && is_array($selectedServices)) {
                    foreach ($selectedServices as $svc) {
                        $serviceId = (int)($svc['id'] ?? 0);
                        $serviceQty = max(1, (int)($svc['quantity'] ?? 1));
                        $dbService = db()->queryOne(
                            "SELECT * FROM hotel_selfcheckin_services WHERE id = ? AND hotel_id = ? AND is_active = 1",
                            [$serviceId, $hotel['id']]
                        );
                        if ($dbService) {
                            $servicesTotal += (float)$dbService['price'] * $serviceQty;
                        }
                    }
                }

                $totalAmount = $accommodationPrice + $touristTaxTotal + $breakfastTotal + $servicesTotal;

                // Mettre à jour toutes les réservations avec les infos client
                $primaryReservationId = $reservations[0]['id'];
                foreach ($reservations as $idx => $res) {
                    $isPrimary = ($idx === 0);
                    db()->execute(
                        "UPDATE selfcheckin_reservations SET
                            guest_first_name = ?, guest_last_name = ?, guest_email = ?, guest_phone = ?,
                            nb_adults = ?, nb_children = ?, breakfast_included = ?,
                            accommodation_price = ?, tourist_tax_amount = ?, breakfast_price = ?,
                            total_amount = ?, remaining_amount = ?, deposit_amount = 0,
                            id_document_path = ?, updated_at = NOW()
                         WHERE id = ?",
                        [
                            $data['guest_first_name'], $data['guest_last_name'],
                            $data['guest_email'], $data['guest_phone'],
                            $nbAdults, $nbChildren, $wantsBreakfast ? 1 : 0,
                            $isPrimary ? $accommodationPrice : $nightPrice,
                            $isPrimary ? $touristTaxTotal : 0,
                            $isPrimary ? $breakfastTotal : 0,
                            $isPrimary ? $totalAmount : $nightPrice,
                            $isPrimary ? $totalAmount : 0,
                            $data['id_document_path'] ?? null,
                            $res['id']
                        ]
                    );
                }

                // Enregistrer les services complémentaires sur la réservation primaire
                if (!empty($selectedServices) && is_array($selectedServices)) {
                    foreach ($selectedServices as $svc) {
                        $serviceId = (int)($svc['id'] ?? 0);
                        $serviceQty = max(1, (int)($svc['quantity'] ?? 1));
                        $dbService = db()->queryOne(
                            "SELECT * FROM hotel_selfcheckin_services WHERE id = ? AND hotel_id = ? AND is_active = 1",
                            [$serviceId, $hotel['id']]
                        );
                        if ($dbService) {
                            db()->insert(
                                "INSERT INTO selfcheckin_reservation_services (reservation_id, service_id, service_name, service_price, quantity, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
                                [$primaryReservationId, $dbService['id'], $dbService['name'], (float)$dbService['price'], $serviceQty]
                            );
                        }
                    }
                }

                // Créer PaymentIntent Stripe
                $amountCents = (int)round($totalAmount * 100);
                $resNumbers = array_map(function($r) { return $r['reservation_number']; }, $reservations);
                $ch = curl_init('https://api.stripe.com/v1/payment_intents');
                curl_setopt_array($ch, [
                    CURLOPT_POST => true,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $hotel['stripe_secret_key']],
                    CURLOPT_POSTFIELDS => http_build_query([
                        'amount' => $amountCents,
                        'currency' => 'eur',
                        'metadata[reservation_ids]' => implode(',', $reservationIds),
                        'metadata[reservation_numbers]' => implode(',', $resNumbers),
                        'metadata[hotel_id]' => $hotel['id'],
                        'metadata[type]' => 'walkin',
                        'metadata[nb_rooms]' => $nbRooms,
                        'receipt_email' => $data['guest_email'],
                        'description' => "Walk-in " . implode(', ', $resNumbers) . " ({$nbRooms} chambre(s)) - {$hotel['name']}"
                    ])
                ]);
                $stripeRaw = curl_exec($ch);
                $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);

                $stripeResponse = json_decode($stripeRaw, true);
                if ($httpCode !== 200 || empty($stripeResponse['client_secret'])) {
                    $stripeErr = $stripeResponse['error']['message'] ?? 'Erreur Stripe';
                    json_error('Erreur paiement: ' . $stripeErr, 500);
                }

                // Stocker le payment_intent_id sur toutes les réservations
                foreach ($reservationIds as $resId) {
                    db()->execute(
                        "UPDATE selfcheckin_reservations SET stripe_payment_intent_id = ?, updated_at = NOW() WHERE id = ?",
                        [$stripeResponse['id'], $resId]
                    );
                }

                json_out([
                    'client_secret' => $stripeResponse['client_secret'],
                    'payment_intent_id' => $stripeResponse['id'],
                    'amount' => $totalAmount,
                    'reservation_id' => (int)$primaryReservationId,
                    'reservation_ids' => $reservationIds,
                    'nb_rooms' => $nbRooms,
                    'pricing_detail' => [
                        'accommodation' => $accommodationPrice,
                        'tourist_tax' => $touristTaxTotal,
                        'breakfast' => $breakfastTotal,
                        'services' => $servicesTotal,
                        'total' => $totalAmount,
                    ]
                ]);
            }

            // POST /booking/{slug}/upload-id - Upload pièce d'identité (walk-in)
            if ($method === 'POST' && $id && $action === 'upload-id') {
                $hotel = db()->queryOne(
                    "SELECT id FROM hotels WHERE booking_slug = ? AND selfcheckin_enabled = 1 AND status = 'active'",
                    [$id]
                );
                if (!$hotel) json_error('Hôtel non trouvé', 404);

                if (!isset($_FILES['id_document'])) json_error('Fichier requis');

                $file = $_FILES['id_document'];
                $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
                $allowedExts = ['jpg', 'jpeg', 'png', 'webp'];
                if (!in_array($ext, $allowedExts)) json_error('Format non autorisé. Formats acceptés : JPG, PNG, WebP');
                if ($file['size'] > 20 * 1024 * 1024) json_error('Fichier trop volumineux (max 20 Mo). Essayez de réduire la qualité de l\'image.');

                $uploadDir = __DIR__ . '/../uploads/id_documents/';
                if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

                $filename = uniqid('id_') . '.' . $ext;
                $path = $uploadDir . $filename;
                if (!move_uploaded_file($file['tmp_name'], $path)) json_error('Erreur lors de l\'upload');

                json_out([
                    'path' => 'uploads/id_documents/' . $filename,
                    'filename' => $filename,
                    'rgpd_notice' => 'Conformément au RGPD (Règlement Général sur la Protection des Données), votre pièce d\'identité sera conservée de manière sécurisée et automatiquement supprimée après 7 jours. Elle est utilisée uniquement pour la vérification d\'identité lors de votre check-in.'
                ]);
            }

            // GET /booking/{slug}/services - Services complémentaires disponibles (public)
            if ($method === 'GET' && $id && $action === 'services') {
                $hotel = db()->queryOne(
                    "SELECT id FROM hotels WHERE booking_slug = ? AND selfcheckin_enabled = 1 AND status = 'active'",
                    [$id]
                );
                if (!$hotel) json_error('Hôtel non trouvé', 404);

                $services = db()->query(
                    "SELECT id, name, description, price, icon FROM hotel_selfcheckin_services WHERE hotel_id = ? AND is_active = 1 ORDER BY sort_order, name",
                    [$hotel['id']]
                );
                json_out(['services' => $services]);
            }

            break;

        // ==================== SELF CHECK-IN ADMIN (réservations) ====================
        case 'selfcheckin':
            $user = require_auth();
            $userHotelIds = getManageableHotels($user);

            // GET /selfcheckin?hotel_id=X - Liste des réservations
            if ($method === 'GET' && !$id) {
                $hotelId = $_GET['hotel_id'] ?? null;
                if (!$hotelId) json_error('hotel_id requis');
                if (!in_array($hotelId, $userHotelIds)) json_error('Accès non autorisé', 403);

                $status = $_GET['status'] ?? null;
                $type = $_GET['type'] ?? null;
                $date = $_GET['date'] ?? null;

                $sql = "SELECT r.*, l.locker_number as current_locker_number
                        FROM selfcheckin_reservations r
                        LEFT JOIN hotel_lockers l ON r.locker_id = l.id
                        WHERE r.hotel_id = ?";
                $params = [$hotelId];

                if ($status) { $sql .= " AND r.status = ?"; $params[] = $status; }
                if ($type) { $sql .= " AND r.type = ?"; $params[] = $type; }
                if ($date) { $sql .= " AND r.checkin_date = ?"; $params[] = $date; }

                $sql .= " ORDER BY r.checkin_date DESC, r.created_at DESC LIMIT 200";

                $reservations = db()->query($sql, $params);
                json_out(['reservations' => $reservations]);
            }

            // GET /selfcheckin/stats?hotel_id=X - Statistiques du jour
            if ($method === 'GET' && $id === 'stats') {
                $hotelId = $_GET['hotel_id'] ?? null;
                if (!$hotelId) json_error('hotel_id requis');
                if (!in_array($hotelId, $userHotelIds)) json_error('Accès non autorisé', 403);

                $today = date('Y-m-d');
                $stats = [
                    'today_total' => db()->count("SELECT COUNT(*) FROM selfcheckin_reservations WHERE hotel_id = ? AND checkin_date = ?", [$hotelId, $today]),
                    'today_prebooked' => db()->count("SELECT COUNT(*) FROM selfcheckin_reservations WHERE hotel_id = ? AND checkin_date = ? AND type = 'pre_booked'", [$hotelId, $today]),
                    'today_walkin' => db()->count("SELECT COUNT(*) FROM selfcheckin_reservations WHERE hotel_id = ? AND checkin_date = ? AND type = 'walkin'", [$hotelId, $today]),
                    'today_confirmed' => db()->count("SELECT COUNT(*) FROM selfcheckin_reservations WHERE hotel_id = ? AND checkin_date = ? AND payment_status = 'paid'", [$hotelId, $today]),
                    'today_pending' => db()->count("SELECT COUNT(*) FROM selfcheckin_reservations WHERE hotel_id = ? AND checkin_date = ? AND payment_status = 'pending'", [$hotelId, $today]),
                    'lockers_total' => db()->count("SELECT COUNT(*) FROM hotel_lockers WHERE hotel_id = ?", [$hotelId]),
                    'lockers_available' => db()->count("SELECT COUNT(*) FROM hotel_lockers WHERE hotel_id = ? AND status = 'available'", [$hotelId]),
                    'lockers_assigned' => db()->count("SELECT COUNT(*) FROM hotel_lockers WHERE hotel_id = ? AND status = 'assigned'", [$hotelId]),
                ];
                json_out($stats);
            }

            // GET /selfcheckin/{id} - Détail d'une réservation
            if ($method === 'GET' && $id && $id !== 'stats' && $id !== 'archives') {
                $reservation = db()->queryOne("SELECT * FROM selfcheckin_reservations WHERE id = ?", [$id]);
                if (!$reservation) json_error('Réservation non trouvée', 404);
                if (!in_array($reservation['hotel_id'], $userHotelIds)) json_error('Accès non autorisé', 403);
                json_out($reservation);
            }

            // POST /selfcheckin - Créer une réservation (pré-enregistrée ou slot walk-in)
            if ($method === 'POST' && !$id) {
                $data = get_input();
                if (empty($data['hotel_id'])) json_error('hotel_id requis');
                if (!in_array($data['hotel_id'], $userHotelIds)) json_error('Accès non autorisé', 403);

                $type = $data['type'] ?? 'pre_booked';
                $hotelId = (int)$data['hotel_id'];

                // Générer numéro de réservation
                $resNumber = $data['reservation_number'] ?? ('SC-' . strtoupper(substr(uniqid(), -6)) . '-' . date('ymd'));

                // Vérifier unicité du numéro
                $existing = db()->queryOne(
                    "SELECT id FROM selfcheckin_reservations WHERE hotel_id = ? AND reservation_number = ?",
                    [$hotelId, $resNumber]
                );
                if ($existing) json_error('Ce numéro de réservation existe déjà');

                // Valider le casier si fourni
                $lockerId = null;
                $lockerNumber = null;
                $lockerCode = null;
                if (!empty($data['locker_id'])) {
                    $locker = db()->queryOne(
                        "SELECT * FROM hotel_lockers WHERE id = ? AND hotel_id = ?",
                        [$data['locker_id'], $hotelId]
                    );
                    if (!$locker) json_error('Casier non trouvé');
                    if ($locker['status'] !== 'available') json_error('Ce casier n\'est pas disponible');
                    $lockerId = $locker['id'];
                    $lockerNumber = $locker['locker_number'];
                    // Code : utiliser celui fourni dans la requête, sinon le code courant du casier
                    $lockerCode = !empty($data['locker_code']) ? $data['locker_code'] : $locker['locker_code'];
                }

                // Calculer le reste à payer
                $totalAmount = (float)($data['total_amount'] ?? 0);
                $depositAmount = (float)($data['deposit_amount'] ?? 0);
                $remainingAmount = max(0, $totalAmount - $depositAmount);

                $insertId = db()->insert('selfcheckin_reservations', [
                    'hotel_id' => $hotelId,
                    'reservation_number' => $resNumber,
                    'type' => $type,
                    'guest_first_name' => $data['guest_first_name'] ?? null,
                    'guest_last_name' => $data['guest_last_name'] ?? null,
                    'guest_email' => $data['guest_email'] ?? null,
                    'guest_phone' => $data['guest_phone'] ?? null,
                    'nb_adults' => (int)($data['nb_adults'] ?? 1),
                    'nb_children' => (int)($data['nb_children'] ?? 0),
                    'checkin_date' => $data['checkin_date'] ?? date('Y-m-d'),
                    'checkout_date' => $data['checkout_date'] ?? null,
                    'room_id' => $data['room_id'] ?? null,
                    'room_number' => $data['room_number'] ?? null,
                    'locker_id' => $lockerId,
                    'locker_number' => $lockerNumber,
                    'locker_code' => $lockerCode,
                    'accommodation_price' => (float)($data['accommodation_price'] ?? 0),
                    'tourist_tax_amount' => (float)($data['tourist_tax_amount'] ?? 0),
                    'breakfast_price' => (float)($data['breakfast_price'] ?? 0),
                    'total_amount' => $totalAmount,
                    'deposit_amount' => $depositAmount,
                    'remaining_amount' => $remainingAmount,
                    'breakfast_included' => !empty($data['breakfast_included']) ? 1 : 0,
                    'payment_status' => $depositAmount >= $totalAmount && $totalAmount > 0 ? 'paid' : 'pending',
                    'status' => 'pending',
                    'created_at' => date('Y-m-d H:i:s'),
                    'created_by' => $user['id']
                ]);

                // Marquer le casier comme assigné
                if ($lockerId) {
                    db()->execute("UPDATE hotel_lockers SET status = 'assigned', updated_at = NOW() WHERE id = ?", [$lockerId]);
                }

                json_out(['id' => $insertId, 'reservation_number' => $resNumber, 'message' => 'Réservation créée'], 201);
            }

            // PUT /selfcheckin/{id} - Modifier une réservation
            if ($method === 'PUT' && $id) {
                $reservation = db()->queryOne("SELECT * FROM selfcheckin_reservations WHERE id = ?", [$id]);
                if (!$reservation) json_error('Réservation non trouvée', 404);
                if (!in_array($reservation['hotel_id'], $userHotelIds)) json_error('Accès non autorisé', 403);

                $data = get_input();
                $fields = [];
                $params = [];

                $updatableFields = [
                    'guest_first_name', 'guest_last_name', 'guest_email', 'guest_phone',
                    'nb_adults', 'nb_children', 'checkin_date', 'checkout_date',
                    'room_id', 'room_number', 'accommodation_price', 'tourist_tax_amount',
                    'breakfast_price', 'total_amount', 'deposit_amount', 'breakfast_included',
                    'status', 'payment_status'
                ];

                foreach ($updatableFields as $field) {
                    if (isset($data[$field])) {
                        $fields[] = "$field = ?";
                        $params[] = $data[$field];
                    }
                }

                // Changement de casier
                if (isset($data['locker_id'])) {
                    // Libérer l'ancien casier
                    if ($reservation['locker_id']) {
                        db()->execute("UPDATE hotel_lockers SET status = 'available', updated_at = NOW() WHERE id = ?", [$reservation['locker_id']]);
                    }
                    if ($data['locker_id']) {
                        $locker = db()->queryOne(
                            "SELECT * FROM hotel_lockers WHERE id = ? AND hotel_id = ?",
                            [$data['locker_id'], $reservation['hotel_id']]
                        );
                        if (!$locker) json_error('Casier non trouvé');
                        if ($locker['status'] !== 'available' && $locker['id'] != $reservation['locker_id']) {
                            json_error('Ce casier n\'est pas disponible');
                        }
                        $fields[] = "locker_id = ?"; $params[] = $locker['id'];
                        $fields[] = "locker_number = ?"; $params[] = $locker['locker_number'];
                        // Code : utiliser celui fourni ou le code courant du casier
                        $fields[] = "locker_code = ?"; $params[] = !empty($data['locker_code']) ? $data['locker_code'] : $locker['locker_code'];
                        // Marquer le nouveau casier comme assigné
                        db()->execute("UPDATE hotel_lockers SET status = 'assigned', updated_at = NOW() WHERE id = ?", [$locker['id']]);
                    } else {
                        $fields[] = "locker_id = ?"; $params[] = null;
                        $fields[] = "locker_number = ?"; $params[] = null;
                        $fields[] = "locker_code = ?"; $params[] = null;
                    }
                } elseif (isset($data['locker_code'])) {
                    // Mise à jour du code seul (sans changer de casier)
                    $fields[] = "locker_code = ?"; $params[] = $data['locker_code'];
                }

                // Libérer le casier si la réservation passe en statut terminal
                if (isset($data['status']) && in_array($data['status'], ['cancelled', 'checked_out', 'no_show'])) {
                    if ($reservation['locker_id']) {
                        db()->execute("UPDATE hotel_lockers SET status = 'available', updated_at = NOW() WHERE id = ?", [$reservation['locker_id']]);
                    }
                }

                // Recalculer le reste à payer
                if (isset($data['total_amount']) || isset($data['deposit_amount'])) {
                    $total = (float)($data['total_amount'] ?? $reservation['total_amount']);
                    $deposit = (float)($data['deposit_amount'] ?? $reservation['deposit_amount']);
                    $fields[] = "remaining_amount = ?";
                    $params[] = max(0, $total - $deposit);
                }

                if (empty($fields)) json_error('Rien à modifier');

                $fields[] = "updated_at = NOW()";
                $params[] = $id;

                db()->execute(
                    "UPDATE selfcheckin_reservations SET " . implode(', ', $fields) . " WHERE id = ?",
                    $params
                );

                json_out(['message' => 'Réservation mise à jour']);
            }

            // POST /selfcheckin/{id}/release-locker - Libérer manuellement le casier
            if ($method === 'POST' && $id && $action === 'release-locker') {
                $reservation = db()->queryOne("SELECT * FROM selfcheckin_reservations WHERE id = ?", [$id]);
                if (!$reservation) json_error('Réservation non trouvée', 404);
                if (!in_array($reservation['hotel_id'], $userHotelIds)) json_error('Accès non autorisé', 403);

                if (!$reservation['locker_id']) json_error('Aucun casier assigné à cette réservation');

                // Libérer le casier
                db()->execute("UPDATE hotel_lockers SET status = 'available', updated_at = NOW() WHERE id = ?", [$reservation['locker_id']]);

                // Retirer le casier de la réservation
                db()->execute(
                    "UPDATE selfcheckin_reservations SET locker_id = NULL, locker_number = NULL, locker_code = NULL, updated_at = NOW() WHERE id = ?",
                    [$reservation['id']]
                );

                json_out(['message' => 'Casier libéré avec succès']);
            }

            // GET /selfcheckin/archives - Archives des ventes avec filtres avancés
            if ($method === 'GET' && $id === 'archives') {
                $hotelId = $_GET['hotel_id'] ?? null;
                if (!$hotelId) json_error('hotel_id requis');
                if (!in_array($hotelId, $userHotelIds)) json_error('Accès non autorisé', 403);

                $dateFrom = $_GET['date_from'] ?? null;
                $dateTo = $_GET['date_to'] ?? null;
                $status = $_GET['status'] ?? null;
                $paymentStatus = $_GET['payment_status'] ?? null;
                $type = $_GET['type'] ?? null;
                $search = $_GET['search'] ?? null;

                $sql = "SELECT r.*, l.locker_number as current_locker_number
                        FROM selfcheckin_reservations r
                        LEFT JOIN hotel_lockers l ON r.locker_id = l.id
                        WHERE r.hotel_id = ?";
                $params = [$hotelId];

                if ($dateFrom) { $sql .= " AND r.checkin_date >= ?"; $params[] = $dateFrom; }
                if ($dateTo) { $sql .= " AND r.checkin_date <= ?"; $params[] = $dateTo; }
                if ($status) { $sql .= " AND r.status = ?"; $params[] = $status; }
                if ($paymentStatus) { $sql .= " AND r.payment_status = ?"; $params[] = $paymentStatus; }
                if ($type) { $sql .= " AND r.type = ?"; $params[] = $type; }
                if ($search) {
                    $sql .= " AND (r.guest_last_name LIKE ? OR r.guest_first_name LIKE ? OR r.reservation_number LIKE ?)";
                    $searchTerm = "%$search%";
                    $params[] = $searchTerm;
                    $params[] = $searchTerm;
                    $params[] = $searchTerm;
                }

                $sql .= " ORDER BY r.checkin_date DESC, r.created_at DESC LIMIT 500";
                $reservations = db()->query($sql, $params);

                // Calculer les statistiques d'archives
                $sqlStats = "SELECT
                    COUNT(*) as total_reservations,
                    SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) as total_paid,
                    SUM(CASE WHEN status = 'checked_in' THEN 1 ELSE 0 END) as total_checkedin,
                    SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as total_cancelled,
                    COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END), 0) as revenue_total,
                    COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN accommodation_price ELSE 0 END), 0) as revenue_accommodation,
                    COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN breakfast_price ELSE 0 END), 0) as revenue_breakfast,
                    COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN tourist_tax_amount ELSE 0 END), 0) as revenue_tax,
                    COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN deposit_amount ELSE 0 END), 0) as total_deposits
                    FROM selfcheckin_reservations WHERE hotel_id = ?";
                $statsParams = [$hotelId];

                if ($dateFrom) { $sqlStats .= " AND checkin_date >= ?"; $statsParams[] = $dateFrom; }
                if ($dateTo) { $sqlStats .= " AND checkin_date <= ?"; $statsParams[] = $dateTo; }
                if ($status) { $sqlStats .= " AND status = ?"; $statsParams[] = $status; }
                if ($paymentStatus) { $sqlStats .= " AND payment_status = ?"; $statsParams[] = $paymentStatus; }
                if ($type) { $sqlStats .= " AND type = ?"; $statsParams[] = $type; }
                if ($search) {
                    $sqlStats .= " AND (guest_last_name LIKE ? OR guest_first_name LIKE ? OR reservation_number LIKE ?)";
                    $statsParams[] = "%$search%";
                    $statsParams[] = "%$search%";
                    $statsParams[] = "%$search%";
                }

                $stats = db()->queryOne($sqlStats, $statsParams);

                json_out([
                    'reservations' => $reservations,
                    'stats' => $stats
                ]);
            }

            // DELETE /selfcheckin/{id} - Supprimer une réservation
            if ($method === 'DELETE' && $id) {
                $reservation = db()->queryOne("SELECT * FROM selfcheckin_reservations WHERE id = ?", [$id]);
                if (!$reservation) json_error('Réservation non trouvée', 404);
                if (!in_array($reservation['hotel_id'], $userHotelIds)) json_error('Accès non autorisé', 403);

                // Interdire la suppression des réservations confirmées ou checked-in
                if (in_array($reservation['status'], ['confirmed', 'checked_in'])) {
                    json_error('Impossible de supprimer une réservation ' . ($reservation['status'] === 'confirmed' ? 'confirmée' : 'en cours (checked-in)') . '. Vous pouvez l\'annuler à la place.', 400);
                }

                // Libérer le casier
                if ($reservation['locker_id']) {
                    db()->execute("UPDATE hotel_lockers SET status = 'available', updated_at = NOW() WHERE id = ?", [$reservation['locker_id']]);
                }

                db()->execute("DELETE FROM selfcheckin_reservations WHERE id = ?", [$id]);
                json_out(['message' => 'Réservation supprimée']);
            }
            break;

        // ==================== CASIERS (LOCKERS) ====================
        case 'lockers':
            $user = require_auth();
            $userHotelIds = getManageableHotels($user);

            // GET /lockers?hotel_id=X - Liste des casiers
            if ($method === 'GET' && !$id) {
                $hotelId = $_GET['hotel_id'] ?? null;
                if (!$hotelId) json_error('hotel_id requis');
                if (!in_array($hotelId, $userHotelIds)) json_error('Accès non autorisé', 403);

                $lockers = db()->query(
                    "SELECT * FROM hotel_lockers WHERE hotel_id = ? ORDER BY CAST(locker_number AS UNSIGNED), locker_number",
                    [$hotelId]
                );
                json_out(['lockers' => $lockers]);
            }

            // GET /lockers/{id}
            if ($method === 'GET' && $id) {
                $locker = db()->queryOne("SELECT * FROM hotel_lockers WHERE id = ?", [$id]);
                if (!$locker) json_error('Casier non trouvé', 404);
                if (!in_array($locker['hotel_id'], $userHotelIds)) json_error('Accès non autorisé', 403);
                json_out($locker);
            }

            // POST /lockers - Créer un casier
            if ($method === 'POST' && !$id) {
                $data = get_input();
                if (empty($data['hotel_id']) || empty($data['locker_number']) || empty($data['locker_code'])) {
                    json_error('hotel_id, locker_number et locker_code requis');
                }
                if (!in_array($data['hotel_id'], $userHotelIds)) json_error('Accès non autorisé', 403);

                // Vérifier unicité
                $existing = db()->queryOne(
                    "SELECT id FROM hotel_lockers WHERE hotel_id = ? AND locker_number = ?",
                    [$data['hotel_id'], $data['locker_number']]
                );
                if ($existing) json_error('Ce numéro de casier existe déjà pour cet hôtel');

                $insertId = db()->insert('hotel_lockers', [
                    'hotel_id' => (int)$data['hotel_id'],
                    'locker_number' => $data['locker_number'],
                    'locker_code' => $data['locker_code'],
                    'status' => $data['status'] ?? 'available',
                    'notes' => $data['notes'] ?? null,
                    'created_at' => date('Y-m-d H:i:s')
                ]);

                json_out(['id' => $insertId, 'message' => 'Casier créé'], 201);
            }

            // PUT /lockers/{id} - Modifier un casier
            if ($method === 'PUT' && $id) {
                $locker = db()->queryOne("SELECT * FROM hotel_lockers WHERE id = ?", [$id]);
                if (!$locker) json_error('Casier non trouvé', 404);
                if (!in_array($locker['hotel_id'], $userHotelIds)) json_error('Accès non autorisé', 403);

                $data = get_input();
                $fields = [];
                $params = [];

                foreach (['locker_number', 'locker_code', 'status', 'notes'] as $field) {
                    if (isset($data[$field])) {
                        $fields[] = "$field = ?";
                        $params[] = $data[$field] ?: null;
                    }
                }

                if (empty($fields)) json_error('Rien à modifier');
                $fields[] = "updated_at = NOW()";
                $params[] = $id;

                db()->execute(
                    "UPDATE hotel_lockers SET " . implode(', ', $fields) . " WHERE id = ?",
                    $params
                );
                json_out(['message' => 'Casier mis à jour']);
            }

            // DELETE /lockers/{id} - Supprimer un casier
            if ($method === 'DELETE' && $id) {
                $locker = db()->queryOne("SELECT * FROM hotel_lockers WHERE id = ?", [$id]);
                if (!$locker) json_error('Casier non trouvé', 404);
                if (!in_array($locker['hotel_id'], $userHotelIds)) json_error('Accès non autorisé', 403);

                // Vérifier si le casier est en cours d'utilisation
                $inUse = db()->queryOne(
                    "SELECT id FROM selfcheckin_reservations WHERE locker_id = ? AND status IN ('pending', 'confirmed', 'checked_in')",
                    [$id]
                );
                if ($inUse) json_error('Ce casier est actuellement assigné à une réservation active');

                db()->execute("DELETE FROM hotel_lockers WHERE id = ?", [$id]);
                json_out(['message' => 'Casier supprimé']);
            }
            break;

        // ==================== TARIFS SELF CHECK-IN ====================
        case 'selfcheckin-pricing':
            $user = require_auth();
            $userHotelIds = getManageableHotels($user);

            // GET /selfcheckin-pricing?hotel_id=X&from=DATE&to=DATE
            if ($method === 'GET') {
                $hotelId = $_GET['hotel_id'] ?? null;
                if (!$hotelId) json_error('hotel_id requis');
                if (!in_array($hotelId, $userHotelIds)) json_error('Accès non autorisé', 403);

                $from = $_GET['from'] ?? date('Y-m-d');
                $to = $_GET['to'] ?? date('Y-m-d', strtotime('+30 days'));

                $pricing = db()->query(
                    "SELECT * FROM selfcheckin_pricing WHERE hotel_id = ? AND date BETWEEN ? AND ? ORDER BY date",
                    [$hotelId, $from, $to]
                );

                $hotel = db()->queryOne(
                    "SELECT default_night_price, default_breakfast_price, default_tourist_tax, breakfast_start, breakfast_end FROM hotels WHERE id = ?",
                    [$hotelId]
                );

                json_out([
                    'pricing' => $pricing,
                    'defaults' => $hotel
                ]);
            }

            // POST /selfcheckin-pricing - Créer/modifier tarif pour une date
            if ($method === 'POST' && !$id) {
                $data = get_input();
                if (empty($data['hotel_id']) || empty($data['date'])) json_error('hotel_id et date requis');
                if (!in_array($data['hotel_id'], $userHotelIds)) json_error('Accès non autorisé', 403);

                $hotelId = (int)$data['hotel_id'];
                $date = $data['date'];

                $existing = db()->queryOne(
                    "SELECT id FROM selfcheckin_pricing WHERE hotel_id = ? AND date = ?",
                    [$hotelId, $date]
                );

                $pricingData = [
                    (float)($data['night_price'] ?? 0),
                    (float)($data['breakfast_price'] ?? 0),
                    (float)($data['tourist_tax'] ?? 0),
                    $data['breakfast_start'] ?? '07:00:00',
                    $data['breakfast_end'] ?? '10:30:00',
                    $data['notes'] ?? null,
                ];

                if ($existing) {
                    db()->execute(
                        "UPDATE selfcheckin_pricing SET night_price = ?, breakfast_price = ?, tourist_tax = ?, breakfast_start = ?, breakfast_end = ?, notes = ?, updated_at = NOW() WHERE id = ?",
                        array_merge($pricingData, [$existing['id']])
                    );
                    json_out(['message' => 'Tarif mis à jour', 'id' => $existing['id']]);
                } else {
                    $insertId = db()->insert('selfcheckin_pricing', [
                        'hotel_id' => $hotelId,
                        'date' => $date,
                        'night_price' => $pricingData[0],
                        'breakfast_price' => $pricingData[1],
                        'tourist_tax' => $pricingData[2],
                        'breakfast_start' => $pricingData[3],
                        'breakfast_end' => $pricingData[4],
                        'notes' => $pricingData[5],
                        'created_at' => date('Y-m-d H:i:s')
                    ]);
                    json_out(['message' => 'Tarif créé', 'id' => $insertId], 201);
                }
            }

            // POST /selfcheckin-pricing/bulk - Mise à jour en masse
            if ($method === 'POST' && $id === 'bulk') {
                $data = get_input();
                if (empty($data['hotel_id']) || empty($data['dates'])) json_error('hotel_id et dates requis');
                if (!in_array($data['hotel_id'], $userHotelIds)) json_error('Accès non autorisé', 403);

                $hotelId = (int)$data['hotel_id'];
                $nightPrice = (float)($data['night_price'] ?? 0);
                $breakfastPrice = (float)($data['breakfast_price'] ?? 0);
                $touristTax = (float)($data['tourist_tax'] ?? 0);
                $breakfastStart = $data['breakfast_start'] ?? '07:00:00';
                $breakfastEnd = $data['breakfast_end'] ?? '10:30:00';
                $notes = $data['notes'] ?? null;

                $count = 0;
                foreach ($data['dates'] as $date) {
                    $existing = db()->queryOne(
                        "SELECT id FROM selfcheckin_pricing WHERE hotel_id = ? AND date = ?",
                        [$hotelId, $date]
                    );

                    if ($existing) {
                        db()->execute(
                            "UPDATE selfcheckin_pricing SET night_price = ?, breakfast_price = ?, tourist_tax = ?, breakfast_start = ?, breakfast_end = ?, notes = ?, updated_at = NOW() WHERE id = ?",
                            [$nightPrice, $breakfastPrice, $touristTax, $breakfastStart, $breakfastEnd, $notes, $existing['id']]
                        );
                    } else {
                        db()->insert('selfcheckin_pricing', [
                            'hotel_id' => $hotelId,
                            'date' => $date,
                            'night_price' => $nightPrice,
                            'breakfast_price' => $breakfastPrice,
                            'tourist_tax' => $touristTax,
                            'breakfast_start' => $breakfastStart,
                            'breakfast_end' => $breakfastEnd,
                            'notes' => $notes,
                            'created_at' => date('Y-m-d H:i:s')
                        ]);
                    }
                    $count++;
                }

                json_out(['message' => "$count tarif(s) mis à jour"]);
            }

            // DELETE /selfcheckin-pricing/{id}
            if ($method === 'DELETE' && $id && $id !== 'bulk') {
                $pricing = db()->queryOne("SELECT * FROM selfcheckin_pricing WHERE id = ?", [$id]);
                if (!$pricing) json_error('Tarif non trouvé', 404);
                if (!in_array($pricing['hotel_id'], $userHotelIds)) json_error('Accès non autorisé', 403);

                db()->execute("DELETE FROM selfcheckin_pricing WHERE id = ?", [$id]);
                json_out(['message' => 'Tarif supprimé']);
            }
            break;

        default:
            json_error('Endpoint non trouvé', 404);
    }

} catch (PDOException $e) {
    json_error(DEBUG ? $e->getMessage() : 'Erreur serveur', 500);
} catch (Exception $e) {
    json_error($e->getMessage(), 500);
}

// ==================== SELF CHECK-IN HELPER FUNCTIONS ====================

/**
 * Formater les données de confirmation pour l'affichage client
 */
function selfcheckin_format_confirmation($reservation, $hotel) {
    return [
        'id' => (int)$reservation['id'],
        'reservation_number' => $reservation['reservation_number'],
        'type' => $reservation['type'],
        'guest_first_name' => $reservation['guest_first_name'],
        'guest_last_name' => $reservation['guest_last_name'],
        'guest_email' => $reservation['guest_email'],
        'guest_phone' => $reservation['guest_phone'],
        'checkin_date' => $reservation['checkin_date'],
        'room_number' => $reservation['room_number'],
        'locker_number' => $reservation['locker_number'],
        'locker_code' => $reservation['locker_code'],
        'nb_adults' => (int)$reservation['nb_adults'],
        'nb_children' => (int)$reservation['nb_children'],
        'accommodation_price' => (float)$reservation['accommodation_price'],
        'tourist_tax_amount' => (float)$reservation['tourist_tax_amount'],
        'breakfast_included' => (bool)$reservation['breakfast_included'],
        'breakfast_price' => (float)$reservation['breakfast_price'],
        'total_amount' => (float)$reservation['total_amount'],
        'deposit_amount' => (float)$reservation['deposit_amount'],
        'remaining_amount' => (float)$reservation['remaining_amount'],
        'payment_status' => $reservation['payment_status'],
        'hotel_name' => $hotel['name'],
        'hotel_address' => $hotel['address'],
        'hotel_city' => $hotel['city'],
    ];
}
