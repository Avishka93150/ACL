/**
 * Hotels Page - Page complète avec onglets (plus de modal)
 */

const ROOM_TYPES = [
    { value: 'standard', label: 'Standard', icon: '🛏️', defaultMaxAdults: 2 },
    { value: 'superieure', label: 'Supérieure', icon: '⭐', defaultMaxAdults: 2 },
    { value: 'suite', label: 'Suite', icon: '👑', defaultMaxAdults: 2 },
    { value: 'triple', label: 'Triple', icon: '🛏️🛏️🛏️', defaultMaxAdults: 3 },
    { value: 'quadruple', label: 'Quadruple', icon: '👨‍👩‍👧‍👦', defaultMaxAdults: 4 },
    { value: 'familiale', label: 'Familiale', icon: '👨‍👩‍👧‍👦', defaultMaxAdults: 4 },
    { value: 'pmr', label: 'PMR', icon: '♿', defaultMaxAdults: 2 }
];

const BED_TYPES = [
    { value: 'single', label: 'Simple' },
    { value: 'double', label: 'Double' },
    { value: 'twin', label: 'Twin (2 lits)' },
    { value: 'queen', label: 'Queen' },
    { value: 'king', label: 'King' }
];

const ROOM_STATUSES = [
    { value: 'active', label: 'Active', color: 'success' },
    { value: 'hors_service', label: 'Hors service', color: 'warning' },
    { value: 'renovation', label: 'En rénovation', color: 'danger' }
];

const HOTEL_CATEGORIES = [
    { value: '', label: 'Aucune catégorie' },
    { value: 'urban', label: 'Urbain / Centre-ville' },
    { value: 'resort', label: 'Resort / Vacances' },
    { value: 'business', label: 'Business / Affaires' },
    { value: 'boutique', label: 'Boutique' },
    { value: 'budget', label: 'Économique / Budget' },
    { value: 'luxury', label: 'Luxe' },
    { value: 'apart', label: 'Appart-hôtel' },
    { value: 'residence', label: 'Résidence de tourisme' }
];

let currentHotelId = null;
let _editHotelData = null;
let _editHotelTab = 'general';

// ============ LISTE DES HOTELS ============

async function loadHotels(container) {
    showLoading(container);

    try {
        const [hotelsRes, permsRes] = await Promise.all([
            API.getHotels(),
            API.getMyPermissions()
        ]);

        const hotels = hotelsRes.hotels || [];
        const perms = permsRes.permissions || {};
        window._hotels = hotels;
        window._myPerms = perms;

        const canCreate = perms['hotels.create'] || API.user.role === 'admin';
        const canEdit = perms['hotels.edit'] || API.user.role === 'admin';
        const canDelete = perms['hotels.delete'] || API.user.role === 'admin';

        container.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title"><i class="fas fa-building"></i> ${t('hotels.title')}</h3>
                    ${canCreate ? `<button class="btn btn-primary" onclick="showNewHotelModal()"><i class="fas fa-plus"></i> ${t('hotels.add')}</button>` : ''}
                </div>
                ${hotels.length ? `
                    <table>
                        <thead><tr><th>${t('hotels.name')}</th><th>Catégorie</th><th>${t('hotels.city')}</th><th>${t('hotels.phone')}</th><th>${t('hotels.stars')}</th><th>${t('hotels.rooms_count')}</th><th>${t('hotels.status')}</th><th>${t('hotels.actions')}</th></tr></thead>
                        <tbody>
                            ${hotels.map(h => `
                                <tr>
                                    <td><strong>${esc(h.name)}</strong></td>
                                    <td>${getCategoryLabel(h.category)}</td>
                                    <td>${esc(h.city) || '-'}</td>
                                    <td>${esc(h.phone) || '-'}</td>
                                    <td>${'⭐'.repeat(h.stars || 0)}</td>
                                    <td><span class="badge badge-primary">${h.room_count || 0}</span></td>
                                    <td>${statusBadge(h.status)}</td>
                                    <td>
                                        <div class="table-actions">
                                            ${h.booking_slug && h.booking_enabled == 1 ? `<a href="${window.location.origin}/booking.html?hotel=${encodeURIComponent(h.booking_slug)}" target="_blank" title="Page de réservation" style="color:var(--primary)"><i class="fas fa-globe"></i></a>` : ''}
                                            <button onclick="viewHotelRooms(${h.id})" title="Gérer les chambres"><i class="fas fa-door-open"></i></button>
                                            ${canEdit ? `<button onclick="showEditHotelPage(${h.id})" title="${t('hotels.edit')}"><i class="fas fa-edit"></i></button>` : ''}
                                            ${canDelete ? `<button onclick="deleteHotel(${h.id})" title="${t('common.delete')}" style="color:var(--danger)"><i class="fas fa-trash"></i></button>` : ''}
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : `<div class="empty-state"><i class="fas fa-building"></i><h3>${t('hotels.no_hotels')}</h3></div>`}
            </div>
        `;
    } catch (error) {
        container.innerHTML = `<div class="card"><p class="text-danger">${t('common.error')}: ${error.message}</p></div>`;
    }
}

function getCategoryLabel(cat) {
    if (!cat) return '<span class="text-muted">-</span>';
    const c = HOTEL_CATEGORIES.find(x => x.value === cat);
    return c ? `<span class="badge badge-info">${c.label}</span>` : esc(cat);
}

// ============ CREATION HOTEL (modal simple) ============

function showNewHotelModal() {
    openModal(t('hotels.add'), `
        <form onsubmit="createHotel(event)">
            <div class="form-group">
                <label>${t('hotels.name')} *</label>
                <input type="text" name="name" required>
            </div>
            <div class="form-group">
                <label>Catégorie</label>
                <select name="category">
                    ${HOTEL_CATEGORIES.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>${t('hotels.address')}</label>
                <input type="text" name="address" placeholder="Rue, numéro...">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>${t('hotels.city')}</label>
                    <input type="text" name="city">
                </div>
                <div class="form-group">
                    <label>Code postal</label>
                    <input type="text" name="postal_code">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>${t('hotels.phone')}</label>
                    <input type="tel" name="phone" placeholder="01 23 45 67 89">
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" name="email" placeholder="contact@hotel.fr">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>${t('hotels.stars')}</label>
                    <select name="stars">
                        <option value="1">1 ⭐</option>
                        <option value="2">2 ⭐</option>
                        <option value="3" selected>3 ⭐</option>
                        <option value="4">4 ⭐</option>
                        <option value="5">5 ⭐</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Étages</label>
                    <input type="number" name="total_floors" value="1" min="1">
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" onclick="closeModal()">${t('common.cancel')}</button>
                <button type="submit" class="btn btn-primary">${t('common.create')}</button>
            </div>
        </form>
    `);
}

async function createHotel(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));

    try {
        const res = await API.createHotel(data);
        toast(t('hotels.created'), 'success');
        closeModal();
        // Ouvrir directement la page d'édition du nouvel hôtel
        showEditHotelPage(res.id);
    } catch (error) {
        toast(error.message, 'error');
    }
}

// ============ PAGE COMPLETE D'EDITION HOTEL ============

async function showEditHotelPage(id, tab) {
    const container = document.getElementById('page-content');
    showLoading(container);
    _editHotelTab = tab || 'general';

    try {
        const [hotelRes, leaveConfigRes] = await Promise.all([
            API.getHotel(id),
            API.get(`hotels/${id}/leave-config`).catch(() => ({ config: null }))
        ]);
        const h = hotelRes.hotel;
        _editHotelData = h;

        const leaveConfig = leaveConfigRes.config || {};

        container.innerHTML = `
            <div class="page-header-actions" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
                <button class="btn btn-outline" onclick="loadHotels(document.getElementById('page-content'))">
                    <i class="fas fa-arrow-left"></i> Retour à la liste
                </button>
                <h2 style="margin:0;flex:1;text-align:center"><i class="fas fa-building"></i> ${esc(h.name)}</h2>
                <div style="width:140px"></div>
            </div>

            <!-- Onglets -->
            <div class="hotel-tabs" style="display:flex;gap:0;border-bottom:2px solid var(--gray-200);margin-bottom:24px">
                <button class="hotel-tab ${_editHotelTab === 'general' ? 'active' : ''}" onclick="switchHotelTab('general')">
                    <i class="fas fa-info-circle"></i> Général
                </button>
                <button class="hotel-tab ${_editHotelTab === 'booking' ? 'active' : ''}" onclick="switchHotelTab('booking')">
                    <i class="fas fa-globe"></i> Réservation
                </button>
                <button class="hotel-tab ${_editHotelTab === 'selfcheckin' ? 'active' : ''}" onclick="switchHotelTab('selfcheckin')">
                    <i class="fas fa-door-open"></i> Self Check-in
                </button>
                <button class="hotel-tab ${_editHotelTab === 'maintenance' ? 'active' : ''}" onclick="switchHotelTab('maintenance')">
                    <i class="fas fa-wrench"></i> Maintenance
                </button>
                <button class="hotel-tab ${_editHotelTab === 'leaves' ? 'active' : ''}" onclick="switchHotelTab('leaves')">
                    <i class="fas fa-calendar-alt"></i> Congés
                </button>
                <button class="hotel-tab ${_editHotelTab === 'closures' ? 'active' : ''}" onclick="switchHotelTab('closures')">
                    <i class="fas fa-cash-register"></i> Clôtures
                </button>
                <button class="hotel-tab ${_editHotelTab === 'revenue' ? 'active' : ''}" onclick="switchHotelTab('revenue')">
                    <i class="fas fa-chart-line"></i> Revenue
                </button>
                ${API.user.role === 'admin' ? `
                <button class="hotel-tab ${_editHotelTab === 'contracts' ? 'active' : ''}" onclick="switchHotelTab('contracts')">
                    <i class="fas fa-file-contract"></i> Contrats IA
                </button>` : ''}
            </div>

            <div id="hotel-tab-content"></div>
        `;

        // Inject tab styles
        injectHotelTabStyles();

        // Render active tab
        renderHotelTab(h, leaveConfig);
    } catch (error) {
        container.innerHTML = `<div class="card"><p class="text-danger">${t('common.error')}: ${error.message}</p></div>`;
    }
}

function switchHotelTab(tab) {
    _editHotelTab = tab;
    // Update active class
    document.querySelectorAll('.hotel-tab').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.trim().toLowerCase().includes(
            tab === 'general' ? 'général' :
            tab === 'booking' ? 'réservation' :
            tab === 'pms' ? 'pms' :
            tab === 'leaves' ? 'congés' :
            tab === 'closures' ? 'clôtures' :
            'revenue'
        ));
    });
    // Simpler: just re-use onclick attribute
    document.querySelectorAll('.hotel-tab').forEach(btn => {
        const btnTab = btn.getAttribute('onclick').match(/'(\w+)'/)[1];
        btn.classList.toggle('active', btnTab === tab);
    });
    renderHotelTab(_editHotelData, null);
}

async function renderHotelTab(h, leaveConfig) {
    const content = document.getElementById('hotel-tab-content');
    if (!content) return;

    // If leaveConfig not passed, fetch it for the leaves tab
    if (_editHotelTab === 'leaves' && !leaveConfig) {
        try {
            const res = await API.get(`hotels/${h.id}/leave-config`);
            leaveConfig = res.config || {};
        } catch (e) {
            leaveConfig = {};
        }
    }

    switch (_editHotelTab) {
        case 'general': renderTabGeneral(content, h); break;
        case 'booking': renderTabBooking(content, h); break;
        case 'selfcheckin': renderTabSelfcheckin(content, h); break;
        case 'maintenance': renderTabMaintenance(content, h); break;
        case 'leaves': renderTabLeaves(content, h, leaveConfig); break;
        case 'closures': renderTabClosures(content, h); break;
        case 'revenue': renderTabRevenue(content, h); break;
        case 'contracts': renderTabContracts(content, h); break;
    }
}

// ---- ONGLET GENERAL ----
function renderTabGeneral(content, h) {
    content.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-info-circle"></i> Informations générales</h3>
            </div>
            <div class="card-body" style="padding:24px">
                <form onsubmit="updateHotel(event, ${h.id})">
                    <div class="form-row">
                        <div class="form-group" style="flex:2">
                            <label>${t('hotels.name')} *</label>
                            <input type="text" name="name" value="${esc(h.name)}" required>
                        </div>
                        <div class="form-group" style="flex:1">
                            <label>Catégorie</label>
                            <select name="category">
                                ${HOTEL_CATEGORIES.map(c => `<option value="${c.value}" ${h.category === c.value ? 'selected' : ''}>${c.label}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>${t('hotels.address')}</label>
                        <input type="text" name="address" value="${esc(h.address || '')}">
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>${t('hotels.city')}</label>
                            <input type="text" name="city" value="${esc(h.city || '')}">
                        </div>
                        <div class="form-group">
                            <label>Code postal</label>
                            <input type="text" name="postal_code" value="${esc(h.postal_code || '')}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>${t('hotels.phone')}</label>
                            <input type="tel" name="phone" value="${esc(h.phone || '')}">
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" name="email" value="${esc(h.email || '')}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>N° d'astreinte</label>
                            <input type="tel" name="on_call_phone" value="${esc(h.on_call_phone || '')}" placeholder="Numéro d'urgence / astreinte">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>${t('hotels.stars')}</label>
                            <select name="stars">
                                ${[1,2,3,4,5].map(n => `<option value="${n}" ${h.stars == n ? 'selected' : ''}>${n} ⭐</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Étages</label>
                            <input type="number" name="total_floors" value="${h.total_floors || 1}" min="1">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Heure check-in</label>
                            <input type="time" name="checkin_time" value="${(h.checkin_time || '15:00:00').substring(0,5)}">
                        </div>
                        <div class="form-group">
                            <label>Heure check-out</label>
                            <input type="time" name="checkout_time" value="${(h.checkout_time || '11:00:00').substring(0,5)}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>${t('hotels.status')}</label>
                        <select name="status">
                            <option value="active" ${h.status === 'active' ? 'selected' : ''}>Actif</option>
                            <option value="inactive" ${h.status === 'inactive' ? 'selected' : ''}>Inactif</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Texte descriptif</label>
                        <textarea name="description" rows="4" placeholder="Description unique de l'hôtel (présentation, particularités, informations clés...)" style="width:100%;resize:vertical">${esc(h.description || '')}</textarea>
                    </div>
                    <div style="text-align:right;margin-top:20px">
                        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Comptes bancaires -->
        <div class="card" style="margin-top:var(--space-4)">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-university"></i> Comptes bancaires (RIB)</h3>
                <button class="btn btn-sm btn-primary" onclick="hotelBankAdd(${h.id})"><i class="fas fa-plus"></i> Ajouter un compte</button>
            </div>
            <div class="card-body" style="padding:var(--space-4)">
                <div id="hotel-bank-list"><div style="text-align:center;padding:var(--space-4)"><i class="fas fa-spinner fa-spin"></i></div></div>
            </div>
        </div>
    `;

    hotelBankLoad(h.id);
}

// ---- COMPTES BANCAIRES ----

async function hotelBankLoad(hotelId) {
    const container = document.getElementById('hotel-bank-list');
    if (!container) return;
    try {
        const res = await API.get(`hotels/${hotelId}/bank-accounts`);
        const accounts = res.accounts || [];
        if (accounts.length === 0) {
            container.innerHTML = '<div class="empty-state" style="padding:var(--space-4)"><p>Aucun compte bancaire configuré</p><p style="color:var(--text-tertiary);font-size:var(--font-size-sm)">Ajoutez un RIB pour simplifier la génération des fichiers SEPA</p></div>';
            return;
        }
        container.innerHTML = `
            <div class="table-responsive">
                <table class="table">
                    <thead><tr><th>Nom</th><th>IBAN</th><th>BIC</th><th>Défaut</th><th style="width:100px">Actions</th></tr></thead>
                    <tbody>
                        ${accounts.map(a => `
                            <tr>
                                <td><strong>${esc(a.label)}</strong></td>
                                <td style="font-family:monospace;font-size:var(--font-size-sm)">${esc(hotelBankFormatIban(a.iban))}</td>
                                <td>${esc(a.bic || '-')}</td>
                                <td>${a.is_default == 1 ? '<span class="badge badge-success"><i class="fas fa-check"></i> Par défaut</span>' : ''}</td>
                                <td>
                                    <button class="btn btn-sm btn-outline" onclick="hotelBankEdit(${hotelId}, ${a.id})" title="Modifier"><i class="fas fa-edit"></i></button>
                                    <button class="btn btn-sm btn-outline text-danger" onclick="hotelBankDelete(${hotelId}, ${a.id}, '${escAttr(a.label)}')" title="Supprimer"><i class="fas fa-trash"></i></button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (e) {
        container.innerHTML = '<div class="text-danger">Erreur de chargement</div>';
    }
}

function hotelBankFormatIban(iban) {
    return (iban || '').replace(/(.{4})/g, '$1 ').trim();
}

function hotelBankAdd(hotelId) {
    openModal('Ajouter un compte bancaire', `
        <form onsubmit="hotelBankSave(event, ${hotelId})">
            <div class="form-group">
                <label class="form-label required">Nom du compte</label>
                <input type="text" id="bank-label" class="form-control" placeholder="Ex : Compte principal, Compte fournisseurs" required>
            </div>
            <div class="form-group">
                <label class="form-label required">IBAN</label>
                <input type="text" id="bank-iban" class="form-control" placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX" required>
            </div>
            <div class="form-group">
                <label class="form-label">BIC</label>
                <input type="text" id="bank-bic" class="form-control" placeholder="BNPAFRPPXXX">
            </div>
            <div class="form-group">
                <label><input type="checkbox" id="bank-default"> Compte par défaut</label>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
            </div>
        </form>
    `, 'modal-md');
}

async function hotelBankSave(e, hotelId, accountId) {
    e.preventDefault();
    const data = {
        label: document.getElementById('bank-label').value.trim(),
        iban: document.getElementById('bank-iban').value.trim(),
        bic: document.getElementById('bank-bic').value.trim(),
        is_default: document.getElementById('bank-default').checked ? 1 : 0
    };
    if (!data.label || !data.iban) { toast('Nom et IBAN requis', 'warning'); return; }
    try {
        if (accountId) {
            await API.put(`hotels/${hotelId}/bank-accounts/${accountId}`, data);
        } else {
            await API.post(`hotels/${hotelId}/bank-accounts`, data);
        }
        closeModal();
        toast('Compte bancaire enregistré', 'success');
        hotelBankLoad(hotelId);
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function hotelBankEdit(hotelId, accountId) {
    try {
        const res = await API.get(`hotels/${hotelId}/bank-accounts`);
        const account = (res.accounts || []).find(a => a.id == accountId);
        if (!account) { toast('Compte introuvable', 'error'); return; }

        openModal('Modifier le compte bancaire', `
            <form onsubmit="hotelBankSave(event, ${hotelId}, ${accountId})">
                <div class="form-group">
                    <label class="form-label required">Nom du compte</label>
                    <input type="text" id="bank-label" class="form-control" value="${escAttr(account.label)}" required>
                </div>
                <div class="form-group">
                    <label class="form-label required">IBAN</label>
                    <input type="text" id="bank-iban" class="form-control" value="${escAttr(account.iban)}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">BIC</label>
                    <input type="text" id="bank-bic" class="form-control" value="${escAttr(account.bic || '')}">
                </div>
                <div class="form-group">
                    <label><input type="checkbox" id="bank-default" ${account.is_default == 1 ? 'checked' : ''}> Compte par défaut</label>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
                </div>
            </form>
        `, 'modal-md');
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function hotelBankDelete(hotelId, accountId, label) {
    if (!confirm(`Supprimer le compte « ${label} » ?`)) return;
    try {
        await API.delete(`hotels/${hotelId}/bank-accounts/${accountId}`);
        toast('Compte supprimé', 'success');
        hotelBankLoad(hotelId);
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ---- ONGLET RESERVATION ----
function renderTabBooking(content, h) {
    content.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-globe"></i> Réservation en ligne & Self Check-in</h3>
            </div>
            <div class="card-body" style="padding:24px">
                <form onsubmit="updateHotel(event, ${h.id})">
                    <div class="form-group">
                        <label>
                            <input type="checkbox" name="selfcheckin_enabled" value="1" ${h.selfcheckin_enabled == 1 ? 'checked' : ''}> Activer le self check-in
                        </label>
                        <small class="form-help" style="display:block;margin-top:4px">Permet aux clients de faire leur check-in via la borne/site web</small>
                    </div>

                    <div class="form-group">
                        <label>
                            <input type="checkbox" name="walkin_enabled" value="1" ${h.walkin_enabled == 1 ? 'checked' : ''}> Autoriser les walk-in (sans réservation)
                        </label>
                        <small class="form-help" style="display:block;margin-top:4px">Permet aux clients sans réservation de réserver une chambre disponible sur place</small>
                    </div>

                    <div class="form-group">
                        <label>Slug de réservation</label>
                        <div style="position:relative">
                            <input type="text" name="booking_slug" value="${esc(h.booking_slug || '')}" placeholder="mon-hotel" id="booking-slug-input" data-hotel-id="${h.id}" data-original-slug="${esc(h.booking_slug || '')}" oninput="onSlugInput()" style="padding-right:36px">
                            <span id="slug-check-icon" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:16px"></span>
                        </div>
                        <small class="form-help">Identifiant unique dans l'URL (lettres minuscules, chiffres, tirets)</small>
                        <small id="slug-check-msg" style="display:none;margin-top:4px"></small>
                    </div>

                    <div class="form-group" id="booking-url-group" style="${h.booking_slug ? '' : 'display:none'}">
                        <label><i class="fas fa-link"></i> Lien self check-in client</label>
                        <div style="display:flex;gap:8px;align-items:center">
                            <input type="text" readonly value="${h.booking_slug ? window.location.origin + '/booking.html?hotel=' + encodeURIComponent(h.booking_slug) : ''}" style="flex:1;padding:8px 12px;border:1px solid #93C5FD;border-radius:6px;font-size:13px;background:#F0F9FF;color:#1E40AF" id="booking-url-field">
                            <button type="button" class="btn btn-sm btn-outline" onclick="copyBookingUrl()" title="Copier"><i class="fas fa-copy"></i></button>
                            <a href="${h.booking_slug ? window.location.origin + '/booking.html?hotel=' + encodeURIComponent(h.booking_slug) : '#'}" target="_blank" class="btn btn-sm btn-primary" id="booking-url-open" title="Ouvrir"><i class="fas fa-external-link-alt"></i></a>
                        </div>
                        <small class="form-help">Partagez ce lien avec vos clients ou affichez-le sur une borne</small>
                    </div>

                    <div style="text-align:right;margin-top:20px">
                        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

// ---- ONGLET SELF CHECK-IN ----
async function renderTabSelfcheckin(content, h) {
    content.innerHTML = '<div class="loading-inline"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>';

    // Charger les casiers et les horaires PDJ
    let lockers = [];
    let bfSchedules = [];
    try {
        const [lockersRes, bfRes] = await Promise.all([
            API.get(`lockers?hotel_id=${h.id}`),
            API.get(`hotels/${h.id}/breakfast-schedules`)
        ]);
        lockers = lockersRes.lockers || [];
        bfSchedules = bfRes.schedules || [];
    } catch (e) {}

    // Indexer les horaires par jour de semaine
    const bfByDay = {};
    bfSchedules.forEach(s => { bfByDay[s.day_of_week] = s; });
    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

    content.innerHTML = `
        <!-- Tarifs par défaut -->
        <div class="card mb-20">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-euro-sign"></i> Tarifs par défaut</h3>
            </div>
            <div class="card-body" style="padding:24px">
                <form onsubmit="updateHotel(event, ${h.id})">
                    <p class="text-muted mb-15">Tarifs par défaut utilisés si aucun tarif spécifique n'est défini pour une date donnée.</p>

                    <div class="form-row">
                        <div class="form-group">
                            <label>Prix de la nuit par défaut</label>
                            <div style="position:relative">
                                <input type="number" name="default_night_price" value="${h.default_night_price || '0'}" step="0.01" min="0" style="padding-right:30px">
                                <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:#6B7280">EUR</span>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Prix petit-déjeuner par défaut (par personne)</label>
                            <div style="position:relative">
                                <input type="number" name="default_breakfast_price" value="${h.default_breakfast_price || '0'}" step="0.01" min="0" style="padding-right:30px">
                                <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:#6B7280">EUR</span>
                            </div>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label>Taxe de séjour par défaut (par adulte/nuit)</label>
                            <div style="position:relative">
                                <input type="number" name="default_tourist_tax" value="${h.default_tourist_tax || '0'}" step="0.01" min="0" style="padding-right:30px">
                                <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:#6B7280">EUR</span>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Heure limite nuit (arrivée après minuit)</label>
                            <select name="night_cutoff_hour">
                                ${[5,6,7,8].map(h2 => `<option value="${h2}" ${(h.night_cutoff_hour || 7) == h2 ? 'selected' : ''}>${h2}h00</option>`).join('')}
                            </select>
                            <small class="form-help">Un client arrivant entre minuit et cette heure sera facturé au tarif de la veille</small>
                        </div>
                    </div>

                    <div style="text-align:right;margin-top:20px">
                        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Horaires petit-déjeuner par jour de la semaine -->
        <div class="card mb-20">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-coffee"></i> Horaires petit-déjeuner par jour</h3>
            </div>
            <div class="card-body" style="padding:24px">
                <form onsubmit="saveBreakfastSchedules(event, ${h.id})">
                    <p class="text-muted mb-15">Configurez les horaires du petit-déjeuner pour chaque jour de la semaine. Décochez un jour si le petit-déjeuner n'est pas servi.</p>

                    <div class="table-responsive">
                        <table class="table" style="margin-bottom:16px">
                            <thead>
                                <tr>
                                    <th>Jour</th>
                                    <th style="width:100px">Servi</th>
                                    <th>Heure début</th>
                                    <th>Heure fin</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${[1,2,3,4,5,6,0].map(dow => {
                                    const sched = bfByDay[dow];
                                    const enabled = sched ? sched.enabled == 1 : true;
                                    const start = sched ? sched.breakfast_start?.substring(0,5) : (h.breakfast_start || '07:00').substring(0,5);
                                    const end = sched ? sched.breakfast_end?.substring(0,5) : (h.breakfast_end || '10:30').substring(0,5);
                                    const isWeekend = dow === 0 || dow === 6;
                                    return `
                                        <tr style="${isWeekend ? 'background:#FFF7ED' : ''}">
                                            <td><strong${isWeekend ? ' style="color:#EA580C"' : ''}>${dayNames[dow]}</strong></td>
                                            <td><input type="checkbox" name="bf_enabled_${dow}" ${enabled ? 'checked' : ''}></td>
                                            <td><input type="time" name="bf_start_${dow}" value="${start}" style="width:130px"></td>
                                            <td><input type="time" name="bf_end_${dow}" value="${end}" style="width:130px"></td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>

                    <div style="text-align:right">
                        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer les horaires</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Gestion des casiers -->
        <div class="card mb-20">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-lock"></i> Casiers</h3>
                <button class="btn btn-primary btn-sm" onclick="showHotelCreateLocker(${h.id})"><i class="fas fa-plus"></i> Nouveau casier</button>
            </div>
            <div class="card-body" style="padding:24px">
                <p class="text-muted mb-15">Configurez les casiers de votre établissement. Le numéro de casier est permanent, le code peut être modifié quotidiennement. L'association chambre-casier se fait lors de la création de chaque réservation.</p>
                <div id="hotel-lockers-list">
                    ${lockers.length === 0 ? `
                        <div class="empty-state" style="padding:30px">
                            <i class="fas fa-lock" style="font-size:36px;color:var(--gray-300);margin-bottom:12px"></i>
                            <p>Aucun casier configuré</p>
                            <small class="text-muted">Ajoutez des casiers pour le self check-in</small>
                        </div>
                    ` : `
                        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">
                            ${lockers.map(l => {
                                const statusColors = {
                                    'available': { color: '#16A34A', bg: '#F0FDF4', label: 'Disponible', icon: 'check-circle' },
                                    'assigned': { color: '#2563EB', bg: '#EFF6FF', label: 'Assign\u00e9', icon: 'user-check' },
                                    'maintenance': { color: '#DC2626', bg: '#FEF2F2', label: 'Maintenance', icon: 'tools' }
                                };
                                const s = statusColors[l.status] || statusColors['available'];
                                return `
                                    <div class="card" style="padding:0;border-left:4px solid ${s.color};overflow:hidden;margin:0">
                                        <div style="padding:14px">
                                            <div style="display:flex;justify-content:space-between;align-items:start">
                                                <div>
                                                    <h4 style="margin:0;font-size:16px"><i class="fas fa-lock" style="color:${s.color}"></i> Casier ${esc(l.locker_number)}</h4>
                                                    <p style="margin:4px 0 0;font-size:13px;color:var(--gray-500)">Code : <strong>${esc(l.locker_code)}</strong></p>
                                                </div>
                                                <span style="padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;background:${s.bg};color:${s.color}">
                                                    <i class="fas fa-${s.icon}"></i> ${s.label}
                                                </span>
                                            </div>
                                            ${l.notes ? `<p style="margin:6px 0 0;font-size:12px;color:var(--gray-400)">${esc(l.notes)}</p>` : ''}
                                            <div style="margin-top:10px;display:flex;gap:6px">
                                                <button class="btn btn-sm btn-outline" onclick="showHotelEditLocker(${h.id}, ${l.id})"><i class="fas fa-edit"></i></button>
                                                <button class="btn btn-sm btn-danger" onclick="deleteHotelLocker(${h.id}, ${l.id})"><i class="fas fa-trash"></i></button>
                                            </div>
                                        </div>
                                    </div>`;
                            }).join('')}
                        </div>
                    `}
                </div>
            </div>
        </div>

        <!-- Services complémentaires -->
        <div class="card mb-20">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-concierge-bell"></i> Services complémentaires</h3>
                <button class="btn btn-primary btn-sm" onclick="showCreateService(${h.id})"><i class="fas fa-plus"></i> Nouveau service</button>
            </div>
            <div class="card-body" style="padding:24px">
                <p class="text-muted mb-15">Services proposés aux clients juste avant le paiement lors du self check-in (ex: kit de bienvenue, parking, late checkout...).</p>
                <div id="hotel-services-list">
                    <div style="text-align:center;padding:20px;color:var(--gray-400)">
                        <i class="fas fa-spinner fa-spin"></i> Chargement...
                    </div>
                </div>
            </div>
        </div>

        <!-- Stripe -->
        ${hasPermission('hotels.stripe_manage') ? `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title"><i class="fab fa-stripe"></i> Stripe (Paiement en ligne)</h3>
            </div>
            <div class="card-body" style="padding:24px">
                <form onsubmit="updateHotel(event, ${h.id})">
                    <p class="text-muted mb-15">Clés API Stripe pour le paiement lors du self check-in</p>
                    <div class="form-group">
                        <label>Clé publique (pk_live_... ou pk_test_...)</label>
                        <input type="text" name="stripe_public_key" value="${esc(h.stripe_public_key || '')}" placeholder="pk_live_xxxxx">
                    </div>
                    <div class="form-group">
                        <label>Clé secrète (sk_live_... ou sk_test_...)</label>
                        <input type="password" name="stripe_secret_key" value="${esc(h.stripe_secret_key || '')}" placeholder="sk_live_xxxxx">
                    </div>
                    <div style="text-align:right;margin-top:20px">
                        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
                    </div>
                </form>
            </div>
        </div>
        ` : ''}
    `;

    // Charger les services complémentaires
    loadHotelServices(h.id);
}

// ---- Sauvegarder horaires PDJ par jour de la semaine ----
async function saveBreakfastSchedules(e, hotelId) {
    e.preventDefault();
    const form = e.target;
    const days = [];

    [1,2,3,4,5,6,0].forEach(dow => {
        days.push({
            day_of_week: dow,
            breakfast_start: form.querySelector(`[name="bf_start_${dow}"]`).value || '07:00',
            breakfast_end: form.querySelector(`[name="bf_end_${dow}"]`).value || '10:30',
            enabled: form.querySelector(`[name="bf_enabled_${dow}"]`).checked ? 1 : 0
        });
    });

    try {
        await API.put(`hotels/${hotelId}/breakfast-schedules`, { days });
        toast('Horaires petit-déjeuner enregistrés', 'success');
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ---- CRUD Casiers côté hôtel ----
function showHotelCreateLocker(hotelId) {
    openModal('Nouveau casier', `
        <form onsubmit="saveHotelLocker(event, ${hotelId})">
            <div class="form-row">
                <div class="form-group">
                    <label>Numéro du casier *</label>
                    <input type="text" name="locker_number" required placeholder="Ex: 1, A1, ...">
                    <small class="form-help">Le numéro est permanent et identifie physiquement le casier</small>
                </div>
                <div class="form-group">
                    <label>Code d'accès actuel *</label>
                    <input type="text" name="locker_code" required placeholder="Ex: 1234, AB12, ...">
                    <small class="form-help">Code pouvant être changé quotidiennement</small>
                </div>
            </div>
            <div class="form-group">
                <label>Notes</label>
                <textarea name="notes" rows="2" placeholder="Notes optionnelles..."></textarea>
            </div>
            <div style="text-align:right;margin-top:20px">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Créer</button>
            </div>
        </form>
    `);
}

async function saveHotelLocker(e, hotelId) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.hotel_id = hotelId;
    try {
        await API.post('lockers', data);
        toast('Casier créé', 'success');
        closeModal();
        renderHotelTab(_editHotelData, null);
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function showHotelEditLocker(hotelId, lockerId) {
    try {
        const locker = await API.get(`lockers/${lockerId}`);
        openModal('Modifier le casier', `
            <form onsubmit="updateHotelLocker(event, ${hotelId}, ${lockerId})">
                <div class="form-row">
                    <div class="form-group">
                        <label>Numéro du casier *</label>
                        <input type="text" name="locker_number" value="${esc(locker.locker_number)}" required>
                    </div>
                    <div class="form-group">
                        <label>Code d'accès actuel *</label>
                        <input type="text" name="locker_code" value="${esc(locker.locker_code)}" required>
                        <small class="form-help">Modifiez ce code quotidiennement</small>
                    </div>
                </div>
                <div class="form-group">
                    <label>Statut</label>
                    <select name="status">
                        <option value="available" ${locker.status === 'available' ? 'selected' : ''}>Disponible</option>
                        <option value="assigned" ${locker.status === 'assigned' ? 'selected' : ''}>Assigné</option>
                        <option value="maintenance" ${locker.status === 'maintenance' ? 'selected' : ''}>Maintenance</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Notes</label>
                    <textarea name="notes" rows="2">${esc(locker.notes || '')}</textarea>
                </div>
                <div style="text-align:right;margin-top:20px">
                    <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
                </div>
            </form>
        `);
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function updateHotelLocker(e, hotelId, lockerId) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
        await API.put(`lockers/${lockerId}`, data);
        toast('Casier mis à jour', 'success');
        closeModal();
        renderHotelTab(_editHotelData, null);
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function deleteHotelLocker(hotelId, lockerId) {
    if (!confirm('Supprimer ce casier ?')) return;
    try {
        await API.delete(`lockers/${lockerId}`);
        toast('Casier supprimé', 'success');
        renderHotelTab(_editHotelData, null);
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ---- CRUD Services complémentaires ----

async function loadHotelServices(hotelId) {
    const container = document.getElementById('hotel-services-list');
    if (!container) return;

    try {
        const res = await API.get(`hotels/${hotelId}/selfcheckin-services`);
        const services = res.services || [];

        if (services.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding:30px">
                    <i class="fas fa-concierge-bell" style="font-size:36px;color:var(--gray-300);margin-bottom:12px"></i>
                    <p>Aucun service complémentaire configuré</p>
                    <small class="text-muted">Ajoutez des services proposés aux clients lors du self check-in</small>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
                ${services.map(s => `
                    <div class="card" style="padding:0;border-left:4px solid ${s.is_active ? '#16A34A' : '#9CA3AF'};overflow:hidden;margin:0">
                        <div style="padding:14px">
                            <div style="display:flex;justify-content:space-between;align-items:start">
                                <div>
                                    <h4 style="margin:0;font-size:15px">
                                        <i class="fas fa-${esc(s.icon || 'concierge-bell')}" style="color:${s.is_active ? '#2563EB' : '#9CA3AF'}"></i>
                                        ${esc(s.name)}
                                    </h4>
                                    <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#2563EB">${formatMoney(s.price)}</p>
                                </div>
                                <span style="padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;background:${s.is_active ? '#F0FDF4' : '#F3F4F6'};color:${s.is_active ? '#16A34A' : '#9CA3AF'}">
                                    ${s.is_active ? 'Actif' : 'Inactif'}
                                </span>
                            </div>
                            ${s.description ? `<p style="margin:6px 0 0;font-size:12px;color:var(--gray-400)">${esc(s.description)}</p>` : ''}
                            <div style="margin-top:10px;display:flex;gap:6px">
                                <button class="btn btn-sm btn-outline" onclick="showEditService(${hotelId}, ${s.id})"><i class="fas fa-edit"></i></button>
                                <button class="btn btn-sm btn-danger" onclick="deleteService(${hotelId}, ${s.id})"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (err) {
        container.innerHTML = `<p class="text-danger">${err.message}</p>`;
    }
}

function showCreateService(hotelId) {
    openModal('Nouveau service complémentaire', `
        <form onsubmit="saveService(event, ${hotelId})">
            <div class="form-group">
                <label>Nom du service *</label>
                <input type="text" name="name" required placeholder="Ex: Kit de bienvenue, Parking, Late checkout...">
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea name="description" rows="2" placeholder="Description optionnelle du service..."></textarea>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Prix (EUR) *</label>
                    <input type="number" name="price" required step="0.01" min="0" value="0" placeholder="0.00">
                </div>
                <div class="form-group">
                    <label>Icône FontAwesome</label>
                    <input type="text" name="icon" value="concierge-bell" placeholder="concierge-bell">
                    <small class="form-help">Nom sans le préfixe fa- (ex: parking, coffee, moon, gift)</small>
                </div>
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" name="is_active" value="1" checked> Service actif
                </label>
            </div>
            <div style="text-align:right;margin-top:20px">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Créer</button>
            </div>
        </form>
    `);
}

async function saveService(e, hotelId) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.hotel_id = hotelId;
    data.is_active = data.is_active ? 1 : 0;
    try {
        await API.post(`hotels/${hotelId}/selfcheckin-services`, data);
        toast('Service créé', 'success');
        closeModal();
        loadHotelServices(hotelId);
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function showEditService(hotelId, serviceId) {
    try {
        const res = await API.get(`hotels/${hotelId}/selfcheckin-services/${serviceId}`);
        const s = res.service;
        openModal('Modifier le service', `
            <form onsubmit="updateService(event, ${hotelId}, ${serviceId})">
                <div class="form-group">
                    <label>Nom du service *</label>
                    <input type="text" name="name" value="${esc(s.name)}" required>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea name="description" rows="2">${esc(s.description || '')}</textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Prix (EUR) *</label>
                        <input type="number" name="price" value="${s.price}" required step="0.01" min="0">
                    </div>
                    <div class="form-group">
                        <label>Icône FontAwesome</label>
                        <input type="text" name="icon" value="${esc(s.icon || 'concierge-bell')}">
                    </div>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" name="is_active" value="1" ${s.is_active == 1 ? 'checked' : ''}> Service actif
                    </label>
                </div>
                <div style="text-align:right;margin-top:20px">
                    <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
                </div>
            </form>
        `);
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function updateService(e, hotelId, serviceId) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.is_active = data.is_active ? 1 : 0;
    try {
        await API.put(`hotels/${hotelId}/selfcheckin-services/${serviceId}`, data);
        toast('Service mis à jour', 'success');
        closeModal();
        loadHotelServices(hotelId);
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function deleteService(hotelId, serviceId) {
    if (!confirm('Supprimer ce service complémentaire ?')) return;
    try {
        await API.delete(`hotels/${hotelId}/selfcheckin-services/${serviceId}`);
        toast('Service supprimé', 'success');
        loadHotelServices(hotelId);
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ---- ONGLET MAINTENANCE (Alertes) ----
async function renderTabMaintenance(content, h) {
    content.innerHTML = '<div class="card"><div class="card-body" style="padding:24px"><div class="loading-inline"><i class="fas fa-spinner fa-spin"></i> Chargement...</div></div></div>';

    let cfg = {};
    try {
        const res = await API.get(`hotels/${h.id}/maintenance-config`);
        cfg = res.config || {};
    } catch (e) {}

    const notifyOnComment = cfg.notify_on_comment !== undefined ? (cfg.notify_on_comment == 1) : true;
    const notifyOnStatusChange = cfg.notify_on_status_change !== undefined ? (cfg.notify_on_status_change == 1) : true;
    const notifyOnResolution = cfg.notify_on_resolution !== undefined ? (cfg.notify_on_resolution == 1) : true;
    const notifyCommenters = cfg.notify_commenters !== undefined ? (cfg.notify_commenters == 1) : true;
    const notifyHotelManager = cfg.notify_hotel_manager !== undefined ? (cfg.notify_hotel_manager == 1) : true;
    const notifyGroupeManager = cfg.notify_groupe_manager !== undefined ? (cfg.notify_groupe_manager == 1) : true;
    const notifyAdmin = cfg.notify_admin !== undefined ? (cfg.notify_admin == 1) : true;

    content.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-wrench"></i> Configuration des alertes maintenance</h3>
            </div>
            <div class="card-body" style="padding:24px">
                <form onsubmit="saveMaintenanceConfig(event, ${h.id})">
                    <p class="text-muted mb-20">Configurez quand et qui est notifié lors d'une activité sur les tickets de maintenance de cet hôtel.</p>

                    <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:10px;padding:20px;margin-bottom:24px">
                        <h5 style="margin:0 0 15px 0"><i class="fas fa-bell"></i> Quand notifier ?</h5>
                        <p class="text-muted" style="margin:0 0 12px 0;font-size:13px">Choisissez les événements qui déclenchent une notification.</p>
                        <label class="checkbox-container" style="display:flex;align-items:center;gap:10px;margin-bottom:10px;cursor:pointer">
                            <input type="checkbox" name="notify_on_comment" value="1" ${notifyOnComment ? 'checked' : ''}>
                            <span><strong>Nouveau commentaire</strong> — Quand un commentaire est ajouté au ticket</span>
                        </label>
                        <label class="checkbox-container" style="display:flex;align-items:center;gap:10px;margin-bottom:10px;cursor:pointer">
                            <input type="checkbox" name="notify_on_status_change" value="1" ${notifyOnStatusChange ? 'checked' : ''}>
                            <span><strong>Prise en charge</strong> — Quand un responsable prend en charge le ticket</span>
                        </label>
                        <label class="checkbox-container" style="display:flex;align-items:center;gap:10px;cursor:pointer">
                            <input type="checkbox" name="notify_on_resolution" value="1" ${notifyOnResolution ? 'checked' : ''}>
                            <span><strong>Résolution / Clôture</strong> — Quand le ticket est résolu</span>
                        </label>
                    </div>

                    <div style="background:#DBEAFE;border:1px solid #93C5FD;border-radius:10px;padding:20px">
                        <h5 style="margin:0 0 15px 0"><i class="fas fa-users"></i> Qui notifier ?</h5>
                        <p class="text-muted" style="margin:0 0 12px 0;font-size:13px">Sélectionnez les personnes qui recevront les alertes. Le créateur du ticket et la personne assignée sont toujours notifiés.</p>
                        <label class="checkbox-container" style="display:flex;align-items:center;gap:10px;margin-bottom:10px;cursor:pointer">
                            <input type="checkbox" name="notify_commenters" value="1" ${notifyCommenters ? 'checked' : ''}>
                            <span><strong>Commentateurs</strong> — Toute personne ayant commenté le ticket</span>
                        </label>
                        <label class="checkbox-container" style="display:flex;align-items:center;gap:10px;margin-bottom:10px;cursor:pointer">
                            <input type="checkbox" name="notify_hotel_manager" value="1" ${notifyHotelManager ? 'checked' : ''}>
                            <span><strong>Responsable Hôtel</strong> — Les hotel managers de cet hôtel</span>
                        </label>
                        <label class="checkbox-container" style="display:flex;align-items:center;gap:10px;margin-bottom:10px;cursor:pointer">
                            <input type="checkbox" name="notify_groupe_manager" value="1" ${notifyGroupeManager ? 'checked' : ''}>
                            <span><strong>Responsable Groupe</strong> — Les groupe managers</span>
                        </label>
                        <label class="checkbox-container" style="display:flex;align-items:center;gap:10px;cursor:pointer">
                            <input type="checkbox" name="notify_admin" value="1" ${notifyAdmin ? 'checked' : ''}>
                            <span><strong>Administrateur</strong> — Tous les admins</span>
                        </label>
                    </div>

                    <div style="text-align:right;margin-top:20px">
                        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer la configuration</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function saveMaintenanceConfig(e, hotelId) {
    e.preventDefault();
    const form = e.target;

    const config = {
        notify_on_comment: form.querySelector('[name="notify_on_comment"]').checked ? 1 : 0,
        notify_on_status_change: form.querySelector('[name="notify_on_status_change"]').checked ? 1 : 0,
        notify_on_resolution: form.querySelector('[name="notify_on_resolution"]').checked ? 1 : 0,
        notify_commenters: form.querySelector('[name="notify_commenters"]').checked ? 1 : 0,
        notify_hotel_manager: form.querySelector('[name="notify_hotel_manager"]').checked ? 1 : 0,
        notify_groupe_manager: form.querySelector('[name="notify_groupe_manager"]').checked ? 1 : 0,
        notify_admin: form.querySelector('[name="notify_admin"]').checked ? 1 : 0
    };

    try {
        await API.put(`hotels/${hotelId}/maintenance-config`, config);
        toast('Configuration des alertes maintenance enregistrée', 'success');
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ---- ONGLET CONGES ----
function renderTabLeaves(content, h, leaveConfig) {
    const cfg = leaveConfig || {};
    const minDelay = cfg.leave_min_delay !== undefined ? cfg.leave_min_delay : 2;
    const t1Deadline = cfg.t1_deadline || '11-01';
    const t2Deadline = cfg.t2_deadline || '02-01';
    const t3Deadline = cfg.t3_deadline || '05-01';
    const t4Deadline = cfg.t4_deadline || '08-01';
    const defaultDays = cfg.default_annual_days !== undefined ? cfg.default_annual_days : 25;

    content.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-calendar-alt"></i> Configuration des congés</h3>
            </div>
            <div class="card-body" style="padding:24px">
                <form onsubmit="saveLeaveConfig(event, ${h.id})">
                    <p class="text-muted mb-20">Paramètres spécifiques à cet hôtel pour le module congés payés. Laissez vide pour utiliser les valeurs par défaut.</p>

                    <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:20px;margin-bottom:24px">
                        <h5 style="margin:0 0 15px 0"><i class="fas fa-clock"></i> Délai et solde</h5>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Délai minimum pour poser un CP (mois)</label>
                                <input type="number" name="leave_min_delay" value="${minDelay}" min="0" max="12" step="1">
                                <small class="form-help">Nombre de mois à l'avance (défaut: 2 mois)</small>
                            </div>
                            <div class="form-group">
                                <label>Solde annuel par défaut (jours)</label>
                                <input type="number" name="default_annual_days" value="${defaultDays}" min="0" max="60" step="1">
                                <small class="form-help">Jours de CP attribués par an (défaut: 25)</small>
                            </div>
                        </div>
                    </div>

                    <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:20px">
                        <h5 style="margin:0 0 15px 0"><i class="fas fa-calendar-check"></i> Dates limites de dépôt par trimestre</h5>
                        <p class="text-muted mb-15">Date limite avant laquelle les employés doivent déposer leurs demandes de congés pour chaque trimestre.</p>

                        <div class="form-row">
                            <div class="form-group">
                                <label>T1 (Janvier - Mars)</label>
                                <div class="form-row" style="gap:8px">
                                    <select name="t1_deadline_month" style="flex:1">
                                        ${generateMonthOptions(t1Deadline.split('-')[0])}
                                    </select>
                                    <select name="t1_deadline_day" style="flex:1">
                                        ${generateDayOptions(t1Deadline.split('-')[1])}
                                    </select>
                                </div>
                                <small class="form-help">Défaut: 1er novembre (année précédente)</small>
                            </div>
                            <div class="form-group">
                                <label>T2 (Avril - Juin)</label>
                                <div class="form-row" style="gap:8px">
                                    <select name="t2_deadline_month" style="flex:1">
                                        ${generateMonthOptions(t2Deadline.split('-')[0])}
                                    </select>
                                    <select name="t2_deadline_day" style="flex:1">
                                        ${generateDayOptions(t2Deadline.split('-')[1])}
                                    </select>
                                </div>
                                <small class="form-help">Défaut: 1er février</small>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>T3 (Juillet - Septembre)</label>
                                <div class="form-row" style="gap:8px">
                                    <select name="t3_deadline_month" style="flex:1">
                                        ${generateMonthOptions(t3Deadline.split('-')[0])}
                                    </select>
                                    <select name="t3_deadline_day" style="flex:1">
                                        ${generateDayOptions(t3Deadline.split('-')[1])}
                                    </select>
                                </div>
                                <small class="form-help">Défaut: 1er mai</small>
                            </div>
                            <div class="form-group">
                                <label>T4 (Octobre - Décembre)</label>
                                <div class="form-row" style="gap:8px">
                                    <select name="t4_deadline_month" style="flex:1">
                                        ${generateMonthOptions(t4Deadline.split('-')[0])}
                                    </select>
                                    <select name="t4_deadline_day" style="flex:1">
                                        ${generateDayOptions(t4Deadline.split('-')[1])}
                                    </select>
                                </div>
                                <small class="form-help">Défaut: 1er août</small>
                            </div>
                        </div>
                    </div>

                    <div style="text-align:right;margin-top:20px">
                        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer la configuration congés</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function generateMonthOptions(selected) {
    const months = [
        {v:'01',l:'Janvier'},{v:'02',l:'Février'},{v:'03',l:'Mars'},{v:'04',l:'Avril'},
        {v:'05',l:'Mai'},{v:'06',l:'Juin'},{v:'07',l:'Juillet'},{v:'08',l:'Août'},
        {v:'09',l:'Septembre'},{v:'10',l:'Octobre'},{v:'11',l:'Novembre'},{v:'12',l:'Décembre'}
    ];
    return months.map(m => `<option value="${m.v}" ${m.v === selected ? 'selected' : ''}>${m.l}</option>`).join('');
}

function generateDayOptions(selected) {
    let html = '';
    for (let d = 1; d <= 28; d++) {
        const v = String(d).padStart(2, '0');
        html += `<option value="${v}" ${v === selected ? 'selected' : ''}>${d}</option>`;
    }
    return html;
}

async function saveLeaveConfig(e, hotelId) {
    e.preventDefault();
    const fd = new FormData(e.target);

    const config = {
        leave_min_delay: parseInt(fd.get('leave_min_delay')) || 0,
        default_annual_days: parseInt(fd.get('default_annual_days')) || 25,
        t1_deadline: fd.get('t1_deadline_month') + '-' + fd.get('t1_deadline_day'),
        t2_deadline: fd.get('t2_deadline_month') + '-' + fd.get('t2_deadline_day'),
        t3_deadline: fd.get('t3_deadline_month') + '-' + fd.get('t3_deadline_day'),
        t4_deadline: fd.get('t4_deadline_month') + '-' + fd.get('t4_deadline_day')
    };

    try {
        await API.put(`hotels/${hotelId}/leave-config`, config);
        toast('Configuration des congés enregistrée', 'success');
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ---- ONGLET CLOTURES ----
let closureConfigDocs = [];

async function renderTabClosures(content, h) {
    try {
        const res = await API.get(`closures/config/${h.id}`);
        closureConfigDocs = res.config || [];
    } catch (e) {
        closureConfigDocs = [];
    }

    content.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-cash-register"></i> Configuration des clôtures</h3>
            </div>
            <div class="card-body" style="padding:24px">
                <p class="text-muted mb-20">Configurez les documents à déposer et les champs à remplir lors des clôtures journalières.</p>

                <div id="closure-config-docs">
                    ${renderClosureConfigDocs()}
                </div>

                <button type="button" class="btn btn-outline btn-block mt-20" onclick="closureConfigAddDoc()">
                    <i class="fas fa-plus"></i> Ajouter un document
                </button>

                <div style="text-align:right;margin-top:20px">
                    <button type="button" class="btn btn-primary" onclick="saveClosureConfig(${h.id})">
                        <i class="fas fa-save"></i> Enregistrer
                    </button>
                </div>
            </div>
        </div>
    `;
}

// ---- ONGLET REVENUE ----
function renderTabRevenue(content, h) {
    content.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-chart-line"></i> Revenue Management (Xotelo)</h3>
            </div>
            <div class="card-body" style="padding:24px">
                <form onsubmit="updateHotel(event, ${h.id})">
                    <p class="text-muted mb-15">Configurez la clé Xotelo pour la veille tarifaire</p>
                    <div class="form-group">
                        <label>Clé Xotelo (hotel_key)</label>
                        <input type="text" name="xotelo_hotel_key" value="${esc(h.xotelo_hotel_key || '')}" placeholder="Ex: h12345678">
                        <small class="form-help">Trouvez cette clé sur <a href="https://xotelo.com" target="_blank">xotelo.com</a></small>
                    </div>
                    <div style="text-align:right;margin-top:20px">
                        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

// ============ HOTEL UPDATE ============

let _slugCheckTimer = null;
let _slugAvailable = true;

async function updateHotel(e, id) {
    e.preventDefault();

    if (!_slugAvailable) {
        toast('Ce slug de réservation est déjà utilisé par un autre hôtel', 'error');
        const slugInput = document.getElementById('booking-slug-input');
        if (slugInput) slugInput.focus();
        return;
    }

    const data = Object.fromEntries(new FormData(e.target));

    try {
        await API.updateHotel(id, data);
        toast(t('hotels.updated'), 'success');
        // Refresh hotel data
        const hotelRes = await API.getHotel(id);
        _editHotelData = hotelRes.hotel;
    } catch (error) {
        toast(error.message, 'error');
    }
}

async function deleteHotel(id) {
    if (!confirm(t('hotels.delete_confirm'))) return;

    try {
        await API.deleteHotel(id);
        toast(t('hotels.deleted'), 'success');
        loadHotels(document.getElementById('page-content'));
    } catch (error) {
        toast(error.message, 'error');
    }
}

// ============ ROOMS MANAGEMENT ============

async function viewHotelRooms(hotelId) {
    currentHotelId = hotelId;
    const container = document.getElementById('page-content');
    showLoading(container);

    try {
        const result = await API.getHotel(hotelId);
        const hotel = result.hotel;
        const rooms = hotel.rooms || [];

        const roomsByFloor = {};
        rooms.forEach(r => {
            if (!roomsByFloor[r.floor]) roomsByFloor[r.floor] = [];
            roomsByFloor[r.floor].push(r);
        });

        const stats = {
            total: rooms.length,
            active: rooms.filter(r => r.status === 'active').length,
            hors_service: rooms.filter(r => r.status === 'hors_service').length,
            renovation: rooms.filter(r => r.status === 'renovation').length
        };

        const typeStats = {};
        ROOM_TYPES.forEach(t => {
            typeStats[t.value] = rooms.filter(r => r.room_type === t.value).length;
        });

        container.innerHTML = `
            <div class="page-header-actions">
                <button class="btn btn-outline" onclick="loadHotels(document.getElementById('page-content'))">
                    <i class="fas fa-arrow-left"></i> ${t('common.back')}
                </button>
            </div>

            <div class="card">
                <div class="card-header">
                    <h3 class="card-title"><i class="fas fa-door-open"></i> ${esc(hotel.name)} - Gestion des chambres</h3>
                    <div class="header-actions">
                        <button class="btn btn-outline" onclick="showBulkAddRoomsModal(${hotelId})">
                            <i class="fas fa-layer-group"></i> Ajout multiple
                        </button>
                        <button class="btn btn-primary" onclick="showAddRoomModal(${hotelId})">
                            <i class="fas fa-plus"></i> ${t('hotels.add_room')}
                        </button>
                    </div>
                </div>

                <div class="rooms-stats">
                    <div class="stat-card"><div class="stat-value">${stats.total}</div><div class="stat-label">Total</div></div>
                    <div class="stat-card stat-success"><div class="stat-value">${stats.active}</div><div class="stat-label">Actives</div></div>
                    <div class="stat-card stat-warning"><div class="stat-value">${stats.hors_service}</div><div class="stat-label">Hors service</div></div>
                    <div class="stat-card stat-danger"><div class="stat-value">${stats.renovation}</div><div class="stat-label">Rénovation</div></div>
                </div>

                <div class="room-types-summary">
                    ${ROOM_TYPES.map(t => `
                        <span class="type-badge ${typeStats[t.value] > 0 ? '' : 'type-badge-empty'}">
                            ${t.icon} ${t.label}: <strong>${typeStats[t.value]}</strong>
                        </span>
                    `).join('')}
                </div>
            </div>

            ${Object.keys(roomsByFloor).sort((a,b) => a - b).map(floor => `
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title"><i class="fas fa-layer-group"></i> Étage ${floor}</h3>
                        <span class="badge badge-primary">${roomsByFloor[floor].length} chambre(s)</span>
                    </div>
                    <div class="rooms-grid">
                        ${roomsByFloor[floor].sort((a,b) => a.room_number.localeCompare(b.room_number)).map(r => `
                            <div class="room-card room-card-${r.status}" onclick="showEditRoomModal(${r.id}, ${hotelId})">
                                <div class="room-number">${esc(r.room_number)}</div>
                                <div class="room-type">${getRoomTypeIcon(r.room_type)} ${LABELS.room_type[r.room_type] || r.room_type}</div>
                                <div class="room-bed">${getBedTypeLabel(r.bed_type)}</div>
                                <div class="room-capacity"><i class="fas fa-user"></i> ${r.max_adults || 2} adulte(s) max</div>
                                <div class="room-status">${getStatusLabel(r.status)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('')}

            ${rooms.length === 0 ? `
                <div class="card">
                    <div class="empty-state">
                        <i class="fas fa-door-open"></i>
                        <h3>Aucune chambre</h3>
                        <p>Commencez par ajouter des chambres à cet hôtel</p>
                        <button class="btn btn-primary" onclick="showBulkAddRoomsModal(${hotelId})">
                            <i class="fas fa-layer-group"></i> Ajouter plusieurs chambres
                        </button>
                    </div>
                </div>
            ` : ''}
        `;
    } catch (error) {
        container.innerHTML = `<div class="card"><p class="text-danger">${t('common.error')}: ${error.message}</p></div>`;
    }
}

function getRoomTypeIcon(type) {
    const t = ROOM_TYPES.find(x => x.value === type);
    return t ? t.icon : '🛏️';
}

function getBedTypeLabel(type) {
    const t = BED_TYPES.find(x => x.value === type);
    return t ? t.label : type;
}

function getStatusLabel(status) {
    const s = ROOM_STATUSES.find(x => x.value === status);
    return s ? s.label : status;
}

// ============ ROOM CRUD ============

function showAddRoomModal(hotelId) {
    openModal(t('hotels.add_room'), `
        <form onsubmit="createRoom(event, ${hotelId})">
            <div class="form-row">
                <div class="form-group">
                    <label>${t('hotels.room_number')} *</label>
                    <input type="text" name="room_number" required placeholder="Ex: 101, A12...">
                </div>
                <div class="form-group">
                    <label>${t('hotels.room_floor')} *</label>
                    <input type="number" name="floor" value="1" min="0" required>
                </div>
            </div>
            <div class="form-group">
                <label>${t('hotels.room_type')}</label>
                <div class="room-type-selector">
                    ${ROOM_TYPES.map((t, i) => `
                        <label class="type-option">
                            <input type="radio" name="room_type" value="${t.value}" ${i === 0 ? 'checked' : ''}>
                            <span class="type-option-content">
                                <span class="type-icon">${t.icon}</span>
                                <span class="type-label">${t.label}</span>
                            </span>
                        </label>
                    `).join('')}
                </div>
            </div>
            <div class="form-group">
                <label>Type de lit</label>
                <select name="bed_type">
                    ${BED_TYPES.map(b => `<option value="${b.value}">${b.label}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Capacité max adultes</label>
                <input type="number" name="max_adults" value="2" min="1" max="10">
                <small class="form-help">Nombre maximum d'adultes pouvant occuper cette chambre</small>
            </div>
            <div class="form-group">
                <label>${t('hotels.status')}</label>
                <select name="status">
                    ${ROOM_STATUSES.map(s => `<option value="${s.value}">${s.label}</option>`).join('')}
                </select>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" onclick="closeModal()">${t('common.cancel')}</button>
                <button type="submit" class="btn btn-primary">Ajouter</button>
            </div>
        </form>
    `);

    // Auto-update max_adults when room type changes
    document.querySelectorAll('input[name="room_type"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const rt = ROOM_TYPES.find(t => t.value === radio.value);
            if (rt) document.querySelector('input[name="max_adults"]').value = rt.defaultMaxAdults;
        });
    });
}

async function createRoom(e, hotelId) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.hotel_id = hotelId;

    try {
        await API.createRoom(data);
        toast(t('hotels.room_created'), 'success');
        closeModal();
        viewHotelRooms(hotelId);
    } catch (error) {
        toast(error.message, 'error');
    }
}

async function showEditRoomModal(roomId, hotelId) {
    try {
        const result = await API.getRoom(roomId);
        const r = result.room;

        openModal(`Chambre ${r.room_number}`, `
            <form onsubmit="updateRoom(event, ${r.id}, ${hotelId})">
                <div class="form-row">
                    <div class="form-group">
                        <label>${t('hotels.room_number')} *</label>
                        <input type="text" name="room_number" value="${esc(r.room_number)}" required>
                    </div>
                    <div class="form-group">
                        <label>${t('hotels.room_floor')} *</label>
                        <input type="number" name="floor" value="${r.floor}" min="0" required>
                    </div>
                </div>
                <div class="form-group">
                    <label>${t('hotels.room_type')}</label>
                    <div class="room-type-selector">
                        ${ROOM_TYPES.map(t => `
                            <label class="type-option">
                                <input type="radio" name="room_type" value="${t.value}" ${r.room_type === t.value ? 'checked' : ''}>
                                <span class="type-option-content">
                                    <span class="type-icon">${t.icon}</span>
                                    <span class="type-label">${t.label}</span>
                                </span>
                            </label>
                        `).join('')}
                    </div>
                </div>
                <div class="form-group">
                    <label>Type de lit</label>
                    <select name="bed_type">
                        ${BED_TYPES.map(b => `<option value="${b.value}" ${r.bed_type === b.value ? 'selected' : ''}>${b.label}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Capacité max adultes</label>
                    <input type="number" name="max_adults" value="${r.max_adults || 2}" min="1" max="10">
                    <small class="form-help">Nombre maximum d'adultes pouvant occuper cette chambre</small>
                </div>
                <div class="form-group">
                    <label>${t('hotels.status')}</label>
                    <select name="status">
                        ${ROOM_STATUSES.map(s => `<option value="${s.value}" ${r.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
                    </select>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-danger" onclick="deleteRoom(${r.id}, ${hotelId})" style="margin-right:auto">
                        <i class="fas fa-trash"></i> ${t('common.delete')}
                    </button>
                    <button type="button" class="btn btn-outline" onclick="closeModal()">${t('common.cancel')}</button>
                    <button type="submit" class="btn btn-primary">${t('common.save')}</button>
                </div>
            </form>
        `);
    } catch (error) {
        toast(error.message, 'error');
    }
}

async function updateRoom(e, roomId, hotelId) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));

    try {
        await API.updateRoom(roomId, data);
        toast(t('hotels.room_updated'), 'success');
        closeModal();
        viewHotelRooms(hotelId);
    } catch (error) {
        toast(error.message, 'error');
    }
}

async function deleteRoom(roomId, hotelId) {
    if (!confirm(t('hotels.room_delete_confirm'))) return;

    try {
        await API.deleteRoom(roomId);
        toast(t('hotels.room_deleted'), 'success');
        closeModal();
        viewHotelRooms(hotelId);
    } catch (error) {
        toast(error.message, 'error');
    }
}

// ============ BULK ADD ROOMS ============

function showBulkAddRoomsModal(hotelId) {
    openModal('Ajouter plusieurs chambres', `
        <form onsubmit="bulkAddRooms(event, ${hotelId})">
            <p class="text-muted mb-20">Créez rapidement plusieurs chambres en définissant une plage de numéros.</p>
            <div class="form-row">
                <div class="form-group">
                    <label>${t('hotels.room_floor')} *</label>
                    <input type="number" name="floor" value="1" min="0" required>
                </div>
                <div class="form-group">
                    <label>Préfixe (optionnel)</label>
                    <input type="text" name="prefix" placeholder="Ex: A, B...">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Numéro début *</label>
                    <input type="number" name="start" value="1" min="1" required>
                </div>
                <div class="form-group">
                    <label>Numéro fin *</label>
                    <input type="number" name="end" value="10" min="1" required>
                </div>
            </div>
            <div class="form-group">
                <label>${t('hotels.room_type')}</label>
                <select name="room_type">
                    ${ROOM_TYPES.map(t => `<option value="${t.value}">${t.icon} ${t.label}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Type de lit</label>
                <select name="bed_type">
                    ${BED_TYPES.map(b => `<option value="${b.value}">${b.label}</option>`).join('')}
                </select>
            </div>
            <div class="bulk-preview" id="bulk-preview"></div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" onclick="closeModal()">${t('common.cancel')}</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i> Créer les chambres</button>
            </div>
        </form>
    `);

    document.querySelectorAll('input[name="floor"], input[name="prefix"], input[name="start"], input[name="end"]').forEach(input => {
        input.addEventListener('input', updateBulkPreview);
    });
    updateBulkPreview();
}

function updateBulkPreview() {
    const floor = document.querySelector('input[name="floor"]').value;
    const prefix = document.querySelector('input[name="prefix"]').value || '';
    const start = parseInt(document.querySelector('input[name="start"]').value) || 1;
    const end = parseInt(document.querySelector('input[name="end"]').value) || 1;

    const preview = document.getElementById('bulk-preview');
    if (!preview) return;

    const count = Math.max(0, end - start + 1);
    if (count > 50) {
        preview.innerHTML = `<p class="text-warning"><i class="fas fa-exclamation-triangle"></i> Maximum 50 chambres à la fois</p>`;
        return;
    }

    const rooms = [];
    for (let i = start; i <= end && i < start + 50; i++) {
        rooms.push(`${prefix}${floor}${String(i).padStart(2, '0')}`);
    }

    preview.innerHTML = `
        <p><strong>${count} chambre(s) à créer :</strong></p>
        <div class="preview-rooms">${rooms.map(r => `<span class="preview-room">${r}</span>`).join('')}</div>
    `;
}

async function bulkAddRooms(e, hotelId) {
    e.preventDefault();
    const formData = new FormData(e.target);

    const floor = formData.get('floor');
    const prefix = formData.get('prefix') || '';
    const start = parseInt(formData.get('start'));
    const end = parseInt(formData.get('end'));
    const roomType = formData.get('room_type');
    const bedType = formData.get('bed_type');

    const count = end - start + 1;
    if (count > 50) {
        toast('Maximum 50 chambres à la fois', 'error');
        return;
    }

    try {
        let created = 0;
        for (let i = start; i <= end; i++) {
            const roomNumber = `${prefix}${floor}${String(i).padStart(2, '0')}`;
            try {
                await API.createRoom({
                    hotel_id: hotelId,
                    room_number: roomNumber,
                    floor: floor,
                    room_type: roomType,
                    bed_type: bedType,
                    status: 'active'
                });
                created++;
            } catch (err) {
                console.warn(`Chambre ${roomNumber} non créée:`, err.message);
            }
        }

        toast(`${created} chambre(s) créée(s)`, 'success');
        closeModal();
        viewHotelRooms(hotelId);
    } catch (error) {
        toast(error.message, 'error');
    }
}

// ==================== CLOSURE CONFIG ====================

function renderClosureConfigDocs() {
    if (closureConfigDocs.length === 0) {
        return `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <p>Aucun document configuré</p>
                <small class="text-muted">Ajoutez des documents requis pour les clôtures journalières</small>
            </div>
        `;
    }

    return closureConfigDocs.map((doc, idx) => `
        <div class="closure-config-doc card mb-15" data-index="${idx}">
            <div class="card-header">
                <div class="closure-config-doc-header">
                    <i class="fas fa-grip-vertical text-muted mr-10"></i>
                    <input type="text" class="form-control" value="${esc(doc.document_name || '')}"
                        onchange="closureConfigUpdateDoc(${idx}, 'document_name', this.value)"
                        placeholder="Nom du document *" style="flex: 1;">
                    <label class="checkbox-label ml-15">
                        <input type="checkbox" ${doc.is_required ? 'checked' : ''}
                            onchange="closureConfigUpdateDoc(${idx}, 'is_required', this.checked)">
                        Obligatoire
                    </label>
                    <button type="button" class="btn btn-sm btn-danger ml-10" onclick="closureConfigRemoveDoc(${idx})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="card-body">
                <h6 class="mb-10">Champs personnalisés</h6>
                <div class="closure-config-fields" id="closure-config-fields-${idx}">
                    ${renderClosureConfigFields(idx, doc.fields || [])}
                </div>
                <button type="button" class="btn btn-sm btn-outline mt-10" onclick="closureConfigAddField(${idx})">
                    <i class="fas fa-plus"></i> Ajouter un champ
                </button>
            </div>
        </div>
    `).join('');
}

function renderClosureConfigFields(docIdx, fields) {
    if (fields.length === 0) {
        return '<p class="text-muted mb-0">Aucun champ - Document uniquement</p>';
    }

    return fields.map((field, fieldIdx) => `
        <div class="closure-config-field form-row mb-10" data-field-index="${fieldIdx}">
            <div class="form-group" style="flex: 2;">
                <input type="text" class="form-control" value="${esc(field.field_name || '')}"
                    onchange="closureConfigUpdateField(${docIdx}, ${fieldIdx}, 'field_name', this.value)"
                    placeholder="Nom du champ">
            </div>
            <div class="form-group" style="flex: 1;">
                <select class="form-control" onchange="closureConfigUpdateField(${docIdx}, ${fieldIdx}, 'field_type', this.value)">
                    <option value="text" ${field.field_type === 'text' ? 'selected' : ''}>Texte</option>
                    <option value="number" ${field.field_type === 'number' ? 'selected' : ''}>Nombre entier</option>
                    <option value="decimal" ${field.field_type === 'decimal' ? 'selected' : ''}>Nombre décimal</option>
                    <option value="date" ${field.field_type === 'date' ? 'selected' : ''}>Date</option>
                    <option value="select" ${field.field_type === 'select' ? 'selected' : ''}>Liste déroulante</option>
                </select>
            </div>
            <div class="form-group" style="flex: 0 0 auto;">
                <label class="checkbox-label">
                    <input type="checkbox" ${field.is_required ? 'checked' : ''}
                        onchange="closureConfigUpdateField(${docIdx}, ${fieldIdx}, 'is_required', this.checked)">
                    Obligatoire
                </label>
            </div>
            <div class="form-group" style="flex: 0 0 auto;">
                <button type="button" class="btn btn-sm btn-danger" onclick="closureConfigRemoveField(${docIdx}, ${fieldIdx})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function closureConfigAddDoc() {
    closureConfigDocs.push({ document_name: '', is_required: true, closure_type: 'daily', fields: [] });
    document.getElementById('closure-config-docs').innerHTML = renderClosureConfigDocs();
}

function closureConfigRemoveDoc(idx) {
    if (!confirm('Supprimer ce document ?')) return;
    closureConfigDocs.splice(idx, 1);
    document.getElementById('closure-config-docs').innerHTML = renderClosureConfigDocs();
}

function closureConfigUpdateDoc(idx, field, value) {
    closureConfigDocs[idx][field] = value;
}

function closureConfigAddField(docIdx) {
    if (!closureConfigDocs[docIdx].fields) closureConfigDocs[docIdx].fields = [];
    closureConfigDocs[docIdx].fields.push({ field_name: '', field_type: 'text', is_required: false });
    document.getElementById(`closure-config-fields-${docIdx}`).innerHTML =
        renderClosureConfigFields(docIdx, closureConfigDocs[docIdx].fields);
}

function closureConfigRemoveField(docIdx, fieldIdx) {
    closureConfigDocs[docIdx].fields.splice(fieldIdx, 1);
    document.getElementById(`closure-config-fields-${docIdx}`).innerHTML =
        renderClosureConfigFields(docIdx, closureConfigDocs[docIdx].fields);
}

function closureConfigUpdateField(docIdx, fieldIdx, field, value) {
    closureConfigDocs[docIdx].fields[fieldIdx][field] = value;
}

async function saveClosureConfig(hotelId) {
    const validDocs = closureConfigDocs.filter(d => d.document_name && d.document_name.trim());

    if (closureConfigDocs.length > 0 && validDocs.length === 0) {
        toast('Veuillez renseigner le nom des documents', 'warning');
        return;
    }

    try {
        await API.post(`closures/config/${hotelId}`, { config: validDocs });
        toast('Configuration enregistrée', 'success');
    } catch (e) {
        toast(e.message, 'error');
    }
}

// ==================== BOOKING HELPERS ====================

function copyBookingUrl() {
    const field = document.getElementById('booking-url-field');
    if (field && field.value) {
        navigator.clipboard.writeText(field.value);
        toast('URL copiée dans le presse-papier', 'success');
    }
}

function onSlugInput() {
    updateBookingUrlPreview();
    clearTimeout(_slugCheckTimer);
    const input = document.getElementById('booking-slug-input');
    if (!input) return;
    const slug = input.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (slug !== input.value) input.value = slug;
    const icon = document.getElementById('slug-check-icon');
    const msg = document.getElementById('slug-check-msg');
    if (!slug) {
        _slugAvailable = true;
        if (icon) icon.innerHTML = '';
        if (msg) { msg.style.display = 'none'; msg.textContent = ''; }
        return;
    }
    if (slug === input.dataset.originalSlug) {
        _slugAvailable = true;
        if (icon) icon.innerHTML = '<i class="fas fa-check-circle" style="color:#16A34A"></i>';
        if (msg) { msg.style.display = 'none'; }
        return;
    }
    if (icon) icon.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:#9CA3AF"></i>';
    if (msg) { msg.style.display = 'none'; }
    _slugCheckTimer = setTimeout(async () => {
        try {
            const hotelId = input.dataset.hotelId || 0;
            const res = await API.get(`/hotels/check-slug?slug=${encodeURIComponent(slug)}&exclude_id=${hotelId}`);
            if (res.available) {
                _slugAvailable = true;
                if (icon) icon.innerHTML = '<i class="fas fa-check-circle" style="color:#16A34A"></i>';
                if (msg) { msg.style.display = 'block'; msg.innerHTML = '<span style="color:#16A34A">Slug disponible</span>'; }
            } else {
                _slugAvailable = false;
                if (icon) icon.innerHTML = '<i class="fas fa-times-circle" style="color:#DC2626"></i>';
                if (msg) { msg.style.display = 'block'; msg.innerHTML = '<span style="color:#DC2626">Ce slug est déjà utilisé</span>'; }
            }
        } catch (err) {
            _slugAvailable = true;
            if (icon) icon.innerHTML = '';
            if (msg) { msg.style.display = 'none'; }
        }
    }, 500);
}

function updateBookingUrlPreview() {
    const slugInput = document.getElementById('booking-slug-input');
    const urlField = document.getElementById('booking-url-field');
    const urlGroup = document.getElementById('booking-url-group');
    const openBtn = document.getElementById('booking-url-open');
    if (!slugInput || !urlField || !urlGroup) return;

    const slug = slugInput.value.trim();
    if (slug) {
        const url = window.location.origin + '/booking.html?hotel=' + encodeURIComponent(slug);
        urlField.value = url;
        urlGroup.style.display = '';
        if (openBtn) openBtn.href = url;
    } else {
        urlGroup.style.display = 'none';
        urlField.value = '';
    }
}

// ==================== TAB STYLES ====================

function injectHotelTabStyles() {
    if (document.getElementById('hotel-tab-styles')) return;
    const style = document.createElement('style');
    style.id = 'hotel-tab-styles';
    style.textContent = `
        .hotel-tab {
            padding: 12px 20px;
            border: none;
            background: none;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            color: var(--gray-500);
            border-bottom: 2px solid transparent;
            margin-bottom: -2px;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .hotel-tab:hover { color: var(--gray-700); background: var(--gray-50); }
        .hotel-tab.active {
            color: var(--primary);
            border-bottom-color: var(--primary);
        }
        .hotel-tab i { font-size: 13px; }
        @media (max-width: 768px) {
            .hotel-tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; }
            .hotel-tab { padding: 10px 14px; font-size: 13px; white-space: nowrap; }
        }
    `;
    document.head.appendChild(style);
}

// ---- ONGLET CONTRATS IA (config par hôtel, admin only) ----
async function renderTabContracts(content, h) {
    content.innerHTML = '<div class="loading-spinner"></div>';
    let config = { ai_enabled: 0, has_api_key: 0 };
    try {
        const res = await API.getHotelContractsConfig(h.id);
        if (res.config) config = res.config;
    } catch (e) {}

    content.innerHTML = `
        <div class="card" style="max-width:700px">
            <div class="card-header">
                <h3 class="card-title"><i class="fas fa-robot"></i> Configuration Analyse IA - Contrats</h3>
            </div>
            <div style="padding:24px">
                <p style="margin-bottom:20px;color:var(--gray-500)">
                    Activez l'analyse IA des contrats fournisseurs pour cet hôtel.
                    L'IA (Anthropic Claude) analysera les contrats et générera des notes d'alerte,
                    des recommandations et des points d'attention.
                </p>

                <div class="form-group">
                    <label style="display:flex;align-items:center;gap:12px;cursor:pointer">
                        <input type="checkbox" id="ct-cfg-ai-enabled" ${config.ai_enabled == 1 ? 'checked' : ''}>
                        <strong>Activer l'analyse IA pour cet hôtel</strong>
                    </label>
                </div>

                <div class="form-group" id="ct-cfg-api-section" style="${config.ai_enabled == 1 ? '' : 'display:none'}">
                    <label>Clé API Anthropic</label>
                    <input type="password" class="form-control" id="ct-cfg-api-key"
                           placeholder="${config.has_api_key ? '••••••••••••••••••••• (clé configurée)' : 'sk-ant-api03-...'}"
                           value="">
                    <small style="color:var(--gray-400);margin-top:4px;display:block">
                        ${config.has_api_key ? 'Une clé est déjà configurée. Laissez vide pour la conserver, ou saisissez une nouvelle clé.' : 'Obtenez votre clé sur console.anthropic.com'}
                    </small>
                </div>

                <div style="margin-top:24px">
                    <button class="btn btn-primary" onclick="saveHotelContractsConfig(${h.id})">
                        <i class="fas fa-save"></i> Enregistrer
                    </button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('ct-cfg-ai-enabled').addEventListener('change', function() {
        document.getElementById('ct-cfg-api-section').style.display = this.checked ? '' : 'none';
    });
}

async function saveHotelContractsConfig(hotelId) {
    const aiEnabled = document.getElementById('ct-cfg-ai-enabled').checked;
    const apiKey = document.getElementById('ct-cfg-api-key').value;

    const data = { ai_enabled: aiEnabled ? 1 : 0 };
    if (apiKey) data.anthropic_api_key = apiKey;

    try {
        await API.saveHotelContractsConfig(hotelId, data);
        toast('Configuration sauvegardée', 'success');
    } catch (e) {
        toast('Erreur: ' + e.message, 'error');
    }
}

// Backward compat - old function name redirects to new page
function showEditHotelModal(id) {
    showEditHotelPage(id);
}
