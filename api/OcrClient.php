<?php
/**
 * ACL GESTION - OCR Client
 * Pipeline : PDF/Image -> Tesseract (extraction texte) -> Claude AI (structuration JSON)
 * Prerequis serveur : apt-get install tesseract-ocr tesseract-ocr-fra ghostscript
 */

class OcrClient {

    /**
     * Pipeline complet : fichier -> texte OCR -> JSON structure
     * @param string $filePath Chemin absolu du fichier (PDF ou image)
     * @param string $apiKey Cle API Anthropic
     * @param string $model Modele Claude a utiliser
     * @return array ['success' => bool, 'data' => [...], 'raw_text' => string, 'confidence' => float]
     */
    public static function processInvoice($filePath, $apiKey, $model = 'claude-sonnet-4-5-20250929') {
        if (!file_exists($filePath)) {
            return ['success' => false, 'error' => 'Fichier introuvable'];
        }

        $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));

        // Etape 1 : Extraction texte via Tesseract
        $rawText = '';
        $ocrSuccess = false;

        if ($ext === 'pdf') {
            $rawText = self::extractFromPdf($filePath);
        } elseif (in_array($ext, ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'bmp'])) {
            $rawText = self::extractFromImage($filePath);
        } else {
            return ['success' => false, 'error' => 'Format non supporte : ' . $ext];
        }

        if (!empty(trim($rawText))) {
            $ocrSuccess = true;
        }

        // Etape 2 : Structuration via Claude AI
        if (empty($apiKey)) {
            return [
                'success' => $ocrSuccess,
                'data' => null,
                'raw_text' => $rawText,
                'confidence' => 0,
                'error' => 'Cle API Anthropic non configuree - OCR texte brut uniquement'
            ];
        }

        $structured = self::structureWithClaude($rawText, $apiKey, $model);

        return [
            'success' => $structured['success'],
            'data' => $structured['data'] ?? null,
            'raw_text' => $rawText,
            'confidence' => $structured['confidence'] ?? 0,
            'usage' => $structured['usage'] ?? null,
            'error' => $structured['error'] ?? null
        ];
    }

    /**
     * Extraction texte depuis un PDF via Ghostscript + Tesseract
     * @param string $pdfPath Chemin du PDF
     * @return string Texte extrait
     */
    private static function extractFromPdf($pdfPath) {
        $tmpDir = sys_get_temp_dir() . '/ocr_' . uniqid();
        mkdir($tmpDir, 0755, true);

        try {
            // PDF -> PNG (300 DPI) via Ghostscript
            $gsCmd = sprintf(
                'gs -dNOPAUSE -dBATCH -sDEVICE=png16m -r300 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -sOutputFile=%s/page_%%03d.png %s 2>&1',
                escapeshellarg($tmpDir),
                escapeshellarg($pdfPath)
            );
            exec($gsCmd, $gsOutput, $gsReturn);

            if ($gsReturn !== 0) {
                // Fallback : essayer pdftotext directement
                $text = self::pdfToTextFallback($pdfPath);
                self::cleanupDir($tmpDir);
                return $text;
            }

            // OCR chaque page
            $pages = glob($tmpDir . '/page_*.png');
            sort($pages);
            $fullText = '';

            foreach ($pages as $pageFile) {
                $text = self::extractFromImage($pageFile);
                if (!empty(trim($text))) {
                    $fullText .= $text . "\n\n--- PAGE ---\n\n";
                }
            }

            self::cleanupDir($tmpDir);
            return trim($fullText);

        } catch (Exception $e) {
            self::cleanupDir($tmpDir);
            return '';
        }
    }

    /**
     * Extraction texte depuis une image via Tesseract
     * @param string $imagePath Chemin de l'image
     * @return string Texte extrait
     */
    private static function extractFromImage($imagePath) {
        $outputBase = sys_get_temp_dir() . '/ocr_out_' . uniqid();

        $cmd = sprintf(
            'tesseract %s %s -l fra+eng --oem 3 --psm 6 2>&1',
            escapeshellarg($imagePath),
            escapeshellarg($outputBase)
        );
        exec($cmd, $output, $returnCode);

        $text = '';
        $outputFile = $outputBase . '.txt';
        if (file_exists($outputFile)) {
            $text = file_get_contents($outputFile);
            unlink($outputFile);
        }

        return $text;
    }

    /**
     * Fallback : extraction texte natif PDF (sans OCR)
     * @param string $pdfPath Chemin du PDF
     * @return string Texte extrait
     */
    private static function pdfToTextFallback($pdfPath) {
        $output = [];
        exec(sprintf('pdftotext %s - 2>&1', escapeshellarg($pdfPath)), $output, $returnCode);
        if ($returnCode === 0) {
            return implode("\n", $output);
        }
        return '';
    }

    /**
     * Structuration du texte OCR via Claude AI
     * @param string $rawText Texte brut OCR
     * @param string $apiKey Cle API Anthropic
     * @param string $model Modele Claude
     * @return array ['success' => bool, 'data' => [...], 'confidence' => float, 'usage' => [...]]
     */
    private static function structureWithClaude($rawText, $apiKey, $model) {
        if (empty(trim($rawText))) {
            return ['success' => false, 'error' => 'Aucun texte extrait par OCR'];
        }

        $prompt = <<<'PROMPT'
Tu es un expert en extraction de donnees de factures fournisseurs francaises. Analyse le texte OCR suivant et extrais les informations structurees en JSON.

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
- Pour suggested_category, choisir la categorie la plus pertinente en analysant la description de la ligne et le type de fournisseur
- Si total_ht et total_ttc sont presents, verifier que total_ttc = total_ht + total_tva

Texte OCR a analyser :
PROMPT;

        $prompt .= "\n" . $rawText;

        $ch = curl_init('https://api.anthropic.com/v1/messages');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_TIMEOUT => 90,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'x-api-key: ' . $apiKey,
                'anthropic-version: 2023-06-01'
            ],
            CURLOPT_POSTFIELDS => json_encode([
                'model' => $model,
                'max_tokens' => 4096,
                'messages' => [
                    ['role' => 'user', 'content' => $prompt]
                ]
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

        // Extraire les tokens pour le suivi usage
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

        // Parser le JSON de la reponse
        $jsonStr = $content;
        // Nettoyer si Claude a entoure de ```json ... ```
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
     * Nettoyer un repertoire temporaire
     * @param string $dir Chemin du repertoire
     */
    private static function cleanupDir($dir) {
        if (!is_dir($dir)) return;
        $files = glob($dir . '/*');
        foreach ($files as $file) {
            if (is_file($file)) unlink($file);
        }
        rmdir($dir);
    }

    /**
     * Verifier que les prerequis sont installes
     * @return array ['tesseract' => bool, 'ghostscript' => bool, 'pdftotext' => bool]
     */
    public static function checkPrerequisites() {
        $tesseract = false;
        $ghostscript = false;
        $pdftotext = false;
        $tesseractVersion = null;
        $languages = [];

        // Verifier que exec() est disponible (peut etre desactive dans php.ini)
        if (!function_exists('exec') || in_array('exec', array_map('trim', explode(',', ini_get('disable_functions'))))) {
            return [
                'tesseract' => false,
                'tesseract_version' => null,
                'tesseract_languages' => [],
                'ghostscript' => false,
                'pdftotext' => false,
                'exec_disabled' => true
            ];
        }

        $tOutput = [];
        @exec('tesseract --version 2>&1', $tOutput, $tReturn);
        if ($tReturn === 0) {
            $tesseract = true;
            $tesseractVersion = $tOutput[0] ?? 'unknown';
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

        // Verifier langues Tesseract
        $lOutput = [];
        @exec('tesseract --list-langs 2>&1', $lOutput, $lReturn);
        if ($lReturn === 0) {
            foreach ($lOutput as $line) {
                $line = trim($line);
                if (!empty($line) && strpos($line, 'List') === false) {
                    $languages[] = $line;
                }
            }
        }

        return [
            'tesseract' => $tesseract,
            'tesseract_version' => $tesseractVersion,
            'tesseract_languages' => $languages,
            'ghostscript' => $ghostscript,
            'pdftotext' => $pdftotext
        ];
    }
}
