// ==================== MODULE LIVRET D'ACCUEIL NUMERIQUE ====================
// Configuration et gestion du livret d'accueil par hotel

let _wlHotelId = null;
let _wlTab = 'design';
let _wlHotels = [];
let _wlConfig = null;
let _wlTabs = [];
let _wlInfos = [];

async function loadWelcome(container) {
    showLoading(container);
    try {
        const mgmtRes = await API.getManagementInfo();
        _wlHotels = mgmtRes.manageable_hotels || [];

        if (_wlHotels.length === 0) {
            container.innerHTML = '<div class="card"><div class="empty-state"><i class="fas fa-book-open" style="font-size:48px;color:var(--gray-300);margin-bottom:16px"></i><p>Aucun hotel accessible</p></div></div>';
            return;
        }

        _wlHotelId = _wlHotelId || _wlHotels[0].id;

        container.innerHTML = `
            <div class="page-header">
                <div>
                    <h2><i class="fas fa-book-open"></i> Livret d'accueil</h2>
                    <p>Configurez le livret d'accueil numerique de vos hotels</p>
                </div>
                <div class="header-actions-group">
                    ${_wlHotels.length > 1 ? `
                    <select id="wl-hotel-select" class="form-control" style="width:auto;min-width:200px" onchange="wlSwitchHotel(this.value)">
                        ${_wlHotels.map(h => `<option value="${h.id}" ${h.id == _wlHotelId ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}
                    </select>` : ''}
                </div>
            </div>

            <div class="tabs-container" style="display:flex;gap:0;border-bottom:2px solid var(--gray-200);margin-bottom:20px;flex-wrap:wrap">
                <button class="tab-btn ${_wlTab === 'design' ? 'active' : ''}" data-tab="design" onclick="wlSwitchTab('design')">
                    <i class="fas fa-palette"></i> Design
                </button>
                <button class="tab-btn ${_wlTab === 'accueil' ? 'active' : ''}" data-tab="accueil" onclick="wlSwitchTab('accueil')">
                    <i class="fas fa-home"></i> Accueil
                </button>
                <button class="tab-btn ${_wlTab === 'services' ? 'active' : ''}" data-tab="services" onclick="wlSwitchTab('services')">
                    <i class="fas fa-concierge-bell"></i> Services
                </button>
                <button class="tab-btn ${_wlTab === 'infos' ? 'active' : ''}" data-tab="infos" onclick="wlSwitchTab('infos')">
                    <i class="fas fa-info-circle"></i> Infos pratiques
                </button>
                <button class="tab-btn ${_wlTab === 'publication' ? 'active' : ''}" data-tab="publication" onclick="wlSwitchTab('publication')">
                    <i class="fas fa-globe"></i> Publication
                </button>
            </div>

            <div id="wl-tab-content"></div>
        `;

        wlInjectStyles();
        await wlLoadData();
        wlRenderTab();
    } catch (err) {
        container.innerHTML = `<div class="alert alert-danger">Erreur : ${esc(err.message)}</div>`;
        console.error(err);
    }
}

async function wlSwitchHotel(hotelId) {
    _wlHotelId = hotelId;
    await wlLoadData();
    wlRenderTab();
}

function wlSwitchTab(tab) {
    _wlTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    wlRenderTab();
}

async function wlLoadData() {
    try {
        const [configRes, tabsRes, infosRes] = await Promise.all([
            API.get(`welcome/config?hotel_id=${_wlHotelId}`),
            API.get(`welcome/tabs?hotel_id=${_wlHotelId}`),
            API.get(`welcome/infos?hotel_id=${_wlHotelId}`)
        ]);
        _wlConfig = configRes.config || null;
        _wlTabs = tabsRes.tabs || [];
        _wlInfos = infosRes.infos || [];
    } catch (err) {
        _wlConfig = null;
        _wlTabs = [];
        _wlInfos = [];
    }
}

function wlRenderTab() {
    const content = document.getElementById('wl-tab-content');
    if (!content) return;

    switch (_wlTab) {
        case 'design': wlRenderDesign(content); break;
        case 'accueil': wlRenderAccueil(content); break;
        case 'services': wlRenderServices(content); break;
        case 'infos': wlRenderInfos(content); break;
        case 'publication': wlRenderPublication(content); break;
    }
}

// ============================================================
// ONGLET DESIGN
// ============================================================
function wlRenderDesign(content) {
    const c = _wlConfig || {};
    content.innerHTML = `
        <div class="card">
            <div class="card-header"><h3 class="card-title"><i class="fas fa-palette"></i> Apparence du livret</h3></div>
            <div style="padding:24px">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
                    <div class="form-group">
                        <label class="form-label">Couleur principale</label>
                        <div style="display:flex;align-items:center;gap:10px">
                            <input type="color" id="wl-primary-color" value="${esc(c.primary_color || '#1a56db')}" style="width:50px;height:40px;border:none;cursor:pointer">
                            <input type="text" class="form-control" id="wl-primary-color-text" value="${esc(c.primary_color || '#1a56db')}" style="width:120px" oninput="document.getElementById('wl-primary-color').value=this.value">
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Couleur secondaire</label>
                        <div style="display:flex;align-items:center;gap:10px">
                            <input type="color" id="wl-secondary-color" value="${esc(c.secondary_color || '#f3f4f6')}" style="width:50px;height:40px;border:none;cursor:pointer">
                            <input type="text" class="form-control" id="wl-secondary-color-text" value="${esc(c.secondary_color || '#f3f4f6')}" style="width:120px" oninput="document.getElementById('wl-secondary-color').value=this.value">
                        </div>
                    </div>
                </div>

                <div class="form-group" style="margin-top:16px">
                    <label class="form-label">Police de caracteres</label>
                    <select class="form-control" id="wl-font-family" style="max-width:300px">
                        ${['Inter', 'Roboto', 'Open Sans', 'Lato', 'Playfair Display', 'Montserrat', 'Poppins', 'Raleway'].map(f =>
                            `<option value="${f}" ${(c.font_family || 'Inter') === f ? 'selected' : ''} style="font-family:${f}">${f}</option>`
                        ).join('')}
                    </select>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:24px">
                    <div class="form-group">
                        <label class="form-label"><i class="fas fa-image"></i> Logo de l'hotel</label>
                        ${c.logo_path ? `
                            <div style="margin-bottom:10px"><img src="${esc(c.logo_path)}" style="max-height:80px;border-radius:8px;border:1px solid var(--gray-200)"></div>
                        ` : ''}
                        <input type="file" class="form-control" accept="image/jpeg,image/png,image/webp" onchange="wlUploadImage('logo', this)">
                        <small class="text-muted">JPG, PNG ou WEBP - Max 5 Mo</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label"><i class="fas fa-panorama"></i> Banniere</label>
                        ${c.banner_path ? `
                            <div style="margin-bottom:10px"><img src="${esc(c.banner_path)}" style="max-height:80px;border-radius:8px;width:100%;object-fit:cover;border:1px solid var(--gray-200)"></div>
                        ` : ''}
                        <input type="file" class="form-control" accept="image/jpeg,image/png,image/webp" onchange="wlUploadImage('banner', this)">
                        <small class="text-muted">Format paysage recommande (1200x400px)</small>
                    </div>
                </div>

                <div style="margin-top:24px">
                    <button class="btn btn-primary" onclick="wlSaveDesign()"><i class="fas fa-save"></i> Enregistrer le design</button>
                </div>
            </div>
        </div>
    `;

    // Synchroniser color picker et text input
    document.getElementById('wl-primary-color').addEventListener('input', function() {
        document.getElementById('wl-primary-color-text').value = this.value;
    });
    document.getElementById('wl-secondary-color').addEventListener('input', function() {
        document.getElementById('wl-secondary-color-text').value = this.value;
    });
}

async function wlSaveDesign() {
    const data = {
        hotel_id: _wlHotelId,
        slug: _wlConfig?.slug || 'hotel-' + _wlHotelId,
        primary_color: document.getElementById('wl-primary-color').value,
        secondary_color: document.getElementById('wl-secondary-color').value,
        font_family: document.getElementById('wl-font-family').value,
        // Conserver les autres champs
        is_published: _wlConfig?.is_published || 0,
        welcome_title: _wlConfig?.welcome_title || null,
        welcome_text: _wlConfig?.welcome_text || null,
        phone: _wlConfig?.phone || null,
        email: _wlConfig?.email || null,
        address: _wlConfig?.address || null,
        google_maps_url: _wlConfig?.google_maps_url || null,
        facebook_url: _wlConfig?.facebook_url || null,
        instagram_url: _wlConfig?.instagram_url || null,
        website_url: _wlConfig?.website_url || null,
        wifi_name: _wlConfig?.wifi_name || null,
        wifi_password: _wlConfig?.wifi_password || null,
        checkin_time: _wlConfig?.checkin_time || '15:00:00',
        checkout_time: _wlConfig?.checkout_time || '11:00:00'
    };

    try {
        await API.put('welcome/config', data);
        toast('Design enregistre', 'success');
        await wlLoadData();
    } catch (err) {
        toast('Erreur : ' + err.message, 'error');
    }
}

async function wlUploadImage(type, input) {
    if (!input.files || !input.files[0]) return;
    const formData = new FormData();
    formData.append('file', input.files[0]);
    formData.append('hotel_id', _wlHotelId);

    try {
        const res = await API.upload(`welcome/config/${type}`, formData);
        toast(res.message || 'Image uploadee', 'success');
        await wlLoadData();
        wlRenderTab();
    } catch (err) {
        toast('Erreur upload : ' + err.message, 'error');
    }
}

// ============================================================
// ONGLET ACCUEIL
// ============================================================
function wlRenderAccueil(content) {
    const c = _wlConfig || {};
    content.innerHTML = `
        <div class="card">
            <div class="card-header"><h3 class="card-title"><i class="fas fa-home"></i> Page d'accueil du livret</h3></div>
            <div style="padding:24px">
                <div class="form-group">
                    <label class="form-label">Titre de bienvenue</label>
                    <input type="text" class="form-control" id="wl-welcome-title" value="${esc(c.welcome_title || '')}" placeholder="Bienvenue dans notre hotel !">
                </div>
                <div class="form-group" style="margin-top:16px">
                    <label class="form-label">Texte d'accueil</label>
                    <textarea class="form-control" id="wl-welcome-text" rows="5" placeholder="Presentez votre hotel et souhaitez la bienvenue a vos clients...">${esc(c.welcome_text || '')}</textarea>
                </div>

                <h4 style="margin-top:28px;margin-bottom:16px"><i class="fas fa-phone"></i> Coordonnees</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
                    <div class="form-group">
                        <label class="form-label">Telephone</label>
                        <input type="tel" class="form-control" id="wl-phone" value="${esc(c.phone || '')}" placeholder="+33 1 23 45 67 89">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Email</label>
                        <input type="email" class="form-control" id="wl-email" value="${esc(c.email || '')}" placeholder="contact@hotel.com">
                    </div>
                </div>
                <div class="form-group" style="margin-top:16px">
                    <label class="form-label">Adresse</label>
                    <textarea class="form-control" id="wl-address" rows="2" placeholder="123 Rue de Paris, 75001 Paris">${esc(c.address || '')}</textarea>
                </div>
                <div class="form-group" style="margin-top:16px">
                    <label class="form-label">Lien Google Maps</label>
                    <input type="url" class="form-control" id="wl-google-maps" value="${esc(c.google_maps_url || '')}" placeholder="https://maps.google.com/...">
                </div>

                <h4 style="margin-top:28px;margin-bottom:16px"><i class="fas fa-share-alt"></i> Reseaux sociaux</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">
                    <div class="form-group">
                        <label class="form-label"><i class="fab fa-facebook"></i> Facebook</label>
                        <input type="url" class="form-control" id="wl-facebook" value="${esc(c.facebook_url || '')}" placeholder="https://facebook.com/...">
                    </div>
                    <div class="form-group">
                        <label class="form-label"><i class="fab fa-instagram"></i> Instagram</label>
                        <input type="url" class="form-control" id="wl-instagram" value="${esc(c.instagram_url || '')}" placeholder="https://instagram.com/...">
                    </div>
                    <div class="form-group">
                        <label class="form-label"><i class="fas fa-globe"></i> Site web</label>
                        <input type="url" class="form-control" id="wl-website" value="${esc(c.website_url || '')}" placeholder="https://www.hotel.com">
                    </div>
                </div>

                <h4 style="margin-top:28px;margin-bottom:16px"><i class="fas fa-clock"></i> Horaires</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:16px">
                    <div class="form-group">
                        <label class="form-label">Check-in</label>
                        <input type="time" class="form-control" id="wl-checkin-time" value="${c.checkin_time ? c.checkin_time.substring(0,5) : '15:00'}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Check-out</label>
                        <input type="time" class="form-control" id="wl-checkout-time" value="${c.checkout_time ? c.checkout_time.substring(0,5) : '11:00'}">
                    </div>
                    <div class="form-group">
                        <label class="form-label"><i class="fas fa-wifi"></i> Nom WiFi</label>
                        <input type="text" class="form-control" id="wl-wifi-name" value="${esc(c.wifi_name || '')}" placeholder="Hotel_Guest">
                    </div>
                    <div class="form-group">
                        <label class="form-label"><i class="fas fa-key"></i> Mot de passe WiFi</label>
                        <input type="text" class="form-control" id="wl-wifi-password" value="${esc(c.wifi_password || '')}" placeholder="bienvenue2026">
                    </div>
                </div>

                <div style="margin-top:24px">
                    <button class="btn btn-primary" onclick="wlSaveAccueil()"><i class="fas fa-save"></i> Enregistrer</button>
                </div>
            </div>
        </div>
    `;
}

async function wlSaveAccueil() {
    const data = {
        hotel_id: _wlHotelId,
        slug: _wlConfig?.slug || 'hotel-' + _wlHotelId,
        is_published: _wlConfig?.is_published || 0,
        primary_color: _wlConfig?.primary_color || '#1a56db',
        secondary_color: _wlConfig?.secondary_color || '#f3f4f6',
        font_family: _wlConfig?.font_family || 'Inter',
        welcome_title: document.getElementById('wl-welcome-title').value || null,
        welcome_text: document.getElementById('wl-welcome-text').value || null,
        phone: document.getElementById('wl-phone').value || null,
        email: document.getElementById('wl-email').value || null,
        address: document.getElementById('wl-address').value || null,
        google_maps_url: document.getElementById('wl-google-maps').value || null,
        facebook_url: document.getElementById('wl-facebook').value || null,
        instagram_url: document.getElementById('wl-instagram').value || null,
        website_url: document.getElementById('wl-website').value || null,
        wifi_name: document.getElementById('wl-wifi-name').value || null,
        wifi_password: document.getElementById('wl-wifi-password').value || null,
        checkin_time: document.getElementById('wl-checkin-time').value + ':00',
        checkout_time: document.getElementById('wl-checkout-time').value + ':00'
    };

    try {
        await API.put('welcome/config', data);
        toast('Informations enregistrees', 'success');
        await wlLoadData();
    } catch (err) {
        toast('Erreur : ' + err.message, 'error');
    }
}

// ============================================================
// ONGLET SERVICES (onglets + items)
// ============================================================
function wlRenderServices(content) {
    content.innerHTML = `
        <div class="card">
            <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
                <h3 class="card-title" style="margin:0"><i class="fas fa-concierge-bell"></i> Onglets de services</h3>
                <button class="btn btn-primary btn-sm" onclick="wlShowAddTab()"><i class="fas fa-plus"></i> Ajouter un onglet</button>
            </div>
            <div style="padding:24px">
                <p class="text-muted" style="margin-bottom:16px">Creez des onglets pour organiser les services de votre hotel (Restaurant, Spa, Activites, Bar...).</p>
                ${_wlTabs.length === 0 ? `
                    <div class="empty-state" style="padding:40px">
                        <i class="fas fa-folder-open" style="font-size:48px;color:var(--gray-300);margin-bottom:16px"></i>
                        <p>Aucun onglet. Cliquez sur "Ajouter un onglet" pour commencer.</p>
                    </div>
                ` : `
                    <div class="wl-tabs-list">
                        ${_wlTabs.map((tab, i) => `
                            <div class="wl-tab-card ${tab.is_active == 1 ? '' : 'inactive'}" data-id="${tab.id}">
                                <div class="wl-tab-drag"><i class="fas fa-grip-vertical"></i></div>
                                <div class="wl-tab-icon"><i class="fas fa-${esc(tab.icon || 'concierge-bell')}"></i></div>
                                <div class="wl-tab-info">
                                    <strong>${esc(tab.name)}</strong>
                                    <small class="text-muted">${tab.description ? esc(tab.description.substring(0, 60)) + '...' : 'Pas de description'}</small>
                                </div>
                                <div class="wl-tab-count">
                                    <span class="badge badge-gray" id="wl-item-count-${tab.id}">...</span>
                                </div>
                                <div class="wl-tab-actions">
                                    <button class="btn btn-sm btn-outline" onclick="wlEditTab(${tab.id})" title="Modifier"><i class="fas fa-pencil-alt"></i></button>
                                    <button class="btn btn-sm btn-outline" onclick="wlManageItems(${tab.id})" title="Gerer le contenu"><i class="fas fa-list"></i></button>
                                    <button class="btn btn-sm btn-outline" onclick="wlToggleTab(${tab.id}, ${tab.is_active == 1 ? 0 : 1})" title="${tab.is_active == 1 ? 'Desactiver' : 'Activer'}">
                                        <i class="fas fa-${tab.is_active == 1 ? 'eye-slash' : 'eye'}"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline" onclick="wlDeleteTab(${tab.id})" title="Supprimer" style="color:var(--danger,#dc2626)"><i class="fas fa-trash"></i></button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        </div>
    `;

    // Charger le nombre d'items par onglet
    _wlTabs.forEach(tab => {
        API.get(`welcome/items?tab_id=${tab.id}`).then(res => {
            const el = document.getElementById(`wl-item-count-${tab.id}`);
            if (el) el.textContent = (res.items || []).length + ' element(s)';
        }).catch(() => {});
    });
}

function wlShowAddTab() {
    const icons = ['utensils','spa','swimmer','cocktail','coffee','bed','map-marked-alt','shopping-bag','car','music','dumbbell','umbrella-beach','hiking','bicycle','ticket-alt','film','book','heart','star','concierge-bell'];

    openModal('Nouvel onglet', `
        <form onsubmit="wlCreateTab(event)">
            <div class="form-group">
                <label class="form-label">Nom de l'onglet *</label>
                <input type="text" class="form-control" name="name" required placeholder="Ex: Restaurant, Spa, Activites...">
            </div>
            <div class="form-group" style="margin-top:16px">
                <label class="form-label">Icone</label>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
                    ${icons.map(icon => `
                        <label style="cursor:pointer">
                            <input type="radio" name="icon" value="${icon}" style="display:none" ${icon === 'concierge-bell' ? 'checked' : ''}>
                            <span class="wl-icon-pick" style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:8px;border:2px solid var(--gray-200);font-size:16px;transition:all 0.2s">
                                <i class="fas fa-${icon}"></i>
                            </span>
                        </label>
                    `).join('')}
                </div>
            </div>
            <div class="form-group" style="margin-top:16px">
                <label class="form-label">Description (optionnel)</label>
                <textarea class="form-control" name="description" rows="2" placeholder="Texte introductif pour cet onglet"></textarea>
            </div>
            <div class="modal-footer" style="margin-top:24px">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i> Creer</button>
            </div>
        </form>
    `);

    // Icon selection highlight
    document.querySelectorAll('.wl-icon-pick').forEach(el => {
        el.closest('label').addEventListener('click', () => {
            document.querySelectorAll('.wl-icon-pick').forEach(e => e.style.borderColor = 'var(--gray-200)');
            setTimeout(() => el.style.borderColor = 'var(--primary, #1a56db)', 10);
        });
    });
}

async function wlCreateTab(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
        await API.post('welcome/tabs', {
            hotel_id: _wlHotelId,
            name: form.get('name'),
            icon: form.get('icon') || 'concierge-bell',
            description: form.get('description') || null
        });
        toast('Onglet cree', 'success');
        closeModal();
        await wlLoadData();
        wlRenderTab();
    } catch (err) {
        toast('Erreur : ' + err.message, 'error');
    }
}

async function wlEditTab(tabId) {
    const tab = _wlTabs.find(t => t.id == tabId);
    if (!tab) return;

    const icons = ['utensils','spa','swimmer','cocktail','coffee','bed','map-marked-alt','shopping-bag','car','music','dumbbell','umbrella-beach','hiking','bicycle','ticket-alt','film','book','heart','star','concierge-bell'];

    openModal('Modifier l\'onglet', `
        <form onsubmit="wlUpdateTab(event, ${tabId})">
            <div class="form-group">
                <label class="form-label">Nom *</label>
                <input type="text" class="form-control" name="name" required value="${esc(tab.name)}">
            </div>
            <div class="form-group" style="margin-top:16px">
                <label class="form-label">Icone</label>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
                    ${icons.map(icon => `
                        <label style="cursor:pointer">
                            <input type="radio" name="icon" value="${icon}" style="display:none" ${(tab.icon || 'concierge-bell') === icon ? 'checked' : ''}>
                            <span class="wl-icon-pick" style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:8px;border:2px solid ${(tab.icon || 'concierge-bell') === icon ? 'var(--primary, #1a56db)' : 'var(--gray-200)'};font-size:16px;transition:all 0.2s">
                                <i class="fas fa-${icon}"></i>
                            </span>
                        </label>
                    `).join('')}
                </div>
            </div>
            <div class="form-group" style="margin-top:16px">
                <label class="form-label">Description</label>
                <textarea class="form-control" name="description" rows="2">${esc(tab.description || '')}</textarea>
            </div>
            <div class="modal-footer" style="margin-top:24px">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
            </div>
        </form>
    `);

    document.querySelectorAll('.wl-icon-pick').forEach(el => {
        el.closest('label').addEventListener('click', () => {
            document.querySelectorAll('.wl-icon-pick').forEach(e => e.style.borderColor = 'var(--gray-200)');
            setTimeout(() => el.style.borderColor = 'var(--primary, #1a56db)', 10);
        });
    });
}

async function wlUpdateTab(e, tabId) {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
        await API.put(`welcome/tabs/${tabId}`, {
            name: form.get('name'),
            icon: form.get('icon') || 'concierge-bell',
            description: form.get('description') || null
        });
        toast('Onglet mis a jour', 'success');
        closeModal();
        await wlLoadData();
        wlRenderTab();
    } catch (err) {
        toast('Erreur : ' + err.message, 'error');
    }
}

async function wlToggleTab(tabId, active) {
    try {
        await API.put(`welcome/tabs/${tabId}`, { is_active: active });
        toast(active ? 'Onglet active' : 'Onglet desactive', 'success');
        await wlLoadData();
        wlRenderTab();
    } catch (err) {
        toast('Erreur : ' + err.message, 'error');
    }
}

async function wlDeleteTab(tabId) {
    if (!confirm('Supprimer cet onglet et tout son contenu ?')) return;
    try {
        await API.delete(`welcome/tabs/${tabId}`);
        toast('Onglet supprime', 'success');
        await wlLoadData();
        wlRenderTab();
    } catch (err) {
        toast('Erreur : ' + err.message, 'error');
    }
}

// --- GESTION DES ITEMS DANS UN ONGLET ---
async function wlManageItems(tabId) {
    const tab = _wlTabs.find(t => t.id == tabId);
    if (!tab) return;

    let items = [];
    try {
        const res = await API.get(`welcome/items?tab_id=${tabId}`);
        items = res.items || [];
    } catch (err) {
        toast('Erreur chargement', 'error');
        return;
    }

    openModal(`<i class="fas fa-${esc(tab.icon || 'concierge-bell')}"></i> ${esc(tab.name)} - Contenu`, `
        <div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
            <span class="text-muted">${items.length} element(s)</span>
            <button class="btn btn-primary btn-sm" onclick="wlShowAddItem(${tabId})"><i class="fas fa-plus"></i> Ajouter</button>
        </div>
        <div id="wl-items-list">
            ${items.length === 0 ? '<p class="text-muted" style="text-align:center;padding:24px">Aucun element. Cliquez sur "Ajouter" pour commencer.</p>' : items.map(item => `
                <div class="wl-item-row" style="display:flex;gap:12px;align-items:center;padding:12px;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:8px">
                    ${item.photo_path ? `<img src="${esc(item.photo_path)}" style="width:50px;height:50px;border-radius:6px;object-fit:cover">` : '<div style="width:50px;height:50px;border-radius:6px;background:var(--gray-100);display:flex;align-items:center;justify-content:center"><i class="fas fa-image" style="color:var(--gray-300)"></i></div>'}
                    <div style="flex:1;min-width:0">
                        <strong>${esc(item.title)}</strong>
                        <div class="text-muted" style="font-size:12px">
                            ${item.price ? '<i class="fas fa-tag"></i> ' + esc(item.price) + ' ' : ''}
                            ${item.schedule ? '<i class="fas fa-clock"></i> ' + esc(item.schedule) : ''}
                        </div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-sm btn-outline" onclick="wlEditItem(${item.id}, ${tabId})" title="Modifier"><i class="fas fa-pencil-alt"></i></button>
                        <button class="btn btn-sm btn-outline" onclick="wlUploadItemPhoto(${item.id}, ${tabId})" title="Photo"><i class="fas fa-camera"></i></button>
                        <button class="btn btn-sm btn-outline" onclick="wlDeleteItem(${item.id}, ${tabId})" title="Supprimer" style="color:var(--danger,#dc2626)"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `).join('')}
        </div>
    `, 'modal-lg');
}

function wlShowAddItem(tabId) {
    closeModal();
    setTimeout(() => {
        openModal('Nouvel element', `
            <form onsubmit="wlCreateItem(event, ${tabId})">
                <div class="form-group">
                    <label class="form-label">Titre *</label>
                    <input type="text" class="form-control" name="title" required placeholder="Ex: Petit-dejeuner buffet">
                </div>
                <div class="form-group" style="margin-top:16px">
                    <label class="form-label">Description</label>
                    <textarea class="form-control" name="description" rows="3" placeholder="Decrivez le service ou l'activite..."></textarea>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
                    <div class="form-group">
                        <label class="form-label"><i class="fas fa-tag"></i> Prix</label>
                        <input type="text" class="form-control" name="price" placeholder="Ex: 18EUR, Gratuit, Sur demande">
                    </div>
                    <div class="form-group">
                        <label class="form-label"><i class="fas fa-clock"></i> Horaires</label>
                        <input type="text" class="form-control" name="schedule" placeholder="Ex: 7h - 10h30">
                    </div>
                </div>
                <div class="form-group" style="margin-top:16px">
                    <label class="form-label"><i class="fas fa-external-link-alt"></i> Lien externe</label>
                    <input type="url" class="form-control" name="external_link" placeholder="https://...">
                </div>
                <div class="modal-footer" style="margin-top:24px">
                    <button type="button" class="btn btn-outline" onclick="closeModal(); setTimeout(() => wlManageItems(${tabId}), 200)">Retour</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i> Creer</button>
                </div>
            </form>
        `);
    }, 200);
}

async function wlCreateItem(e, tabId) {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
        await API.post('welcome/items', {
            tab_id: tabId,
            title: form.get('title'),
            description: form.get('description') || null,
            price: form.get('price') || null,
            schedule: form.get('schedule') || null,
            external_link: form.get('external_link') || null
        });
        toast('Element cree', 'success');
        closeModal();
        setTimeout(() => wlManageItems(tabId), 200);
    } catch (err) {
        toast('Erreur : ' + err.message, 'error');
    }
}

async function wlEditItem(itemId, tabId) {
    let item;
    try {
        const res = await API.get(`welcome/items?tab_id=${tabId}`);
        item = (res.items || []).find(i => i.id == itemId);
    } catch (err) { return; }
    if (!item) return;

    closeModal();
    setTimeout(() => {
        openModal('Modifier l\'element', `
            <form onsubmit="wlUpdateItem(event, ${itemId}, ${tabId})">
                <div class="form-group">
                    <label class="form-label">Titre *</label>
                    <input type="text" class="form-control" name="title" required value="${esc(item.title)}">
                </div>
                <div class="form-group" style="margin-top:16px">
                    <label class="form-label">Description</label>
                    <textarea class="form-control" name="description" rows="3">${esc(item.description || '')}</textarea>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
                    <div class="form-group">
                        <label class="form-label"><i class="fas fa-tag"></i> Prix</label>
                        <input type="text" class="form-control" name="price" value="${esc(item.price || '')}">
                    </div>
                    <div class="form-group">
                        <label class="form-label"><i class="fas fa-clock"></i> Horaires</label>
                        <input type="text" class="form-control" name="schedule" value="${esc(item.schedule || '')}">
                    </div>
                </div>
                <div class="form-group" style="margin-top:16px">
                    <label class="form-label"><i class="fas fa-external-link-alt"></i> Lien externe</label>
                    <input type="url" class="form-control" name="external_link" value="${esc(item.external_link || '')}">
                </div>
                <div class="modal-footer" style="margin-top:24px">
                    <button type="button" class="btn btn-outline" onclick="closeModal(); setTimeout(() => wlManageItems(${tabId}), 200)">Retour</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
                </div>
            </form>
        `);
    }, 200);
}

async function wlUpdateItem(e, itemId, tabId) {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
        await API.put(`welcome/items/${itemId}`, {
            title: form.get('title'),
            description: form.get('description') || null,
            price: form.get('price') || null,
            schedule: form.get('schedule') || null,
            external_link: form.get('external_link') || null
        });
        toast('Element mis a jour', 'success');
        closeModal();
        setTimeout(() => wlManageItems(tabId), 200);
    } catch (err) {
        toast('Erreur : ' + err.message, 'error');
    }
}

function wlUploadItemPhoto(itemId, tabId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = async () => {
        if (!input.files || !input.files[0]) return;
        const formData = new FormData();
        formData.append('file', input.files[0]);

        try {
            await API.upload(`welcome/items/${itemId}/photo`, formData);
            toast('Photo uploadee', 'success');
            wlManageItems(tabId);
        } catch (err) {
            toast('Erreur : ' + err.message, 'error');
        }
    };
    input.click();
}

async function wlDeleteItem(itemId, tabId) {
    if (!confirm('Supprimer cet element ?')) return;
    try {
        await API.delete(`welcome/items/${itemId}`);
        toast('Element supprime', 'success');
        wlManageItems(tabId);
    } catch (err) {
        toast('Erreur : ' + err.message, 'error');
    }
}

// ============================================================
// ONGLET INFOS PRATIQUES
// ============================================================
function wlRenderInfos(content) {
    const infoTypes = {
        wifi: { label: 'WiFi', icon: 'wifi' },
        parking: { label: 'Parking', icon: 'parking' },
        transport: { label: 'Transport', icon: 'bus' },
        emergency: { label: 'Urgences', icon: 'phone-alt' },
        rules: { label: 'Reglement', icon: 'clipboard-list' },
        other: { label: 'Autre', icon: 'info-circle' }
    };

    content.innerHTML = `
        <div class="card">
            <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
                <h3 class="card-title" style="margin:0"><i class="fas fa-info-circle"></i> Informations pratiques</h3>
                <button class="btn btn-primary btn-sm" onclick="wlShowAddInfo()"><i class="fas fa-plus"></i> Ajouter</button>
            </div>
            <div style="padding:24px">
                <p class="text-muted" style="margin-bottom:16px">Ajoutez les informations utiles pour vos clients (WiFi, parking, transports, reglement interieur...).</p>
                ${_wlInfos.length === 0 ? `
                    <div class="empty-state" style="padding:40px">
                        <i class="fas fa-info-circle" style="font-size:48px;color:var(--gray-300);margin-bottom:16px"></i>
                        <p>Aucune information. Cliquez sur "Ajouter" pour commencer.</p>
                    </div>
                ` : _wlInfos.map(info => `
                    <div style="display:flex;gap:12px;align-items:flex-start;padding:16px;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:8px">
                        <div style="width:40px;height:40px;border-radius:8px;background:var(--gray-100);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                            <i class="fas fa-${esc(info.icon || 'info-circle')}" style="color:var(--gray-500)"></i>
                        </div>
                        <div style="flex:1;min-width:0">
                            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                                <strong>${esc(info.title)}</strong>
                                <span class="badge badge-gray">${(infoTypes[info.info_type] || infoTypes.other).label}</span>
                            </div>
                            <p class="text-muted" style="font-size:13px;white-space:pre-line">${esc(info.content)}</p>
                        </div>
                        <div style="display:flex;gap:6px;flex-shrink:0">
                            <button class="btn btn-sm btn-outline" onclick="wlEditInfo(${info.id})"><i class="fas fa-pencil-alt"></i></button>
                            <button class="btn btn-sm btn-outline" onclick="wlDeleteInfo(${info.id})" style="color:var(--danger,#dc2626)"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function wlShowAddInfo() {
    openModal('Nouvelle information', `
        <form onsubmit="wlCreateInfo(event)">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
                <div class="form-group">
                    <label class="form-label">Type</label>
                    <select class="form-control" name="info_type">
                        <option value="wifi">WiFi</option>
                        <option value="parking">Parking</option>
                        <option value="transport">Transport</option>
                        <option value="emergency">Urgences</option>
                        <option value="rules">Reglement</option>
                        <option value="other" selected>Autre</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Icone</label>
                    <select class="form-control" name="icon">
                        <option value="wifi">wifi</option>
                        <option value="parking">parking</option>
                        <option value="bus">bus</option>
                        <option value="taxi">taxi</option>
                        <option value="phone-alt">telephone</option>
                        <option value="clipboard-list">reglement</option>
                        <option value="key">cle</option>
                        <option value="shield-alt">securite</option>
                        <option value="first-aid">premiers secours</option>
                        <option value="info-circle" selected>info</option>
                    </select>
                </div>
            </div>
            <div class="form-group" style="margin-top:16px">
                <label class="form-label">Titre *</label>
                <input type="text" class="form-control" name="title" required placeholder="Ex: Acces WiFi">
            </div>
            <div class="form-group" style="margin-top:16px">
                <label class="form-label">Contenu *</label>
                <textarea class="form-control" name="content" rows="4" required placeholder="Reseau : Hotel_Guest&#10;Mot de passe : bienvenue2026"></textarea>
            </div>
            <div class="modal-footer" style="margin-top:24px">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i> Creer</button>
            </div>
        </form>
    `);
}

async function wlCreateInfo(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
        await API.post('welcome/infos', {
            hotel_id: _wlHotelId,
            info_type: form.get('info_type'),
            title: form.get('title'),
            content: form.get('content'),
            icon: form.get('icon') || 'info-circle'
        });
        toast('Information creee', 'success');
        closeModal();
        await wlLoadData();
        wlRenderTab();
    } catch (err) {
        toast('Erreur : ' + err.message, 'error');
    }
}

async function wlEditInfo(infoId) {
    const info = _wlInfos.find(i => i.id == infoId);
    if (!info) return;

    openModal('Modifier l\'information', `
        <form onsubmit="wlUpdateInfo(event, ${infoId})">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
                <div class="form-group">
                    <label class="form-label">Type</label>
                    <select class="form-control" name="info_type">
                        ${['wifi','parking','transport','emergency','rules','other'].map(t =>
                            `<option value="${t}" ${info.info_type === t ? 'selected' : ''}>${t}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Icone</label>
                    <select class="form-control" name="icon">
                        ${['wifi','parking','bus','taxi','phone-alt','clipboard-list','key','shield-alt','first-aid','info-circle'].map(i =>
                            `<option value="${i}" ${(info.icon || 'info-circle') === i ? 'selected' : ''}>${i}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
            <div class="form-group" style="margin-top:16px">
                <label class="form-label">Titre *</label>
                <input type="text" class="form-control" name="title" required value="${esc(info.title)}">
            </div>
            <div class="form-group" style="margin-top:16px">
                <label class="form-label">Contenu *</label>
                <textarea class="form-control" name="content" rows="4" required>${esc(info.content)}</textarea>
            </div>
            <div class="modal-footer" style="margin-top:24px">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
            </div>
        </form>
    `);
}

async function wlUpdateInfo(e, infoId) {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
        await API.put(`welcome/infos/${infoId}`, {
            info_type: form.get('info_type'),
            title: form.get('title'),
            content: form.get('content'),
            icon: form.get('icon') || 'info-circle'
        });
        toast('Information mise a jour', 'success');
        closeModal();
        await wlLoadData();
        wlRenderTab();
    } catch (err) {
        toast('Erreur : ' + err.message, 'error');
    }
}

async function wlDeleteInfo(infoId) {
    if (!confirm('Supprimer cette information ?')) return;
    try {
        await API.delete(`welcome/infos/${infoId}`);
        toast('Information supprimee', 'success');
        await wlLoadData();
        wlRenderTab();
    } catch (err) {
        toast('Erreur : ' + err.message, 'error');
    }
}

// ============================================================
// ONGLET PUBLICATION
// ============================================================
function wlRenderPublication(content) {
    const c = _wlConfig || {};
    const slug = c.slug || 'hotel-' + _wlHotelId;
    const isPublished = c.is_published == 1;
    const publicUrl = window.location.origin + '/welcome.html?hotel=' + slug;

    content.innerHTML = `
        <div class="card">
            <div class="card-header"><h3 class="card-title"><i class="fas fa-globe"></i> Publication du livret</h3></div>
            <div style="padding:24px">
                <div style="display:flex;align-items:center;gap:16px;padding:20px;background:${isPublished ? '#f0fdf4' : 'var(--gray-50, #f9fafb)'};border-radius:12px;border:1px solid ${isPublished ? '#bbf7d0' : 'var(--gray-200)'};margin-bottom:24px">
                    <div style="width:48px;height:48px;border-radius:50%;background:${isPublished ? '#22c55e' : 'var(--gray-300)'};display:flex;align-items:center;justify-content:center">
                        <i class="fas fa-${isPublished ? 'check' : 'eye-slash'}" style="color:white;font-size:20px"></i>
                    </div>
                    <div style="flex:1">
                        <strong style="font-size:16px">${isPublished ? 'Livret publie' : 'Livret en brouillon'}</strong>
                        <p class="text-muted" style="margin:4px 0 0">${isPublished ? 'Votre livret est accessible au public via le lien ci-dessous.' : 'Votre livret n\'est pas encore visible par les clients.'}</p>
                    </div>
                    <button class="btn ${isPublished ? 'btn-outline' : 'btn-primary'}" onclick="wlTogglePublish(${isPublished ? 0 : 1})">
                        <i class="fas fa-${isPublished ? 'eye-slash' : 'rocket'}"></i> ${isPublished ? 'Depublier' : 'Publier'}
                    </button>
                </div>

                <div class="form-group">
                    <label class="form-label"><i class="fas fa-link"></i> Slug URL (identifiant unique)</label>
                    <div style="display:flex;gap:8px">
                        <input type="text" class="form-control" id="wl-slug" value="${esc(slug)}" pattern="[a-z0-9\\-]+" title="Lettres minuscules, chiffres et tirets uniquement" style="flex:1">
                        <button class="btn btn-outline" onclick="wlSaveSlug()"><i class="fas fa-save"></i></button>
                    </div>
                    <small class="text-muted">URL du livret : <code>${esc(publicUrl)}</code></small>
                </div>

                ${isPublished ? `
                <div style="margin-top:24px">
                    <h4 style="margin-bottom:16px"><i class="fas fa-share-alt"></i> Partager</h4>
                    <div style="display:flex;gap:12px;flex-wrap:wrap">
                        <a href="${esc(publicUrl)}" target="_blank" class="btn btn-primary">
                            <i class="fas fa-external-link-alt"></i> Ouvrir le livret
                        </a>
                        <button class="btn btn-outline" onclick="wlCopyLink('${escAttr(publicUrl)}')">
                            <i class="fas fa-copy"></i> Copier le lien
                        </button>
                    </div>
                </div>

                <div style="margin-top:24px">
                    <h4 style="margin-bottom:16px"><i class="fas fa-qrcode"></i> QR Code</h4>
                    <p class="text-muted" style="margin-bottom:12px">Imprimez ce QR code et placez-le dans les chambres pour un acces rapide au livret.</p>
                    <div style="background:white;padding:20px;border:1px solid var(--gray-200);border-radius:12px;display:inline-block">
                        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(publicUrl)}" alt="QR Code" style="width:200px;height:200px">
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

async function wlTogglePublish(publish) {
    if (publish && !_wlConfig) {
        toast('Veuillez d\'abord configurer le design et l\'accueil', 'warning');
        return;
    }

    const data = {
        hotel_id: _wlHotelId,
        slug: _wlConfig?.slug || 'hotel-' + _wlHotelId,
        is_published: publish,
        primary_color: _wlConfig?.primary_color || '#1a56db',
        secondary_color: _wlConfig?.secondary_color || '#f3f4f6',
        font_family: _wlConfig?.font_family || 'Inter',
        welcome_title: _wlConfig?.welcome_title || null,
        welcome_text: _wlConfig?.welcome_text || null,
        phone: _wlConfig?.phone || null,
        email: _wlConfig?.email || null,
        address: _wlConfig?.address || null,
        google_maps_url: _wlConfig?.google_maps_url || null,
        facebook_url: _wlConfig?.facebook_url || null,
        instagram_url: _wlConfig?.instagram_url || null,
        website_url: _wlConfig?.website_url || null,
        wifi_name: _wlConfig?.wifi_name || null,
        wifi_password: _wlConfig?.wifi_password || null,
        checkin_time: _wlConfig?.checkin_time || '15:00:00',
        checkout_time: _wlConfig?.checkout_time || '11:00:00'
    };

    try {
        await API.put('welcome/config', data);
        toast(publish ? 'Livret publie !' : 'Livret depublie', 'success');
        await wlLoadData();
        wlRenderTab();
    } catch (err) {
        toast('Erreur : ' + err.message, 'error');
    }
}

async function wlSaveSlug() {
    const slug = document.getElementById('wl-slug').value.trim();
    if (!slug || !/^[a-z0-9\-]+$/.test(slug)) {
        toast('Le slug ne doit contenir que des lettres minuscules, chiffres et tirets', 'warning');
        return;
    }

    const data = {
        hotel_id: _wlHotelId,
        slug: slug,
        is_published: _wlConfig?.is_published || 0,
        primary_color: _wlConfig?.primary_color || '#1a56db',
        secondary_color: _wlConfig?.secondary_color || '#f3f4f6',
        font_family: _wlConfig?.font_family || 'Inter',
        welcome_title: _wlConfig?.welcome_title || null,
        welcome_text: _wlConfig?.welcome_text || null,
        phone: _wlConfig?.phone || null,
        email: _wlConfig?.email || null,
        address: _wlConfig?.address || null,
        google_maps_url: _wlConfig?.google_maps_url || null,
        facebook_url: _wlConfig?.facebook_url || null,
        instagram_url: _wlConfig?.instagram_url || null,
        website_url: _wlConfig?.website_url || null,
        wifi_name: _wlConfig?.wifi_name || null,
        wifi_password: _wlConfig?.wifi_password || null,
        checkin_time: _wlConfig?.checkin_time || '15:00:00',
        checkout_time: _wlConfig?.checkout_time || '11:00:00'
    };

    try {
        await API.put('welcome/config', data);
        toast('Slug mis a jour', 'success');
        await wlLoadData();
        wlRenderTab();
    } catch (err) {
        toast('Erreur : ' + err.message, 'error');
    }
}

function wlCopyLink(url) {
    navigator.clipboard.writeText(url).then(() => {
        toast('Lien copie dans le presse-papier', 'success');
    }).catch(() => {
        // Fallback
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        input.remove();
        toast('Lien copie', 'success');
    });
}

// ============================================================
// STYLES MODULE
// ============================================================
function wlInjectStyles() {
    if (document.getElementById('welcome-module-styles')) return;
    const style = document.createElement('style');
    style.id = 'welcome-module-styles';
    style.textContent = `
        .wl-tabs-list { display:flex; flex-direction:column; gap:8px; }
        .wl-tab-card {
            display:flex; align-items:center; gap:12px; padding:14px 16px;
            border:1px solid var(--gray-200); border-radius:10px;
            background:white; transition:all 0.2s;
        }
        .wl-tab-card:hover { border-color:var(--primary-300, #93c5fd); box-shadow:0 2px 8px rgba(0,0,0,0.06); }
        .wl-tab-card.inactive { opacity:0.5; background:var(--gray-50, #f9fafb); }
        .wl-tab-drag { color:var(--gray-300); cursor:grab; }
        .wl-tab-icon {
            width:40px; height:40px; border-radius:8px;
            background:var(--primary-50, #eff6ff); color:var(--primary, #1a56db);
            display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0;
        }
        .wl-tab-info { flex:1; min-width:0; }
        .wl-tab-info strong { display:block; font-size:14px; }
        .wl-tab-info small { display:block; margin-top:2px; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .wl-tab-count { flex-shrink:0; }
        .wl-tab-actions { display:flex; gap:6px; flex-shrink:0; }
        @media (max-width:768px) {
            .wl-tab-card { flex-wrap:wrap; }
            .wl-tab-actions { width:100%; justify-content:flex-end; }
        }
    `;
    document.head.appendChild(style);
}
