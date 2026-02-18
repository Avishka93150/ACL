<?php
/**
 * ACL GESTION - OCR Client (v2 - Optimise)
 *
 * Pipeline rapide :
 *   PDF numerique → pdftotext (instant) → Claude AI texte
 *   PDF scanne / Image → Ghostscript 150dpi → Claude Vision (base64)
 *
 * Elimination de Tesseract : Claude Vision lit directement les images.
 * Prerequis serveur : ghostscript (gs), pdftotext (optionnel)
 */

class OcrClient {

    /** Nombre max de pages a traiter */
    const MAX_PAGES = 3;

    /** DPI pour conversion PDF → PNG (150 = rapide, suffisant pour Claude Vision) */
    const GS_DPI = 150;

    /**
     * Pipeline complet : fichier → JSON structure
     * @param string $filePath Chemin absolu du fichier (PDF ou image)
     * @param string $apiKey Cle API Anthropic
     * @param string $model Modele Claude a utiliser
     * @return array ['success' => bool, 'data' => [...], 'raw_text' => string, 'confidence' => float]
     */
    public static function processInvoice($filePath, $apiKey, $model = 'claude-sonnet-4-5-20250929') {
        if (!file_exists($filePath)) {
            return ['success' => false, 'error' => 'Fichier introuvable'];
        }

        if (empty($apiKey)) {
            return [
                'success' => false,
                'data' => null,
                'raw_text' => '',
                'confidence' => 0,
                'error' => 'Cle API Anthropic non configuree'
            ];
        }

        $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
        $startTime = microtime(true);

        // === STRATEGIE 1 : PDF numerique → pdftotext (ultra-rapide) ===
        if ($ext === 'pdf') {
            $nativeText = self::pdfToTextFast($filePath);

            // Si le PDF contient du texte natif exploitable (> 50 chars), on skip le pipeline image
            if (strlen(trim($nativeText)) > 50) {
                $structured = self::structureWithClaudeText($nativeText, $apiKey, $model);
                $elapsed = round(microtime(true) - $startTime, 2);
                return [
                    'success' => $structured['success'],
                    'data' => $structured['data'] ?? null,
                    'raw_text' => $nativeText,
                    'confidence' => $structured['confidence'] ?? 0,
                    'usage' => $structured['usage'] ?? null,
                    'error' => $structured['error'] ?? null,
                    'pipeline' => 'pdftotext+claude_text',
                    'elapsed_seconds' => $elapsed
                ];
            }

            // === STRATEGIE 2 : PDF scanne → Ghostscript → Claude Vision ===
            $images = self::pdfToImages($filePath);
            if (!empty($images)) {
                $structured = self::structureWithClaudeVision($images, $apiKey, $model);
                self::cleanupFiles($images);
                $elapsed = round(microtime(true) - $startTime, 2);
                return [
                    'success' => $structured['success'],
                    'data' => $structured['data'] ?? null,
                    'raw_text' => $structured['raw_text'] ?? '',
                    'confidence' => $structured['confidence'] ?? 0,
                    'usage' => $structured['usage'] ?? null,
                    'error' => $structured['error'] ?? null,
                    'pipeline' => 'ghostscript+claude_vision',
                    'elapsed_seconds' => $elapsed
                ];
            }

            return ['success' => false, 'error' => 'Impossible de traiter le PDF'];
        }

        // === STRATEGIE 3 : Image directe → Claude Vision ===
        if (in_array($ext, ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'bmp', 'webp'])) {
            $structured = self::structureWithClaudeVision([$filePath], $apiKey, $model);
            $elapsed = round(microtime(true) - $startTime, 2);
            return [
                'success' => $structured['success'],
                'data' => $structured['data'] ?? null,
                'raw_text' => $structured['raw_text'] ?? '',
                'confidence' => $structured['confidence'] ?? 0,
                'usage' => $structured['usage'] ?? null,
                'error' => $structured['error'] ?? null,
                'pipeline' => 'claude_vision',
                'elapsed_seconds' => $elapsed
            ];
        }

        return ['success' => false, 'error' => 'Format non supporte : ' . $ext];
    }

    /**
     * Extraction texte natif PDF via pdftotext (ultra-rapide, < 0.1s)
     * Fonctionne uniquement pour les PDF numeriques (pas les scans)
     */
    private static function pdfToTextFast($pdfPath) {
        $output = [];
        // -layout preserve la mise en page (utile pour les montants alignés)
        @exec(sprintf('pdftotext -layout %s - 2>&1', escapeshellarg($pdfPath)), $output, $returnCode);
        if ($returnCode === 0) {
            return implode("\n", $output);
        }
        // Fallback sans -layout
        $output = [];
        @exec(sprintf('pdftotext %s - 2>&1', escapeshellarg($pdfPath)), $output, $returnCode);
        if ($returnCode === 0) {
            return implode("\n", $output);
        }
        return '';
    }

    /**
     * Conversion PDF → PNG via Ghostscript (150 DPI, max 3 pages)
     * @return array Chemins des images générées
     */
    private static function pdfToImages($pdfPath) {
        $tmpDir = sys_get_temp_dir() . '/ocr_' . uniqid();
        @mkdir($tmpDir, 0755, true);

        // Limiter aux N premières pages avec -dLastPage
        $gsCmd = sprintf(
            'gs -dNOPAUSE -dBATCH -dQUIET -sDEVICE=png16m -r%d -dLastPage=%d -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -sOutputFile=%s/page_%%03d.png %s 2>&1',
            self::GS_DPI,
            self::MAX_PAGES,
            escapeshellarg($tmpDir),
            escapeshellarg($pdfPath)
        );
        @exec($gsCmd, $gsOutput, $gsReturn);

        if ($gsReturn !== 0) {
            self::cleanupDir($tmpDir);
            return [];
        }

        $pages = glob($tmpDir . '/page_*.png');
        sort($pages);
        return $pages;
    }

    /**
     * Structuration via Claude AI en mode TEXTE (pour PDF numeriques)
     * Plus rapide car pas d'encodage base64 et moins de tokens
     */
    private static function structureWithClaudeText($rawText, $apiKey, $model) {
        if (empty(trim($rawText))) {
            return ['success' => false, 'error' => 'Aucun texte extrait'];
        }

        // Tronquer à 15000 chars max pour éviter des prompts trop longs
        if (strlen($rawText) > 15000) {
            $rawText = substr($rawText, 0, 15000) . "\n\n[... texte tronque ...]";
        }

        $prompt = self::getExtractionPrompt();
        $prompt .= "\n\nTexte de la facture :\n" . $rawText;

        return self::callClaudeAPI($apiKey, $model, [
            ['role' => 'user', 'content' => $prompt]
        ]);
    }

    /**
     * Structuration via Claude Vision (pour images et PDF scannes)
     * Envoie les images en base64 directement à Claude — pas besoin de Tesseract
     */
    private static function structureWithClaudeVision($imagePaths, $apiKey, $model) {
        if (empty($imagePaths)) {
            return ['success' => false, 'error' => 'Aucune image fournie'];
        }

        // Construire le contenu multimodal
        $contentBlocks = [];
        foreach ($imagePaths as $imgPath) {
            $imageData = @file_get_contents($imgPath);
            if (!$imageData) continue;

            // Compresser si l'image est trop grande (> 1.5 Mo) pour réduire les tokens
            $fileSize = strlen($imageData);
            $ext = strtolower(pathinfo($imgPath, PATHINFO_EXTENSION));
            $mediaType = ($ext === 'png') ? 'image/png' : 'image/jpeg';

            if ($fileSize > 1500000 && function_exists('imagecreatefromstring')) {
                $compressed = self::compressImage($imageData, $ext);
                if ($compressed) {
                    $imageData = $compressed;
                    $mediaType = 'image/jpeg';
                }
            }

            $contentBlocks[] = [
                'type' => 'image',
                'source' => [
                    'type' => 'base64',
                    'media_type' => $mediaType,
                    'data' => base64_encode($imageData)
                ]
            ];
        }

        if (empty($contentBlocks)) {
            return ['success' => false, 'error' => 'Impossible de lire les images'];
        }

        // Ajouter le prompt texte
        $contentBlocks[] = [
            'type' => 'text',
            'text' => self::getExtractionPrompt()
        ];

        return self::callClaudeAPI($apiKey, $model, [
            ['role' => 'user', 'content' => $contentBlocks]
        ]);
    }

    /**
     * Appel unique API Claude (factorisé pour texte et vision)
     */
    private static function callClaudeAPI($apiKey, $model, $messages) {
        $ch = curl_init('https://api.anthropic.com/v1/messages');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'x-api-key: ' . $apiKey,
                'anthropic-version: 2023-06-01'
            ],
            CURLOPT_POSTFIELDS => json_encode([
                'model' => $model,
                'max_tokens' => 2048,
                'messages' => $messages
            ])
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($curlError) {
            return ['success' => false, 'error' => 'Erreur connexion API Anthropic: ' . $curlError];
        }

        if ($httpCode !== 200) {
            $errorData = json_decode($response, true);
            $errorMsg = $errorData['error']['message'] ?? 'Erreur API Anthropic (code ' . $httpCode . ')';
            return ['success' => false, 'error' => $errorMsg];
        }

        $result = json_decode($response, true);

        // Usage
        $usage = null;
        if (isset($result['usage'])) {
            $usage = [
                'input_tokens' => $result['usage']['input_tokens'] ?? 0,
                'output_tokens' => $result['usage']['output_tokens'] ?? 0,
                'model' => $model
            ];
        }

        // Extraire le contenu texte
        $content = '';
        if (!empty($result['content'])) {
            foreach ($result['content'] as $block) {
                if ($block['type'] === 'text') $content .= $block['text'];
            }
        }

        if (empty($content)) {
            return ['success' => false, 'error' => 'Reponse vide de l\'API', 'usage' => $usage];
        }

        // Parser le JSON
        $jsonStr = $content;
        if (preg_match('/```(?:json)?\s*([\s\S]*?)```/', $jsonStr, $matches)) {
            $jsonStr = $matches[1];
        }
        $jsonStr = trim($jsonStr);

        $data = json_decode($jsonStr, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return [
                'success' => false,
                'error' => 'Reponse IA non parsable en JSON',
                'raw_response' => $content,
                'usage' => $usage
            ];
        }

        $confidence = $data['confidence']['overall'] ?? 0;

        return [
            'success' => true,
            'data' => $data,
            'confidence' => (float) $confidence,
            'usage' => $usage
        ];
    }

    /**
     * Prompt d'extraction facture (partage entre texte et vision)
     */
    private static function getExtractionPrompt() {
        return <<<'PROMPT'
Tu es un expert en extraction de donnees de factures fournisseurs francaises. Analyse cette facture et extrais les informations structurees en JSON.

IMPORTANT : Retourne UNIQUEMENT un objet JSON valide, sans texte avant ni apres.

Structure attendue :
{
  "supplier": {
    "name": "Raison sociale du fournisseur",
    "siret": "N SIRET (14 chiffres) ou null",
    "siren": "N SIREN (9 chiffres) ou null",
    "tva_number": "N TVA intracommunautaire (ex: FR12345678901) ou null",
    "address": "Adresse complete ou null",
    "contact_email": "Email ou null",
    "contact_phone": "Telephone ou null",
    "iban": "IBAN (FR76...) ou null",
    "bic": "Code BIC/SWIFT ou null"
  },
  "invoice": {
    "invoice_number": "Numero de facture",
    "invoice_date": "YYYY-MM-DD",
    "due_date": "YYYY-MM-DD ou null",
    "total_ht": 0.00,
    "total_tva": 0.00,
    "total_ttc": 0.00,
    "currency": "EUR",
    "po_number": "N bon de commande ou null"
  },
  "line_items": [
    {
      "description": "Description de la ligne",
      "quantity": 1,
      "unit_price_ht": 0.00,
      "tva_rate": 20.00,
      "total_ht": 0.00,
      "suggested_category": "Categorie suggeree parmi: Alimentation, Boissons, Entretien, Nettoyage, Fournitures, Electricite, Eau, Gaz, Telecom, Assurance, Maintenance, Blanchisserie, Amenities, Decoration, Equipement, Informatique, Marketing, Juridique, Comptabilite, Divers"
    }
  ],
  "confidence": {
    "overall": 85,
    "supplier_name": 95,
    "invoice_number": 90,
    "amounts": 80,
    "dates": 75,
    "line_items": 70
  }
}

Notes :
- Les montants doivent etre des nombres decimaux (pas de symboles monetaires)
- Les dates en format ISO YYYY-MM-DD
- Si une information est illisible ou absente, mettre null
- Le score de confiance (0-100) reflete la fiabilite de chaque champ extrait
- Pour les taux TVA francais, utiliser 20.00, 10.00, 5.50 ou 2.10
- Si plusieurs taux TVA sont presents, creer une ligne par taux
- Pour le fournisseur, extraire le SIRET/SIREN et le N TVA s'ils sont visibles
- Pour l'IBAN/BIC, les extraire s'ils apparaissent dans la zone de paiement (RIB, coordonnees bancaires)
- Pour suggested_category, choisir la categorie la plus pertinente
- Si total_ht et total_ttc sont presents, verifier que total_ttc = total_ht + total_tva
PROMPT;
    }

    /**
     * Compresser une image pour réduire la taille base64
     */
    private static function compressImage($imageData, $ext) {
        $img = @imagecreatefromstring($imageData);
        if (!$img) return null;

        ob_start();
        imagejpeg($img, null, 75);
        $compressed = ob_get_clean();
        imagedestroy($img);

        return $compressed;
    }

    /**
     * Nettoyer des fichiers temporaires
     */
    private static function cleanupFiles($files) {
        $dirs = [];
        foreach ($files as $file) {
            if (is_file($file)) {
                $dir = dirname($file);
                @unlink($file);
                $dirs[$dir] = true;
            }
        }
        foreach (array_keys($dirs) as $dir) {
            if ($dir !== sys_get_temp_dir()) {
                @rmdir($dir);
            }
        }
    }

    /**
     * Nettoyer un repertoire temporaire
     */
    private static function cleanupDir($dir) {
        if (!is_dir($dir)) return;
        $files = glob($dir . '/*');
        foreach ($files as $file) {
            if (is_file($file)) @unlink($file);
        }
        @rmdir($dir);
    }

    /**
     * Verifier que les prerequis sont installes
     */
    public static function checkPrerequisites() {
        $ghostscript = false;
        $pdftotext = false;

        if (!function_exists('exec') || in_array('exec', array_map('trim', explode(',', ini_get('disable_functions'))))) {
            return [
                'ghostscript' => false,
                'pdftotext' => false,
                'gd' => extension_loaded('gd'),
                'exec_disabled' => true
            ];
        }

        $gOutput = [];
        @exec('gs --version 2>&1', $gOutput, $gReturn);
        if ($gReturn === 0) {
            $ghostscript = true;
        }

        $pOutput = [];
        @exec('pdftotext -v 2>&1', $pOutput, $pReturn);
        if ($pReturn === 0 || $pReturn === 99) {
            $pdftotext = true;
        }

        return [
            'ghostscript' => $ghostscript,
            'pdftotext' => $pdftotext,
            'gd' => extension_loaded('gd')
        ];
    }
}
