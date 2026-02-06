#!/bin/bash
# =============================================
# ACL GESTION - Script de deploiement
# Usage: bash deploy.sh
# =============================================

set -e

# === CONFIGURATION ===
APP_DIR="/var/www/vhosts/acl-gestion.com/httpdocs"
PHP_BIN="/opt/plesk/php/8.3/bin/php"
BRANCH="main"
BACKUP_DIR="/var/www/vhosts/acl-gestion.com/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}  ACL GESTION - Deploiement${NC}"
echo -e "${BLUE}  $(date)${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# === VERIFICATIONS ===
echo -e "${YELLOW}[1/7] Verifications...${NC}"

if [ ! -d "$APP_DIR" ]; then
    echo -e "${RED}ERREUR: Repertoire $APP_DIR introuvable${NC}"
    exit 1
fi

if [ ! -f "$PHP_BIN" ]; then
    echo -e "${RED}ERREUR: PHP introuvable a $PHP_BIN${NC}"
    exit 1
fi

if [ ! -f "$APP_DIR/.env" ]; then
    echo -e "${RED}ERREUR: Fichier .env manquant. Copiez .env.example en .env et configurez-le.${NC}"
    exit 1
fi

cd "$APP_DIR"
echo -e "${GREEN}  OK - Repertoire: $APP_DIR${NC}"
echo -e "${GREEN}  OK - PHP: $($PHP_BIN -v | head -1)${NC}"

# === BACKUP BASE DE DONNEES ===
echo ""
echo -e "${YELLOW}[2/7] Backup base de donnees...${NC}"

# Lire les credentials depuis .env
DB_HOST=$(grep -E '^DB_HOST=' .env | cut -d'=' -f2 | tr -d ' ')
DB_NAME=$(grep -E '^DB_NAME=' .env | cut -d'=' -f2 | tr -d ' ')
DB_USER=$(grep -E '^DB_USER=' .env | cut -d'=' -f2 | tr -d ' ')
DB_PASS=$(grep -E '^DB_PASS=' .env | cut -d'=' -f2 | tr -d ' ')

mkdir -p "$BACKUP_DIR"

if command -v mysqldump &> /dev/null; then
    BACKUP_FILE="$BACKUP_DIR/db_backup_${DATE}.sql.gz"
    mysqldump -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" 2>/dev/null | gzip > "$BACKUP_FILE"
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}  OK - Backup: $BACKUP_FILE ($BACKUP_SIZE)${NC}"
else
    echo -e "${YELLOW}  ATTENTION: mysqldump non disponible, backup ignore${NC}"
fi

# === BACKUP FICHIERS MODIFIES ===
echo ""
echo -e "${YELLOW}[3/7] Verification fichiers locaux...${NC}"

# Verifier s'il y a des modifications locales non commitees
LOCAL_CHANGES=$(git status --porcelain 2>/dev/null | grep -v '^\?\?' | wc -l)
if [ "$LOCAL_CHANGES" -gt 0 ]; then
    echo -e "${YELLOW}  ATTENTION: $LOCAL_CHANGES fichier(s) modifie(s) localement${NC}"
    git status --short | grep -v '^\?\?'
    echo ""
    read -p "  Sauvegarder les modifications locales avec git stash ? (o/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Oo]$ ]]; then
        git stash save "backup_deploy_${DATE}"
        echo -e "${GREEN}  OK - Modifications sauvegardees (git stash)${NC}"
        STASHED=true
    else
        echo -e "${RED}  ABANDON: Commitez ou stashez vos modifications avant de deployer${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}  OK - Aucune modification locale${NC}"
fi

# === GIT PULL ===
echo ""
echo -e "${YELLOW}[4/7] Mise a jour du code (git pull origin $BRANCH)...${NC}"

git fetch origin "$BRANCH"

# Comparer les commits
LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
    echo -e "${GREEN}  Deja a jour (commit: ${LOCAL_COMMIT:0:8})${NC}"
else
    echo -e "${BLUE}  Local:  ${LOCAL_COMMIT:0:8}${NC}"
    echo -e "${BLUE}  Remote: ${REMOTE_COMMIT:0:8}${NC}"
    echo ""
    echo "  Nouveaux commits:"
    git log --oneline HEAD..origin/$BRANCH | sed 's/^/    /'
    echo ""

    git pull origin "$BRANCH"
    echo -e "${GREEN}  OK - Code mis a jour${NC}"
fi

# === MIGRATIONS SQL ===
echo ""
echo -e "${YELLOW}[5/7] Migrations base de donnees...${NC}"

MIGRATION_DIR="$APP_DIR/database"
MIGRATION_LOG="$BACKUP_DIR/migrations_applied.log"
touch "$MIGRATION_LOG"

MIGRATIONS_APPLIED=0

for migration_file in "$MIGRATION_DIR"/migration_*.sql; do
    if [ ! -f "$migration_file" ]; then
        continue
    fi

    filename=$(basename "$migration_file")

    # Verifier si deja appliquee
    if grep -q "$filename" "$MIGRATION_LOG" 2>/dev/null; then
        continue
    fi

    echo -e "  ${BLUE}Execution: $filename${NC}"

    # Executer la migration
    if mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$migration_file" 2>/tmp/migration_error.log; then
        echo "$filename | $(date)" >> "$MIGRATION_LOG"
        echo -e "  ${GREEN}OK${NC}"
        MIGRATIONS_APPLIED=$((MIGRATIONS_APPLIED + 1))
    else
        echo -e "  ${RED}ERREUR: $(cat /tmp/migration_error.log)${NC}"
        echo ""
        read -p "  Continuer malgre l'erreur ? (o/n) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Oo]$ ]]; then
            echo -e "${RED}  ABANDON${NC}"
            exit 1
        fi
    fi
done

if [ "$MIGRATIONS_APPLIED" -eq 0 ]; then
    echo -e "${GREEN}  Aucune nouvelle migration a appliquer${NC}"
else
    echo -e "${GREEN}  $MIGRATIONS_APPLIED migration(s) appliquee(s)${NC}"
fi

# === PERMISSIONS ===
echo ""
echo -e "${YELLOW}[6/7] Permissions fichiers...${NC}"

# Proprietaire correct pour Plesk
chown -R acl-gestion:psaserv "$APP_DIR"

# Permissions des repertoires
find "$APP_DIR" -type d -exec chmod 755 {} \;

# Permissions des fichiers
find "$APP_DIR" -type f -exec chmod 644 {} \;

# Proteger .env
chmod 600 "$APP_DIR/.env"

# Permissions ecriture sur uploads
chmod -R 775 "$APP_DIR/uploads" 2>/dev/null || true
mkdir -p "$APP_DIR/uploads/maintenance" "$APP_DIR/uploads/linen" "$APP_DIR/uploads/audit" "$APP_DIR/uploads/closures"
chown -R acl-gestion:psaserv "$APP_DIR/uploads"

echo -e "${GREEN}  OK - Permissions appliquees${NC}"

# === VERIFICATION FINALE ===
echo ""
echo -e "${YELLOW}[7/7] Verification finale...${NC}"

# Verifier la syntaxe PHP
PHP_ERRORS=0
for php_file in "$APP_DIR/api/"*.php; do
    if ! $PHP_BIN -l "$php_file" > /dev/null 2>&1; then
        echo -e "  ${RED}Erreur syntaxe: $php_file${NC}"
        PHP_ERRORS=$((PHP_ERRORS + 1))
    fi
done

if [ "$PHP_ERRORS" -eq 0 ]; then
    echo -e "${GREEN}  OK - Syntaxe PHP valide${NC}"
else
    echo -e "${RED}  ATTENTION: $PHP_ERRORS erreur(s) de syntaxe PHP${NC}"
fi

# Test rapide de l'API
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://acl-gestion.com/api/" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "404" ]; then
    echo -e "${GREEN}  OK - API repond (HTTP $HTTP_CODE)${NC}"
elif [ "$HTTP_CODE" = "000" ]; then
    echo -e "${YELLOW}  ATTENTION: Impossible de joindre l'API (curl indisponible ou DNS)${NC}"
else
    echo -e "${RED}  ATTENTION: API repond HTTP $HTTP_CODE${NC}"
fi

# Restaurer stash si necessaire
if [ "${STASHED:-false}" = true ]; then
    echo ""
    read -p "Restaurer les modifications locales sauvegardees ? (o/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Oo]$ ]]; then
        git stash pop
        echo -e "${GREEN}  OK - Modifications locales restaurees${NC}"
    else
        echo -e "${YELLOW}  Modifications gardees dans le stash (git stash pop pour restaurer)${NC}"
    fi
fi

# === NETTOYAGE VIEUX BACKUPS (garder 30 jours) ===
find "$BACKUP_DIR" -name "db_backup_*.sql.gz" -mtime +30 -delete 2>/dev/null || true

# === RESUME ===
echo ""
echo -e "${BLUE}=========================================${NC}"
echo -e "${GREEN}  Deploiement termine avec succes !${NC}"
echo -e "${BLUE}=========================================${NC}"
echo -e "  Commit: $(git rev-parse --short HEAD)"
echo -e "  Branch: $(git branch --show-current)"
echo -e "  Date:   $(date)"
echo ""
