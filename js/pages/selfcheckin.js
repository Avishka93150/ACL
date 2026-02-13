// ==================== MODULE SELF CHECK-IN ====================
// Gestion des réservations self check-in, casiers et tarifs journaliers

let _scHotelId = null;
let _scTab = 'reservations';
let _scReservations = [];
let _scLockers = [];
let _scRooms = [];
let _scHotels = [];
let _scHotelData = {};
let _scFilterDate = new Date().toISOString().split('T')[0];
let _scArchiveData = [];
let _scArchiveStats = {};
let _scPaymentLinks = [];
let _scPaymentStats = {};

async function loadSelfcheckin(container) {
    showLoading(container);
    try {
        const mgmtRes = await API.getManagementInfo();
        _scHotels = mgmtRes.manageable_hotels || [];

        if (_scHotels.length === 0) {
            container.innerHTML = '<div class="card"><div class="empty-state"><i class="fas fa-door-open" style="font-size:48px;color:var(--gray-300);margin-bottom:16px"></i><p>Aucun hôtel accessible</p></div></div>';
            return;
        }

        _scHotelId = _scHotelId || _scHotels[0].id;

        container.innerHTML = `
            <div class="page-header">
                <div>
                    <h2><i class="fas fa-door-open"></i> Self Check-in</h2>
                    <p>Gestion des réservations et tarifs</p>
                </div>
                <div class="header-actions-group">
                    ${_scHotels.length > 1 ? `
                    <select id="sc-hotel-select" class="form-control" style="width:auto;min-width:200px" onchange="scSwitchHotel(this.value)">
                        ${_scHotels.map(h => `<option value="${h.id}" ${h.id == _scHotelId ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}
                    </select>` : ''}
                </div>
            </div>

            <div id="sc-stats" style="margin-bottom:20px"></div>

            <div class="tabs-container" style="display:flex;gap:0;border-bottom:2px solid var(--gray-200);margin-bottom:20px">
                <button class="tab-btn ${_scTab === 'reservations' ? 'active' : ''}" data-tab="reservations" onclick="scSwitchTab('reservations')">
                    <i class="fas fa-clipboard-list"></i> Réservations
                </button>
                <button class="tab-btn ${_scTab === 'pricing' ? 'active' : ''}" data-tab="pricing" onclick="scSwitchTab('pricing')">
                    <i class="fas fa-euro-sign"></i> Tarifs journaliers
                </button>
                <button class="tab-btn ${_scTab === 'archives' ? 'active' : ''}" data-tab="archives" onclick="scSwitchTab('archives')">
                    <i class="fas fa-archive"></i> Archives des ventes
                </button>
                <button class="tab-btn ${_scTab === 'payment_links' ? 'active' : ''}" data-tab="payment_links" onclick="scSwitchTab('payment_links')">
                    <i class="fas fa-link"></i> Liens de paiement
                </button>
            </div>

            <div id="sc-tab-content"></div>
        `;

        scInjectStyles();
        await scLoadStats();
        scRenderTab();
    } catch (err) {
        container.innerHTML = `<div class="alert alert-danger">Erreur : ${esc(err.message)}</div>`;
        console.error(err);
    }
}

async function scSwitchHotel(hotelId) {
    _scHotelId = hotelId;
    await scLoadStats();
    scRenderTab();
}

function scSwitchTab(tab) {
    _scTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    scRenderTab();
}

async function scLoadStats() {
    try {
        const stats = await API.get(`selfcheckin/stats?hotel_id=${_scHotelId}`);
        const el = document.getElementById('sc-stats');
        if (!el) return;
        el.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
                <div class="card" style="padding:16px;text-align:center">
                    <div style="font-size:24px;font-weight:700;color:var(--primary)">${stats.today_total || 0}</div>
                    <div style="font-size:12px;color:var(--gray-500)">Réservations aujourd'hui</div>
                </div>
                <div class="card" style="padding:16px;text-align:center">
                    <div style="font-size:24px;font-weight:700;color:#16A34A">${stats.today_confirmed || 0}</div>
                    <div style="font-size:12px;color:var(--gray-500)">Confirmées (payées)</div>
                </div>
                <div class="card" style="padding:16px;text-align:center">
                    <div style="font-size:24px;font-weight:700;color:#F59E0B">${stats.today_pending || 0}</div>
                    <div style="font-size:12px;color:var(--gray-500)">En attente</div>
                </div>
                <div class="card" style="padding:16px;text-align:center">
                    <div style="font-size:24px;font-weight:700;color:#6366F1">${stats.lockers_available || 0}/${stats.lockers_total || 0}</div>
                    <div style="font-size:12px;color:var(--gray-500)">Casiers disponibles</div>
                </div>
            </div>
        `;
    } catch (e) {}
}

async function scRenderTab() {
    const content = document.getElementById('sc-tab-content');
    if (!content) return;

    switch (_scTab) {
        case 'reservations': await scRenderReservations(content); break;
        case 'pricing': await scRenderPricing(content); break;
        case 'archives': await scRenderArchives(content); break;
        case 'payment_links': await scRenderPaymentLinks(content); break;
    }
}

// ==================== ONGLET RESERVATIONS ====================

async function scRenderReservations(content) {
    content.innerHTML = '<div class="loading-inline"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>';

    try {
        const [resData, lockersData, roomsData] = await Promise.all([
            API.get(`selfcheckin?hotel_id=${_scHotelId}`),
            API.get(`lockers?hotel_id=${_scHotelId}`),
            API.get(`hotels/${_scHotelId}`)
        ]);

        _scReservations = resData.reservations || [];
        _scLockers = lockersData.lockers || [];
        _scHotelData = roomsData.hotel || roomsData || {};
        _scRooms = (_scHotelData.rooms) || roomsData.rooms || [];

        content.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <select id="sc-filter-type" onchange="scFilterReservations()" class="form-control" style="width:auto">
                        <option value="">Tous types</option>
                        <option value="pre_booked">Pré-enregistrées</option>
                        <option value="walkin">Walk-in</option>
                    </select>
                    <select id="sc-filter-status" onchange="scFilterReservations()" class="form-control" style="width:auto">
                        <option value="">Tous statuts</option>
                        <option value="pending">En attente</option>
                        <option value="confirmed">Confirmée</option>
                        <option value="checked_in">Checked-in</option>
                        <option value="cancelled">Annulée</option>
                    </select>
                    <input type="date" id="sc-filter-date" onchange="scFilterReservations()" class="form-control" style="width:auto" value="${_scFilterDate}">
                </div>
                <div style="display:flex;gap:8px">
                    <button class="btn btn-primary" onclick="scShowCreateReservation('pre_booked')">
                        <i class="fas fa-plus"></i> Nouvelle réservation
                    </button>
                    <button class="btn btn-outline" onclick="scShowCreateReservation('walkin')">
                        <i class="fas fa-walking"></i> Slot Walk-in
                    </button>
                </div>
            </div>
            <div id="sc-reservations-list"></div>
        `;

        scFilterReservations();
    } catch (err) {
        content.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
    }
}

function scFilterReservations() {
    const type = document.getElementById('sc-filter-type')?.value || '';
    const status = document.getElementById('sc-filter-status')?.value || '';
    const date = document.getElementById('sc-filter-date')?.value || '';
    _scFilterDate = date;

    let filtered = _scReservations;
    if (type) filtered = filtered.filter(r => r.type === type);
    if (status) filtered = filtered.filter(r => r.status === status);
    if (date) filtered = filtered.filter(r => r.checkin_date === date);

    const list = document.getElementById('sc-reservations-list');
    if (!list) return;

    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding:40px"><i class="fas fa-clipboard-list" style="font-size:36px;color:var(--gray-300);margin-bottom:12px"></i><p>Aucune réservation trouvée</p></div>';
        return;
    }

    list.innerHTML = `
        <div class="table-responsive">
            <table class="table">
                <thead>
                    <tr>
                        <th>N° Résa</th>
                        <th>Type</th>
                        <th>Client</th>
                        <th>Date</th>
                        <th>Chambre</th>
                        <th>Casier</th>
                        <th>Total</th>
                        <th>Arrhes</th>
                        <th>Reste</th>
                        <th>Statut</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtered.map(r => {
                        const canDelete = !['confirmed', 'checked_in'].includes(r.status);
                        const canReleaseLocker = r.locker_id && !['checked_in', 'checked_out', 'cancelled', 'no_show'].includes(r.status);
                        return `
                        <tr>
                            <td><strong>${esc(r.reservation_number)}</strong></td>
                            <td><span class="badge badge-${r.type === 'pre_booked' ? 'primary' : 'warning'}">${r.type === 'pre_booked' ? 'Pré-enregistrée' : 'Walk-in'}</span></td>
                            <td>${r.guest_last_name ? esc((r.guest_first_name || '') + ' ' + r.guest_last_name) : '<em class="text-muted">Non renseigné</em>'}</td>
                            <td>${r.checkin_date ? formatDate(r.checkin_date) : '-'}</td>
                            <td>${r.room_number ? '<i class="fas fa-bed"></i> ' + esc(r.room_number) : '-'}</td>
                            <td>${r.locker_number ? '<i class="fas fa-lock"></i> ' + esc(r.locker_number) + (r.locker_code ? ' <small style="color:var(--gray-400)">(' + esc(r.locker_code) + ')</small>' : '') : '-'}</td>
                            <td>${formatMoney(r.total_amount || 0)}</td>
                            <td>${r.deposit_amount > 0 ? formatMoney(r.deposit_amount) : '-'}</td>
                            <td><strong>${formatMoney(r.remaining_amount || 0)}</strong></td>
                            <td>${scStatusBadge(r.status, r.payment_status)}</td>
                            <td>
                                <div style="display:flex;gap:4px;flex-wrap:wrap">
                                    <button class="btn btn-sm btn-outline" onclick="scEditReservation(${r.id})" title="Modifier"><i class="fas fa-edit"></i></button>
                                    ${canReleaseLocker ? `<button class="btn btn-sm btn-outline" style="color:#F59E0B;border-color:#F59E0B" onclick="scReleaseLocker(${r.id})" title="Libérer le casier"><i class="fas fa-lock-open"></i></button>` : ''}
                                    ${canDelete ? `<button class="btn btn-sm btn-danger" onclick="scDeleteReservation(${r.id})" title="Supprimer"><i class="fas fa-trash"></i></button>` : ''}
                                </div>
                            </td>
                        </tr>
                    `;}).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function scStatusBadge(status, paymentStatus) {
    const statusMap = {
        'pending': { label: 'En attente', color: '#F59E0B', bg: '#FFFBEB' },
        'confirmed': { label: 'Confirmée', color: '#16A34A', bg: '#F0FDF4' },
        'checked_in': { label: 'Checked-in', color: '#2563EB', bg: '#EFF6FF' },
        'checked_out': { label: 'Checked-out', color: '#6B7280', bg: '#F9FAFB' },
        'cancelled': { label: 'Annulée', color: '#DC2626', bg: '#FEF2F2' },
        'no_show': { label: 'No-show', color: '#9333EA', bg: '#FAF5FF' },
    };
    const s = statusMap[status] || { label: status, color: '#6B7280', bg: '#F9FAFB' };
    let badge = `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:${s.color};background:${s.bg}">${s.label}</span>`;

    if (paymentStatus === 'paid') {
        badge += ' <i class="fas fa-check-circle" style="color:#16A34A;font-size:11px" title="Payée"></i>';
    }
    return badge;
}

// ==================== LIBERER CASIER ====================

async function scReleaseLocker(reservationId) {
    if (!confirm('Libérer le casier de cette réservation ? Le casier sera de nouveau disponible.')) return;
    try {
        await API.post(`selfcheckin/${reservationId}/release-locker`, {});
        toast('Casier libéré avec succès', 'success');
        await scLoadStats();
        scRenderTab();
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ==================== CREER / MODIFIER / SUPPRIMER ====================

function scShowCreateReservation(type) {
    const isWalkin = type === 'walkin';
    const availableLockers = _scLockers.filter(l => l.status === 'available');
    const activeRooms = _scRooms.filter(r => r.status === 'active');

    const modalContent = `
        <form onsubmit="scSaveReservation(event)">
            <input type="hidden" name="type" value="${type}">
            <input type="hidden" name="hotel_id" value="${_scHotelId}">

            ${!isWalkin ? `
            <div class="form-row">
                <div class="form-group">
                    <label>Numéro de réservation</label>
                    <input type="text" name="reservation_number" placeholder="Auto-généré si vide">
                    <small class="form-help">Laissez vide pour auto-générer</small>
                </div>
                <div class="form-group">
                    <label>Date d'arrivée *</label>
                    <input type="date" name="checkin_date" value="${new Date().toISOString().split('T')[0]}" required>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Nom *</label>
                    <input type="text" name="guest_last_name" required>
                </div>
                <div class="form-group">
                    <label>Prénom</label>
                    <input type="text" name="guest_first_name">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" name="guest_email">
                </div>
                <div class="form-group">
                    <label>Téléphone</label>
                    <input type="tel" name="guest_phone">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Nb adultes *</label>
                    <input type="number" name="nb_adults" value="1" min="1" max="10" required oninput="scCalcTotal()">
                </div>
                <div class="form-group">
                    <label>Nb enfants</label>
                    <input type="number" name="nb_children" value="0" min="0" max="10">
                </div>
            </div>

            <div class="form-group">
                <label><input type="checkbox" name="breakfast_included" value="1"> Petit-déjeuner inclus</label>
            </div>

            <hr style="margin:16px 0">
            <h4 style="margin-bottom:12px"><i class="fas fa-euro-sign"></i> Tarification</h4>

            <div class="form-row">
                <div class="form-group">
                    <label>Prix hébergement</label>
                    <input type="number" name="accommodation_price" step="0.01" min="0" value="0" oninput="scCalcTotal()">
                </div>
                <div class="form-group">
                    <label>Taxe de séjour (par pers.)</label>
                    <input type="number" name="tourist_tax_per_person" step="0.01" min="0" value="${_scHotelData.default_tourist_tax || 0}" oninput="scCalcTotal()">
                    <small class="form-help" id="sc-tax-total"></small>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Prix petit-déjeuner</label>
                    <input type="number" name="breakfast_price" step="0.01" min="0" value="0" oninput="scCalcTotal()">
                </div>
                <div class="form-group">
                    <label>Arrhes (déjà payées)</label>
                    <input type="number" name="deposit_amount" step="0.01" min="0" value="0" oninput="scCalcTotal()">
                </div>
            </div>

            <div class="form-group">
                <label>Total TTC</label>
                <input type="number" name="total_amount" step="0.01" min="0" value="0" id="sc-total-amount" style="font-weight:700;font-size:16px" readonly>
            </div>
            ` : `
            <div class="form-row">
                <div class="form-group">
                    <label>Date *</label>
                    <input type="date" name="checkin_date" value="${new Date().toISOString().split('T')[0]}" required>
                </div>
            </div>
            <p class="text-muted">Slot walk-in : aucune info client. Le client remplira ses informations lors du self check-in.</p>
            `}

            <hr style="margin:16px 0">
            <h4 style="margin-bottom:12px"><i class="fas fa-lock"></i> Chambre, Casier & Code</h4>

            <div class="form-row">
                <div class="form-group">
                    <label>Chambre *</label>
                    <select name="room_number" required>
                        <option value="">-- Sélectionner --</option>
                        ${activeRooms.map(r => `<option value="${r.room_number}" data-room-id="${r.id}">${r.room_number} (${r.room_type})</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Casier *</label>
                    <select name="locker_id" required onchange="scOnLockerChange(this)">
                        <option value="">-- Sélectionner --</option>
                        ${availableLockers.map(l => `<option value="${l.id}" data-code="${esc(l.locker_code)}">${l.locker_number}</option>`).join('')}
                        ${_scLockers.filter(l => l.status !== 'available').map(l => `<option value="${l.id}" disabled data-code="${esc(l.locker_code)}">${l.locker_number} (${l.status === 'assigned' ? 'assigné' : 'maintenance'})</option>`).join('')}
                    </select>
                    ${_scLockers.length === 0 ? '<small class="form-help" style="color:var(--danger)">Aucun casier configuré. Configurez-les dans Hôtels > Self Check-in.</small>' : availableLockers.length === 0 ? '<small class="form-help" style="color:var(--warning)">Tous les casiers sont occupés. Libérez un casier en annulant ou complétant une réservation existante.</small>' : ''}
                </div>
            </div>
            <div class="form-group">
                <label>Code du casier *</label>
                <input type="text" name="locker_code" required placeholder="Code d'accès du jour">
                <small class="form-help">Le code change quotidiennement. Il est pré-rempli depuis la configuration du casier.</small>
            </div>

            <div style="text-align:right;margin-top:20px">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Créer</button>
            </div>
        </form>
    `;

    openModal(isWalkin ? 'Nouveau slot Walk-in' : 'Nouvelle réservation', modalContent, 'large');
}

function scCalcTotal() {
    const accom = parseFloat(document.querySelector('[name="accommodation_price"]')?.value || 0);
    const taxPerPerson = parseFloat(document.querySelector('[name="tourist_tax_per_person"]')?.value || 0);
    const nbAdults = parseInt(document.querySelector('[name="nb_adults"]')?.value || 1);
    const breakfast = parseFloat(document.querySelector('[name="breakfast_price"]')?.value || 0);
    const tax = taxPerPerson * nbAdults;
    const total = accom + tax + breakfast;
    const totalField = document.getElementById('sc-total-amount');
    if (totalField) totalField.value = total.toFixed(2);
    const taxDisplay = document.getElementById('sc-tax-total');
    if (taxDisplay) taxDisplay.textContent = `Total : ${tax.toFixed(2)} € (${nbAdults} pers. × ${taxPerPerson.toFixed(2)} €)`;
}

function scOnLockerChange(select) {
    const opt = select.selectedOptions[0];
    const codeField = document.querySelector('[name="locker_code"]');
    if (opt && codeField && opt.dataset.code) {
        codeField.value = opt.dataset.code;
    }
}

async function scSaveReservation(e) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));

    // Get room_id from select
    const roomSelect = form.querySelector('[name="room_number"]');
    if (roomSelect && roomSelect.selectedOptions[0]) {
        data.room_id = roomSelect.selectedOptions[0].dataset.roomId || null;
    }

    // Checkboxes
    data.breakfast_included = form.querySelector('[name="breakfast_included"]')?.checked ? 1 : 0;

    // Calculer la taxe de séjour totale (par personne × nb adultes)
    if (data.tourist_tax_per_person !== undefined) {
        const taxPerPerson = parseFloat(data.tourist_tax_per_person || 0);
        const nbAdults = parseInt(data.nb_adults || 1);
        data.tourist_tax_amount = (taxPerPerson * nbAdults).toFixed(2);
        delete data.tourist_tax_per_person;
    }

    try {
        await API.post('selfcheckin', data);
        toast('Réservation créée avec succès', 'success');
        closeModal();
        await scLoadStats();
        scRenderTab();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function scEditReservation(id) {
    try {
        const reservation = await API.get(`selfcheckin/${id}`);
        const availableLockers = _scLockers.filter(l => l.status === 'available' || l.id == reservation.locker_id);
        const activeRooms = _scRooms.filter(r => r.status === 'active');

        const modalContent = `
            <form onsubmit="scUpdateReservation(event, ${id})">
                <div class="form-row">
                    <div class="form-group">
                        <label>N° Réservation</label>
                        <input type="text" value="${esc(reservation.reservation_number)}" readonly style="background:#F3F4F6">
                    </div>
                    <div class="form-group">
                        <label>Type</label>
                        <input type="text" value="${reservation.type === 'pre_booked' ? 'Pré-enregistrée' : 'Walk-in'}" readonly style="background:#F3F4F6">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Nom</label>
                        <input type="text" name="guest_last_name" value="${esc(reservation.guest_last_name || '')}">
                    </div>
                    <div class="form-group">
                        <label>Prénom</label>
                        <input type="text" name="guest_first_name" value="${esc(reservation.guest_first_name || '')}">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" name="guest_email" value="${esc(reservation.guest_email || '')}">
                    </div>
                    <div class="form-group">
                        <label>Téléphone</label>
                        <input type="tel" name="guest_phone" value="${esc(reservation.guest_phone || '')}">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Nb adultes</label>
                        <input type="number" name="nb_adults" value="${reservation.nb_adults || 1}" min="1" oninput="scCalcTotal()">
                    </div>
                    <div class="form-group">
                        <label>Nb enfants</label>
                        <input type="number" name="nb_children" value="${reservation.nb_children || 0}" min="0">
                    </div>
                </div>

                <div class="form-group">
                    <label>Date d'arrivée</label>
                    <input type="date" name="checkin_date" value="${reservation.checkin_date || ''}">
                </div>

                <div class="form-group">
                    <label><input type="checkbox" name="breakfast_included" value="1" ${reservation.breakfast_included == 1 ? 'checked' : ''}> Petit-déjeuner inclus</label>
                </div>

                <hr style="margin:16px 0">
                <h4><i class="fas fa-euro-sign"></i> Tarification</h4>

                <div class="form-row">
                    <div class="form-group">
                        <label>Prix hébergement</label>
                        <input type="number" name="accommodation_price" step="0.01" value="${reservation.accommodation_price || 0}" oninput="scCalcTotal()">
                    </div>
                    <div class="form-group">
                        <label>Taxe de séjour (par pers.)</label>
                        <input type="number" name="tourist_tax_per_person" step="0.01" value="${reservation.nb_adults > 0 ? ((reservation.tourist_tax_amount || 0) / (reservation.nb_adults || 1)).toFixed(2) : (reservation.tourist_tax_amount || 0)}" oninput="scCalcTotal()">
                        <small class="form-help" id="sc-tax-total"></small>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Prix petit-déjeuner</label>
                        <input type="number" name="breakfast_price" step="0.01" value="${reservation.breakfast_price || 0}" oninput="scCalcTotal()">
                    </div>
                    <div class="form-group">
                        <label>Arrhes</label>
                        <input type="number" name="deposit_amount" step="0.01" value="${reservation.deposit_amount || 0}" oninput="scCalcTotal()">
                    </div>
                </div>

                <div class="form-group">
                    <label>Total TTC</label>
                    <input type="number" name="total_amount" step="0.01" value="${reservation.total_amount || 0}" id="sc-total-amount" style="font-weight:700;font-size:16px" readonly>
                </div>

                <hr style="margin:16px 0">
                <h4><i class="fas fa-lock"></i> Chambre, Casier & Code</h4>

                <div class="form-row">
                    <div class="form-group">
                        <label>Chambre</label>
                        <select name="room_number">
                            <option value="">-- Sélectionner --</option>
                            ${activeRooms.map(r => `<option value="${r.room_number}" data-room-id="${r.id}" ${r.room_number === reservation.room_number ? 'selected' : ''}>${r.room_number} (${r.room_type})</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Casier</label>
                        <select name="locker_id" onchange="scOnLockerChange(this)">
                            <option value="">-- Aucun --</option>
                            ${availableLockers.map(l => `<option value="${l.id}" data-code="${esc(l.locker_code)}" ${l.id == reservation.locker_id ? 'selected' : ''}>${l.locker_number}</option>`).join('')}
                            ${_scLockers.filter(l => l.status !== 'available' && l.id != reservation.locker_id).map(l => `<option value="${l.id}" disabled data-code="${esc(l.locker_code)}">${l.locker_number} (${l.status === 'assigned' ? 'assigné' : 'maintenance'})</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Code du casier</label>
                    <input type="text" name="locker_code" value="${esc(reservation.locker_code || '')}" placeholder="Code d'accès du jour">
                    <small class="form-help">Le code change quotidiennement</small>
                </div>

                <div class="form-group">
                    <label>Statut</label>
                    <select name="status">
                        <option value="pending" ${reservation.status === 'pending' ? 'selected' : ''}>En attente</option>
                        <option value="confirmed" ${reservation.status === 'confirmed' ? 'selected' : ''}>Confirmée</option>
                        <option value="checked_in" ${reservation.status === 'checked_in' ? 'selected' : ''}>Checked-in</option>
                        <option value="checked_out" ${reservation.status === 'checked_out' ? 'selected' : ''}>Checked-out</option>
                        <option value="cancelled" ${reservation.status === 'cancelled' ? 'selected' : ''}>Annulée</option>
                        <option value="no_show" ${reservation.status === 'no_show' ? 'selected' : ''}>No-show</option>
                    </select>
                </div>

                <div style="text-align:right;margin-top:20px">
                    <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
                </div>
            </form>
        `;

        openModal('Modifier la réservation', modalContent, 'large');
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function scUpdateReservation(e, id) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));

    const roomSelect = form.querySelector('[name="room_number"]');
    if (roomSelect && roomSelect.selectedOptions[0]) {
        data.room_id = roomSelect.selectedOptions[0].dataset.roomId || null;
    }
    data.breakfast_included = form.querySelector('[name="breakfast_included"]')?.checked ? 1 : 0;

    // Calculer la taxe de séjour totale (par personne × nb adultes)
    if (data.tourist_tax_per_person !== undefined) {
        const taxPerPerson = parseFloat(data.tourist_tax_per_person || 0);
        const nbAdults = parseInt(data.nb_adults || 1);
        data.tourist_tax_amount = (taxPerPerson * nbAdults).toFixed(2);
        delete data.tourist_tax_per_person;
    }

    try {
        await API.put(`selfcheckin/${id}`, data);
        toast('Réservation mise à jour', 'success');
        closeModal();
        await scLoadStats();
        scRenderTab();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function scDeleteReservation(id) {
    const reservation = _scReservations.find(r => r.id == id);
    if (reservation && ['confirmed', 'checked_in'].includes(reservation.status)) {
        toast('Impossible de supprimer une réservation confirmée ou checked-in. Vous pouvez l\'annuler à la place.', 'warning');
        return;
    }
    if (!confirm('Supprimer cette réservation ?')) return;
    try {
        await API.delete(`selfcheckin/${id}`);
        toast('Réservation supprimée', 'success');
        await scLoadStats();
        scRenderTab();
    } catch (err) {
        toast(err.message, 'error');
    }
}

// Note: La gestion des casiers a été déplacée vers la page Hôtel (onglet Self Check-in)

// ==================== ONGLET ARCHIVES DES VENTES ====================

async function scRenderArchives(content) {
    content.innerHTML = '<div class="loading-inline"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>';

    // Dates par défaut : 30 derniers jours
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const defaultFrom = thirtyDaysAgo.toISOString().split('T')[0];

    content.innerHTML = `
        <div class="card" style="padding:16px;margin-bottom:16px">
            <h4 style="margin-bottom:12px"><i class="fas fa-filter"></i> Filtres avancés</h4>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
                <div class="form-group" style="margin-bottom:0;min-width:140px">
                    <label style="font-size:12px">Date début</label>
                    <input type="date" id="sc-arch-from" class="form-control" value="${defaultFrom}">
                </div>
                <div class="form-group" style="margin-bottom:0;min-width:140px">
                    <label style="font-size:12px">Date fin</label>
                    <input type="date" id="sc-arch-to" class="form-control" value="${today}">
                </div>
                <div class="form-group" style="margin-bottom:0;min-width:130px">
                    <label style="font-size:12px">Type</label>
                    <select id="sc-arch-type" class="form-control">
                        <option value="">Tous</option>
                        <option value="pre_booked">Pré-enregistrées</option>
                        <option value="walkin">Walk-in</option>
                    </select>
                </div>
                <div class="form-group" style="margin-bottom:0;min-width:130px">
                    <label style="font-size:12px">Statut</label>
                    <select id="sc-arch-status" class="form-control">
                        <option value="">Tous</option>
                        <option value="pending">En attente</option>
                        <option value="confirmed">Confirmée</option>
                        <option value="checked_in">Checked-in</option>
                        <option value="checked_out">Checked-out</option>
                        <option value="cancelled">Annulée</option>
                        <option value="no_show">No-show</option>
                    </select>
                </div>
                <div class="form-group" style="margin-bottom:0;min-width:130px">
                    <label style="font-size:12px">Paiement</label>
                    <select id="sc-arch-payment" class="form-control">
                        <option value="">Tous</option>
                        <option value="paid">Payé</option>
                        <option value="pending">En attente</option>
                        <option value="partial">Partiel</option>
                        <option value="failed">Échoué</option>
                        <option value="refunded">Remboursé</option>
                    </select>
                </div>
                <div class="form-group" style="margin-bottom:0;min-width:180px">
                    <label style="font-size:12px">Recherche</label>
                    <input type="text" id="sc-arch-search" class="form-control" placeholder="Nom, prénom, n° résa...">
                </div>
                <button class="btn btn-primary" onclick="scLoadArchives()" style="height:38px">
                    <i class="fas fa-search"></i> Rechercher
                </button>
                <button class="btn btn-outline" onclick="scResetArchiveFilters()" style="height:38px" title="Réinitialiser les filtres">
                    <i class="fas fa-undo"></i>
                </button>
            </div>
        </div>

        <div id="sc-archive-stats" style="margin-bottom:16px"></div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div id="sc-archive-count" style="font-size:13px;color:var(--gray-500)"></div>
            <button class="btn btn-outline" onclick="scExportArchivePDF()" id="sc-export-pdf-btn" style="display:none">
                <i class="fas fa-file-pdf"></i> Exporter PDF
            </button>
        </div>

        <div id="sc-archive-list"></div>
    `;

    await scLoadArchives();
}

function scResetArchiveFilters() {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    document.getElementById('sc-arch-from').value = thirtyDaysAgo.toISOString().split('T')[0];
    document.getElementById('sc-arch-to').value = today;
    document.getElementById('sc-arch-type').value = '';
    document.getElementById('sc-arch-status').value = '';
    document.getElementById('sc-arch-payment').value = '';
    document.getElementById('sc-arch-search').value = '';
    scLoadArchives();
}

async function scLoadArchives() {
    const list = document.getElementById('sc-archive-list');
    if (!list) return;
    list.innerHTML = '<div class="loading-inline"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>';

    const dateFrom = document.getElementById('sc-arch-from')?.value || '';
    const dateTo = document.getElementById('sc-arch-to')?.value || '';
    const type = document.getElementById('sc-arch-type')?.value || '';
    const status = document.getElementById('sc-arch-status')?.value || '';
    const payment = document.getElementById('sc-arch-payment')?.value || '';
    const search = document.getElementById('sc-arch-search')?.value || '';

    let url = `selfcheckin/archives?hotel_id=${_scHotelId}`;
    if (dateFrom) url += `&date_from=${dateFrom}`;
    if (dateTo) url += `&date_to=${dateTo}`;
    if (type) url += `&type=${encodeURIComponent(type)}`;
    if (status) url += `&status=${encodeURIComponent(status)}`;
    if (payment) url += `&payment_status=${encodeURIComponent(payment)}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    try {
        const res = await API.get(url);
        _scArchiveData = res.reservations || [];
        _scArchiveStats = res.stats || {};

        scRenderArchiveStats();
        scRenderArchiveList();
    } catch (err) {
        list.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
    }
}

function scRenderArchiveStats() {
    const el = document.getElementById('sc-archive-stats');
    if (!el) return;
    const s = _scArchiveStats;

    el.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
            <div class="card" style="padding:14px;text-align:center">
                <div style="font-size:22px;font-weight:700;color:var(--primary)">${s.total_reservations || 0}</div>
                <div style="font-size:11px;color:var(--gray-500)">Total réservations</div>
            </div>
            <div class="card" style="padding:14px;text-align:center">
                <div style="font-size:22px;font-weight:700;color:#16A34A">${s.total_paid || 0}</div>
                <div style="font-size:11px;color:var(--gray-500)">Payées</div>
            </div>
            <div class="card" style="padding:14px;text-align:center">
                <div style="font-size:22px;font-weight:700;color:#2563EB">${s.total_checkedin || 0}</div>
                <div style="font-size:11px;color:var(--gray-500)">Checked-in</div>
            </div>
            <div class="card" style="padding:14px;text-align:center">
                <div style="font-size:22px;font-weight:700;color:#DC2626">${s.total_cancelled || 0}</div>
                <div style="font-size:11px;color:var(--gray-500)">Annulées</div>
            </div>
            <div class="card" style="padding:14px;text-align:center;background:linear-gradient(135deg,#F0FDF4,#DCFCE7)">
                <div style="font-size:22px;font-weight:700;color:#16A34A">${formatMoney(s.revenue_total || 0)}</div>
                <div style="font-size:11px;color:var(--gray-600)">CA total (payé)</div>
            </div>
            <div class="card" style="padding:14px;text-align:center">
                <div style="font-size:18px;font-weight:700;color:#6366F1">${formatMoney(s.revenue_accommodation || 0)}</div>
                <div style="font-size:11px;color:var(--gray-500)">Hébergement</div>
            </div>
            <div class="card" style="padding:14px;text-align:center">
                <div style="font-size:18px;font-weight:700;color:#F59E0B">${formatMoney(s.revenue_breakfast || 0)}</div>
                <div style="font-size:11px;color:var(--gray-500)">Petit-déjeuner</div>
            </div>
            <div class="card" style="padding:14px;text-align:center">
                <div style="font-size:18px;font-weight:700;color:#8B5CF6">${formatMoney(s.revenue_tax || 0)}</div>
                <div style="font-size:11px;color:var(--gray-500)">Taxe de séjour</div>
            </div>
        </div>
    `;
}

function scRenderArchiveList() {
    const list = document.getElementById('sc-archive-list');
    const countEl = document.getElementById('sc-archive-count');
    const exportBtn = document.getElementById('sc-export-pdf-btn');
    if (!list) return;

    if (countEl) countEl.textContent = `${_scArchiveData.length} réservation(s) trouvée(s)`;
    if (exportBtn) exportBtn.style.display = _scArchiveData.length > 0 ? '' : 'none';

    if (_scArchiveData.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding:40px"><i class="fas fa-archive" style="font-size:36px;color:var(--gray-300);margin-bottom:12px"></i><p>Aucune réservation trouvée pour cette période</p></div>';
        return;
    }

    list.innerHTML = `
        <div class="table-responsive">
            <table class="table" id="sc-archive-table">
                <thead>
                    <tr>
                        <th>N° Résa</th>
                        <th>Type</th>
                        <th>Client</th>
                        <th>Date</th>
                        <th>Chambre</th>
                        <th>Héberg.</th>
                        <th>PDJ</th>
                        <th>Taxe</th>
                        <th>Total</th>
                        <th>Arrhes</th>
                        <th>Statut</th>
                        <th>Paiement</th>
                    </tr>
                </thead>
                <tbody>
                    ${_scArchiveData.map(r => `
                        <tr>
                            <td><strong>${esc(r.reservation_number)}</strong></td>
                            <td><span class="badge badge-${r.type === 'pre_booked' ? 'primary' : 'warning'}" style="font-size:10px">${r.type === 'pre_booked' ? 'Pré-enr.' : 'Walk-in'}</span></td>
                            <td>${r.guest_last_name ? esc((r.guest_first_name || '') + ' ' + r.guest_last_name) : '<em class="text-muted">-</em>'}</td>
                            <td style="white-space:nowrap">${r.checkin_date ? formatDate(r.checkin_date) : '-'}</td>
                            <td>${r.room_number || '-'}</td>
                            <td>${formatMoney(r.accommodation_price || 0)}</td>
                            <td>${r.breakfast_price > 0 ? formatMoney(r.breakfast_price) : '-'}</td>
                            <td>${r.tourist_tax_amount > 0 ? formatMoney(r.tourist_tax_amount) : '-'}</td>
                            <td><strong>${formatMoney(r.total_amount || 0)}</strong></td>
                            <td>${r.deposit_amount > 0 ? formatMoney(r.deposit_amount) : '-'}</td>
                            <td>${scStatusBadge(r.status, r.payment_status)}</td>
                            <td>${scPaymentBadge(r.payment_status)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function scPaymentBadge(status) {
    const map = {
        'paid': { label: 'Payé', color: '#16A34A', bg: '#F0FDF4' },
        'pending': { label: 'En attente', color: '#F59E0B', bg: '#FFFBEB' },
        'partial': { label: 'Partiel', color: '#2563EB', bg: '#EFF6FF' },
        'failed': { label: 'Échoué', color: '#DC2626', bg: '#FEF2F2' },
        'refunded': { label: 'Remboursé', color: '#9333EA', bg: '#FAF5FF' },
    };
    const s = map[status] || { label: status || '-', color: '#6B7280', bg: '#F9FAFB' };
    return `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:${s.color};background:${s.bg}">${s.label}</span>`;
}

// ==================== EXPORT PDF ====================

async function scExportArchivePDF() {
    if (_scArchiveData.length === 0) {
        toast('Aucune donnée à exporter', 'warning');
        return;
    }

    // Charger jsPDF dynamiquement si nécessaire
    if (!window.jspdf) {
        try {
            await scLoadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
            await scLoadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
        } catch (err) {
            toast('Erreur lors du chargement de la librairie PDF', 'error');
            console.error(err);
            return;
        }
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape', 'mm', 'a4');

    const hotelName = _scHotels.find(h => h.id == _scHotelId)?.name || 'Hôtel';
    const dateFrom = document.getElementById('sc-arch-from')?.value || '';
    const dateTo = document.getElementById('sc-arch-to')?.value || '';

    // Titre
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('Archives des ventes - Self Check-in', 14, 15);

    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text(`${hotelName}`, 14, 22);

    doc.setFontSize(9);
    doc.setTextColor(100);
    const periodText = dateFrom && dateTo ? `Période : ${dateFrom} au ${dateTo}` : 'Toutes les dates';
    doc.text(periodText, 14, 28);
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 14, 33);

    // Statistiques résumées
    const s = _scArchiveStats;
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.setFont(undefined, 'bold');
    doc.text('Résumé :', 14, 41);
    doc.setFont(undefined, 'normal');
    doc.text(`Réservations : ${s.total_reservations || 0}  |  Payées : ${s.total_paid || 0}  |  Checked-in : ${s.total_checkedin || 0}  |  Annulées : ${s.total_cancelled || 0}`, 14, 47);
    doc.text(`CA total : ${scFormatMoneyPlain(s.revenue_total || 0)}  |  Hébergement : ${scFormatMoneyPlain(s.revenue_accommodation || 0)}  |  PDJ : ${scFormatMoneyPlain(s.revenue_breakfast || 0)}  |  Taxe séjour : ${scFormatMoneyPlain(s.revenue_tax || 0)}`, 14, 53);

    // Tableau
    const statusLabels = { pending: 'En attente', confirmed: 'Confirmée', checked_in: 'Checked-in', checked_out: 'Checked-out', cancelled: 'Annulée', no_show: 'No-show' };
    const paymentLabels = { paid: 'Payé', pending: 'En attente', partial: 'Partiel', failed: 'Échoué', refunded: 'Remboursé' };

    const tableData = _scArchiveData.map(r => [
        r.reservation_number || '',
        r.type === 'pre_booked' ? 'Pré-enr.' : 'Walk-in',
        r.guest_last_name ? ((r.guest_first_name || '') + ' ' + r.guest_last_name).trim() : '-',
        r.checkin_date || '-',
        r.room_number || '-',
        scFormatMoneyPlain(r.accommodation_price || 0),
        r.breakfast_price > 0 ? scFormatMoneyPlain(r.breakfast_price) : '-',
        r.tourist_tax_amount > 0 ? scFormatMoneyPlain(r.tourist_tax_amount) : '-',
        scFormatMoneyPlain(r.total_amount || 0),
        r.deposit_amount > 0 ? scFormatMoneyPlain(r.deposit_amount) : '-',
        statusLabels[r.status] || r.status,
        paymentLabels[r.payment_status] || r.payment_status
    ]);

    doc.autoTable({
        startY: 58,
        head: [['N° Résa', 'Type', 'Client', 'Date', 'Ch.', 'Héberg.', 'PDJ', 'Taxe', 'Total', 'Arrhes', 'Statut', 'Paiement']],
        body: tableData,
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
            0: { cellWidth: 25 },
            5: { halign: 'right' },
            6: { halign: 'right' },
            7: { halign: 'right' },
            8: { halign: 'right', fontStyle: 'bold' },
            9: { halign: 'right' },
        },
        margin: { left: 14, right: 14 },
        didParseCell: function(data) {
            if (data.section === 'body' && data.column.index === 11) {
                if (data.cell.raw === 'Payé') data.cell.styles.textColor = [22, 163, 74];
                else if (data.cell.raw === 'Échoué') data.cell.styles.textColor = [220, 38, 38];
            }
        }
    });

    // Pied de page
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Page ${i}/${pageCount}`, doc.internal.pageSize.width - 30, doc.internal.pageSize.height - 10);
        doc.text('ACL GESTION - Self Check-in', 14, doc.internal.pageSize.height - 10);
    }

    const filename = `archives_selfcheckin_${hotelName.replace(/\s+/g, '_')}_${dateFrom || 'all'}_${dateTo || 'all'}.pdf`;
    doc.save(filename);
    toast('PDF exporté avec succès', 'success');
}

function scFormatMoneyPlain(amount) {
    return parseFloat(amount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function scLoadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// ==================== ONGLET TARIFS ====================

async function scRenderPricing(content) {
    content.innerHTML = '<div class="loading-inline"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>';

    try {
        const today = new Date();
        const from = today.toISOString().split('T')[0];
        const toDate = new Date(today);
        toDate.setDate(toDate.getDate() + 30);
        const to = toDate.toISOString().split('T')[0];

        const res = await API.get(`selfcheckin-pricing?hotel_id=${_scHotelId}&from=${from}&to=${to}`);
        const pricing = res.pricing || [];
        const defaults = res.defaults || {};

        // Build date map
        const priceMap = {};
        pricing.forEach(p => { priceMap[p.date] = p; });

        content.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
                <p class="text-muted">Définissez les tarifs nuit par nuit. Les jours sans tarif utilisent les valeurs par défaut de l'hôtel.</p>
                <button class="btn btn-primary" onclick="scShowBulkPricing()">
                    <i class="fas fa-calendar-plus"></i> Tarif en masse
                </button>
            </div>

            <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;padding:12px;margin-bottom:16px">
                <strong>Valeurs par défaut :</strong>
                Nuit : <strong>${formatMoney(defaults.default_night_price || 0)}</strong> |
                Petit-déj : <strong>${formatMoney(defaults.default_breakfast_price || 0)}</strong>/pers |
                Taxe séjour : <strong>${formatMoney(defaults.default_tourist_tax || 0)}</strong>/adulte |
                PDJ : ${defaults.breakfast_start || '07:00'} - ${defaults.breakfast_end || '10:30'}
            </div>

            <div class="table-responsive">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Jour</th>
                            <th>Prix nuit</th>
                            <th>Prix petit-déj</th>
                            <th>Taxe séjour</th>
                            <th>PDJ horaires</th>
                            <th>Notes</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Array.from({length: 31}, (_, i) => {
                            const d = new Date(today);
                            d.setDate(d.getDate() + i);
                            const dateStr = d.toISOString().split('T')[0];
                            const p = priceMap[dateStr];
                            const isToday = i === 0;
                            const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
                            const dayName = dayNames[d.getDay()];
                            const isWeekend = d.getDay() === 0 || d.getDay() === 6;

                            return `
                                <tr style="${isToday ? 'background:#FFFBEB;font-weight:500' : isWeekend ? 'background:#F8FAFC' : ''}">
                                    <td>${isToday ? '<strong>Aujourd\'hui</strong>' : formatDate(dateStr)}</td>
                                    <td><span style="${isWeekend ? 'color:#DC2626;font-weight:600' : ''}">${dayName}</span></td>
                                    <td>${p ? '<strong>' + formatMoney(p.night_price) + '</strong>' : '<span class="text-muted">' + formatMoney(defaults.default_night_price || 0) + '</span>'}</td>
                                    <td>${p ? formatMoney(p.breakfast_price) : '<span class="text-muted">' + formatMoney(defaults.default_breakfast_price || 0) + '</span>'}</td>
                                    <td>${p ? formatMoney(p.tourist_tax) : '<span class="text-muted">' + formatMoney(defaults.default_tourist_tax || 0) + '</span>'}</td>
                                    <td>${p ? (p.breakfast_start || '-') + ' - ' + (p.breakfast_end || '-') : '<span class="text-muted">défaut</span>'}</td>
                                    <td>${p && p.notes ? '<small>' + esc(p.notes) + '</small>' : ''}</td>
                                    <td>
                                        <button class="btn btn-sm btn-outline" onclick="scEditPricing('${dateStr}', ${p ? p.id : 'null'})">
                                            <i class="fas fa-${p ? 'edit' : 'plus'}"></i>
                                        </button>
                                        ${p ? `<button class="btn btn-sm btn-danger" onclick="scDeletePricing(${p.id})"><i class="fas fa-trash"></i></button>` : ''}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        content.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
    }
}

function scEditPricing(date, existingId) {
    // Get current defaults for pre-fill
    const hotel = _scHotels.find(h => h.id == _scHotelId) || {};

    openModal(`Tarif du ${formatDate(date)}`, `
        <form onsubmit="scSavePricing(event, '${date}')">
            <div class="form-row">
                <div class="form-group">
                    <label>Prix de la nuit *</label>
                    <input type="number" name="night_price" step="0.01" min="0" required value="${hotel.default_night_price || 0}">
                </div>
                <div class="form-group">
                    <label>Prix petit-déjeuner (par personne)</label>
                    <input type="number" name="breakfast_price" step="0.01" min="0" value="${hotel.default_breakfast_price || 0}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Taxe de séjour (par adulte/nuit)</label>
                    <input type="number" name="tourist_tax" step="0.01" min="0" value="${hotel.default_tourist_tax || 0}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Heure début petit-déjeuner</label>
                    <input type="time" name="breakfast_start" value="${hotel.breakfast_start || '07:00'}">
                </div>
                <div class="form-group">
                    <label>Heure fin petit-déjeuner</label>
                    <input type="time" name="breakfast_end" value="${hotel.breakfast_end || '10:30'}">
                </div>
            </div>
            <div class="form-group">
                <label>Notes</label>
                <input type="text" name="notes" placeholder="Ex: Haute saison, événement spécial...">
            </div>
            <div style="text-align:right;margin-top:20px">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
            </div>
        </form>
    `);
}

async function scSavePricing(e, date) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.hotel_id = _scHotelId;
    data.date = date;

    try {
        await API.post('selfcheckin-pricing', data);
        toast('Tarif enregistré', 'success');
        closeModal();
        scRenderTab();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function scDeletePricing(id) {
    if (!confirm('Supprimer ce tarif ? La valeur par défaut sera utilisée.')) return;
    try {
        await API.delete(`selfcheckin-pricing/${id}`);
        toast('Tarif supprimé', 'success');
        scRenderTab();
    } catch (err) {
        toast(err.message, 'error');
    }
}

function scShowBulkPricing() {
    const today = new Date().toISOString().split('T')[0];
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    const to = in30.toISOString().split('T')[0];

    openModal('Tarif en masse', `
        <form onsubmit="scSaveBulkPricing(event)">
            <p class="text-muted mb-15">Appliquer le même tarif sur une période</p>
            <div class="form-row">
                <div class="form-group">
                    <label>Date début *</label>
                    <input type="date" name="date_from" value="${today}" required>
                </div>
                <div class="form-group">
                    <label>Date fin *</label>
                    <input type="date" name="date_to" value="${to}" required>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Prix de la nuit *</label>
                    <input type="number" name="night_price" step="0.01" min="0" required>
                </div>
                <div class="form-group">
                    <label>Prix petit-déjeuner</label>
                    <input type="number" name="breakfast_price" step="0.01" min="0" value="0">
                </div>
            </div>
            <div class="form-group">
                <label>Taxe de séjour</label>
                <input type="number" name="tourist_tax" step="0.01" min="0" value="0">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Heure début PDJ</label>
                    <input type="time" name="breakfast_start" value="07:00">
                </div>
                <div class="form-group">
                    <label>Heure fin PDJ</label>
                    <input type="time" name="breakfast_end" value="10:30">
                </div>
            </div>
            <div class="form-group">
                <label>Notes</label>
                <input type="text" name="notes" placeholder="Optionnel">
            </div>
            <div style="text-align:right;margin-top:20px">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Appliquer</button>
            </div>
        </form>
    `);
}

async function scSaveBulkPricing(e) {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(e.target));

    // Generate date array
    const dates = [];
    const start = new Date(formData.date_from);
    const end = new Date(formData.date_to);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0]);
    }

    if (dates.length === 0) {
        toast('Période invalide', 'error');
        return;
    }

    if (dates.length > 365) {
        toast('Maximum 365 jours', 'error');
        return;
    }

    try {
        await API.post('selfcheckin-pricing/bulk', {
            hotel_id: _scHotelId,
            dates: dates,
            night_price: formData.night_price,
            breakfast_price: formData.breakfast_price,
            tourist_tax: formData.tourist_tax,
            breakfast_start: formData.breakfast_start,
            breakfast_end: formData.breakfast_end,
            notes: formData.notes
        });
        toast(`${dates.length} tarif(s) mis à jour`, 'success');
        closeModal();
        scRenderTab();
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ==================== ONGLET LIENS DE PAIEMENT ====================

async function scRenderPaymentLinks(content) {
    content.innerHTML = '<div class="loading-inline"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>';

    try {
        const res = await API.get(`payment-links?hotel_id=${_scHotelId}`);
        _scPaymentLinks = res.payment_links || [];
        _scPaymentStats = res.stats || {};

        content.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px">
                <div class="card" style="padding:14px;text-align:center">
                    <div style="font-size:22px;font-weight:700;color:var(--primary)">${_scPaymentStats.total || 0}</div>
                    <div style="font-size:11px;color:var(--gray-500)">Total liens</div>
                </div>
                <div class="card" style="padding:14px;text-align:center">
                    <div style="font-size:22px;font-weight:700;color:#F59E0B">${_scPaymentStats.total_pending || 0}</div>
                    <div style="font-size:11px;color:var(--gray-500)">En attente</div>
                </div>
                <div class="card" style="padding:14px;text-align:center">
                    <div style="font-size:22px;font-weight:700;color:#16A34A">${_scPaymentStats.total_paid || 0}</div>
                    <div style="font-size:11px;color:var(--gray-500)">Payés</div>
                </div>
                <div class="card" style="padding:14px;text-align:center;background:linear-gradient(135deg,#F0FDF4,#DCFCE7)">
                    <div style="font-size:22px;font-weight:700;color:#16A34A">${formatMoney(_scPaymentStats.revenue_paid || 0)}</div>
                    <div style="font-size:11px;color:var(--gray-600)">CA encaissé</div>
                </div>
                <div class="card" style="padding:14px;text-align:center">
                    <div style="font-size:22px;font-weight:700;color:#6366F1">${formatMoney(_scPaymentStats.revenue_pending || 0)}</div>
                    <div style="font-size:11px;color:var(--gray-500)">En attente</div>
                </div>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <select id="sc-pl-filter-status" onchange="scFilterPaymentLinks()" class="form-control" style="width:auto">
                        <option value="">Tous statuts</option>
                        <option value="pending">En attente</option>
                        <option value="paid">Payé</option>
                        <option value="expired">Expiré</option>
                        <option value="cancelled">Annulé</option>
                    </select>
                    <input type="text" id="sc-pl-search" class="form-control" style="width:auto;min-width:200px" placeholder="Rechercher nom, email, réf..." oninput="scFilterPaymentLinks()">
                </div>
                <div style="display:flex;gap:8px">
                    <button class="btn btn-outline" onclick="scRefreshAllPaymentStatuses()" title="Rafraîchir les statuts Stripe">
                        <i class="fas fa-sync-alt"></i> Vérifier statuts
                    </button>
                    <button class="btn btn-primary" onclick="scShowCreatePaymentLink()">
                        <i class="fas fa-plus"></i> Générer un lien
                    </button>
                </div>
            </div>

            <div id="sc-pl-list"></div>
        `;

        scFilterPaymentLinks();
    } catch (err) {
        content.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
    }
}

function scFilterPaymentLinks() {
    const status = document.getElementById('sc-pl-filter-status')?.value || '';
    const search = (document.getElementById('sc-pl-search')?.value || '').toLowerCase();

    let filtered = _scPaymentLinks;
    if (status) filtered = filtered.filter(l => l.payment_status === status);
    if (search) filtered = filtered.filter(l =>
        (l.guest_first_name || '').toLowerCase().includes(search) ||
        (l.guest_last_name || '').toLowerCase().includes(search) ||
        (l.guest_email || '').toLowerCase().includes(search) ||
        (l.reservation_reference || '').toLowerCase().includes(search)
    );

    const list = document.getElementById('sc-pl-list');
    if (!list) return;

    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding:40px"><i class="fas fa-link" style="font-size:36px;color:var(--gray-300);margin-bottom:12px"></i><p>Aucun lien de paiement</p></div>';
        return;
    }

    list.innerHTML = `
        <div class="table-responsive">
            <table class="table">
                <thead>
                    <tr>
                        <th>Référence</th>
                        <th>Client</th>
                        <th>Email</th>
                        <th>Date d'arrivée</th>
                        <th>Montant</th>
                        <th>Statut</th>
                        <th>Email envoyé</th>
                        <th>Créé par</th>
                        <th>Créé le</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtered.map(l => {
                        const isPaid = l.payment_status === 'paid';
                        const isPending = l.payment_status === 'pending';
                        return `
                        <tr style="${isPaid ? 'background:#F0FDF4' : l.payment_status === 'expired' ? 'background:#FEF2F2' : ''}">
                            <td><strong>${esc(l.reservation_reference)}</strong></td>
                            <td>${esc((l.guest_first_name || '') + ' ' + (l.guest_last_name || ''))}</td>
                            <td><small>${esc(l.guest_email)}</small></td>
                            <td>${l.checkin_date ? formatDate(l.checkin_date) : '-'}</td>
                            <td><strong>${formatMoney(l.total_amount || 0)}</strong></td>
                            <td>${scPaymentLinkStatusBadge(l.payment_status)}</td>
                            <td>${l.email_sent_at ? '<i class="fas fa-check-circle" style="color:#16A34A" title="' + esc(l.email_sent_at) + '"></i>' : '<i class="fas fa-times-circle" style="color:#DC2626" title="Non envoyé"></i>'}</td>
                            <td><small>${esc(l.created_by_name || '-')}</small></td>
                            <td><small>${l.created_at ? formatDateTime(l.created_at) : '-'}</small></td>
                            <td>
                                <div style="display:flex;gap:4px;flex-wrap:wrap">
                                    ${isPending ? `<button class="btn btn-sm btn-outline" onclick="scCheckPaymentStatus(${l.id})" title="Vérifier le statut"><i class="fas fa-sync-alt"></i></button>` : ''}
                                    ${isPending ? `<button class="btn btn-sm btn-outline" style="color:#2563EB;border-color:#2563EB" onclick="scResendPaymentEmail(${l.id})" title="Renvoyer l'email"><i class="fas fa-envelope"></i></button>` : ''}
                                    ${isPending ? `<button class="btn btn-sm btn-outline" onclick="scCopyPaymentUrl(${l.id})" title="Copier le lien"><i class="fas fa-copy"></i></button>` : ''}
                                    ${!isPaid ? `<button class="btn btn-sm btn-outline" onclick="scEditPaymentLink(${l.id})" title="Modifier"><i class="fas fa-edit"></i></button>` : ''}
                                    ${!isPaid ? `<button class="btn btn-sm btn-danger" onclick="scDeletePaymentLink(${l.id})" title="Supprimer"><i class="fas fa-trash"></i></button>` : ''}
                                    ${isPaid ? `<span style="color:#16A34A;font-size:12px;font-weight:600"><i class="fas fa-check-circle"></i> Payé${l.paid_at ? ' le ' + formatDateTime(l.paid_at) : ''}</span>` : ''}
                                </div>
                            </td>
                        </tr>
                    `;}).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function scPaymentLinkStatusBadge(status) {
    const map = {
        'pending': { label: 'En attente', color: '#F59E0B', bg: '#FFFBEB' },
        'paid': { label: 'Payé', color: '#16A34A', bg: '#F0FDF4' },
        'expired': { label: 'Expiré', color: '#DC2626', bg: '#FEF2F2' },
        'cancelled': { label: 'Annulé', color: '#6B7280', bg: '#F9FAFB' },
    };
    const s = map[status] || { label: status || '-', color: '#6B7280', bg: '#F9FAFB' };
    return `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:${s.color};background:${s.bg}">${s.label}</span>`;
}

function scShowCreatePaymentLink() {
    const modalContent = `
        <form onsubmit="scSavePaymentLink(event)">
            <input type="hidden" name="hotel_id" value="${_scHotelId}">

            <p class="text-muted" style="margin-bottom:16px">
                Remplissez les informations du client. Un lien de paiement Stripe sera généré et envoyé par email.
            </p>

            <div class="form-row">
                <div class="form-group">
                    <label>Nom *</label>
                    <input type="text" name="guest_last_name" required placeholder="Dupont">
                </div>
                <div class="form-group">
                    <label>Prénom *</label>
                    <input type="text" name="guest_first_name" required placeholder="Jean">
                </div>
            </div>

            <div class="form-group">
                <label>Email *</label>
                <input type="email" name="guest_email" required placeholder="client@email.com">
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Référence de réservation *</label>
                    <input type="text" name="reservation_reference" required placeholder="Ex: RES-2026-001">
                </div>
                <div class="form-group">
                    <label>Date d'arrivée *</label>
                    <input type="date" name="checkin_date" required value="${new Date().toISOString().split('T')[0]}">
                </div>
            </div>

            <div class="form-group">
                <label>Montant total à payer (EUR) *</label>
                <input type="number" name="total_amount" step="0.01" min="0.50" required placeholder="150.00" style="font-weight:700;font-size:16px">
            </div>

            <div class="form-group">
                <label>Notes (optionnel)</label>
                <textarea name="notes" rows="2" class="form-control" placeholder="Informations complémentaires..."></textarea>
            </div>

            <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:12px;margin:16px 0">
                <p style="margin:0;font-size:13px;color:#1E40AF"><i class="fas fa-info-circle"></i> Un email avec le récapitulatif et le lien de paiement sécurisé sera envoyé automatiquement au client.</p>
            </div>

            <div style="text-align:right;margin-top:20px">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-paper-plane"></i> Générer et envoyer</button>
            </div>
        </form>
    `;

    openModal('Générer un lien de paiement', modalContent, 'modal-md');
}

async function scSavePaymentLink(e) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Génération en cours...';

    try {
        const res = await API.post('payment-links', data);
        closeModal();
        if (res.email_sent) {
            toast('Lien de paiement créé et email envoyé au client', 'success');
        } else {
            toast('Lien créé mais l\'email n\'a pas pu être envoyé. Vous pouvez le renvoyer manuellement.', 'warning');
        }
        scRenderTab();
    } catch (err) {
        toast(err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

async function scEditPaymentLink(id) {
    try {
        const link = await API.get(`payment-links/${id}`);
        if (link.payment_status === 'paid') {
            toast('Impossible de modifier un lien déjà payé', 'warning');
            return;
        }

        const modalContent = `
            <form onsubmit="scUpdatePaymentLink(event, ${id})">
                <div class="form-row">
                    <div class="form-group">
                        <label>Nom *</label>
                        <input type="text" name="guest_last_name" required value="${esc(link.guest_last_name || '')}">
                    </div>
                    <div class="form-group">
                        <label>Prénom *</label>
                        <input type="text" name="guest_first_name" required value="${esc(link.guest_first_name || '')}">
                    </div>
                </div>

                <div class="form-group">
                    <label>Email *</label>
                    <input type="email" name="guest_email" required value="${esc(link.guest_email || '')}">
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Référence de réservation *</label>
                        <input type="text" name="reservation_reference" required value="${esc(link.reservation_reference || '')}">
                    </div>
                    <div class="form-group">
                        <label>Date d'arrivée *</label>
                        <input type="date" name="checkin_date" required value="${link.checkin_date || ''}">
                    </div>
                </div>

                <div class="form-group">
                    <label>Montant total (EUR) *</label>
                    <input type="number" name="total_amount" step="0.01" min="0.50" required value="${link.total_amount || ''}" style="font-weight:700;font-size:16px">
                    <small class="form-help">Si le montant change, un nouveau lien Stripe sera généré.</small>
                </div>

                <div class="form-group">
                    <label>Notes</label>
                    <textarea name="notes" rows="2" class="form-control">${esc(link.notes || '')}</textarea>
                </div>

                <div style="text-align:right;margin-top:20px">
                    <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
                </div>
            </form>
        `;

        openModal('Modifier le lien de paiement', modalContent, 'modal-md');
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function scUpdatePaymentLink(e, id) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));

    try {
        const res = await API.put(`payment-links/${id}`, data);
        closeModal();
        toast(res.message || 'Lien mis à jour', 'success');
        if (res.new_url) {
            toast('Un nouveau lien Stripe a été généré. Pensez à renvoyer l\'email au client.', 'info');
        }
        scRenderTab();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function scDeletePaymentLink(id) {
    const link = _scPaymentLinks.find(l => l.id == id);
    if (link && link.payment_status === 'paid') {
        toast('Impossible de supprimer un lien déjà payé', 'warning');
        return;
    }
    if (!confirm('Supprimer ce lien de paiement ? Le lien Stripe sera invalidé.')) return;

    try {
        await API.delete(`payment-links/${id}`);
        toast('Lien de paiement supprimé', 'success');
        scRenderTab();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function scCheckPaymentStatus(id) {
    try {
        const res = await API.post(`payment-links/${id}/check-status`, {});
        if (res.payment_status === 'paid') {
            toast('Paiement confirmé !', 'success');
        } else if (res.payment_status === 'expired') {
            toast('La session de paiement a expiré', 'warning');
        } else {
            toast('Statut : ' + res.payment_status, 'info');
        }
        scRenderTab();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function scRefreshAllPaymentStatuses() {
    const pendingLinks = _scPaymentLinks.filter(l => l.payment_status === 'pending');
    if (pendingLinks.length === 0) {
        toast('Aucun lien en attente à vérifier', 'info');
        return;
    }

    toast(`Vérification de ${pendingLinks.length} lien(s)...`, 'info');

    let updated = 0;
    for (const link of pendingLinks) {
        try {
            const res = await API.post(`payment-links/${link.id}/check-status`, {});
            if (res.payment_status !== 'pending') updated++;
        } catch (e) {}
    }

    if (updated > 0) {
        toast(`${updated} statut(s) mis à jour`, 'success');
    } else {
        toast('Aucun changement de statut', 'info');
    }
    scRenderTab();
}

async function scResendPaymentEmail(id) {
    if (!confirm('Renvoyer l\'email de paiement au client ?')) return;
    try {
        const res = await API.post(`payment-links/${id}/resend`, {});
        if (res.email_sent) {
            toast('Email renvoyé avec succès', 'success');
        } else {
            toast('Échec de l\'envoi de l\'email', 'error');
        }
        scRenderTab();
    } catch (err) {
        toast(err.message, 'error');
    }
}

function scCopyPaymentUrl(id) {
    const link = _scPaymentLinks.find(l => l.id == id);
    if (!link || !link.stripe_payment_url) {
        toast('Lien non disponible', 'error');
        return;
    }
    navigator.clipboard.writeText(link.stripe_payment_url).then(() => {
        toast('Lien copié dans le presse-papier', 'success');
    }).catch(() => {
        // Fallback
        const input = document.createElement('input');
        input.value = link.stripe_payment_url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        toast('Lien copié dans le presse-papier', 'success');
    });
}

// ==================== STYLES ====================

function scInjectStyles() {
    if (document.getElementById('sc-styles')) return;
    const style = document.createElement('style');
    style.id = 'sc-styles';
    style.textContent = `
        .tab-btn {
            padding: 10px 18px;
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
        .tab-btn:hover { color: var(--gray-700); background: var(--gray-50); }
        .tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); }
        .tab-btn i { font-size: 13px; }
    `;
    document.head.appendChild(style);
}
