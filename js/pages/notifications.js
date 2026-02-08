/**
 * Module Gestion des Notifications
 * Admin + Responsable Hôtel : envoyer, programmer, historique
 */

let ntfHotels = [];
let ntfUsers = [];
let ntfHistory = [];
let ntfFilter = { type: '', target: '' };

async function loadNotificationManager(container) {
    showLoading(container);

    try {
        const [mgmtRes, historyRes] = await Promise.all([
            API.getManagementInfo(),
            API.get('notifications/admin/history')
        ]);

        ntfHotels = mgmtRes.manageable_hotels || [];
        ntfHistory = historyRes.campaigns || [];

        container.innerHTML = `
            <div class="page-header">
                <div>
                    <h2><i class="fas fa-bell"></i> Gestion des Notifications</h2>
                    <p class="text-muted">Envoyez et gérez les notifications pour vos équipes</p>
                </div>
                <div class="header-actions-group">
                    <button class="btn btn-primary" onclick="ntfShowSendForm()">
                        <i class="fas fa-paper-plane"></i> Nouvelle notification
                    </button>
                </div>
            </div>

            <!-- Stats -->
            <div class="rooms-stats" id="ntf-stats">
                ${renderNtfStats(historyRes)}
            </div>

            <!-- Formulaire d'envoi -->
            <div class="card mb-20" id="ntf-send-card" style="display:none">
                <div class="card-header">
                    <h3 class="card-title"><i class="fas fa-paper-plane"></i> Envoyer une notification</h3>
                    <button class="btn btn-sm btn-outline" onclick="ntfHideSendForm()"><i class="fas fa-times"></i></button>
                </div>
                <div class="card-body" style="padding:24px">
                    <form onsubmit="ntfSendNotification(event)">
                        <div class="form-row">
                            <div class="form-group" style="flex:2">
                                <label>Titre *</label>
                                <input type="text" name="title" required maxlength="255" placeholder="Ex: Réunion d'équipe demain à 10h">
                            </div>
                            <div class="form-group" style="flex:1">
                                <label>Type</label>
                                <select name="type">
                                    <option value="info">ℹ️ Information</option>
                                    <option value="success">✅ Succès</option>
                                    <option value="warning">⚠️ Avertissement</option>
                                    <option value="danger">🚨 Urgent</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Message</label>
                            <textarea name="message" rows="3" placeholder="Détails de la notification (optionnel)..."></textarea>
                        </div>

                        <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:10px;padding:16px 20px;margin-bottom:16px">
                            <h5 style="margin:0 0 12px"><i class="fas fa-users"></i> Destinataires</h5>
                            <div class="form-group" style="margin-bottom:12px">
                                <label>Ciblage</label>
                                <select name="target_type" onchange="ntfTargetChanged(this.value)">
                                    <option value="all">Tous les utilisateurs</option>
                                    <option value="hotel">Par hôtel</option>
                                    <option value="role">Par rôle</option>
                                    <option value="users">Utilisateurs spécifiques</option>
                                </select>
                            </div>

                            <div id="ntf-target-hotel" style="display:none" class="form-group" style="margin-bottom:0">
                                <label>Hôtel(s)</label>
                                <div class="ntf-checkbox-grid">
                                    ${ntfHotels.map(h => `
                                        <label class="checkbox-label">
                                            <input type="checkbox" name="hotel_ids" value="${h.id}"> ${esc(h.name)}
                                        </label>
                                    `).join('')}
                                </div>
                            </div>

                            <div id="ntf-target-role" style="display:none" class="form-group" style="margin-bottom:0">
                                <label>Rôle(s)</label>
                                <div class="ntf-checkbox-grid">
                                    ${[
                                        {v:'admin',l:'Administrateur'},
                                        {v:'groupe_manager',l:'Responsable Groupe'},
                                        {v:'hotel_manager',l:'Responsable Hôtel'},
                                        {v:'comptabilite',l:'Comptabilité'},
                                        {v:'rh',l:'Ressources Humaines'},
                                        {v:'receptionniste',l:'Réceptionniste'},
                                        {v:'employee',l:'Employé'}
                                    ].map(r => `
                                        <label class="checkbox-label">
                                            <input type="checkbox" name="roles" value="${r.v}"> ${r.l}
                                        </label>
                                    `).join('')}
                                </div>
                            </div>

                            <div id="ntf-target-users" style="display:none" class="form-group" style="margin-bottom:0">
                                <label>Rechercher des utilisateurs</label>
                                <input type="text" id="ntf-user-search" placeholder="Tapez un nom..." oninput="ntfSearchUsers(this.value)">
                                <div id="ntf-user-results" style="margin-top:8px"></div>
                                <div id="ntf-selected-users" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px"></div>
                            </div>
                        </div>

                        <div style="display:flex;justify-content:flex-end;gap:10px">
                            <button type="button" class="btn btn-outline" onclick="ntfHideSendForm()">Annuler</button>
                            <button type="submit" class="btn btn-primary"><i class="fas fa-paper-plane"></i> Envoyer</button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Historique -->
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title"><i class="fas fa-history"></i> Historique des envois</h3>
                    <div class="header-actions" style="display:flex;gap:8px">
                        <select onchange="ntfFilterType(this.value)" style="padding:6px 10px;border:1px solid var(--gray-300);border-radius:6px;font-size:13px">
                            <option value="">Tous les types</option>
                            <option value="info">Information</option>
                            <option value="success">Succès</option>
                            <option value="warning">Avertissement</option>
                            <option value="danger">Urgent</option>
                        </select>
                    </div>
                </div>
                <div id="ntf-history-content">
                    ${renderNtfHistory(ntfHistory)}
                </div>
            </div>
        `;

        injectNtfStyles();
    } catch (error) {
        container.innerHTML = `<div class="card"><p class="text-danger">Erreur: ${error.message}</p></div>`;
    }
}

function renderNtfStats(data) {
    const total = data.total_sent || 0;
    const today = data.sent_today || 0;
    const week = data.sent_week || 0;

    return `
        <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Total envoyées</div></div>
        <div class="stat-card stat-success"><div class="stat-value">${today}</div><div class="stat-label">Aujourd'hui</div></div>
        <div class="stat-card" style="border-left:4px solid var(--primary)"><div class="stat-value">${week}</div><div class="stat-label">Cette semaine</div></div>
    `;
}

function renderNtfHistory(campaigns) {
    if (!campaigns || campaigns.length === 0) {
        return `<div class="empty-state"><i class="fas fa-bell-slash"></i><h3>Aucune notification envoyée</h3><p>Cliquez sur "Nouvelle notification" pour commencer</p></div>`;
    }

    return `
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Titre</th>
                    <th>Message</th>
                    <th>Ciblage</th>
                    <th>Envoyé par</th>
                    <th>Destinataires</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${campaigns.map(c => `
                    <tr>
                        <td><small>${formatDateTime(c.created_at)}</small></td>
                        <td>${ntfTypeBadge(c.type)}</td>
                        <td><strong>${esc(c.title)}</strong></td>
                        <td><small class="text-muted">${esc((c.message || '').substring(0, 60))}${(c.message || '').length > 60 ? '...' : ''}</small></td>
                        <td>${ntfTargetBadge(c.target_type, c.target_detail)}</td>
                        <td><small>${esc(c.sender_name || '-')}</small></td>
                        <td><span class="badge badge-primary">${c.recipients_count || 0}</span></td>
                        <td>
                            <div class="table-actions">
                                <button onclick="ntfResend(${c.id})" title="Renvoyer"><i class="fas fa-redo"></i></button>
                                <button onclick="ntfDeleteCampaign(${c.id})" title="Supprimer" style="color:var(--danger)"><i class="fas fa-trash"></i></button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function ntfTypeBadge(type) {
    const map = {
        info: '<span class="badge badge-info">Info</span>',
        success: '<span class="badge badge-success">Succès</span>',
        warning: '<span class="badge badge-warning">Avertissement</span>',
        danger: '<span class="badge badge-danger">Urgent</span>'
    };
    return map[type] || `<span class="badge">${type}</span>`;
}

function ntfTargetBadge(type, detail) {
    if (type === 'all') return '<span class="badge">Tous</span>';
    if (type === 'hotel') return `<span class="badge badge-info"><i class="fas fa-building"></i> ${esc(detail || 'Hôtel')}</span>`;
    if (type === 'role') return `<span class="badge badge-warning"><i class="fas fa-user-tag"></i> ${esc(detail || 'Rôle')}</span>`;
    if (type === 'users') return `<span class="badge"><i class="fas fa-user"></i> ${esc(detail || 'Sélection')}</span>`;
    return '<span class="badge">-</span>';
}

// ============ FORMULAIRE D'ENVOI ============

function ntfShowSendForm() {
    document.getElementById('ntf-send-card').style.display = '';
    document.getElementById('ntf-send-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function ntfHideSendForm() {
    document.getElementById('ntf-send-card').style.display = 'none';
}

function ntfTargetChanged(value) {
    document.getElementById('ntf-target-hotel').style.display = value === 'hotel' ? '' : 'none';
    document.getElementById('ntf-target-role').style.display = value === 'role' ? '' : 'none';
    document.getElementById('ntf-target-users').style.display = value === 'users' ? '' : 'none';
}

let _ntfSelectedUserIds = [];

let _ntfSearchTimer = null;
async function ntfSearchUsers(query) {
    clearTimeout(_ntfSearchTimer);
    if (query.length < 2) {
        document.getElementById('ntf-user-results').innerHTML = '';
        return;
    }
    _ntfSearchTimer = setTimeout(async () => {
        try {
            const res = await API.get(`users?search=${encodeURIComponent(query)}&limit=10`);
            const users = res.users || [];
            const resultsEl = document.getElementById('ntf-user-results');
            if (users.length === 0) {
                resultsEl.innerHTML = '<small class="text-muted">Aucun résultat</small>';
                return;
            }
            resultsEl.innerHTML = users
                .filter(u => !_ntfSelectedUserIds.includes(u.id))
                .map(u => `
                    <button type="button" class="ntf-user-result" onclick="ntfAddUser(${u.id}, '${escAttr(u.first_name + ' ' + u.last_name)}')">
                        <i class="fas fa-user"></i> ${esc(u.first_name)} ${esc(u.last_name)} <small class="text-muted">(${esc(u.role)})</small>
                    </button>
                `).join('');
        } catch (e) {
            document.getElementById('ntf-user-results').innerHTML = '';
        }
    }, 300);
}

function ntfAddUser(id, name) {
    if (_ntfSelectedUserIds.includes(id)) return;
    _ntfSelectedUserIds.push(id);
    ntfRenderSelectedUsers();
    document.getElementById('ntf-user-results').innerHTML = '';
    document.getElementById('ntf-user-search').value = '';
}

function ntfRemoveUser(id) {
    _ntfSelectedUserIds = _ntfSelectedUserIds.filter(x => x !== id);
    ntfRenderSelectedUsers();
}

function ntfRenderSelectedUsers() {
    const el = document.getElementById('ntf-selected-users');
    if (!el) return;
    el.innerHTML = _ntfSelectedUserIds.map(id => {
        return `<span class="badge badge-primary" style="padding:4px 10px;display:inline-flex;align-items:center;gap:6px">
            Utilisateur #${id}
            <button type="button" onclick="ntfRemoveUser(${id})" style="background:none;border:none;color:white;cursor:pointer;padding:0"><i class="fas fa-times" style="font-size:10px"></i></button>
        </span>`;
    }).join('');
}

async function ntfSendNotification(e) {
    e.preventDefault();
    const fd = new FormData(e.target);

    const targetType = fd.get('target_type');
    const payload = {
        title: fd.get('title'),
        message: fd.get('message') || '',
        type: fd.get('type'),
        target_type: targetType
    };

    if (targetType === 'hotel') {
        payload.hotel_ids = fd.getAll('hotel_ids').map(Number);
        if (payload.hotel_ids.length === 0) { toast('Sélectionnez au moins un hôtel', 'warning'); return; }
    } else if (targetType === 'role') {
        payload.roles = fd.getAll('roles');
        if (payload.roles.length === 0) { toast('Sélectionnez au moins un rôle', 'warning'); return; }
    } else if (targetType === 'users') {
        payload.user_ids = _ntfSelectedUserIds;
        if (payload.user_ids.length === 0) { toast('Sélectionnez au moins un utilisateur', 'warning'); return; }
    }

    try {
        const res = await API.post('notifications/admin/send', payload);
        toast(`Notification envoyée à ${res.recipients_count || 0} destinataire(s)`, 'success');
        ntfHideSendForm();
        e.target.reset();
        _ntfSelectedUserIds = [];
        // Recharger
        loadNotificationManager(document.getElementById('page-content'));
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function ntfResend(campaignId) {
    if (!confirm('Renvoyer cette notification ?')) return;
    try {
        const res = await API.post(`notifications/admin/resend/${campaignId}`);
        toast(`Notification renvoyée à ${res.recipients_count || 0} destinataire(s)`, 'success');
        loadNotificationManager(document.getElementById('page-content'));
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function ntfDeleteCampaign(campaignId) {
    if (!confirm('Supprimer cette notification de l\'historique ?')) return;
    try {
        await API.delete(`notifications/admin/campaigns/${campaignId}`);
        toast('Supprimé', 'success');
        loadNotificationManager(document.getElementById('page-content'));
    } catch (err) {
        toast(err.message, 'error');
    }
}

function ntfFilterType(type) {
    ntfFilter.type = type;
    const filtered = type ? ntfHistory.filter(c => c.type === type) : ntfHistory;
    document.getElementById('ntf-history-content').innerHTML = renderNtfHistory(filtered);
}

// ============ STYLES ============

function injectNtfStyles() {
    if (document.getElementById('ntf-mgmt-styles')) return;
    const style = document.createElement('style');
    style.id = 'ntf-mgmt-styles';
    style.textContent = `
        .ntf-checkbox-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 8px;
        }
        .ntf-checkbox-grid .checkbox-label {
            padding: 8px 12px;
            background: white;
            border: 1px solid var(--gray-200);
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.15s;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
        }
        .ntf-checkbox-grid .checkbox-label:hover {
            border-color: var(--primary);
            background: var(--primary-50, #EFF6FF);
        }
        .ntf-user-result {
            display: block;
            width: 100%;
            text-align: left;
            padding: 8px 12px;
            border: 1px solid var(--gray-200);
            border-radius: 6px;
            background: white;
            cursor: pointer;
            margin-bottom: 4px;
            font-size: 13px;
            transition: background 0.15s;
        }
        .ntf-user-result:hover {
            background: var(--gray-50);
        }
    `;
    document.head.appendChild(style);
}
