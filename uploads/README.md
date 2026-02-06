# Uploads ACL GESTION

Ce dossier contient les fichiers uploades par les utilisateurs.

## Structure

```
uploads/
├── maintenance/    # Photos des tickets de maintenance (JPG, PNG)
├── linen/          # Bons de reception blanchisserie (PDF)
├── dispatch/       # Photos des controles qualite chambres (JPG, PNG)
└── closures/       # Documents de cloture journaliere (PDF, JPG)
```

## Regles

- Les fichiers sont nommes avec `uniqid()` + extension originale pour eviter les conflits
- Photos : JPG et PNG acceptes, max 5 Mo
- Documents : PDF acceptes, max 10 Mo
- Le chemin relatif (ex: `uploads/maintenance/65f3a1b2c4d5e.jpg`) est stocke en base de donnees
- Ce dossier doit etre accessible en lecture par le serveur web
- Ce dossier doit etre accessible en ecriture par PHP

## Permissions serveur

```bash
chmod 755 uploads/
chmod 755 uploads/maintenance/
chmod 755 uploads/linen/
chmod 755 uploads/dispatch/
chmod 755 uploads/closures/
```
