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
// HELPER: Build full config payload for saving
// ============================================================
function wlBuildConfigPayload(overrides = {}) {
    const c = _wlConfig || {};
    return Object.assign({
        hotel_id: _wlHotelId,
        slug: c.slug || 'hotel-' + _wlHotelId,
        is_published: c.is_published || 0,
        primary_color: c.primary_color || '#1a56db',
        secondary_color: c.secondary_color || '#f3f4f6',
        font_family: c.font_family || 'Inter',
        title_font: c.title_font || null,
        title_size: c.title_size || 'lg',
        body_font_size: c.body_font_size || 'md',
        banner_height: c.banner_height || 320,
        banner_overlay: c.banner_overlay != null ? parseInt(c.banner_overlay) : 1,
        header_style: c.header_style || 'card',
        tab_style: c.tab_style || 'pills',
        item_layout: c.item_layout || 'cards',
        section_order: c.section_order || null,
        show_header: c.show_header != null ? parseInt(c.show_header) : 1,
        show_wifi: c.show_wifi != null ? parseInt(c.show_wifi) : 1,
        show_schedule: c.show_schedule != null ? parseInt(c.show_schedule) : 1,
        show_welcome: c.show_welcome != null ? parseInt(c.show_welcome) : 1,
        show_contact: c.show_contact != null ? parseInt(c.show_contact) : 1,
        show_social: c.show_social != null ? parseInt(c.show_social) : 1,
        show_infos: c.show_infos != null ? parseInt(c.show_infos) : 1,
        custom_css: c.custom_css || null,
        welcome_title: c.welcome_title || null,
        welcome_text: c.welcome_text || null,
        phone: c.phone || null,
        email: c.email || null,
        address: c.address || null,
        google_maps_url: c.google_maps_url || null,
        facebook_url: c.facebook_url || null,
        instagram_url: c.instagram_url || null,
        website_url: c.website_url || null,
        wifi_name: c.wifi_name || null,
        wifi_password: c.wifi_password || null,
        checkin_time: c.checkin_time || '15:00:00',
        checkout_time: c.checkout_time || '11:00:00'
    }, overrides);
}

// ============================================================
// HELPER: Style picker card
// ============================================================
function wlStyleOption(name, value, current, icon, label, desc) {
    const active = value === current;
    return `<div class="wl-style-option ${active ? 'active' : ''}" onclick="document.querySelectorAll('[data-group=\\'${name}\\'] .wl-style-option').forEach(e=>e.classList.remove('active'));this.classList.add('active');this.querySelector('input').checked=true" data-group="${name}">
        <input type="radio" name="${name}" value="${value}" ${active ? 'checked' : ''} style="display:none">
        <div class="wl-style-preview"><i class="${icon}"></i></div>
        <strong>${label}</strong>
        <small>${desc}</small>
    </div>`;
}

// ============================================================
// HELPER: Toggle switch
// ============================================================
function wlToggle(id, label, checked) {
    return `<label class="wl-toggle-row">
        <span>${label}</span>
        <div class="wl-toggle">
            <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
            <span class="wl-toggle-slider"></span>
        </div>
    </label>`;
}

// ============================================================
// ONGLET DESIGN
// ============================================================
function wlRenderDesign(content) {
    const c = _wlConfig || {};
    const titleFonts = ['Inter','Playfair Display','Cormorant Garamond','DM Serif Display','Libre Baskerville','Montserrat','Poppins','Raleway'];
    const bodyFonts = ['Inter','Roboto','Open Sans','Lato','Montserrat','Poppins','Raleway'];

    content.innerHTML = `
        <!-- SECTION: Couleurs & Typographie -->
        <div class="card" style="margin-bottom:20px">
            <div class="card-header"><h3 class="card-title"><i class="fas fa-palette"></i> Couleurs et typographie</h3></div>
            <div style="padding:24px">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
                    <div class="form-group">
                        <label class="form-label">Couleur principale</label>
                        <div style="display:flex;align-items:center;gap:10px">
                            <input type="color" id="wl-primary-color" value="${esc(c.primary_color || '#1a56db')}" style="width:50px;height:40px;border:none;cursor:pointer;border-radius:8px">
                            <input type="text" class="form-control" id="wl-primary-color-text" value="${esc(c.primary_color || '#1a56db')}" style="width:120px" oninput="document.getElementById('wl-primary-color').value=this.value">
                        </div>
                        <div style="display:flex;gap:6px;margin-top:8px">
                            ${['#1a56db','#059669','#dc2626','#7c3aed','#d97706','#0891b2','#be185d','#1e293b'].map(col =>
                                `<div style="width:28px;height:28px;border-radius:50%;background:${col};cursor:pointer;border:2px solid ${col === (c.primary_color||'#1a56db') ? 'var(--gray-800)' : 'transparent'};transition:all .2s" onclick="document.getElementById('wl-primary-color').value='${col}';document.getElementById('wl-primary-color-text').value='${col}'"></div>`
                            ).join('')}
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Couleur secondaire</label>
                        <div style="display:flex;align-items:center;gap:10px">
                            <input type="color" id="wl-secondary-color" value="${esc(c.secondary_color || '#f3f4f6')}" style="width:50px;height:40px;border:none;cursor:pointer;border-radius:8px">
                            <input type="text" class="form-control" id="wl-secondary-color-text" value="${esc(c.secondary_color || '#f3f4f6')}" style="width:120px" oninput="document.getElementById('wl-secondary-color').value=this.value">
                        </div>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px">
                    <div class="form-group">
                        <label class="form-label">Police des titres</label>
                        <select class="form-control" id="wl-title-font">
                            <option value="">Identique au corps</option>
                            ${titleFonts.map(f => `<option value="${f}" ${(c.title_font||'')=== f ? 'selected' : ''} style="font-family:'${f}'">${f}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Police du corps</label>
                        <select class="form-control" id="wl-font-family">
                            ${bodyFonts.map(f => `<option value="${f}" ${(c.font_family||'Inter')=== f ? 'selected' : ''} style="font-family:'${f}'">${f}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px">
                    <div class="form-group">
                        <label class="form-label">Taille des titres</label>
                        <select class="form-control" id="wl-title-size">
                            <option value="sm" ${(c.title_size||'lg')==='sm'?'selected':''}>Petit</option>
                            <option value="md" ${(c.title_size||'lg')==='md'?'selected':''}>Moyen</option>
                            <option value="lg" ${(c.title_size||'lg')==='lg'?'selected':''}>Grand</option>
                            <option value="xl" ${(c.title_size||'lg')==='xl'?'selected':''}>Tres grand</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Taille du texte</label>
                        <select class="form-control" id="wl-body-font-size">
                            <option value="sm" ${(c.body_font_size||'md')==='sm'?'selected':''}>Petit</option>
                            <option value="md" ${(c.body_font_size||'md')==='md'?'selected':''}>Moyen</option>
                            <option value="lg" ${(c.body_font_size||'md')==='lg'?'selected':''}>Grand</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>

        <!-- SECTION: Images -->
        <div class="card" style="margin-bottom:20px">
            <div class="card-header"><h3 class="card-title"><i class="fas fa-image"></i> Images</h3></div>
            <div style="padding:24px">
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px">
                    <div class="form-group">
                        <label class="form-label">Logo</label>
                        ${c.logo_path ? `<div style="margin-bottom:8px"><img src="${esc(c.logo_path)}" style="max-height:70px;border-radius:8px;border:1px solid var(--gray-200)"></div>` : ''}
                        <input type="file" class="form-control" accept="image/jpeg,image/png,image/webp" onchange="wlUploadImage('logo', this)" style="font-size:13px">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Banniere</label>
                        ${c.banner_path ? `<div style="margin-bottom:8px"><img src="${esc(c.banner_path)}" style="max-height:70px;border-radius:8px;width:100%;object-fit:cover;border:1px solid var(--gray-200)"></div>` : ''}
                        <input type="file" class="form-control" accept="image/jpeg,image/png,image/webp" onchange="wlUploadImage('banner', this)" style="font-size:13px">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Image bienvenue</label>
                        ${c.welcome_image_path ? `<div style="margin-bottom:8px"><img src="${esc(c.welcome_image_path)}" style="max-height:70px;border-radius:8px;width:100%;object-fit:cover;border:1px solid var(--gray-200)"></div>` : ''}
                        <input type="file" class="form-control" accept="image/jpeg,image/png,image/webp" onchange="wlUploadImage('welcome-image', this)" style="font-size:13px">
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px">
                    <div class="form-group">
                        <label class="form-label">Hauteur de banniere : <strong id="wl-bh-label">${c.banner_height || 320}px</strong></label>
                        <input type="range" id="wl-banner-height" min="180" max="500" step="10" value="${c.banner_height || 320}" style="width:100%" oninput="document.getElementById('wl-bh-label').textContent=this.value+'px'">
                    </div>
                    <div class="form-group" style="display:flex;align-items:center;gap:12px;padding-top:24px">
                        <label class="wl-toggle" style="flex-shrink:0">
                            <input type="checkbox" id="wl-banner-overlay" ${(c.banner_overlay != 0 || c.banner_overlay == null) ? 'checked' : ''}>
                            <span class="wl-toggle-slider"></span>
                        </label>
                        <span>Degradee sombre sur la banniere</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- SECTION: Mise en page -->
        <div class="card" style="margin-bottom:20px">
            <div class="card-header"><h3 class="card-title"><i class="fas fa-th-large"></i> Mise en page</h3></div>
            <div style="padding:24px">
                <label class="form-label" style="margin-bottom:12px">Style de l'en-tete</label>
                <div class="wl-style-grid" data-group="header_style">
                    ${wlStyleOption('header_style','card', c.header_style || 'card', 'fas fa-id-card', 'Carte', 'Carte flottante sous la banniere')}
                    ${wlStyleOption('header_style','overlay', c.header_style || 'card', 'fas fa-layer-group', 'Superpose', 'Nom sur la banniere')}
                    ${wlStyleOption('header_style','minimal', c.header_style || 'card', 'fas fa-minus', 'Minimal', 'Logo centre, texte simple')}
                </div>

                <label class="form-label" style="margin-top:24px;margin-bottom:12px">Style des onglets</label>
                <div class="wl-style-grid" data-group="tab_style">
                    ${wlStyleOption('tab_style','pills', c.tab_style || 'pills', 'fas fa-capsules', 'Pilules', 'Boutons arrondis colores')}
                    ${wlStyleOption('tab_style','underline', c.tab_style || 'pills', 'fas fa-underline', 'Souligne', 'Texte avec trait actif')}
                    ${wlStyleOption('tab_style','cards', c.tab_style || 'pills', 'fas fa-th-large', 'Cartes', 'Icones dans des cartes')}
                </div>

                <label class="form-label" style="margin-top:24px;margin-bottom:12px">Affichage des elements</label>
                <div class="wl-style-grid" data-group="item_layout">
                    ${wlStyleOption('item_layout','cards', c.item_layout || 'cards', 'fas fa-square', 'Cartes', 'Grandes cartes avec image')}
                    ${wlStyleOption('item_layout','list', c.item_layout || 'cards', 'fas fa-list', 'Liste', 'Liste compacte avec vignette')}
                    ${wlStyleOption('item_layout','grid', c.item_layout || 'cards', 'fas fa-th', 'Grille', 'Grille 2 colonnes')}
                </div>
            </div>
        </div>

        <!-- SECTION: Sections visibles -->
        <div class="card" style="margin-bottom:20px">
            <div class="card-header"><h3 class="card-title"><i class="fas fa-eye"></i> Sections visibles</h3></div>
            <div style="padding:24px">
                <p class="text-muted" style="margin-bottom:16px">Activez ou desactivez les sections de votre livret d'accueil.</p>
                <div class="wl-toggles-grid">
                    ${wlToggle('wl-show-header', 'En-tete hotel (nom, logo, etoiles)', c.show_header != 0 || c.show_header == null)}
                    ${wlToggle('wl-show-schedule', 'Horaires check-in / check-out', c.show_schedule != 0 || c.show_schedule == null)}
                    ${wlToggle('wl-show-wifi', 'Informations WiFi', c.show_wifi != 0 || c.show_wifi == null)}
                    ${wlToggle('wl-show-welcome', 'Message de bienvenue', c.show_welcome != 0 || c.show_welcome == null)}
                    ${wlToggle('wl-show-infos', 'Informations pratiques', c.show_infos != 0 || c.show_infos == null)}
                    ${wlToggle('wl-show-contact', 'Section contact', c.show_contact != 0 || c.show_contact == null)}
                    ${wlToggle('wl-show-social', 'Reseaux sociaux', c.show_social != 0 || c.show_social == null)}
                </div>
            </div>
        </div>

        <!-- SECTION: CSS personnalise -->
        <div class="card" style="margin-bottom:20px">
            <div class="card-header"><h3 class="card-title"><i class="fas fa-code"></i> CSS personnalise (avance)</h3></div>
            <div style="padding:24px">
                <p class="text-muted" style="margin-bottom:12px">Ajoutez du CSS personnalise pour affiner l'apparence du livret. Les classes commencent par <code>.wl-</code>.</p>
                <textarea class="form-control" id="wl-custom-css" rows="5" style="font-family:monospace;font-size:13px" placeholder=".wl-welcome-title { text-align: center; }&#10;.wl-banner-wrap { filter: saturate(1.2); }">${esc(c.custom_css || '')}</textarea>
            </div>
        </div>

        <div style="position:sticky;bottom:0;background:var(--gray-50,#f9fafb);padding:16px 0;border-top:1px solid var(--gray-200);z-index:10">
            <button class="btn btn-primary btn-lg" onclick="wlSaveDesign()" style="min-width:220px"><i class="fas fa-save"></i> Enregistrer le design</button>
        </div>
    `;

    // Synchroniser les color pickers
    const pc = document.getElementById('wl-primary-color');
    const sc = document.getElementById('wl-secondary-color');
    if (pc) pc.addEventListener('input', function() { document.getElementById('wl-primary-color-text').value = this.value; });
    if (sc) sc.addEventListener('input', function() { document.getElementById('wl-secondary-color-text').value = this.value; });
}

async function wlSaveDesign() {
    const getRadio = (name) => { const el = document.querySelector(`input[name="${name}"]:checked`); return el ? el.value : null; };

    const data = wlBuildConfigPayload({
        primary_color: document.getElementById('wl-primary-color').value,
        secondary_color: document.getElementById('wl-secondary-color').value,
        font_family: document.getElementById('wl-font-family').value,
        title_font: document.getElementById('wl-title-font').value || null,
        title_size: document.getElementById('wl-title-size').value,
        body_font_size: document.getElementById('wl-body-font-size').value,
        banner_height: parseInt(document.getElementById('wl-banner-height').value),
        banner_overlay: document.getElementById('wl-banner-overlay').checked ? 1 : 0,
        header_style: getRadio('header_style') || 'card',
        tab_style: getRadio('tab_style') || 'pills',
        item_layout: getRadio('item_layout') || 'cards',
        show_header: document.getElementById('wl-show-header').checked ? 1 : 0,
        show_schedule: document.getElementById('wl-show-schedule').checked ? 1 : 0,
        show_wifi: document.getElementById('wl-show-wifi').checked ? 1 : 0,
        show_welcome: document.getElementById('wl-show-welcome').checked ? 1 : 0,
        show_infos: document.getElementById('wl-show-infos').checked ? 1 : 0,
        show_contact: document.getElementById('wl-show-contact').checked ? 1 : 0,
        show_social: document.getElementById('wl-show-social').checked ? 1 : 0,
        custom_css: document.getElementById('wl-custom-css').value || null
    });

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

                <h4 style="margin-top:28px;margin-bottom:16px"><i class="fas fa-clock"></i> Horaires et WiFi</h4>
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
    const data = wlBuildConfigPayload({
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
    });

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
                                    <small class="text-muted">${tab.description ? esc(tab.description.substring(0, 60)) + '...' : 'Pas de description'}${tab.layout && tab.layout !== 'cards' ? ' &bull; ' + esc(tab.layout) : ''}</small>
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

    _wlTabs.forEach(tab => {
        API.get(`welcome/items?tab_id=${tab.id}`).then(res => {
            const el = document.getElementById(`wl-item-count-${tab.id}`);
            if (el) el.textContent = (res.items || []).length + ' element(s)';
        }).catch(() => {});
    });
}

const WL_ICONS = ['utensils','spa','swimmer','cocktail','coffee','bed','map-marked-alt','shopping-bag','car','music','dumbbell','umbrella-beach','hiking','bicycle','ticket-alt','film','book','heart','star','concierge-bell','wine-glass-alt','hot-tub','running','golf-ball','chess','gamepad','paint-brush','camera'];

function wlIconPicker(selected) {
    return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
        ${WL_ICONS.map(icon => `
            <label style="cursor:pointer">
                <input type="radio" name="icon" value="${icon}" style="display:none" ${(selected||'concierge-bell') === icon ? 'checked' : ''}>
                <span class="wl-icon-pick" style="display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:8px;border:2px solid ${(selected||'concierge-bell') === icon ? 'var(--primary, #1a56db)' : 'var(--gray-200)'};font-size:15px;transition:all 0.2s;color:var(--gray-600)">
                    <i class="fas fa-${icon}"></i>
                </span>
            </label>
        `).join('')}
    </div>`;
}

function wlBindIconPicker() {
    document.querySelectorAll('.wl-icon-pick').forEach(el => {
        el.closest('label').addEventListener('click', () => {
            document.querySelectorAll('.wl-icon-pick').forEach(e => e.style.borderColor = 'var(--gray-200)');
            setTimeout(() => el.style.borderColor = 'var(--primary, #1a56db)', 10);
        });
    });
}

function wlShowAddTab() {
    openModal('Nouvel onglet', `
        <form onsubmit="wlCreateTab(event)">
            <div class="form-group">
                <label class="form-label required">Nom de l'onglet</label>
                <input type="text" class="form-control" name="name" required placeholder="Ex: Restaurant, Spa, Activites...">
            </div>
            <div class="form-group" style="margin-top:16px">
                <label class="form-label">Icone</label>
                ${wlIconPicker('concierge-bell')}
            </div>
            <div class="form-group" style="margin-top:16px">
                <label class="form-label">Description (optionnel)</label>
                <textarea class="form-control" name="description" rows="2" placeholder="Texte introductif pour cet onglet"></textarea>
            </div>
            <div class="form-group" style="margin-top:16px">
                <label class="form-label">Disposition des elements</label>
                <select class="form-control" name="layout">
                    <option value="cards">Cartes (grandes images)</option>
                    <option value="list">Liste (compact)</option>
                    <option value="grid">Grille (2 colonnes)</option>
                </select>
            </div>
            <div class="modal-footer" style="margin-top:24px">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i> Creer</button>
            </div>
        </form>
    `);
    wlBindIconPicker();
}

async function wlCreateTab(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
        await API.post('welcome/tabs', {
            hotel_id: _wlHotelId,
            name: form.get('name'),
            icon: form.get('icon') || 'concierge-bell',
            description: form.get('description') || null,
            layout: form.get('layout') || 'cards'
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

    openModal('Modifier l\'onglet', `
        <form onsubmit="wlUpdateTab(event, ${tabId})">
            <div class="form-group">
                <label class="form-label required">Nom</label>
                <input type="text" class="form-control" name="name" required value="${esc(tab.name)}">
            </div>
            <div class="form-group" style="margin-top:16px">
                <label class="form-label">Icone</label>
                ${wlIconPicker(tab.icon)}
            </div>
            <div class="form-group" style="margin-top:16px">
                <label class="form-label">Description</label>
                <textarea class="form-control" name="description" rows="2">${esc(tab.description || '')}</textarea>
            </div>
            <div class="form-group" style="margin-top:16px">
                <label class="form-label">Disposition des elements</label>
                <select class="form-control" name="layout">
                    <option value="cards" ${(tab.layout||'cards')==='cards'?'selected':''}>Cartes (grandes images)</option>
                    <option value="list" ${tab.layout==='list'?'selected':''}>Liste (compact)</option>
                    <option value="grid" ${tab.layout==='grid'?'selected':''}>Grille (2 colonnes)</option>
                </select>
            </div>
            <div class="form-group" style="margin-top:16px">
                <label class="form-label">Image d'en-tete de l'onglet</label>
                ${tab.banner_path ? `<div style="margin-bottom:8px"><img src="${esc(tab.banner_path)}" style="max-height:80px;border-radius:8px;width:100%;object-fit:cover;border:1px solid var(--gray-200)"></div>` : ''}
                <input type="file" class="form-control" accept="image/jpeg,image/png,image/webp" onchange="wlUploadTabBanner(${tabId}, this)">
            </div>
            <div class="modal-footer" style="margin-top:24px">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
            </div>
        </form>
    `, 'modal-lg');
    wlBindIconPicker();
}

async function wlUploadTabBanner(tabId, input) {
    if (!input.files || !input.files[0]) return;
    const formData = new FormData();
    formData.append('file', input.files[0]);
    try {
        await API.upload(`welcome/tabs/${tabId}/banner`, formData);
        toast('Image uploadee', 'success');
        await wlLoadData();
    } catch (err) {
        toast('Erreur : ' + err.message, 'error');
    }
}

async function wlUpdateTab(e, tabId) {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
        await API.put(`welcome/tabs/${tabId}`, {
            name: form.get('name'),
            icon: form.get('icon') || 'concierge-bell',
            description: form.get('description') || null,
            layout: form.get('layout') || 'cards'
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
                        ${item.subtitle ? `<div class="text-muted" style="font-size:11px">${esc(item.subtitle)}</div>` : ''}
                        <div class="text-muted" style="font-size:12px">
                            ${item.badge_text ? `<span style="background:${esc(item.badge_color||'#1a56db')};color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;margin-right:4px">${esc(item.badge_text)}</span>` : ''}
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

function wlItemFormFields(item = {}) {
    return `
        <div class="form-group">
            <label class="form-label required">Titre</label>
            <input type="text" class="form-control" name="title" required value="${esc(item.title || '')}" placeholder="Ex: Petit-dejeuner buffet">
        </div>
        <div class="form-group" style="margin-top:12px">
            <label class="form-label">Sous-titre</label>
            <input type="text" class="form-control" name="subtitle" value="${esc(item.subtitle || '')}" placeholder="Ex: Au restaurant Le Jardin, rez-de-chaussee">
        </div>
        <div class="form-group" style="margin-top:12px">
            <label class="form-label">Description</label>
            <textarea class="form-control" name="description" rows="3" placeholder="Decrivez le service ou l'activite...">${esc(item.description || '')}</textarea>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px">
            <div class="form-group">
                <label class="form-label"><i class="fas fa-tag"></i> Prix</label>
                <input type="text" class="form-control" name="price" value="${esc(item.price || '')}" placeholder="Ex: 18EUR, Gratuit">
            </div>
            <div class="form-group">
                <label class="form-label"><i class="fas fa-clock"></i> Horaires</label>
                <input type="text" class="form-control" name="schedule" value="${esc(item.schedule || '')}" placeholder="Ex: 7h - 10h30">
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px">
            <div class="form-group">
                <label class="form-label"><i class="fas fa-bookmark"></i> Badge / etiquette</label>
                <div style="display:flex;gap:8px;align-items:center">
                    <input type="text" class="form-control" name="badge_text" value="${esc(item.badge_text || '')}" placeholder="Ex: Nouveau, Populaire" style="flex:1">
                    <input type="color" name="badge_color" value="${item.badge_color || '#1a56db'}" style="width:40px;height:36px;border:none;cursor:pointer;border-radius:6px">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label"><i class="fas fa-external-link-alt"></i> Lien externe</label>
                <input type="url" class="form-control" name="external_link" value="${esc(item.external_link || '')}" placeholder="https://...">
            </div>
        </div>
    `;
}

function wlShowAddItem(tabId) {
    closeModal();
    setTimeout(() => {
        openModal('Nouvel element', `
            <form onsubmit="wlCreateItem(event, ${tabId})">
                ${wlItemFormFields()}
                <div class="modal-footer" style="margin-top:24px">
                    <button type="button" class="btn btn-outline" onclick="closeModal(); setTimeout(() => wlManageItems(${tabId}), 200)">Retour</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i> Creer</button>
                </div>
            </form>
        `, 'modal-lg');
    }, 200);
}

async function wlCreateItem(e, tabId) {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
        await API.post('welcome/items', {
            tab_id: tabId,
            title: form.get('title'),
            subtitle: form.get('subtitle') || null,
            description: form.get('description') || null,
            price: form.get('price') || null,
            schedule: form.get('schedule') || null,
            external_link: form.get('external_link') || null,
            badge_text: form.get('badge_text') || null,
            badge_color: form.get('badge_text') ? form.get('badge_color') : null
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
                ${wlItemFormFields(item)}
                <div class="modal-footer" style="margin-top:24px">
                    <button type="button" class="btn btn-outline" onclick="closeModal(); setTimeout(() => wlManageItems(${tabId}), 200)">Retour</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
                </div>
            </form>
        `, 'modal-lg');
    }, 200);
}

async function wlUpdateItem(e, itemId, tabId) {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
        await API.put(`welcome/items/${itemId}`, {
            title: form.get('title'),
            subtitle: form.get('subtitle') || null,
            description: form.get('description') || null,
            price: form.get('price') || null,
            schedule: form.get('schedule') || null,
            external_link: form.get('external_link') || null,
            badge_text: form.get('badge_text') || null,
            badge_color: form.get('badge_text') ? form.get('badge_color') : null
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

function wlInfoFormFields(info = {}) {
    return `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div class="form-group">
                <label class="form-label">Type</label>
                <select class="form-control" name="info_type">
                    ${['wifi','parking','transport','emergency','rules','other'].map(t =>
                        `<option value="${t}" ${(info.info_type||'other') === t ? 'selected' : ''}>${t === 'wifi' ? 'WiFi' : t === 'parking' ? 'Parking' : t === 'transport' ? 'Transport' : t === 'emergency' ? 'Urgences' : t === 'rules' ? 'Reglement' : 'Autre'}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Icone</label>
                <select class="form-control" name="icon">
                    ${['wifi','parking','bus','taxi','phone-alt','clipboard-list','key','shield-alt','first-aid','info-circle','map-marker-alt','clock','utensils','swimming-pool','dog','smoking-ban','bed'].map(i =>
                        `<option value="${i}" ${(info.icon||'info-circle') === i ? 'selected' : ''}>${i}</option>`
                    ).join('')}
                </select>
            </div>
        </div>
        <div class="form-group" style="margin-top:16px">
            <label class="form-label required">Titre</label>
            <input type="text" class="form-control" name="title" required value="${esc(info.title || '')}" placeholder="Ex: Acces WiFi">
        </div>
        <div class="form-group" style="margin-top:16px">
            <label class="form-label required">Contenu</label>
            <textarea class="form-control" name="content" rows="4" required placeholder="Reseau : Hotel_Guest&#10;Mot de passe : bienvenue2026">${esc(info.content || '')}</textarea>
        </div>
    `;
}

function wlShowAddInfo() {
    openModal('Nouvelle information', `
        <form onsubmit="wlCreateInfo(event)">
            ${wlInfoFormFields()}
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
            ${wlInfoFormFields(info)}
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

    try {
        await API.put('welcome/config', wlBuildConfigPayload({ is_published: publish }));
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

    try {
        await API.put('welcome/config', wlBuildConfigPayload({ slug: slug }));
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

        /* Style picker */
        .wl-style-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; }
        .wl-style-option {
            border:2px solid var(--gray-200); border-radius:12px; padding:16px;
            text-align:center; cursor:pointer; transition:all 0.2s; background:white;
        }
        .wl-style-option:hover { border-color:var(--primary-300, #93c5fd); }
        .wl-style-option.active { border-color:var(--primary, #1a56db); background:var(--primary-50, #eff6ff); }
        .wl-style-preview {
            width:48px; height:48px; border-radius:10px;
            background:var(--gray-100); color:var(--gray-500);
            display:flex; align-items:center; justify-content:center;
            font-size:20px; margin:0 auto 10px;
        }
        .wl-style-option.active .wl-style-preview { background:var(--primary, #1a56db); color:white; }
        .wl-style-option strong { display:block; font-size:13px; margin-bottom:2px; }
        .wl-style-option small { display:block; font-size:11px; color:var(--gray-500); }

        /* Toggle switch */
        .wl-toggle { position:relative; display:inline-block; width:44px; height:24px; flex-shrink:0; }
        .wl-toggle input { opacity:0; width:0; height:0; }
        .wl-toggle-slider {
            position:absolute; cursor:pointer; inset:0;
            background:var(--gray-300); border-radius:24px; transition:.3s;
        }
        .wl-toggle-slider::before {
            content:''; position:absolute; height:18px; width:18px;
            left:3px; bottom:3px; background:white; border-radius:50%; transition:.3s;
        }
        .wl-toggle input:checked + .wl-toggle-slider { background:var(--primary, #1a56db); }
        .wl-toggle input:checked + .wl-toggle-slider::before { transform:translateX(20px); }

        .wl-toggle-row {
            display:flex; align-items:center; justify-content:space-between;
            padding:12px 16px; border:1px solid var(--gray-100); border-radius:8px;
            margin-bottom:6px; cursor:pointer; transition:background 0.2s;
        }
        .wl-toggle-row:hover { background:var(--gray-50, #f9fafb); }
        .wl-toggle-row span { font-size:14px; }

        .wl-toggles-grid { display:flex; flex-direction:column; }

        @media (max-width:768px) {
            .wl-tab-card { flex-wrap:wrap; }
            .wl-tab-actions { width:100%; justify-content:flex-end; }
            .wl-style-grid { grid-template-columns:1fr; }
        }
    `;
    document.head.appendChild(style);
}
