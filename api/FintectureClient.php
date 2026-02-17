<?php
/**
 * ACL GESTION - Fintecture Client
 * Integration paiement par virement via Open Banking PSD2
 * Documentation : https://docs.fintecture.com
 */

class FintectureClient {

    private $appId;
    private $appSecret;
    private $privateKeyPath;
    private $environment;
    private $accessToken;

    private const SANDBOX_URL = 'https://api-sandbox.fintecture.com';
    private const PRODUCTION_URL = 'https://api.fintecture.com';

    /**
     * @param string $appId App ID Fintecture
     * @param string $appSecret App Secret Fintecture
     * @param string $privateKeyPath Chemin vers la cle privee RSA
     * @param string $environment 'sandbox' ou 'production'
     */
    public function __construct($appId, $appSecret, $privateKeyPath, $environment = 'sandbox') {
        $this->appId = $appId;
        $this->appSecret = $appSecret;
        $this->privateKeyPath = $privateKeyPath;
        $this->environment = $environment;
    }

    /**
     * Creer une instance depuis la config BDD d'un hotel
     * @param int $hotelId
     * @return FintectureClient|null
     */
    public static function fromHotelConfig($hotelId) {
        $config = db()->queryOne(
            "SELECT * FROM fintecture_config WHERE hotel_id = ? AND is_active = 1",
            [$hotelId]
        );

        if (!$config) return null;
        if (empty($config['app_id']) || empty($config['app_secret'])) return null;

        return new self(
            $config['app_id'],
            $config['app_secret'],
            $config['private_key_path'] ?? '',
            $config['environment'] ?? 'sandbox'
        );
    }

    /**
     * URL de base selon l'environnement
     * @return string
     */
    private function getBaseUrl() {
        return $this->environment === 'production' ? self::PRODUCTION_URL : self::SANDBOX_URL;
    }

    /**
     * Authentification OAuth2 (client_credentials)
     * @return string Access token
     * @throws Exception
     */
    private function authenticate() {
        if ($this->accessToken) return $this->accessToken;

        $url = $this->getBaseUrl() . '/oauth/accesstoken';
        $credentials = base64_encode($this->appId . ':' . $this->appSecret);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTPHEADER => [
                'Authorization: Basic ' . $credentials,
                'Content-Type: application/x-www-form-urlencoded',
                'Accept: application/json'
            ],
            CURLOPT_POSTFIELDS => http_build_query([
                'grant_type' => 'client_credentials',
                'scope' => 'PIS'
            ])
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) throw new Exception('Erreur connexion Fintecture: ' . $error);
        if ($httpCode !== 200) {
            $data = json_decode($response, true);
            throw new Exception('Erreur auth Fintecture: ' . ($data['message'] ?? 'Code ' . $httpCode));
        }

        $data = json_decode($response, true);
        $this->accessToken = $data['access_token'] ?? null;

        if (!$this->accessToken) {
            throw new Exception('Token Fintecture non recu');
        }

        return $this->accessToken;
    }

    /**
     * Initier un paiement Request-to-Pay
     * @param array $invoice Donnees facture (total_ttc, invoice_number, currency)
     * @param array $supplier Donnees fournisseur (name, iban, bic)
     * @param string $redirectUrl URL de retour apres paiement
     * @return array ['session_id' => string, 'redirect_url' => string]
     * @throws Exception
     */
    public function initiatePayment($invoice, $supplier, $redirectUrl) {
        $token = $this->authenticate();

        $payload = [
            'meta' => [
                'psu_name' => $supplier['name'],
                'psu_email' => $supplier['contact_email'] ?? '',
                'psu_ip' => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1'
            ],
            'data' => [
                'type' => 'request-to-pay',
                'attributes' => [
                    'amount' => number_format((float)$invoice['total_ttc'], 2, '.', ''),
                    'currency' => $invoice['currency'] ?? 'EUR',
                    'communication' => 'Facture ' . ($invoice['invoice_number'] ?? $invoice['id']),
                    'beneficiary' => [
                        'name' => $supplier['name'],
                        'iban' => $supplier['iban'] ?? '',
                        'swift_bic' => $supplier['bic'] ?? ''
                    ],
                    'end_to_end_id' => 'INV-' . ($invoice['id'] ?? uniqid())
                ]
            ]
        ];

        $url = $this->getBaseUrl() . '/pis/v2/request-to-pay';

        $headers = [
            'Authorization: Bearer ' . $token,
            'Content-Type: application/json',
            'Accept: application/json',
            'app_id: ' . $this->appId
        ];

        // Signer la requete si cle privee disponible
        $body = json_encode($payload);
        $signature = $this->signPayload($body);
        if ($signature) {
            $headers[] = 'Signature: ' . $signature;
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_POSTFIELDS => $body
        ]);

        // Ajouter l'URL de redirection
        $urlWithRedirect = $url . '?redirect_uri=' . urlencode($redirectUrl);
        curl_setopt($ch, CURLOPT_URL, $urlWithRedirect);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) throw new Exception('Erreur connexion Fintecture: ' . $error);

        $data = json_decode($response, true);

        if ($httpCode < 200 || $httpCode >= 300) {
            $msg = $data['errors'][0]['detail'] ?? $data['message'] ?? 'Erreur Fintecture (code ' . $httpCode . ')';
            throw new Exception($msg);
        }

        $sessionId = $data['meta']['session_id'] ?? null;
        $paymentUrl = $data['meta']['url'] ?? null;

        if (!$sessionId) {
            throw new Exception('Session ID Fintecture non recu');
        }

        return [
            'session_id' => $sessionId,
            'redirect_url' => $paymentUrl,
            'status' => 'initiated'
        ];
    }

    /**
     * Obtenir le statut d'un paiement
     * @param string $sessionId ID de session Fintecture
     * @return array ['status' => string, 'raw' => array]
     * @throws Exception
     */
    public function getPaymentStatus($sessionId) {
        $token = $this->authenticate();

        $url = $this->getBaseUrl() . '/pis/v2/payments/' . urlencode($sessionId);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $token,
                'Accept: application/json',
                'app_id: ' . $this->appId
            ]
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) throw new Exception('Erreur connexion Fintecture: ' . $error);

        $data = json_decode($response, true);

        if ($httpCode !== 200) {
            $msg = $data['errors'][0]['detail'] ?? 'Erreur Fintecture (code ' . $httpCode . ')';
            throw new Exception($msg);
        }

        // Mapper le statut Fintecture vers nos statuts internes
        $fintectureStatus = $data['meta']['status'] ?? 'unknown';
        $internalStatus = self::mapStatus($fintectureStatus);

        return [
            'status' => $internalStatus,
            'fintecture_status' => $fintectureStatus,
            'provider' => $data['meta']['provider'] ?? null,
            'raw' => $data
        ];
    }

    /**
     * Verifier la signature d'un webhook Fintecture
     * @param string $payload Body brut du webhook
     * @param string $signature Signature envoyee dans le header
     * @param string $webhookSecret Secret webhook configure
     * @return bool
     */
    public static function verifyWebhook($payload, $signature, $webhookSecret) {
        if (empty($signature) || empty($webhookSecret)) return false;

        // Fintecture utilise HMAC-SHA256 pour les signatures webhook
        $expectedSignature = hash_hmac('sha256', $payload, $webhookSecret);

        return hash_equals($expectedSignature, $signature);
    }

    /**
     * Parser les donnees webhook
     * @param string $payload Body brut JSON
     * @return array|null Donnees parsees
     */
    public static function parseWebhookPayload($payload) {
        $data = json_decode($payload, true);
        if (!$data) return null;

        $sessionId = $data['meta']['session_id'] ?? null;
        $status = $data['meta']['status'] ?? null;

        if (!$sessionId || !$status) return null;

        return [
            'session_id' => $sessionId,
            'status' => self::mapStatus($status),
            'fintecture_status' => $status,
            'provider' => $data['meta']['provider'] ?? null,
            'raw' => $data
        ];
    }

    /**
     * Mapper les statuts Fintecture vers les statuts internes
     * @param string $fintectureStatus
     * @return string
     */
    private static function mapStatus($fintectureStatus) {
        $map = [
            'payment_created' => 'initiated',
            'payment_pending' => 'pending',
            'payment_initiated' => 'pending',
            'sca_required' => 'pending',
            'payment_unsuccessful' => 'failed',
            'payment_error' => 'failed',
            'payment_expired' => 'failed',
            'payment_cancelled' => 'cancelled',
            'payment_executed' => 'completed',
            'payment_received' => 'completed'
        ];

        return $map[strtolower($fintectureStatus)] ?? 'pending';
    }

    /**
     * Signer le payload avec la cle privee RSA
     * @param string $payload Contenu a signer
     * @return string|null Signature base64 ou null
     */
    private function signPayload($payload) {
        if (empty($this->privateKeyPath) || !file_exists($this->privateKeyPath)) {
            return null;
        }

        $privateKey = file_get_contents($this->privateKeyPath);
        if (!$privateKey) return null;

        $key = openssl_pkey_get_private($privateKey);
        if (!$key) return null;

        $digest = hash('sha256', $payload, true);
        $signature = '';
        $signed = openssl_sign($digest, $signature, $key, OPENSSL_ALGO_SHA256);

        if (!$signed) return null;

        return base64_encode($signature);
    }

    /**
     * Tester la connexion Fintecture
     * @return array ['success' => bool, 'environment' => string, 'error' => string|null]
     */
    public function testConnection() {
        try {
            $this->authenticate();
            return [
                'success' => true,
                'environment' => $this->environment,
                'error' => null
            ];
        } catch (Exception $e) {
            return [
                'success' => false,
                'environment' => $this->environment,
                'error' => $e->getMessage()
            ];
        }
    }
}
