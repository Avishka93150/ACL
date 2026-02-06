#!/bin/bash
# =============================================
# ACL GESTION - Script de deploiement complet
# Usage: curl + bash (voir instructions en bas)
# Gere: premier deploiement ET mises a jour
# =============================================

set -e

# === CONFIGURATION ===
REPO_URL="https://github.com/Avishka93150/ACL.git"
APP_DIR="/var/www/vhosts/acl-gestion.com/httpdocs"
PHP_BIN="/opt/plesk/php/8.3/bin/php"
BRANCH="main"
BACKUP_DIR="/var/www/vhosts/acl-gestion.com/backups"
OWNER="acl-gestion"
GROUP="psaserv"
DATE=$(date +%Y%m%d_%H%M%S)
TMP_DIR="/tmp/acl_deploy_${DATE}"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  ACL GESTION - Deploiement complet${NC}"
echo -e "${BLUE}  $(date)${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# === ETAPE 1 : VERIFICATIONS ===
echo -e "${YELLOW}[1/8] Verifications systeme...${NC}"

if [ ! -f "$PHP_BIN" ]; then
    # Chercher PHP automatiquement
    PHP_BIN=$(which php 2>/dev/null || echo "")
    if [ -z "$PHP_BIN" ]; then
        echo -e "${RED}ERREUR: PHP introuvable${NC}"
        exit 1
    fi
fi
echo -e "${GREEN}  PHP: $($PHP_BIN -v | head -1)${NC}"

if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}  Git non installe, installation...${NC}"
    apt-get update -qq && apt-get install -y -qq git
fi
echo -e "${GREEN}  Git: $(git --version)${NC}"

if ! command -v mysql &> /dev/null; then
    echo -e "${YELLOW}  ATTENTION: client mysql non disponible, les migrations seront faites via PHP${NC}"
    MYSQL_VIA_PHP=true
else
    echo -e "${GREEN}  MySQL client: OK${NC}"
    MYSQL_VIA_PHP=false
fi

mkdir -p "$BACKUP_DIR"
echo -e "${GREEN}  Backup dir: $BACKUP_DIR${NC}"

# Autoriser git sur ce repertoire (necessaire quand root execute sur un repo d'un autre user)
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

# === ETAPE 2 : DETECTER PREMIER DEPLOIEMENT OU MISE A JOUR ===
echo ""
echo -e "${YELLOW}[2/8] Detection du type de deploiement...${NC}"

FIRST_DEPLOY=false

if [ ! -d "$APP_DIR" ]; then
    echo -e "${BLUE}  Repertoire $APP_DIR inexistant, creation...${NC}"
    mkdir -p "$APP_DIR"
    FIRST_DEPLOY=true
elif [ ! -d "$APP_DIR/.git" ]; then
    echo -e "${BLUE}  Premier deploiement detecte (pas de .git)${NC}"
    FIRST_DEPLOY=true
else
    echo -e "${GREEN}  Mise a jour detectee (repo git existant)${NC}"
    # Verifier/corriger le remote origin
    cd "$APP_DIR"
    CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
    if [ -z "$CURRENT_REMOTE" ]; then
        echo -e "${YELLOW}  Remote 'origin' manquant, ajout...${NC}"
        git remote add origin "$REPO_URL"
        echo -e "${GREEN}  Remote origin configure: $REPO_URL${NC}"
    elif [ "$CURRENT_REMOTE" != "$REPO_URL" ]; then
        echo -e "${YELLOW}  Remote origin incorrect ($CURRENT_REMOTE), correction...${NC}"
        git remote set-url origin "$REPO_URL"
        echo -e "${GREEN}  Remote origin corrige: $REPO_URL${NC}"
    fi
fi

# === ETAPE 3 : SAUVEGARDER LES DONNEES EXISTANTES ===
echo ""
echo -e "${YELLOW}[3/8] Sauvegarde des donnees existantes...${NC}"

# Sauvegarder .env s'il existe
if [ -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env" "$BACKUP_DIR/.env.backup_${DATE}"
    echo -e "${GREEN}  .env sauvegarde${NC}"
    HAS_ENV=true
else
    echo -e "${YELLOW}  Pas de .env existant${NC}"
    HAS_ENV=false
fi

# Sauvegarder uploads s'ils existent
if [ -d "$APP_DIR/uploads" ] && [ "$(ls -A "$APP_DIR/uploads" 2>/dev/null)" ]; then
    echo -e "${BLUE}  Sauvegarde du dossier uploads...${NC}"
    cp -r "$APP_DIR/uploads" "$BACKUP_DIR/uploads_backup_${DATE}"
    echo -e "${GREEN}  uploads sauvegarde ($(du -sh "$APP_DIR/uploads" | cut -f1))${NC}"
else
    echo -e "${YELLOW}  Pas de uploads existant${NC}"
fi

# Backup BDD si .env disponible
if [ "$HAS_ENV" = true ]; then
    DB_HOST=$(grep -E '^DB_HOST=' "$APP_DIR/.env" | cut -d'=' -f2 | tr -d ' ')
    DB_NAME=$(grep -E '^DB_NAME=' "$APP_DIR/.env" | cut -d'=' -f2 | tr -d ' ')
    DB_USER=$(grep -E '^DB_USER=' "$APP_DIR/.env" | cut -d'=' -f2 | tr -d ' ')
    DB_PASS=$(grep -E '^DB_PASS=' "$APP_DIR/.env" | cut -d'=' -f2 | tr -d ' ')

    if command -v mysqldump &> /dev/null && [ -n "$DB_NAME" ]; then
        BACKUP_FILE="$BACKUP_DIR/db_backup_${DATE}.sql.gz"
        if mysqldump -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" 2>/dev/null | gzip > "$BACKUP_FILE"; then
            echo -e "${GREEN}  BDD sauvegardee: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))${NC}"
        else
            echo -e "${YELLOW}  ATTENTION: Backup BDD echoue (non bloquant)${NC}"
        fi
    fi
fi

# === ETAPE 4 : RECUPERER LE CODE DEPUIS GITHUB ===
echo ""
echo -e "${YELLOW}[4/8] Recuperation du code depuis GitHub...${NC}"
echo -e "${BLUE}  Repo: $REPO_URL${NC}"
echo -e "${BLUE}  Branche: $BRANCH${NC}"

if [ "$FIRST_DEPLOY" = true ]; then
    # Premier deploiement : cloner dans un dossier temporaire puis copier
    echo -e "${BLUE}  Clonage du repository...${NC}"
    rm -rf "$TMP_DIR"
    git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$TMP_DIR"

    # Copier les fichiers vers APP_DIR sans ecraser uploads et .env
    echo -e "${BLUE}  Installation des fichiers...${NC}"

    # Copier le .git
    rm -rf "$APP_DIR/.git"
    cp -r "$TMP_DIR/.git" "$APP_DIR/.git"

    # Lister les fichiers du repo et copier un par un (sauf .env et uploads)
    cd "$TMP_DIR"
    git ls-files | while read file; do
        # Ne pas ecraser .env
        if [ "$file" = ".env" ]; then
            continue
        fi
        # Ne pas toucher au dossier uploads
        if [[ "$file" == uploads/* ]]; then
            continue
        fi
        # Creer le repertoire parent si necessaire
        dir=$(dirname "$file")
        mkdir -p "$APP_DIR/$dir"
        cp "$TMP_DIR/$file" "$APP_DIR/$file"
    done

    rm -rf "$TMP_DIR"
    cd "$APP_DIR"

    # Aligner git sur l'etat actuel
    git reset HEAD -- . > /dev/null 2>&1 || true

    DEPLOYED_COMMIT=$(git rev-parse --short HEAD)
    echo -e "${GREEN}  Code installe (commit: $DEPLOYED_COMMIT)${NC}"

else
    # Mise a jour : git pull
    cd "$APP_DIR"

    git fetch origin "$BRANCH"

    LOCAL_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "none")
    REMOTE_COMMIT=$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "none")

    if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
        echo -e "${GREEN}  Deja a jour (commit: ${LOCAL_COMMIT:0:8})${NC}"
    else
        echo "  Nouveaux commits:"
        git log --oneline HEAD..origin/$BRANCH 2>/dev/null | sed 's/^/    /'
        echo ""

        # Tenter un pull classique
        if git pull origin "$BRANCH" 2>/dev/null; then
            echo -e "${GREEN}  Code mis a jour via git pull${NC}"
        else
            # Echec (fichiers untracked en conflit) : forcer la synchro
            # Les uploads et .env sont deja sauvegardes a l'etape 3
            echo -e "${YELLOW}  Pull classique impossible (fichiers locaux en conflit)${NC}"
            echo -e "${BLUE}  Synchronisation forcee depuis GitHub...${NC}"

            # Forcer le checkout sur la branche remote
            git reset --hard "origin/$BRANCH"

            echo -e "${GREEN}  Code synchronise depuis GitHub${NC}"

            # Restaurer les uploads depuis le backup
            if [ -d "$BACKUP_DIR/uploads_backup_${DATE}" ]; then
                echo -e "${BLUE}  Restauration des uploads...${NC}"
                cp -rn "$BACKUP_DIR/uploads_backup_${DATE}/"* "$APP_DIR/uploads/" 2>/dev/null || true
                echo -e "${GREEN}  Uploads restaures${NC}"
            fi
        fi

        echo -e "${GREEN}  OK: ${LOCAL_COMMIT:0:8} -> $(git rev-parse --short HEAD)${NC}"
    fi

    DEPLOYED_COMMIT=$(git rev-parse --short HEAD)
fi

# === ETAPE 5 : RESTAURER .env ===
echo ""
echo -e "${YELLOW}[5/8] Configuration .env...${NC}"

if [ "$HAS_ENV" = true ]; then
    # Restaurer le .env sauvegarde
    cp "$BACKUP_DIR/.env.backup_${DATE}" "$APP_DIR/.env"
    echo -e "${GREEN}  .env restaure depuis la sauvegarde${NC}"
elif [ -f "$APP_DIR/.env.example" ]; then
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
    echo -e "${RED}  ==========================================${NC}"
    echo -e "${RED}  IMPORTANT : .env cree depuis .env.example${NC}"
    echo -e "${RED}  Editez-le avec vos vrais identifiants :${NC}"
    echo -e "${RED}  nano $APP_DIR/.env${NC}"
    echo -e "${RED}  ==========================================${NC}"
    ENV_NEEDS_CONFIG=true
else
    echo -e "${RED}  ERREUR: Pas de .env ni de .env.example${NC}"
    ENV_NEEDS_CONFIG=true
fi

# === ETAPE 6 : MIGRATIONS SQL ===
echo ""
echo -e "${YELLOW}[6/8] Migrations base de donnees...${NC}"

if [ "${ENV_NEEDS_CONFIG:-false}" = true ]; then
    echo -e "${YELLOW}  IGNORE: Configurez d'abord le .env puis relancez le script${NC}"
else
    # Relire les credentials (au cas ou restaures)
    DB_HOST=$(grep -E '^DB_HOST=' "$APP_DIR/.env" | cut -d'=' -f2 | tr -d ' ')
    DB_NAME=$(grep -E '^DB_NAME=' "$APP_DIR/.env" | cut -d'=' -f2 | tr -d ' ')
    DB_USER=$(grep -E '^DB_USER=' "$APP_DIR/.env" | cut -d'=' -f2 | tr -d ' ')
    DB_PASS=$(grep -E '^DB_PASS=' "$APP_DIR/.env" | cut -d'=' -f2 | tr -d ' ')

    MIGRATION_DIR="$APP_DIR/database"
    MIGRATION_LOG="$BACKUP_DIR/migrations_applied.log"
    touch "$MIGRATION_LOG"
    MIGRATIONS_APPLIED=0
    MIGRATIONS_FAILED=0

    # Trier les migrations par nom pour un ordre coherent
    for migration_file in $(ls "$MIGRATION_DIR"/migration_*.sql 2>/dev/null | sort); do
        if [ ! -f "$migration_file" ]; then
            continue
        fi

        filename=$(basename "$migration_file")

        # Verifier si deja appliquee
        if grep -q "$filename" "$MIGRATION_LOG" 2>/dev/null; then
            echo -e "  ${GREEN}[deja fait] $filename${NC}"
            continue
        fi

        echo -ne "  ${BLUE}$filename ... ${NC}"

        if [ "$MYSQL_VIA_PHP" = true ]; then
            # Executer via PHP si mysql client non dispo
            RESULT=$($PHP_BIN -r "
                \$pdo = new PDO('mysql:host=$DB_HOST;dbname=$DB_NAME;charset=utf8mb4', '$DB_USER', '$DB_PASS');
                \$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                try {
                    \$sql = file_get_contents('$migration_file');
                    \$pdo->exec(\$sql);
                    echo 'OK';
                } catch (Exception \$e) {
                    echo 'ERREUR: ' . \$e->getMessage();
                }
            " 2>&1)
        else
            RESULT=$(mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$migration_file" 2>&1 && echo "OK")
        fi

        if [[ "$RESULT" == "OK" ]]; then
            echo "$filename | $(date)" >> "$MIGRATION_LOG"
            echo -e "${GREEN}OK${NC}"
            MIGRATIONS_APPLIED=$((MIGRATIONS_APPLIED + 1))
        else
            echo -e "${RED}ERREUR${NC}"
            echo -e "    ${RED}$RESULT${NC}"
            MIGRATIONS_FAILED=$((MIGRATIONS_FAILED + 1))
        fi
    done

    if [ "$MIGRATIONS_APPLIED" -eq 0 ] && [ "$MIGRATIONS_FAILED" -eq 0 ]; then
        echo -e "${GREEN}  Toutes les migrations sont deja appliquees${NC}"
    else
        echo -e "${GREEN}  $MIGRATIONS_APPLIED appliquee(s)${NC}"
        [ "$MIGRATIONS_FAILED" -gt 0 ] && echo -e "${RED}  $MIGRATIONS_FAILED en erreur${NC}"
    fi
fi

# === ETAPE 7 : PERMISSIONS ET DOSSIERS ===
echo ""
echo -e "${YELLOW}[7/8] Permissions et dossiers...${NC}"

# Creer les dossiers uploads necessaires
mkdir -p "$APP_DIR/uploads/maintenance"
mkdir -p "$APP_DIR/uploads/linen"
mkdir -p "$APP_DIR/uploads/audit"
mkdir -p "$APP_DIR/uploads/closures"
mkdir -p "$APP_DIR/uploads/profiles"

# Proprietaire Plesk
chown -R "$OWNER:$GROUP" "$APP_DIR"

# Permissions
find "$APP_DIR" -type d -exec chmod 755 {} \;
find "$APP_DIR" -type f -exec chmod 644 {} \;

# Scripts executables
chmod +x "$APP_DIR/deploy.sh" 2>/dev/null || true

# .env protege
chmod 600 "$APP_DIR/.env" 2>/dev/null || true

# Uploads en ecriture
chmod -R 775 "$APP_DIR/uploads"
chown -R "$OWNER:$GROUP" "$APP_DIR/uploads"

# .htaccess uploads (securite)
if [ ! -f "$APP_DIR/uploads/.htaccess" ]; then
    cat > "$APP_DIR/uploads/.htaccess" << 'HTEOF'
# Bloquer l'execution PHP dans uploads
php_flag engine off
<FilesMatch "\.(php|phtml|php3|php4|php5|php7|php8|phar|phps)$">
    Require all denied
</FilesMatch>
Options -Indexes
HTEOF
    echo -e "${GREEN}  uploads/.htaccess cree (securite)${NC}"
fi

echo -e "${GREEN}  Permissions appliquees${NC}"

# === ETAPE 8 : VERIFICATION FINALE ===
echo ""
echo -e "${YELLOW}[8/8] Verification finale...${NC}"

# Syntaxe PHP
PHP_ERRORS=0
for php_file in "$APP_DIR/api/"*.php; do
    if [ ! -f "$php_file" ]; then continue; fi
    if ! $PHP_BIN -l "$php_file" > /dev/null 2>&1; then
        echo -e "  ${RED}Erreur syntaxe: $(basename $php_file)${NC}"
        PHP_ERRORS=$((PHP_ERRORS + 1))
    fi
done
if [ "$PHP_ERRORS" -eq 0 ]; then
    echo -e "${GREEN}  Syntaxe PHP: OK${NC}"
else
    echo -e "${RED}  $PHP_ERRORS erreur(s) de syntaxe PHP !${NC}"
fi

# Fichiers critiques
MISSING=0
for f in index.html js/app.js js/api.js js/utils.js api/index.php api/config.php api/Database.php api/Auth.php; do
    if [ ! -f "$APP_DIR/$f" ]; then
        echo -e "  ${RED}MANQUANT: $f${NC}"
        MISSING=$((MISSING + 1))
    fi
done
if [ "$MISSING" -eq 0 ]; then
    echo -e "${GREEN}  Fichiers critiques: tous presents${NC}"
fi

# Test API
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "https://acl-gestion.com/api/" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "404" ] || [ "$HTTP_CODE" = "405" ]; then
    echo -e "${GREEN}  API: repond (HTTP $HTTP_CODE)${NC}"
elif [ "$HTTP_CODE" = "000" ]; then
    echo -e "${YELLOW}  API: test impossible (timeout ou DNS)${NC}"
else
    echo -e "${RED}  API: HTTP $HTTP_CODE${NC}"
fi

# Restaurer stash si utilise
if [ "${STASHED:-false}" = true ]; then
    echo ""
    echo -e "${YELLOW}  Restauration des modifications locales...${NC}"
    if git stash pop 2>/dev/null; then
        echo -e "${GREEN}  OK${NC}"
    else
        echo -e "${YELLOW}  Conflit lors du stash pop, modifications gardees dans le stash${NC}"
    fi
fi

# Nettoyage vieux backups (garder 30 jours)
find "$BACKUP_DIR" -name "db_backup_*.sql.gz" -mtime +30 -delete 2>/dev/null || true
find "$BACKUP_DIR" -name ".env.backup_*" -mtime +30 -delete 2>/dev/null || true

# === RESUME FINAL ===
echo ""
echo -e "${BLUE}================================================${NC}"
if [ "${ENV_NEEDS_CONFIG:-false}" = true ]; then
    echo -e "${YELLOW}  Deploiement partiel - Action requise :${NC}"
    echo -e "${YELLOW}  1. Editez .env : nano $APP_DIR/.env${NC}"
    echo -e "${YELLOW}  2. Relancez : bash $APP_DIR/deploy.sh${NC}"
else
    echo -e "${GREEN}  Deploiement termine avec succes !${NC}"
fi
echo -e "${BLUE}================================================${NC}"
echo -e "  Commit:  $(cd "$APP_DIR" && git rev-parse --short HEAD 2>/dev/null || echo 'N/A')"
echo -e "  Branche: $BRANCH"
echo -e "  Date:    $(date)"
echo -e "  Backups: $BACKUP_DIR"
echo ""
if [ "$FIRST_DEPLOY" = true ]; then
    echo -e "${BLUE}  Premier deploiement detecte.${NC}"
    echo -e "${BLUE}  Pour les prochaines mises a jour, relancez simplement :${NC}"
    echo -e "${GREEN}  bash $APP_DIR/deploy.sh${NC}"
fi
echo ""
