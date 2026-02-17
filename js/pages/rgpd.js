/**
 * ACL GESTION - Module RGPD
 * Gestion des données personnelles, consentements et conformité RGPD
 */

let rgpdSettings = {};

// ==================== PAGE MES DONNEES PERSONNELLES ====================

async function loadMyData(container) {
    container.innerHTML = `<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>`;
    
    try {
        const res = await API.get('/rgpd/my-data');
        const userData = res.user || {};
        const consents = res.consents || [];
        const requests = res.requests || [];
        const accessLogs = res.access_logs || [];
        
        container.innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-user-shield"></i> ${t('rgpd.my_data')}</h2>
            </div>
            
            <div class="rgpd-info-banner">
                <i class="fas fa-info-circle"></i>
                <div>
                    <strong>Vos droits RGPD</strong>
                    <p>Conformément au Règlement Général sur la Protection des Données (RGPD), vous disposez d'un droit d'accès, de rectification, d'effacement, de portabilité et d'opposition concernant vos données personnelles.</p>
                </div>
            </div>
            
            <div class="row">
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">
                            <h4><i class="fas fa-user"></i> Mes informations</h4>
                        </div>
                        <div class="card-body">
                            <table class="table table-simple">
                                <tr><td><strong>Nom</strong></td><td>${esc(userData.first_name || '')} ${esc(userData.last_name || '')}</td></tr>
                                <tr><td><strong>Email</strong></td><td>${esc(userData.email || '')}</td></tr>
                                <tr><td><strong>Téléphone</strong></td><td>${esc(userData.phone || '-')}</td></tr>
                                <tr><td><strong>Rôle</strong></td><td>${esc(LABELS.role[userData.role] || userData.role)}</td></tr>
                                <tr><td><strong>Hôtel</strong></td><td>${esc(userData.hotel_name || 'Tous')}</td></tr>
                                <tr><td><strong>Compte créé le</strong></td><td>${formatDate(userData.created_at)}</td></tr>
                                <tr><td><strong>Dernière connexion</strong></td><td>${userData.last_login ? formatDateTime(userData.last_login) : '-'}</td></tr>
                            </table>
                            <button class="btn btn-outline btn-block mt-15" onclick="showProfileModal()">
                                <i class="fas fa-edit"></i> Modifier mes informations
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">
                            <h4><i class="fas fa-check-circle"></i> Mes consentements</h4>
                        </div>
                        <div class="card-body">
                            ${renderConsentsTable(consents)}
                            <button class="btn btn-outline btn-block mt-15" onclick="rgpdManageConsents()">
                                <i class="fas fa-cog"></i> Gérer mes consentements
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="card mt-20">
                <div class="card-header">
                    <h4><i class="fas fa-download"></i> Exporter mes données</h4>
                </div>
                <div class="card-body">
                    <p class="text-muted">Téléchargez une copie de toutes vos données personnelles stockées dans l'application.</p>
                    <div class="btn-group">
                        <button class="btn btn-primary" onclick="rgpdExportMyData('json')">
                            <i class="fas fa-file-code"></i> Export JSON
                        </button>
                        <button class="btn btn-outline" onclick="rgpdExportMyData('csv')">
                            <i class="fas fa-file-csv"></i> Export CSV
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="card mt-20">
                <div class="card-header">
                    <h4><i class="fas fa-history"></i> ${t('rgpd.access_logs')}</h4>
                </div>
                <div class="card-body">
                    ${accessLogs.length === 0 ? `
                        <p class="text-muted">Aucun historique d'accès enregistré.</p>
                    ` : `
                        <div class="table-responsive">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Action</th>
                                        <th>Ressource</th>
                                        <th>Adresse IP</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${accessLogs.slice(0, 20).map(log => `
                                        <tr>
                                            <td>${formatDateTime(log.created_at)}</td>
                                            <td><span class="badge badge-${getActionBadgeClass(log.action)}">${esc(log.action)}</span></td>
                                            <td>${esc(log.resource || '-')} ${log.resource_id ? '#' + log.resource_id : ''}</td>
                                            <td><code>${esc(log.ip_address || '-')}</code></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        ${accessLogs.length > 20 ? `<p class="text-muted mt-10">Affichage des 20 dernières actions. Exportez vos données pour l'historique complet.</p>` : ''}
                    `}
                </div>
            </div>
            
            <div class="card mt-20">
                <div class="card-header">
                    <h4><i class="fas fa-clipboard-list"></i> ${t('rgpd.requests')}</h4>
                </div>
                <div class="card-body">
                    ${requests.length === 0 ? `
                        <p class="text-muted">${t('rgpd.no_requests')}</p>
                    ` : `
                        <div class="table-responsive">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Type</th>
                                        <th>Statut</th>
                                        <th>Traité le</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${requests.map(req => `
                                        <tr>
                                            <td>${formatDate(req.requested_at)}</td>
                                            <td>${getRequestTypeLabel(req.request_type)}</td>
                                            <td>${rgpdRequestStatusBadge(req.status)}</td>
                                            <td>${req.processed_at ? formatDate(req.processed_at) : '-'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                    
                    <div class="rgpd-actions mt-20">
                        <h5>${t('rgpd.new_request')}</h5>
                        <div class="btn-group-vertical">
                            <button class="btn btn-outline" onclick="rgpdRequestAccess()">
                                <i class="fas fa-eye"></i> ${t('rgpd.access_request')}
                            </button>
                            <button class="btn btn-outline" onclick="rgpdRequestPortability()">
                                <i class="fas fa-file-export"></i> ${t('rgpd.portability_request')}
                            </button>
                            <button class="btn btn-danger" onclick="rgpdRequestErasure()">
                                <i class="fas fa-trash-alt"></i> ${t('rgpd.deletion_request')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
}

function renderConsentsTable(consents) {
    const consentTypes = [
        { key: 'privacy_policy', label: 'Politique de confidentialité', required: true },
        { key: 'data_processing', label: 'Traitement des données', required: true },
        { key: 'cookies', label: 'Cookies analytiques', required: false },
        { key: 'marketing', label: 'Communications marketing', required: false }
    ];
    
    return `
        <table class="table table-simple">
            ${consentTypes.map(type => {
                const consent = consents.find(c => c.consent_type === type.key);
                const isConsented = consent && consent.consented;
                return `
                    <tr>
                        <td>
                            ${type.label}
                            ${type.required ? '<span class="text-danger">*</span>' : ''}
                        </td>
                        <td class="text-right">
                            ${isConsented 
                                ? `<span class="text-success"><i class="fas fa-check-circle"></i> Accepté le ${formatDate(consent.consented_at)}</span>`
                                : `<span class="text-danger"><i class="fas fa-times-circle"></i> Non accepté</span>`
                            }
                        </td>
                    </tr>
                `;
            }).join('')}
        </table>
    `;
}

function getActionBadgeClass(action) {
    const classes = {
        'login': 'success',
        'logout': 'secondary',
        'view': 'info',
        'create': 'primary',
        'update': 'warning',
        'delete': 'danger',
        'export': 'info'
    };
    return classes[action] || 'secondary';
}

function getRequestTypeLabel(type) {
    const labels = {
        'access': 'Accès aux données',
        'rectification': 'Rectification',
        'erasure': 'Effacement',
        'portability': 'Portabilité',
        'restriction': 'Limitation',
        'objection': 'Opposition'
    };
    return labels[type] || type;
}

function rgpdRequestStatusBadge(status) {
    const badges = {
        'pending': '<span class="badge badge-warning">En attente</span>',
        'processing': '<span class="badge badge-info">En cours</span>',
        'completed': '<span class="badge badge-success">Traitée</span>',
        'rejected': '<span class="badge badge-danger">Rejetée</span>'
    };
    return badges[status] || status;
}

// ==================== GESTION DES CONSENTEMENTS ====================

function rgpdManageConsents() {
    openModal('Gérer mes consentements', `
        <form id="consents-form" onsubmit="rgpdSaveConsents(event)">
            <p class="text-muted mb-20">
                Vous pouvez à tout moment modifier vos préférences de consentement. 
                Les consentements marqués d'un * sont obligatoires pour utiliser le service.
            </p>
            
            <div class="consent-item">
                <label class="checkbox-label">
                    <input type="checkbox" name="privacy_policy" checked disabled>
                    <strong>Politique de confidentialité *</strong>
                </label>
                <p class="text-muted small">J'ai lu et accepté la <a href="#" onclick="showPrivacyPolicy(); return false;">politique de confidentialité</a>.</p>
            </div>
            
            <div class="consent-item">
                <label class="checkbox-label">
                    <input type="checkbox" name="data_processing" checked disabled>
                    <strong>Traitement des données *</strong>
                </label>
                <p class="text-muted small">J'accepte le traitement de mes données personnelles dans le cadre de l'utilisation du service.</p>
            </div>
            
            <div class="consent-item">
                <label class="checkbox-label">
                    <input type="checkbox" name="cookies" id="consent-cookies">
                    <strong>Cookies analytiques</strong>
                </label>
                <p class="text-muted small">J'accepte l'utilisation de cookies pour améliorer mon expérience utilisateur.</p>
            </div>
            
            <div class="consent-item">
                <label class="checkbox-label">
                    <input type="checkbox" name="marketing" id="consent-marketing">
                    <strong>Communications marketing</strong>
                </label>
                <p class="text-muted small">J'accepte de recevoir des communications marketing par email.</p>
            </div>
            
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" onclick="closeModal()">${t('common.cancel')}</button>
                <button type="submit" class="btn btn-primary">${t('common.save')}</button>
            </div>
        </form>
    `);
    
    // Charger l'état actuel des consentements
    loadCurrentConsents();
}

async function loadCurrentConsents() {
    try {
        const res = await API.get('/rgpd/my-consents');
        const consents = res.consents || [];
        
        consents.forEach(c => {
            const checkbox = document.getElementById(`consent-${c.consent_type}`);
            if (checkbox) checkbox.checked = c.consented;
        });
    } catch (e) {
        console.error('Erreur chargement consentements:', e);
    }
}

async function rgpdSaveConsents(e) {
    e.preventDefault();
    const form = e.target;
    
    const consents = {
        cookies: form.querySelector('[name="cookies"]').checked,
        marketing: form.querySelector('[name="marketing"]').checked
    };
    
    try {
        await API.post('/rgpd/consents', consents);
        toast('Préférences enregistrées', 'success');
        closeModal();
        loadMyData(document.getElementById('page-content'));
    } catch (e) {
        toast(e.message, 'error');
    }
}

// ==================== EXPORT DES DONNEES ====================

async function rgpdExportMyData(format = 'json') {
    try {
        toast('Préparation de l\'export...', 'info');
        
        const res = await API.get(`/rgpd/export?format=${format}`);
        
        if (format === 'json') {
            const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
            downloadBlob(blob, `mes_donnees_${new Date().toISOString().split('T')[0]}.json`);
        } else {
            // CSV
            const csv = convertToCSV(res.data);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            downloadBlob(blob, `mes_donnees_${new Date().toISOString().split('T')[0]}.csv`);
        }
        
        toast('Export téléchargé', 'success');
    } catch (e) {
        toast(e.message, 'error');
    }
}

function downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

function convertToCSV(data) {
    const lines = [];
    
    // Informations personnelles
    lines.push('=== INFORMATIONS PERSONNELLES ===');
    lines.push('Champ,Valeur');
    if (data.user) {
        Object.entries(data.user).forEach(([key, value]) => {
            lines.push(`${key},"${value || ''}"`);
        });
    }
    
    lines.push('');
    lines.push('=== CONSENTEMENTS ===');
    lines.push('Type,Accepté,Date');
    if (data.consents) {
        data.consents.forEach(c => {
            lines.push(`${c.consent_type},${c.consented ? 'Oui' : 'Non'},${c.consented_at || ''}`);
        });
    }
    
    lines.push('');
    lines.push('=== HISTORIQUE DES ACCES ===');
    lines.push('Date,Action,Ressource,IP');
    if (data.access_logs) {
        data.access_logs.forEach(log => {
            lines.push(`${log.created_at},${log.action},${log.resource || ''},${log.ip_address || ''}`);
        });
    }
    
    return lines.join('\n');
}

// ==================== DEMANDES RGPD ====================

function rgpdRequestAccess() {
    openModal(t('rgpd.access_request'), `
        <form onsubmit="rgpdSubmitRequest(event, 'access')">
            <p>Vous souhaitez obtenir une copie complète de toutes les données personnelles que nous détenons à votre sujet.</p>
            <p class="text-muted">Cette demande sera traitée dans un délai maximum de 30 jours.</p>
            
            <div class="form-group">
                <label>${t('rgpd.reason')}</label>
                <textarea name="reason" rows="3" placeholder="Précisez votre demande si nécessaire..."></textarea>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn btn-outline" onclick="closeModal()">${t('common.cancel')}</button>
                <button type="submit" class="btn btn-primary">${t('rgpd.new_request')}</button>
            </div>
        </form>
    `);
}

function rgpdRequestPortability() {
    openModal(t('rgpd.portability_request'), `
        <form onsubmit="rgpdSubmitRequest(event, 'portability')">
            <p>Vous souhaitez recevoir vos données dans un format structuré et lisible par machine (JSON) pour les transférer à un autre service.</p>
            <p class="text-muted">Cette demande sera traitée dans un délai maximum de 30 jours.</p>
            
            <div class="form-group">
                <label>${t('rgpd.reason')}</label>
                <textarea name="reason" rows="3" placeholder="Précisez votre demande si nécessaire..."></textarea>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn btn-outline" onclick="closeModal()">${t('common.cancel')}</button>
                <button type="submit" class="btn btn-primary">${t('rgpd.new_request')}</button>
            </div>
        </form>
    `);
}

function rgpdRequestErasure() {
    openModal(t('rgpd.deletion_request'), `
        <form onsubmit="rgpdSubmitRequest(event, 'erasure')">
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>Attention !</strong> Cette action est irréversible.
            </div>
            
            <p>Vous demandez la suppression définitive de votre compte et de toutes vos données personnelles.</p>
            
            <p><strong>Conséquences :</strong></p>
            <ul>
                <li>Votre compte sera désactivé immédiatement</li>
                <li>Vos données personnelles seront supprimées sous 30 jours</li>
                <li>Certaines données peuvent être conservées pour des obligations légales</li>
                <li>Cette action est irréversible</li>
            </ul>
            
            <div class="form-group">
                <label>${t('rgpd.reason')} *</label>
                <textarea name="reason" rows="3" required placeholder="Veuillez indiquer la raison de votre demande..."></textarea>
            </div>
            
            <div class="form-group">
                <label class="checkbox-label">
                    <input type="checkbox" name="confirm" required>
                    Je comprends que cette action est irréversible et je confirme vouloir supprimer mon compte
                </label>
            </div>
            
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" onclick="closeModal()">${t('common.cancel')}</button>
                <button type="submit" class="btn btn-danger">${t('common.delete')}</button>
            </div>
        </form>
    `);
}

async function rgpdSubmitRequest(e, type) {
    e.preventDefault();
    const form = e.target;
    const reason = form.querySelector('[name="reason"]')?.value || '';
    
    try {
        await API.post('/rgpd/request', { type, reason });
        toast(t('rgpd.request_created'), 'success');
        closeModal();
        loadMyData(document.getElementById('page-content'));
    } catch (e) {
        toast(e.message, 'error');
    }
}

// ==================== PAGES LEGALES ====================

function showPrivacyPolicy() {
    openModal(t('rgpd.privacy_policy'), `
        <div class="legal-content">
            <h4>1. Introduction</h4>
            <p>La presente politique de confidentialite decrit comment ACL GESTION SAS collecte, utilise et protege vos donnees personnelles conformement au Reglement General sur la Protection des Donnees (RGPD - Reglement UE 2016/679) et a la loi Informatique et Libertes du 6 janvier 1978 modifiee.</p>

            <h4>2. Responsable du traitement</h4>
            <p>
                <strong>ACL GESTION SAS</strong><br>
                22 Avenue de Chalons, 93150 Le Blanc-Mesnil<br>
                SIRET : 845 388 222 00018 — RCS Bobigny<br>
                Contact protection des donnees : <strong>contact@acl-gestion.com</strong>
            </p>

            <h4>3. Donnees collectees</h4>
            <p>Nous collectons les donnees suivantes :</p>
            <ul>
                <li><strong>Donnees d'identification :</strong> nom, prenom, email professionnel, telephone</li>
                <li><strong>Donnees professionnelles :</strong> fonction, role, hotel(s) d'affectation</li>
                <li><strong>Donnees de connexion :</strong> adresse IP, logs d'acces, horodatage, navigateur</li>
                <li><strong>Donnees d'utilisation :</strong> actions effectuees dans l'application (journal d'audit)</li>
                <li><strong>Donnees financieres :</strong> donnees de clotures, factures (dans le cadre de la gestion hoteliere)</li>
            </ul>

            <h4>4. Finalites du traitement</h4>
            <p>Vos donnees sont traitees pour :</p>
            <ul>
                <li>Gestion de votre compte utilisateur et authentification</li>
                <li>Fourniture des services de la plateforme ACL GESTION</li>
                <li>Securite, prevention des fraudes et tracabilite des operations</li>
                <li>Amelioration continue de nos services</li>
                <li>Respect des obligations legales et reglementaires</li>
            </ul>

            <h4>5. Base legale</h4>
            <p>Le traitement de vos donnees est fonde sur :</p>
            <ul>
                <li><strong>L'execution du contrat :</strong> fourniture du service SaaS souscrit</li>
                <li><strong>L'interet legitime :</strong> securite, amelioration du service, statistiques d'usage</li>
                <li><strong>Le consentement :</strong> pour les communications commerciales et certains cookies</li>
                <li><strong>L'obligation legale :</strong> conservation des donnees comptables et fiscales</li>
            </ul>

            <h4>6. Destinataires des donnees</h4>
            <p>Vos donnees sont accessibles uniquement aux personnes habilitees au sein de votre organisation (selon les roles et permissions configures) et au personnel technique d'ACL GESTION pour la maintenance du service. Aucune donnee n'est vendue ou transmise a des tiers a des fins commerciales.</p>

            <h4>7. Transferts hors UE</h4>
            <p>Vos donnees sont hebergees en France (OVH SAS, Roubaix). Aucun transfert de donnees hors de l'Union Europeenne n'est effectue.</p>

            <h4>8. Duree de conservation</h4>
            <ul>
                <li><strong>Donnees de compte :</strong> duree du contrat + 3 ans apres resiliation</li>
                <li><strong>Donnees de connexion :</strong> 12 mois (obligation legale)</li>
                <li><strong>Donnees comptables :</strong> 10 ans (obligation legale)</li>
                <li><strong>Journaux d'audit :</strong> 5 ans</li>
                <li><strong>Donnees de prospection :</strong> 3 ans apres le dernier contact</li>
            </ul>

            <h4>9. Vos droits</h4>
            <p>Conformement au RGPD, vous disposez des droits suivants :</p>
            <ul>
                <li><strong>Droit d'acces :</strong> obtenir une copie de vos donnees personnelles</li>
                <li><strong>Droit de rectification :</strong> corriger vos donnees inexactes ou incompletes</li>
                <li><strong>Droit a l'effacement :</strong> demander la suppression de vos donnees</li>
                <li><strong>Droit a la portabilite :</strong> recevoir vos donnees dans un format structure et lisible</li>
                <li><strong>Droit d'opposition :</strong> vous opposer a certains traitements</li>
                <li><strong>Droit a la limitation :</strong> limiter le traitement de vos donnees</li>
            </ul>
            <p>Pour exercer vos droits, contactez : <strong>contact@acl-gestion.com</strong></p>

            <h4>10. Securite</h4>
            <p>Nous mettons en oeuvre des mesures techniques et organisationnelles appropriees : chiffrement SSL/TLS, authentification JWT, controle d'acces par roles (RBAC), journalisation des acces, sauvegardes quotidiennes, hebergement securise en France.</p>

            <h4>11. Cookies</h4>
            <p>L'application utilise exclusivement des cookies techniques necessaires a son fonctionnement (authentification, preferences d'affichage). Aucun cookie publicitaire ou de tracking n'est utilise.</p>

            <h4>12. Reclamation</h4>
            <p>Vous avez le droit d'introduire une reclamation aupres de la CNIL (Commission Nationale de l'Informatique et des Libertes) : <a href="https://www.cnil.fr" target="_blank">www.cnil.fr</a></p>

            <p class="text-muted mt-20"><em>Derniere mise a jour : ${new Date().toLocaleDateString('fr-FR')}</em></p>
        </div>

        <div class="modal-footer">
            <button type="button" class="btn btn-primary" onclick="closeModal()">Fermer</button>
        </div>
    `, 'modal-lg');
}

function showLegalNotice() {
    openModal(t('rgpd.legal_notice'), `
        <div class="legal-content">
            <h4>1. Editeur du site</h4>
            <p>
                <strong>ACL GESTION SAS</strong><br>
                Societe par Actions Simplifiee au capital de 1 000 euros<br>
                Siege social : 22 Avenue de Chalons, 93150 Le Blanc-Mesnil, France<br>
                SIRET : 845 388 222 00018<br>
                RCS : Bobigny<br>
                N° TVA intracommunautaire : FR59 845 388 222<br>
                Code NAF : 7022Z (Conseil pour les affaires et autres conseils de gestion)<br>
                Email : contact@acl-gestion.com<br>
                Site web : acl-gestion.com
            </p>

            <h4>2. Directeur de la publication</h4>
            <p>Le directeur de la publication est le representant legal d'ACL GESTION SAS.</p>

            <h4>3. Hebergement</h4>
            <p>
                L'application est hebergee par :<br>
                <strong>OVH SAS</strong><br>
                2, rue Kellermann — 59100 Roubaix, France<br>
                RCS Lille Metropole 424 761 419 00045<br>
                Telephone : +33 9 72 10 10 07<br>
                Site web : www.ovhcloud.com
            </p>

            <h4>4. Propriete intellectuelle</h4>
            <p>L'ensemble du contenu de cette application (textes, images, logos, logiciels, code source, bases de donnees, architecture) est la propriete exclusive d'ACL GESTION SAS et est protege par les lois francaises et internationales relatives a la propriete intellectuelle. Toute reproduction, representation, modification ou exploitation non autorisee est interdite et constitue une contrefacon sanctionnee par les articles L.335-2 et suivants du Code de la propriete intellectuelle.</p>

            <h4>5. Protection des donnees personnelles</h4>
            <p>Conformement au RGPD et a la loi Informatique et Libertes, vous disposez de droits sur vos donnees personnelles. Consultez notre <a href="#" onclick="closeModal(); setTimeout(showPrivacyPolicy, 300); return false;">Politique de confidentialite</a> pour plus d'informations.<br>
            Contact protection des donnees : <strong>contact@acl-gestion.com</strong></p>

            <h4>6. Cookies</h4>
            <p>Cette application utilise exclusivement des cookies techniques necessaires a son fonctionnement (authentification, preferences). Aucun cookie publicitaire ou de suivi tiers n'est utilise.</p>

            <h4>7. Limitation de responsabilite</h4>
            <p>ACL GESTION SAS s'efforce d'assurer l'exactitude et la mise a jour des informations diffusees sur la plateforme. Toutefois, ACL GESTION SAS ne saurait etre tenue responsable des erreurs, omissions, indisponibilites ou des resultats obtenus suite a l'utilisation de ces informations. L'utilisateur est seul responsable de l'utilisation qu'il fait du service.</p>

            <h4>8. Droit applicable et juridiction</h4>
            <p>Les presentes mentions legales sont soumises au droit francais. En cas de litige, les tribunaux competents de Bobigny seront seuls competents.</p>

            <p class="text-muted mt-20"><em>Derniere mise a jour : ${new Date().toLocaleDateString('fr-FR')}</em></p>
        </div>

        <div class="modal-footer">
            <button type="button" class="btn btn-primary" onclick="closeModal()">Fermer</button>
        </div>
    `, 'modal-lg');
}

function showCGV() {
    openModal('Conditions Generales de Vente', \`
        <div class="legal-content">
            <h4>1. Objet</h4>
            <p>Les presentes Conditions Generales de Vente (CGV) regissent les relations contractuelles entre ACL GESTION SAS (ci-apres "le Prestataire") et toute personne morale souscrivant au service ACL GESTION (ci-apres "le Client"). Toute souscription implique l'acceptation sans reserve des presentes CGV.</p>

            <h4>2. Identification du Prestataire</h4>
            <p>
                <strong>ACL GESTION SAS</strong><br>
                Capital social : 1 000 euros<br>
                Siege social : 22 Avenue de Chalons, 93150 Le Blanc-Mesnil<br>
                SIRET : 845 388 222 00018 — RCS Bobigny<br>
                TVA intracommunautaire : FR59 845 388 222
            </p>

            <h4>3. Description du service</h4>
            <p>ACL GESTION est une plateforme SaaS (Software as a Service) de gestion hoteliere multi-etablissements accessible via navigateur web et application mobile. Le service comprend l'ensemble des modules fonctionnels decrits sur le site, l'hebergement des donnees, la maintenance corrective et evolutive, et le support technique.</p>

            <h4>4. Souscription et duree</h4>
            <p>La souscription s'effectue par signature d'un bon de commande ou acceptation d'un devis. Le contrat prend effet a la date d'activation du compte. La duree initiale et les conditions de renouvellement sont precisees dans le bon de commande. A defaut, l'abonnement est mensuel avec un preavis de resiliation de 30 jours.</p>

            <h4>5. Tarification et paiement</h4>
            <ul>
                <li>Les tarifs sont exprimes en euros hors taxes (HT) et communiques sur devis personnalise.</li>
                <li>La TVA applicable est celle en vigueur au jour de la facturation (20%).</li>
                <li>Les factures sont payables a 30 jours date de facture, sauf accord contraire.</li>
                <li>Tout retard de paiement entraine de plein droit l'application de penalites de retard au taux annuel de 3 fois le taux d'interet legal, ainsi qu'une indemnite forfaitaire de 40 euros pour frais de recouvrement (art. L.441-10 du Code de commerce).</li>
                <li>Le Prestataire se reserve le droit de suspendre l'acces au service en cas de non-paiement apres mise en demeure restee infructueuse pendant 15 jours.</li>
            </ul>

            <h4>6. Obligations du Prestataire</h4>
            <ul>
                <li>Fournir un service conforme a la description et aux specifications convenues.</li>
                <li>Assurer la disponibilite du service avec un taux de disponibilite cible de 99,5% (hors maintenance planifiee).</li>
                <li>Heberger les donnees en France, chez OVH SAS (Roubaix).</li>
                <li>Assurer la sauvegarde quotidienne des donnees.</li>
                <li>Assurer le support technique par email aux heures ouvrables (lundi-vendredi, 9h-18h).</li>
                <li>Informer le Client de toute maintenance planifiee avec un preavis minimum de 48 heures.</li>
            </ul>

            <h4>7. Obligations du Client</h4>
            <ul>
                <li>Fournir des informations exactes et a jour lors de l'inscription.</li>
                <li>Assurer la confidentialite des identifiants d'acces.</li>
                <li>Utiliser le service conformement a sa destination et aux presentes CGV.</li>
                <li>S'acquitter des sommes dues dans les delais impartis.</li>
                <li>Respecter la reglementation applicable, notamment en matiere de protection des donnees.</li>
            </ul>

            <h4>8. Propriete intellectuelle</h4>
            <p>Le service ACL GESTION, ses logiciels, interfaces, bases de donnees, documentation et tout element associe sont et demeurent la propriete exclusive d'ACL GESTION SAS. La souscription confere uniquement un droit d'utilisation non exclusif, non cessible et non transferable, pour la duree du contrat.</p>

            <h4>9. Donnees du Client</h4>
            <p>Le Client reste proprietaire de l'ensemble des donnees qu'il saisit dans la plateforme. ACL GESTION SAS s'interdit toute utilisation des donnees du Client a des fins autres que la fourniture du service. En cas de resiliation, le Client peut exporter ses donnees pendant une periode de 30 jours. Au-dela, les donnees seront supprimees.</p>

            <h4>10. Limitation de responsabilite</h4>
            <ul>
                <li>La responsabilite du Prestataire est limitee aux dommages directs et previsibles, et ne saurait exceder le montant des sommes versees par le Client au titre des 12 derniers mois.</li>
                <li>Le Prestataire ne saurait etre tenu responsable des dommages indirects (perte de chiffre d'affaires, perte de donnees due a un cas de force majeure, prejudice commercial).</li>
                <li>Le Prestataire ne saurait etre tenu responsable des contenus saisis par le Client ou ses utilisateurs.</li>
            </ul>

            <h4>11. Force majeure</h4>
            <p>Aucune des parties ne pourra etre tenue responsable de l'inexecution de ses obligations en cas de force majeure au sens de l'article 1218 du Code civil (catastrophe naturelle, pandemie, guerre, greve generale, panne de reseau internet, cyberattaque d'ampleur exceptionnelle).</p>

            <h4>12. Resiliation</h4>
            <ul>
                <li>Chaque partie peut resilier le contrat avec un preavis de 30 jours avant la date de renouvellement.</li>
                <li>En cas de manquement grave par l'une des parties, l'autre partie pourra resilier de plein droit apres mise en demeure restee sans effet pendant 15 jours.</li>
                <li>Le Client peut exporter ses donnees via les fonctionnalites prevues a cet effet (export CSV, PDF, ZIP).</li>
            </ul>

            <h4>13. Protection des donnees</h4>
            <p>Le Prestataire agit en qualite de sous-traitant au sens du RGPD pour les donnees personnelles traitees par le Client via la plateforme. Les modalites de traitement sont detaillees dans notre <a href="#" onclick="closeModal(); setTimeout(showPrivacyPolicy, 300); return false;">Politique de confidentialite</a>.</p>

            <h4>14. Droit applicable et competence</h4>
            <p>Les presentes CGV sont soumises au droit francais. Tout differend sera soumis, apres tentative de resolution amiable, a la competence exclusive des tribunaux de Bobigny.</p>

            <p class="text-muted mt-20"><em>Derniere mise a jour : \${new Date().toLocaleDateString('fr-FR')}</em></p>
        </div>

        <div class="modal-footer">
            <button type="button" class="btn btn-primary" onclick="closeModal()">Fermer</button>
        </div>
    \`, 'modal-lg');
}

function showCGU() {
    openModal("Conditions Generales d'Utilisation", \`
        <div class="legal-content">
            <h4>1. Objet</h4>
            <p>Les presentes Conditions Generales d'Utilisation (CGU) definissent les regles d'utilisation de la plateforme ACL GESTION editee par ACL GESTION SAS. L'acces et l'utilisation de la plateforme impliquent l'acceptation pleine et entiere des presentes CGU.</p>

            <h4>2. Definitions</h4>
            <ul>
                <li><strong>"Plateforme" :</strong> l'application web et mobile ACL GESTION accessible a l'adresse acl-gestion.com.</li>
                <li><strong>"Editeur" :</strong> ACL GESTION SAS, 22 Avenue de Chalons, 93150 Le Blanc-Mesnil (SIRET 845 388 222 00018).</li>
                <li><strong>"Utilisateur" :</strong> toute personne disposant d'un compte d'acces a la plateforme.</li>
                <li><strong>"Client" :</strong> la personne morale ayant souscrit un abonnement au service.</li>
                <li><strong>"Contenu" :</strong> toute donnee, fichier, texte ou document saisi ou televerse par l'Utilisateur.</li>
            </ul>

            <h4>3. Acces a la plateforme</h4>
            <p>L'acces a la plateforme est reserve aux Utilisateurs disposant d'un compte valide, cree par le Client ou son administrateur. L'Utilisateur s'engage a :</p>
            <ul>
                <li>Fournir des informations exactes lors de la creation de son profil.</li>
                <li>Preserver la confidentialite de ses identifiants de connexion (email et mot de passe).</li>
                <li>Ne pas partager, ceder ou communiquer ses identifiants a des tiers.</li>
                <li>Informer immediatement l'administrateur de toute utilisation non autorisee de son compte.</li>
            </ul>
            <p>L'Utilisateur est responsable de toute action effectuee depuis son compte.</p>

            <h4>4. Utilisation autorisee</h4>
            <p>La plateforme est destinee exclusivement a la gestion operationnelle d'etablissements hoteliers. L'Utilisateur s'engage a utiliser la plateforme conformement a sa destination professionnelle et dans le respect de la reglementation en vigueur.</p>

            <h4>5. Comportements interdits</h4>
            <p>Il est strictement interdit de :</p>
            <ul>
                <li>Tenter d'acceder a des donnees ou fonctionnalites non autorisees par son role.</li>
                <li>Contourner, desactiver ou interferer avec les mecanismes de securite de la plateforme.</li>
                <li>Utiliser la plateforme a des fins illicites, frauduleuses ou contraires a l'ordre public.</li>
                <li>Introduire des virus, logiciels malveillants ou tout code nuisible.</li>
                <li>Proceder a l'extraction systematique ou automatisee de donnees (scraping, crawling).</li>
                <li>Reproduire, copier, decompiler, desassembler ou proceder a l'ingenierie inverse du logiciel.</li>
                <li>Utiliser la plateforme pour stocker ou diffuser des contenus illicites.</li>
                <li>Surcharger intentionnellement l'infrastructure technique du service.</li>
            </ul>

            <h4>6. Propriete intellectuelle</h4>
            <p>L'ensemble des elements de la plateforme (logiciels, code source, interfaces, design, bases de donnees, textes, logos, marques) est la propriete exclusive d'ACL GESTION SAS, protege par le droit d'auteur, le droit des marques et le droit des bases de donnees. L'Utilisateur ne dispose d'aucun droit de propriete intellectuelle sur la plateforme. Toute reproduction, meme partielle, est interdite sans autorisation ecrite prealable.</p>

            <h4>7. Contenu de l'Utilisateur</h4>
            <ul>
                <li>L'Utilisateur reste proprietaire des donnees et contenus qu'il saisit dans la plateforme.</li>
                <li>L'Utilisateur garantit que les contenus qu'il publie ne portent pas atteinte aux droits de tiers et sont conformes a la reglementation.</li>
                <li>L'Editeur se reserve le droit de supprimer tout contenu manifestement illicite, apres notification.</li>
                <li>L'Editeur n'exerce aucun controle prealable sur les contenus saisis par les Utilisateurs.</li>
            </ul>

            <h4>8. Disponibilite du service</h4>
            <p>L'Editeur s'efforce d'assurer la disponibilite de la plateforme 24h/24 et 7j/7. Toutefois, l'Editeur ne garantit pas une disponibilite ininterrompue et ne saurait etre tenu responsable des interruptions liees a :</p>
            <ul>
                <li>Des operations de maintenance planifiees ou urgentes.</li>
                <li>Des pannes ou defaillances des reseaux de telecommunications.</li>
                <li>Des cas de force majeure.</li>
                <li>Des actes de malveillance ou intrusions informatiques.</li>
            </ul>

            <h4>9. Responsabilite de l'Editeur</h4>
            <ul>
                <li>L'Editeur n'est tenu que d'une obligation de moyens concernant le fonctionnement de la plateforme.</li>
                <li>L'Editeur ne saurait etre tenu responsable des dommages indirects subis par l'Utilisateur (perte de donnees, perte de chiffre d'affaires, prejudice commercial, atteinte a l'image).</li>
                <li>L'Editeur ne saurait etre tenu responsable de l'utilisation faite par l'Utilisateur du service, ni des decisions prises sur la base des informations fournies par la plateforme.</li>
                <li>En tout etat de cause, la responsabilite de l'Editeur est plafonnee au montant des sommes effectivement versees par le Client au titre des 12 derniers mois.</li>
            </ul>

            <h4>10. Responsabilite de l'Utilisateur</h4>
            <ul>
                <li>L'Utilisateur est seul responsable de l'utilisation qu'il fait de la plateforme et des contenus qu'il y saisit.</li>
                <li>L'Utilisateur s'engage a indemniser et garantir l'Editeur contre toute reclamation, action ou plainte de tiers resultant de son utilisation de la plateforme.</li>
                <li>L'Utilisateur est responsable de la securite de ses equipements et de sa connexion internet.</li>
            </ul>

            <h4>11. Protection des donnees personnelles</h4>
            <p>Le traitement des donnees personnelles est detaille dans notre <a href="#" onclick="closeModal(); setTimeout(showPrivacyPolicy, 300); return false;">Politique de confidentialite</a>. L'Utilisateur dispose des droits d'acces, rectification, suppression, portabilite, opposition et limitation du traitement. Contact : <strong>contact@acl-gestion.com</strong></p>

            <h4>12. Suspension et resiliation</h4>
            <ul>
                <li>L'Editeur se reserve le droit de suspendre ou supprimer l'acces d'un Utilisateur en cas de violation des presentes CGU, sans preavis en cas de manquement grave.</li>
                <li>En cas de suspension, l'Utilisateur sera informe par email des motifs de la suspension.</li>
                <li>Le Client pourra demander la reactivation du compte apres regularisation de la situation.</li>
            </ul>

            <h4>13. Modification des CGU</h4>
            <p>L'Editeur se reserve le droit de modifier les presentes CGU a tout moment. Les Utilisateurs seront informes de toute modification substantielle par notification dans l'application ou par email. L'utilisation continue de la plateforme apres notification vaut acceptation des CGU modifiees.</p>

            <h4>14. Droit applicable et litiges</h4>
            <p>Les presentes CGU sont soumises au droit francais. En cas de litige, les parties s'efforceront de trouver une solution amiable. A defaut, les tribunaux de Bobigny seront seuls competents.</p>

            <h4>15. Contact</h4>
            <p>Pour toute question relative aux presentes CGU :<br>
            <strong>ACL GESTION SAS</strong><br>
            22 Avenue de Chalons, 93150 Le Blanc-Mesnil<br>
            Email : contact@acl-gestion.com</p>

            <p class="text-muted mt-20"><em>Derniere mise a jour : \${new Date().toLocaleDateString('fr-FR')}</em></p>
        </div>

        <div class="modal-footer">
            <button type="button" class="btn btn-primary" onclick="closeModal()">Fermer</button>
        </div>
    \`, 'modal-lg');
}

// ==================== CONSENTEMENT INITIAL ====================

function showConsentModal(onAccept) {
    openModal('Consentement requis', `
        <form id="initial-consent-form">
            <div class="consent-intro">
                <i class="fas fa-shield-alt fa-3x text-primary mb-15"></i>
                <h4>Protection de vos données</h4>
                <p>Avant de continuer, veuillez prendre connaissance de notre politique de confidentialité et donner votre consentement.</p>
            </div>
            
            <div class="consent-item required">
                <label class="checkbox-label">
                    <input type="checkbox" name="privacy_policy" id="consent-privacy" required>
                    <strong>J'ai lu et j'accepte la <a href="#" onclick="showPrivacyPolicy(); return false;">politique de confidentialité</a></strong> *
                </label>
            </div>
            
            <div class="consent-item required">
                <label class="checkbox-label">
                    <input type="checkbox" name="data_processing" id="consent-processing" required>
                    <strong>J'accepte le traitement de mes données personnelles</strong> *
                </label>
                <p class="text-muted small">Nécessaire pour l'utilisation du service</p>
            </div>
            
            <div class="consent-item">
                <label class="checkbox-label">
                    <input type="checkbox" name="cookies" id="consent-cookies-init">
                    J'accepte les cookies analytiques
                </label>
                <p class="text-muted small">Pour améliorer votre expérience utilisateur</p>
            </div>
            
            <p class="text-muted small mt-15">* Champs obligatoires</p>
            
            <div class="modal-footer">
                <button type="button" class="btn btn-danger" onclick="rgpdRefuseAndLogout()">Refuser et quitter</button>
                <button type="button" class="btn btn-primary" onclick="rgpdAcceptConsents()">Accepter et continuer</button>
            </div>
        </form>
    `, 'modal-md', false); // false = non fermable
}

async function rgpdAcceptConsents() {
    const privacyChecked = document.getElementById('consent-privacy').checked;
    const processingChecked = document.getElementById('consent-processing').checked;
    const cookiesChecked = document.getElementById('consent-cookies-init')?.checked || false;
    
    if (!privacyChecked || !processingChecked) {
        toast('Veuillez accepter les conditions obligatoires', 'warning');
        return;
    }
    
    try {
        await API.post('/rgpd/initial-consent', {
            privacy_policy: true,
            data_processing: true,
            cookies: cookiesChecked
        });
        
        closeModal();
        toast('Merci pour votre consentement', 'success');
        
        // Continuer vers l'application
        if (typeof showApp === 'function') {
            showApp();
        }
    } catch (e) {
        toast(e.message, 'error');
    }
}

function rgpdRefuseAndLogout() {
    if (confirm('Sans votre consentement, vous ne pourrez pas utiliser l\'application. Voulez-vous vraiment quitter ?')) {
        closeModal();
        logout();
    }
}

// ==================== ADMIN RGPD ====================

async function loadRgpdAdmin(container) {
    if (!['admin'].includes(API.user.role)) {
        container.innerHTML = `<div class="alert alert-danger">Accès non autorisé</div>`;
        return;
    }
    
    container.innerHTML = `<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>`;
    
    try {
        const res = await API.get('/rgpd/admin/requests');
        const requests = res.requests || [];
        const stats = res.stats || {};
        
        container.innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-user-shield"></i> ${t('rgpd.title')}</h2>
            </div>
            
            <div class="stats-row mb-20">
                <div class="stat-card">
                    <div class="stat-icon" style="background: #ffc107;"><i class="fas fa-clock"></i></div>
                    <div class="stat-info">
                        <h3>${stats.pending || 0}</h3>
                        <p>Demandes en attente</p>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background: #17a2b8;"><i class="fas fa-spinner"></i></div>
                    <div class="stat-info">
                        <h3>${stats.processing || 0}</h3>
                        <p>En cours de traitement</p>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background: #28a745;"><i class="fas fa-check"></i></div>
                    <div class="stat-info">
                        <h3>${stats.completed || 0}</h3>
                        <p>Traitées ce mois</p>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h4><i class="fas fa-clipboard-list"></i> ${t('rgpd.requests')}</h4>
                </div>
                <div class="card-body">
                    ${requests.length === 0 ? `
                        <div class="empty-state">
                            <i class="fas fa-inbox"></i>
                            <p>${t('rgpd.no_requests')}</p>
                        </div>
                    ` : `
                        <div class="table-responsive">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Utilisateur</th>
                                        <th>Type</th>
                                        <th>Statut</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${requests.map(req => `
                                        <tr>
                                            <td>${formatDate(req.requested_at)}</td>
                                            <td>
                                                <strong>${esc(req.user_name)}</strong><br>
                                                <small class="text-muted">${esc(req.user_email)}</small>
                                            </td>
                                            <td>${getRequestTypeLabel(req.request_type)}</td>
                                            <td>${rgpdRequestStatusBadge(req.status)}</td>
                                            <td>
                                                <button class="btn btn-sm btn-outline" onclick="rgpdViewRequest(${req.id})">
                                                    <i class="fas fa-eye"></i>
                                                </button>
                                                ${req.status === 'pending' ? `
                                                    <button class="btn btn-sm btn-success" onclick="rgpdProcessRequest(${req.id})">
                                                        <i class="fas fa-play"></i>
                                                    </button>
                                                ` : ''}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            </div>
            
            <div class="card mt-20">
                <div class="card-header">
                    <h4><i class="fas fa-cog"></i> Paramètres RGPD</h4>
                </div>
                <div class="card-body">
                    <button class="btn btn-outline" onclick="rgpdEditSettings()">
                        <i class="fas fa-edit"></i> Modifier les paramètres
                    </button>
                    <button class="btn btn-outline" onclick="rgpdViewLogs()">
                        <i class="fas fa-history"></i> Voir les logs d'accès
                    </button>
                    <button class="btn btn-danger" onclick="rgpdPurgeOldData()">
                        <i class="fas fa-trash"></i> Purger les anciennes données
                    </button>
                </div>
            </div>
        `;
    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
}

async function rgpdViewRequest(requestId) {
    try {
        const res = await API.get(`/rgpd/admin/requests/${requestId}`);
        const req = res.request;
        
        openModal(t('rgpd.details'), `
            <div class="rgpd-request-detail">
                <div class="form-row">
                    <div class="form-group">
                        <label>Utilisateur</label>
                        <p><strong>${esc(req.user_name)}</strong> (${esc(req.user_email)})</p>
                    </div>
                    <div class="form-group">
                        <label>${t('rgpd.request_type')}</label>
                        <p>${getRequestTypeLabel(req.request_type)}</p>
                    </div>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label>Date de la demande</label>
                        <p>${formatDateTime(req.requested_at)}</p>
                    </div>
                    <div class="form-group">
                        <label>Statut</label>
                        <p>${rgpdRequestStatusBadge(req.status)}</p>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>${t('rgpd.reason')}</label>
                    <p>${esc(req.reason) || '<em>Non renseigné</em>'}</p>
                </div>
                
                ${req.admin_notes ? `
                    <div class="form-group">
                        <label>Notes admin</label>
                        <p>${esc(req.admin_notes)}</p>
                    </div>
                ` : ''}
                
                ${req.status !== 'completed' && req.status !== 'rejected' ? `
                    <hr>
                    <form onsubmit="rgpdUpdateRequest(event, ${req.id})">
                        <div class="form-group">
                            <label>Notes de traitement</label>
                            <textarea name="admin_notes" rows="3">${esc(req.admin_notes || '')}</textarea>
                        </div>
                        <div class="form-group">
                            <label>Action</label>
                            <select name="status" required>
                                <option value="">-- Sélectionner --</option>
                                <option value="processing">${t('rgpd.process')}</option>
                                <option value="completed">${t('rgpd.request_processed')}</option>
                                <option value="rejected">${t('rgpd.reject')}</option>
                            </select>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline" onclick="closeModal()">Fermer</button>
                            <button type="submit" class="btn btn-primary">Mettre à jour</button>
                        </div>
                    </form>
                ` : `
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" onclick="closeModal()">Fermer</button>
                    </div>
                `}
            </div>
        `, 'modal-lg');
    } catch (e) {
        toast(e.message, 'error');
    }
}

async function rgpdUpdateRequest(e, requestId) {
    e.preventDefault();
    const form = e.target;
    const data = {
        status: form.querySelector('[name="status"]').value,
        admin_notes: form.querySelector('[name="admin_notes"]').value
    };
    
    try {
        await API.put(`/rgpd/admin/requests/${requestId}`, data);
        toast(t('rgpd.request_processed'), 'success');
        closeModal();
        loadRgpdAdmin(document.getElementById('page-content'));
    } catch (e) {
        toast(e.message, 'error');
    }
}

async function rgpdProcessRequest(requestId) {
    try {
        await API.put(`/rgpd/admin/requests/${requestId}`, { status: 'processing' });
        toast(t('rgpd.process'), 'success');
        loadRgpdAdmin(document.getElementById('page-content'));
    } catch (e) {
        toast(e.message, 'error');
    }
}

async function rgpdPurgeOldData() {
    if (!confirm('Cette action va supprimer les logs et données de plus de 3 ans. Continuer ?')) return;
    
    try {
        const res = await API.post('/rgpd/admin/purge');
        toast(`${res.deleted || 0} enregistrements supprimés`, 'success');
    } catch (e) {
        toast(e.message, 'error');
    }
}
