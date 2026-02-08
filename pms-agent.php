#!/usr/bin/env php
<?php
/**
 * ACL GESTION - Agent Relais PMS
 *
 * Ce script tourne sur le PC de l'hôtel (même réseau que GeHo).
 * Il se connecte au serveur ACL en long-polling pour récupérer les requêtes PMS,
 * les exécute en local contre GeHo, et renvoie les réponses.
 *
 * INSTALLATION :
 * 1. Copier ce fichier sur le PC où GeHo est installé
 * 2. Configurer les variables ci-dessous (ACL_URL, RELAY_TOKEN, GEHO_IP, GEHO_PORT)
 * 3. Lancer : php pms-agent.php
 * 4. Pour un service permanent : créer une tâche planifiée ou un service Windows
 *
 * CONFIGURATION WINDOWS (Tâche planifiée) :
 * - Programme : C:\php\php.exe (ou chemin vers php.exe)
 * - Arguments : C:\chemin\vers\pms-agent.php
 * - Démarrer dans : C:\chemin\vers\
 * - Déclencheur : Au démarrage de l'ordinateur
 * - Paramètres : Autoriser l'exécution à la demande, ne pas arrêter
 */

// ===================== CONFIGURATION =====================

// URL de votre serveur ACL (sans slash final)
// IMPORTANT : inclure index.php dans le chemin
define('ACL_URL', 'https://acl-gestion.com/api/index.php');

// Token de relais (généré dans Administration > Hôtel > PMS > Mode Relais)
define('RELAY_TOKEN', 'VOTRE_TOKEN_ICI');

// Adresse IP et port du PMS GeHo en local
define('GEHO_IP', '127.0.0.1');
define('GEHO_PORT', 80);

// Authentification GeHo (laisser vide si pas nécessaire)
define('GEHO_USERNAME', '');
define('GEHO_PASSWORD', '');

// ===================== FIN CONFIGURATION =====================

// Ne pas modifier en dessous de cette ligne
define('AGENT_VERSION', '1.0.0');
define('POLL_RETRY_DELAY', 3);      // Secondes entre les tentatives si erreur
define('MAX_CONSECUTIVE_ERRORS', 10); // Arrêt après N erreurs consécutives

echo "╔══════════════════════════════════════════════╗\n";
echo "║  ACL GESTION - Agent Relais PMS v" . AGENT_VERSION . "      ║\n";
echo "╠══════════════════════════════════════════════╣\n";
echo "║  Serveur ACL : " . str_pad(ACL_URL, 29) . "║\n";
echo "║  GeHo local  : " . str_pad(GEHO_IP . ':' . GEHO_PORT, 29) . "║\n";
echo "╚══════════════════════════════════════════════╝\n\n";

if (RELAY_TOKEN === 'VOTRE_TOKEN_ICI' || empty(RELAY_TOKEN)) {
    echo "[ERREUR] Veuillez configurer le RELAY_TOKEN dans ce fichier.\n";
    echo "         Vous pouvez le générer depuis l'administration ACL > Hôtel > PMS.\n";
    exit(1);
}

$consecutiveErrors = 0;

// Boucle principale
while (true) {
    try {
        // 1. Récupérer une requête en attente (long-polling)
        $request = pollForRequest();

        if ($request === null) {
            // Pas de requête, le long-polling a expiré, on relance
            $consecutiveErrors = 0;
            continue;
        }

        $consecutiveErrors = 0;
        $reqId = $request['request_id'];
        $endpoint = $request['endpoint'];
        $method = $request['method'] ?? 'GET';
        $body = $request['body'] ?? null;

        logMsg("Requête reçue: {$method} {$endpoint} [{$reqId}]");

        // 2. Exécuter la requête en local contre GeHo
        $result = callGehoLocal($endpoint, $method, $body);

        // 3. Renvoyer la réponse au serveur ACL
        sendResponse($reqId, $result);

        logMsg("Réponse envoyée: HTTP {$result['http_status']} [{$reqId}]");

    } catch (Exception $e) {
        $consecutiveErrors++;
        logMsg("ERREUR: " . $e->getMessage(), 'error');

        if ($consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            logMsg("Trop d'erreurs consécutives ({$consecutiveErrors}). Arrêt de l'agent.", 'error');
            logMsg("Vérifiez la connexion réseau et la configuration.", 'error');
            exit(1);
        }

        sleep(POLL_RETRY_DELAY);
    }
}

// ===================== FONCTIONS =====================

/**
 * Long-polling : interroge le serveur ACL pour récupérer une requête PMS en attente
 */
function pollForRequest() {
    $url = ACL_URL . '/pms-relay/poll?token=' . urlencode(RELAY_TOKEN);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,          // Le serveur attend 25s max, on met 30 côté client
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_HTTPHEADER => [
            'X-Relay-Token: ' . RELAY_TOKEN,
            'X-Agent-Version: ' . AGENT_VERSION,
            'Accept: application/json',
        ],
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error) {
        throw new Exception("Connexion au serveur ACL échouée: {$error}");
    }

    if ($httpCode === 401 || $httpCode === 403) {
        throw new Exception("Token relais invalide ou relais non configuré (HTTP {$httpCode})");
    }

    if ($httpCode !== 200) {
        throw new Exception("Réponse serveur ACL inattendue: HTTP {$httpCode}");
    }

    $data = json_decode($response, true);
    if (!is_array($data)) {
        throw new Exception("Réponse serveur ACL invalide (JSON)");
    }

    return $data['request'] ?? null;
}

/**
 * Exécute une requête HTTP en local contre le PMS GeHo
 */
function callGehoLocal($endpoint, $method, $body) {
    $url = 'http://' . GEHO_IP . ':' . GEHO_PORT . '/' . ltrim($endpoint, '/');

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Accept: application/json',
        ],
    ]);

    if (!empty(GEHO_USERNAME) && !empty(GEHO_PASSWORD)) {
        curl_setopt($ch, CURLOPT_USERPWD, GEHO_USERNAME . ':' . GEHO_PASSWORD);
    }

    if ($method === 'POST' || $method === 'PUT') {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        if ($body) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        }
    }

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error) {
        return [
            'http_status' => 0,
            'response' => null,
            'error' => "Connexion GeHo locale échouée: {$error}"
        ];
    }

    $decoded = json_decode($response, true);

    return [
        'http_status' => $httpCode,
        'response' => $decoded,
        'error' => null
    ];
}

/**
 * Envoie la réponse PMS au serveur ACL
 */
function sendResponse($requestId, $result) {
    $url = ACL_URL . '/pms-relay/response';

    $payload = [
        'request_id' => $requestId,
        'http_status' => $result['http_status'],
        'response' => $result['response'],
        'error' => $result['error']
    ];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'X-Relay-Token: ' . RELAY_TOKEN,
            'Accept: application/json',
        ],
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error || $httpCode !== 200) {
        throw new Exception("Erreur envoi réponse au serveur ACL: " . ($error ?: "HTTP {$httpCode}"));
    }
}

/**
 * Affiche un message horodaté
 */
function logMsg($msg, $level = 'info') {
    $timestamp = date('Y-m-d H:i:s');
    $prefix = $level === 'error' ? '!!' : '>>';
    echo "[{$timestamp}] {$prefix} {$msg}\n";
}
