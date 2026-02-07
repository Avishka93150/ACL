# API Réservation GeHo - Documentation Technique

> **Version**: 1.3 – Décembre 2025  
> **Type**: REST/JSON  
> **Base URL**: `http://<serveur:port>/`  
> **Accès**: Local (serveur sur site) ou en ligne via GeH'Online

---

## Vue d'ensemble

L'API Réservation GeHo est l'interface de communication avec le PMS (Property Management System) GeHo. Elle est principalement conçue pour les bornes de Self Check-In et peut être étendue pour des moteurs de réservation, réceptionnistes IA, etc.

### Flux typique
1. `GetParams` → Obtenir la date de travail
2. `AvailRooms` → Vérifier les disponibilités
3. `CreateBooking` → Créer la réservation
4. `Products` → Lister les extras disponibles
5. `AddProduct` → Ajouter des prestations
6. `UpdateCustomer` → Mettre à jour les coordonnées client
7. `CheckInBooking` → Valider l'arrivée + paiement
8. `GetBooking` → Consulter une réservation
9. `CancelBooking` → Annuler une réservation

### Convention de réponse
Toutes les réponses contiennent :
- `ErrorCode` (int) : `0` = succès, autre = erreur
- `ErrorMessage` (string) : `"Success"` ou message d'erreur

### Langues supportées
Code langue (`LangCode` / `CodeLang`) : `'fr'`, `'en'`, `'it'`, `'de'`, `'es'`

---

## Endpoints

---

### 1. GetParams

**Description** : Obtenir la date de travail du PMS (date hôtelière en cours).

**URL** : `GET http://<serveur:port>/GetParams/`

**Paramètres d'entrée** : Aucun

**Réponse** :
```json
{
  "DateJour": "2022-02-14"
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `DateJour` | string | Date de travail du PMS au format `YYYY-MM-DD` |

---

### 2. AvailRooms

**Description** : Obtenir les chambres disponibles pour un séjour donné.

**URL** : `POST http://<serveur:port>/AvailRooms/`

**Paramètres d'entrée** :
```json
{
  "CheckIn": "2022-02-14",
  "CheckOut": "2022-02-15",
  "LangCode": "fr",
  "NbAdult": 1,
  "NbChild": 0
}
```

| Paramètre | Type | Obligatoire | Description |
|-----------|------|-------------|-------------|
| `CheckIn` | string | Oui | Date de début au format `YYYY-MM-DD` |
| `CheckOut` | string | Oui | Date de fin au format `YYYY-MM-DD` |
| `LangCode` | string | Oui | Code langue (`fr`, `en`, `it`, `de`, `es`) |
| `NbAdult` | int | Oui | Nombre d'adultes |
| `NbChild` | int | Oui | Nombre d'enfants |

**Réponse** :
```json
{
  "ErrorCode": 0,
  "ErrorMessage": "Success",
  "Availabilities": [
    {
      "TypeCode": "SDBLE",
      "Name": "Chambre Double Privilege",
      "Description": "Chaleureuses et confortables...",
      "MaxCapacity": 2,
      "Quantity": 13,
      "NightPrice": 103,
      "StayPrice": 103
    }
  ]
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `Availabilities` | array | Liste des types de chambres disponibles |
| `Availabilities[].TypeCode` | string | Code du type de chambre dans le PMS |
| `Availabilities[].Name` | string | Nom du type de chambre |
| `Availabilities[].Description` | string | Descriptif de la chambre |
| `Availabilities[].MaxCapacity` | int | Occupation maximum |
| `Availabilities[].Quantity` | int | Nombre de chambres disponibles |
| `Availabilities[].NightPrice` | float | Prix par nuit |
| `Availabilities[].StayPrice` | float | Prix total du séjour |

---

### 3. Products

**Description** : Obtenir la liste des prestations optionnelles disponibles pour une réservation.

**URL** : `POST http://<serveur:port>/Products/`

**Paramètres d'entrée** :
```json
{
  "NoResa": "007784.104",
  "CodeLang": "fr"
}
```

| Paramètre | Type | Obligatoire | Description |
|-----------|------|-------------|-------------|
| `NoResa` | string | Oui | Identifiant de la réservation |
| `CodeLang` | string | Oui | Code langue |

**Réponse** :
```json
{
  "ErrorCode": 0,
  "ErrorMessage": "Success",
  "Products": [
    {
      "ProductCode": "PC000001",
      "Name": "Petit déjeuner Borne",
      "CalcRule": "F",
      "PostingType": "D",
      "UnitPrice": 6.9,
      "QuantityType": "Quantity"
    }
  ]
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `Products` | array | Liste des prestations disponibles |
| `Products[].ProductCode` | string | Code produit dans le PMS |
| `Products[].Name` | string | Nom du produit |
| `Products[].CalcRule` | string | Règle de calcul (`F` = forfait, `P` = par personne) |
| `Products[].PostingType` | string | Type de posting (`N` = par séjour, `D` = par nuit) |
| `Products[].UnitPrice` | float | Prix unitaire |
| `Products[].QuantityType` | string | `"Quantity"` = choix libre, `"YesNo"` = oui/non |

**Combinaisons CalcRule + PostingType** :

| CalcRule | PostingType | Signification |
|----------|-------------|---------------|
| `F` | `N` | Par séjour (forfait) |
| `F` | `D` | Par nuit |
| `P` | `N` | Par personne |
| `F` | `D` | Par nuit et par personne |
| `P` | `D` | Par nuit et par personne (YesNo) |

---

### 4. CreateBooking

**Description** : Créer une nouvelle réservation dans le PMS.

**URL** : `POST http://<serveur:port>/CreateBooking/`

**Paramètres d'entrée** :
```json
{
  "CheckIn": "2022-02-14",
  "NbNights": 1,
  "TypeCode": "CDBLE",
  "LastName": "John Doe",
  "NbAdult": 1,
  "NbChild": 0,
  "Civilite": "M.",
  "Adresse1": "18 avenue des moulins",
  "Adresse2": "Res. des pommiers",
  "Ville": "Montpelier",
  "CDP": "34000",
  "Email": "john@doe.fr",
  "Phone": "0607080910"
}
```

| Paramètre | Type | Obligatoire | Description |
|-----------|------|-------------|-------------|
| `CheckIn` | string | Oui | Date de début au format `YYYY-MM-DD` |
| `NbNights` | int | Oui | Nombre de nuits |
| `TypeCode` | string | Oui | Code du type de chambre (issu de `AvailRooms`) |
| `LastName` | string | Oui | Nom / prénom du client |
| `NbAdult` | int | Oui | Nombre d'adultes |
| `NbChild` | int | Oui | Nombre d'enfants |
| `Civilite` | string | Oui | Civilité (`M.`, `Mme`, etc.) |
| `Adresse1` | string | Non | Adresse ligne 1 |
| `Adresse2` | string | Non | Adresse ligne 2 |
| `Ville` | string | Non | Ville |
| `CDP` | string | Non | Code postal |
| `Email` | string | Non | Email du client |
| `Phone` | string | Non | Téléphone du client |

**Réponse** :
```json
{
  "ErrorCode": 0,
  "ErrorMessage": "Success",
  "NoResa": "007784.104"
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `NoResa` | string | Identifiant de la réservation créée (format `XXXXXX.XXX`) |

---

### 5. GetBooking

**Description** : Rechercher / récupérer une réservation dans le PMS.

**URL** : `POST http://<serveur:port>/GetBooking/`

**Paramètres d'entrée** :
```json
{
  "NoResa": "007784.104",
  "TypeRequest": "",
  "LastName": "",
  "CodeLang": "fr",
  "Email": "",
  "Phone": "",
  "SearchExactName": "1"
}
```

| Paramètre | Type | Obligatoire | Description |
|-----------|------|-------------|-------------|
| `NoResa` | string | Non* | Identifiant de la réservation |
| `TypeRequest` | string | Non | `"INHOUSE"` pour les réservations déjà arrivées |
| `LastName` | string | Non* | Nom du client |
| `CodeLang` | string | Oui | Code langue |
| `Email` | string | Non* | Email du client |
| `Phone` | string | Non* | Téléphone du client |
| `SearchExactName` | string | Non | `"1"` = nom exact, autre = recherche partielle |

> *Au moins un critère de recherche requis (NoResa, LastName, Email ou Phone)

**Réponse** :
```json
{
  "ErrorCode": 0,
  "ErrorMessage": "1 reservation(s) found.",
  "ResaInfo": [
    {
      "NoResa": "007784.104",
      "StartDate": "2022-02-14",
      "EndDate": "2022-02-15",
      "NbAdult": 1,
      "NbChild": 0,
      "NbStay": 1,
      "ClientInfo": {
        "LastName": "TEST",
        "ClientID": "9525",
        "Civilite": "M.",
        "AdRue": "",
        "AdCP": "",
        "AdVille": "",
        "Email": "john@doe.fr"
      },
      "RoomInfo": {
        "RoomNumber": "104",
        "TypeCode": "CDBLE",
        "KeyLockCode": "",
        "KeyLockUrl": "",
        "Name": "Chambre Double Classique",
        "Description": "De décoration moderne...",
        "Capacite": 2
      },
      "TotalAmountIT": 91.45,
      "TotalBalanceIT": 91.45,
      "DepositIT": 0,
      "Factures": [
        {
          "FolioType": "MA",
          "FolioId": "9525.1",
          "LastName": "TEST",
          "AdCp": "",
          "AdVille": "",
          "AdRue": "",
          "TotalFactET": 83.27,
          "TotalFactIT": 91.45,
          "TotalFactVAT": 8.18,
          "DepositIT": 0,
          "TotalBalanceIT": 91.45,
          "TotalPaidIT": 0,
          "LigneFact": [
            {
              "ProductCode": "PR000037",
              "Description": "Classique double",
              "Date": "2022-02-14",
              "UnitPriceET": 81.82,
              "UnitPriceIT": 90,
              "Quantity": 1,
              "TotalPriceET": 81.82,
              "TotalPriceIT": 90,
              "VATCode": "TVA 10,0%"
            }
          ],
          "PaymentMethod": "CREDIT_CARD"
        }
      ],
      "Compartment": 0
    }
  ]
}
```

#### Détail des champs de réponse

**ResaInfo[]** (Réservation) :

| Champ | Type | Description |
|-------|------|-------------|
| `NoResa` | string | Identifiant réservation |
| `StartDate` | string | Date début (`YYYY-MM-DD`) |
| `EndDate` | string | Date fin (`YYYY-MM-DD`) |
| `NbAdult` | int | Nombre d'adultes |
| `NbChild` | int | Nombre d'enfants |
| `NbStay` | int | Nombre de nuitées |
| `TotalAmountIT` | float | Montant total TTC |
| `TotalBalanceIT` | float | Solde restant TTC (arrhes déduites) |
| `DepositIT` | float | Montant total des arrhes |
| `Compartment` | int | Numéro de casier de la clé |

**ClientInfo** :

| Champ | Type | Description |
|-------|------|-------------|
| `LastName` | string | Nom du client |
| `ClientID` | string | Identifiant client dans le PMS |
| `Civilite` | string | Civilité |
| `AdRue` | string | Adresse |
| `AdCP` | string | Code postal |
| `AdVille` | string | Ville |
| `Email` | string | Email |

**RoomInfo** :

| Champ | Type | Description |
|-------|------|-------------|
| `RoomNumber` | string | Numéro de chambre attribué |
| `TypeCode` | string | Code type de chambre |
| `KeyLockCode` | string | Code ouverture porte (non utilisé pour borne) |
| `KeyLockUrl` | string | URL ouverture porte (non utilisé pour borne) |
| `Name` | string | Nom du type de chambre |
| `Description` | string | Descriptif |
| `Capacite` | int | Capacité max |

**Factures[]** :

| Champ | Type | Description |
|-------|------|-------------|
| `FolioType` | string | `"MA"` = master, `"CA"` = compte (pas de paiement borne), `"EX1"` = extra |
| `FolioId` | string | Identifiant facture |
| `LastName` | string | Nom sur la facture |
| `AdCp` | string | Code postal facture |
| `AdVille` | string | Ville facture |
| `AdRue` | string | Adresse facture |
| `TotalFactET` | float | Montant HT |
| `TotalFactIT` | float | Montant TTC |
| `TotalFactVAT` | float | Montant TVA |
| `DepositIT` | float | Arrhes facture |
| `TotalBalanceIT` | float | Solde TTC (arrhes déduites) |
| `TotalPaidIT` | float | Montant déjà payé |
| `PaymentMethod` | string | `"CREDIT_CARD"` = paiement requis, `"ACCOUNT"` = accès sans paiement |

**LigneFact[]** (Lignes de facture) :

| Champ | Type | Description |
|-------|------|-------------|
| `ProductCode` | string | Code produit PMS |
| `Description` | string | Descriptif prestation |
| `Date` | string | Date facturation (`YYYY-MM-DD`) |
| `UnitPriceET` | float | Prix unitaire HT |
| `UnitPriceIT` | float | Prix unitaire TTC |
| `Quantity` | int | Quantité |
| `TotalPriceET` | float | Total ligne HT |
| `TotalPriceIT` | float | Total ligne TTC |
| `VATCode` | string | Code TVA (ex: `"TVA 10,0%"`) |

---

### 6. AddProduct

**Description** : Ajouter une ou plusieurs prestations au séjour d'un client.

**URL** : `POST http://<serveur:port>/AddProduct/`

**Paramètres d'entrée** :
```json
{
  "NoResa": "004830.04",
  "ProdList": [
    {
      "ProdCode": "PR000451",
      "Quantity": 1,
      "StartDate": "2021-09-13",
      "NbNight": 1
    }
  ]
}
```

| Paramètre | Type | Obligatoire | Description |
|-----------|------|-------------|-------------|
| `NoResa` | string | Oui | Identifiant réservation |
| `ProdList` | array | Oui | Liste des produits à ajouter |
| `ProdList[].ProdCode` | string | Oui | Code produit (issu de `Products`) |
| `ProdList[].Quantity` | int | Oui | Quantité |
| `ProdList[].StartDate` | string | Oui | Date début facturation (`YYYY-MM-DD`) |
| `ProdList[].NbNight` | int | Oui | Nombre de nuits facturées |

**Réponse** :
```json
{
  "ErrorCode": 0,
  "ErrorMessage": "Success",
  "NoResa": "007784.104"
}
```

---

### 7. CheckInBooking

**Description** : Valider l'arrivée du client dans le PMS, avec ou sans paiement.

**URL** : `POST http://<serveur:port>/CheckInBooking/`

**Paramètres d'entrée** :
```json
{
  "TransactionType": "PREAUTH",
  "NoResa": "007784.104",
  "FolioId": "9525.1",
  "Amount": 91.45,
  "CreditCard": {
    "CardNumber": "",
    "CardType": "CB",
    "ExpireDate": "",
    "CVVCode": ""
  },
  "LastName": "TEST",
  "FirstName": ""
}
```

| Paramètre | Type | Obligatoire | Description |
|-----------|------|-------------|-------------|
| `TransactionType` | string | Oui | Type de paiement (ex: `"PREAUTH"`) |
| `NoResa` | string | Oui | Identifiant réservation |
| `FolioId` | string | Oui | Identifiant de la facture |
| `Amount` | float | Oui | Montant du paiement effectué |
| `CreditCard` | object | Oui | Informations carte bancaire |
| `CreditCard.CardNumber` | string | Non | Numéro de carte |
| `CreditCard.CardType` | string | Non | Type de carte (ex: `"CB"`) |
| `CreditCard.ExpireDate` | string | Non | Date d'expiration |
| `CreditCard.CVVCode` | string | Non | Code CVV |
| `LastName` | string | Oui | Nom du client |
| `FirstName` | string | Non | Prénom du client |

**Réponse** :
```json
{
  "ErrorCode": 0,
  "ErrorMessage": "Success"
}
```

---

### 8. CancelBooking

**Description** : Annuler une réservation créée via la borne dont l'arrivée n'est pas encore enregistrée.

**URL** : `POST http://<serveur:port>/CancelBooking/`

**Paramètres d'entrée** :
```json
{
  "NoResa": "007777.408",
  "Reason": "Retour Home page"
}
```

| Paramètre | Type | Obligatoire | Description |
|-----------|------|-------------|-------------|
| `NoResa` | string | Oui | Identifiant réservation |
| `Reason` | string | Oui | Motif d'annulation |

**Réponse** :
```json
{
  "ErrorCode": 0,
  "ErrorMessage": "Success",
  "NoResa": "007784.104"
}
```

---

### 9. UpdateCustomer

**Description** : Modifier les coordonnées du client lors de son arrivée.

**URL** : `POST http://<serveur:port>/UpdateCustomer/`

**Paramètres d'entrée** :
```json
{
  "NoResa": "005290.202",
  "ClientInfo": {
    "LastName": "DUPOND",
    "ClientID": "",
    "Civilite": "M.",
    "AdRue": "",
    "AdVille": "",
    "AdCP": "",
    "Email": "john@doe.fr",
    "Phone": ""
  }
}
```

| Paramètre | Type | Obligatoire | Description |
|-----------|------|-------------|-------------|
| `NoResa` | string | Oui | Identifiant réservation |
| `ClientInfo.LastName` | string | Non | Nom du client |
| `ClientInfo.ClientID` | string | Non | Identifiant client |
| `ClientInfo.Civilite` | string | Non | Civilité |
| `ClientInfo.AdRue` | string | Non | Adresse |
| `ClientInfo.AdCP` | string | Non | Code postal |
| `ClientInfo.AdVille` | string | Non | Ville |
| `ClientInfo.Email` | string | Non | Email |
| `ClientInfo.Phone` | string | Non | Téléphone |

**Réponse** :
```json
{
  "ErrorCode": 0,
  "ErrorMessage": "Success"
}
```

---

## Notes d'intégration

- **Format de date** : Toujours `YYYY-MM-DD`
- **Identifiant réservation** (`NoResa`) : Format `XXXXXX.XXX` (ex: `"007784.104"`)
- **Gestion d'erreurs** : Toujours vérifier `ErrorCode === 0` avant de traiter la réponse
- **Types de facture** : `MA` (master/principale), `CA` (compte client, pas de paiement borne requis), `EX1` (extras)
- **Méthode de paiement** : `CREDIT_CARD` (paiement requis à la borne) vs `ACCOUNT` (accès chambre sans paiement)
- **KeyLockCode / KeyLockUrl** : Champs prévus pour l'ouverture de porte mais non utilisés dans le contexte borne
- **Compartment** : Numéro de casier physique contenant la clé de chambre
