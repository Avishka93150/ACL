// ==================== MODULE SELF CHECK-IN ====================
// Gestion des réservations self check-in, casiers et tarifs journaliers

let _scHotelId = null;
let _scTab = 'reservations';
let _scReservations = [];
let _scLockers = [];
let _scRooms = [];
let _scHotels = [];

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
                    <p>Gestion des réservations, casiers et tarifs</p>
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
                <button class="tab-btn ${_scTab === 'lockers' ? 'active' : ''}" data-tab="lockers" onclick="scSwitchTab('lockers')">
                    <i class="fas fa-lock"></i> Casiers
                </button>
                <button class="tab-btn ${_scTab === 'pricing' ? 'active' : ''}" data-tab="pricing" onclick="scSwitchTab('pricing')">
                    <i class="fas fa-euro-sign"></i> Tarifs journaliers
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
        case 'lockers': await scRenderLockers(content); break;
        case 'pricing': await scRenderPricing(content); break;
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
        _scRooms = roomsData.rooms || [];

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
                    <input type="date" id="sc-filter-date" onchange="scFilterReservations()" class="form-control" style="width:auto" value="${new Date().toISOString().split('T')[0]}">
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
                    ${filtered.map(r => `
                        <tr>
                            <td><strong>${esc(r.reservation_number)}</strong></td>
                            <td><span class="badge badge-${r.type === 'pre_booked' ? 'primary' : 'warning'}">${r.type === 'pre_booked' ? 'Pré-enregistrée' : 'Walk-in'}</span></td>
                            <td>${r.guest_last_name ? esc((r.guest_first_name || '') + ' ' + r.guest_last_name) : '<em class="text-muted">Non renseigné</em>'}</td>
                            <td>${r.checkin_date ? formatDate(r.checkin_date) : '-'}</td>
                            <td>${r.room_number ? '<i class="fas fa-bed"></i> ' + esc(r.room_number) : '-'}</td>
                            <td>${r.locker_number ? '<i class="fas fa-lock"></i> ' + esc(r.locker_number) : '-'}</td>
                            <td>${formatCurrency(r.total_amount || 0)}</td>
                            <td>${r.deposit_amount > 0 ? formatCurrency(r.deposit_amount) : '-'}</td>
                            <td><strong>${formatCurrency(r.remaining_amount || 0)}</strong></td>
                            <td>${scStatusBadge(r.status, r.payment_status)}</td>
                            <td>
                                <div style="display:flex;gap:4px">
                                    <button class="btn btn-sm btn-outline" onclick="scEditReservation(${r.id})" title="Modifier"><i class="fas fa-edit"></i></button>
                                    <button class="btn btn-sm btn-danger" onclick="scDeleteReservation(${r.id})" title="Supprimer"><i class="fas fa-trash"></i></button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
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
                    <input type="number" name="nb_adults" value="1" min="1" max="10" required>
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
                    <label>Taxe de séjour</label>
                    <input type="number" name="tourist_tax_amount" step="0.01" min="0" value="0" oninput="scCalcTotal()">
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
            <h4 style="margin-bottom:12px"><i class="fas fa-lock"></i> Casier & Chambre</h4>

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
                    <select name="locker_id" required>
                        <option value="">-- Sélectionner --</option>
                        ${availableLockers.map(l => `<option value="${l.id}">${l.locker_number}${l.linked_room_number ? ' (Ch. ' + l.linked_room_number + ')' : ''}</option>`).join('')}
                    </select>
                </div>
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
    const tax = parseFloat(document.querySelector('[name="tourist_tax_amount"]')?.value || 0);
    const breakfast = parseFloat(document.querySelector('[name="breakfast_price"]')?.value || 0);
    const total = accom + tax + breakfast;
    const totalField = document.getElementById('sc-total-amount');
    if (totalField) totalField.value = total.toFixed(2);
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
                        <input type="number" name="nb_adults" value="${reservation.nb_adults || 1}" min="1">
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
                        <input type="number" name="accommodation_price" step="0.01" value="${reservation.accommodation_price || 0}">
                    </div>
                    <div class="form-group">
                        <label>Taxe de séjour</label>
                        <input type="number" name="tourist_tax_amount" step="0.01" value="${reservation.tourist_tax_amount || 0}">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Prix petit-déjeuner</label>
                        <input type="number" name="breakfast_price" step="0.01" value="${reservation.breakfast_price || 0}">
                    </div>
                    <div class="form-group">
                        <label>Arrhes</label>
                        <input type="number" name="deposit_amount" step="0.01" value="${reservation.deposit_amount || 0}">
                    </div>
                </div>

                <div class="form-group">
                    <label>Total TTC</label>
                    <input type="number" name="total_amount" step="0.01" value="${reservation.total_amount || 0}" style="font-weight:700">
                </div>

                <hr style="margin:16px 0">
                <h4><i class="fas fa-lock"></i> Casier & Chambre</h4>

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
                        <select name="locker_id">
                            <option value="">-- Aucun --</option>
                            ${availableLockers.map(l => `<option value="${l.id}" ${l.id == reservation.locker_id ? 'selected' : ''}>${l.locker_number}</option>`).join('')}
                        </select>
                    </div>
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

// ==================== ONGLET CASIERS ====================

async function scRenderLockers(content) {
    content.innerHTML = '<div class="loading-inline"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>';

    try {
        const [lockersData, roomsData] = await Promise.all([
            API.get(`lockers?hotel_id=${_scHotelId}`),
            API.get(`hotels/${_scHotelId}`)
        ]);

        _scLockers = lockersData.lockers || [];
        _scRooms = roomsData.rooms || [];

        content.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <p class="text-muted">Configurez les casiers de votre établissement. Chaque casier contient la clé d'une chambre.</p>
                <button class="btn btn-primary" onclick="scShowCreateLocker()">
                    <i class="fas fa-plus"></i> Nouveau casier
                </button>
            </div>
            <div id="sc-lockers-list"></div>
        `;

        scRenderLockersList();
    } catch (err) {
        content.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
    }
}

function scRenderLockersList() {
    const list = document.getElementById('sc-lockers-list');
    if (!list) return;

    if (_scLockers.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding:40px"><i class="fas fa-lock" style="font-size:36px;color:var(--gray-300);margin-bottom:12px"></i><p>Aucun casier configuré</p><small class="text-muted">Ajoutez des casiers pour le self check-in</small></div>';
        return;
    }

    list.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
            ${_scLockers.map(l => {
                const statusColors = {
                    'available': { bg: '#F0FDF4', border: '#BBF7D0', color: '#16A34A', label: 'Disponible', icon: 'check-circle' },
                    'assigned': { bg: '#EFF6FF', border: '#BFDBFE', color: '#2563EB', label: 'Assigné', icon: 'user-check' },
                    'maintenance': { bg: '#FEF2F2', border: '#FECACA', color: '#DC2626', label: 'Maintenance', icon: 'tools' }
                };
                const s = statusColors[l.status] || statusColors['available'];

                return `
                <div class="card" style="padding:0;border-left:4px solid ${s.color};overflow:hidden">
                    <div style="padding:16px">
                        <div style="display:flex;justify-content:space-between;align-items:start">
                            <div>
                                <h4 style="margin:0;font-size:18px"><i class="fas fa-lock" style="color:${s.color}"></i> Casier ${esc(l.locker_number)}</h4>
                                <p style="margin:4px 0 0;font-size:13px;color:var(--gray-500)">Code : <strong>${esc(l.locker_code)}</strong></p>
                            </div>
                            <span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${s.bg};color:${s.color}">
                                <i class="fas fa-${s.icon}"></i> ${s.label}
                            </span>
                        </div>
                        ${l.linked_room_number ? `<p style="margin:8px 0 0;font-size:13px"><i class="fas fa-bed"></i> Chambre ${esc(l.linked_room_number)}</p>` : ''}
                        ${l.notes ? `<p style="margin:4px 0 0;font-size:12px;color:var(--gray-400)">${esc(l.notes)}</p>` : ''}
                        <div style="margin-top:12px;display:flex;gap:8px">
                            <button class="btn btn-sm btn-outline" onclick="scEditLocker(${l.id})"><i class="fas fa-edit"></i> Modifier</button>
                            <button class="btn btn-sm btn-danger" onclick="scDeleteLocker(${l.id})"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                </div>`;
            }).join('')}
        </div>
    `;
}

function scShowCreateLocker() {
    const activeRooms = _scRooms.filter(r => r.status === 'active');

    openModal('Nouveau casier', `
        <form onsubmit="scSaveLocker(event)">
            <input type="hidden" name="hotel_id" value="${_scHotelId}">
            <div class="form-row">
                <div class="form-group">
                    <label>Numéro du casier *</label>
                    <input type="text" name="locker_number" required placeholder="Ex: 1, A1, ...">
                </div>
                <div class="form-group">
                    <label>Code d'accès *</label>
                    <input type="text" name="locker_code" required placeholder="Ex: 1234, AB12, ...">
                </div>
            </div>
            <div class="form-group">
                <label>Chambre associée</label>
                <select name="room_id">
                    <option value="">-- Aucune --</option>
                    ${activeRooms.map(r => `<option value="${r.id}">${r.room_number} (${r.room_type})</option>`).join('')}
                </select>
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

async function scSaveLocker(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
        await API.post('lockers', data);
        toast('Casier créé', 'success');
        closeModal();
        scRenderTab();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function scEditLocker(id) {
    const locker = _scLockers.find(l => l.id == id);
    if (!locker) return;
    const activeRooms = _scRooms.filter(r => r.status === 'active');

    openModal('Modifier le casier', `
        <form onsubmit="scUpdateLocker(event, ${id})">
            <div class="form-row">
                <div class="form-group">
                    <label>Numéro du casier *</label>
                    <input type="text" name="locker_number" value="${esc(locker.locker_number)}" required>
                </div>
                <div class="form-group">
                    <label>Code d'accès *</label>
                    <input type="text" name="locker_code" value="${esc(locker.locker_code)}" required>
                </div>
            </div>
            <div class="form-group">
                <label>Chambre associée</label>
                <select name="room_id">
                    <option value="">-- Aucune --</option>
                    ${activeRooms.map(r => `<option value="${r.id}" ${r.id == locker.room_id ? 'selected' : ''}>${r.room_number} (${r.room_type})</option>`).join('')}
                </select>
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
}

async function scUpdateLocker(e, id) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
        await API.put(`lockers/${id}`, data);
        toast('Casier mis à jour', 'success');
        closeModal();
        scRenderTab();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function scDeleteLocker(id) {
    if (!confirm('Supprimer ce casier ?')) return;
    try {
        await API.delete(`lockers/${id}`);
        toast('Casier supprimé', 'success');
        scRenderTab();
    } catch (err) {
        toast(err.message, 'error');
    }
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
                Nuit : <strong>${formatCurrency(defaults.default_night_price || 0)}</strong> |
                Petit-déj : <strong>${formatCurrency(defaults.default_breakfast_price || 0)}</strong>/pers |
                Taxe séjour : <strong>${formatCurrency(defaults.default_tourist_tax || 0)}</strong>/adulte |
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
                                    <td>${p ? '<strong>' + formatCurrency(p.night_price) + '</strong>' : '<span class="text-muted">' + formatCurrency(defaults.default_night_price || 0) + '</span>'}</td>
                                    <td>${p ? formatCurrency(p.breakfast_price) : '<span class="text-muted">' + formatCurrency(defaults.default_breakfast_price || 0) + '</span>'}</td>
                                    <td>${p ? formatCurrency(p.tourist_tax) : '<span class="text-muted">' + formatCurrency(defaults.default_tourist_tax || 0) + '</span>'}</td>
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
