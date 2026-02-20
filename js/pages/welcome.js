// ==================== MODULE LIVRET D'ACCUEIL NUMERIQUE ====================
// Configuration et gestion du livret d'accueil par hotel - Page Builder

let _wlHotelId = null;
let _wlTab = 'sections';
let _wlHotels = [];
let _wlConfig = null;
let _wlTabs = [];
let _wlInfos = [];
let _wlSections = [];
let _wlExpandedSection = null;

// Section types definition
const WL_SECTION_TYPES = {
    banner:    { icon: 'fa-image',          label: 'Banniere',           desc: 'Image d\'en-tete pleine largeur', unique: true },
    header:    { icon: 'fa-hotel',          label: 'En-tete hotel',      desc: 'Nom, logo et etoiles',            unique: true },
    text:      { icon: 'fa-align-left',     label: 'Texte',              desc: 'Bloc de texte libre avec image',  unique: false },
    image:     { icon: 'fa-camera',         label: 'Image',              desc: 'Image pleine largeur avec legende', unique: false },
    schedule:  { icon: 'fa-clock',          label: 'Horaires',           desc: 'Check-in / Check-out',            unique: true },
    wifi:      { icon: 'fa-wifi',           label: 'WiFi',               desc: 'Reseau et mot de passe',          unique: true },
    services:  { icon: 'fa-concierge-bell', label: 'Services',           desc: 'Onglets de services (restaurant, spa...)', unique: true },
    infos:     { icon: 'fa-info-circle',    label: 'Infos pratiques',    desc: 'Cartes d\'informations utiles',   unique: true },
    contact:   { icon: 'fa-phone-alt',      label: 'Contact',            desc: 'Telephone, email, adresse, carte', unique: true },
    social:    { icon: 'fa-share-alt',      label: 'Reseaux sociaux',    desc: 'Facebook, Instagram, site web',   unique: true },
    separator: { icon: 'fa-minus',          label: 'Separateur',         desc: 'Ligne de separation visuelle',    unique: false },
    map:       { icon: 'fa-map-marked-alt', label: 'Carte',              desc: 'Google Maps integre',             unique: false },
    spacer:    { icon: 'fa-arrows-alt-v',   label: 'Espacement',         desc: 'Espace vertical personnalisable', unique: false }
};

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
                <button class="tab-btn ${_wlTab === 'sections' ? 'active' : ''}" data-tab="sections" onclick="wlSwitchTab('sections')">
                    <i class="fas fa-th-list"></i> Sections
                </button>
                <button class="tab-btn ${_wlTab === 'design' ? 'active' : ''}" data-tab="design" onclick="wlSwitchTab('design')">
                    <i class="fas fa-palette"></i> Design
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
    _wlExpandedSection = null;
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
        const [configRes, tabsRes, infosRes, sectionsRes] = await Promise.all([
            API.get(`welcome/config?hotel_id=${_wlHotelId}`),
            API.get(`welcome/tabs?hotel_id=${_wlHotelId}`),
            API.get(`welcome/infos?hotel_id=${_wlHotelId}`),
            API.get(`welcome/sections?hotel_id=${_wlHotelId}`)
        ]);
        _wlConfig = configRes.config || null;
        _wlTabs = tabsRes.tabs || [];
        _wlInfos = infosRes.infos || [];
        _wlSections = sectionsRes.sections || [];
    } catch (err) {
        _wlConfig = null;
        _wlTabs = [];
        _wlInfos = [];
        _wlSections = [];
    }
}

function wlRenderTab() {
    const content = document.getElementById('wl-tab-content');
    if (!content) return;

    switch (_wlTab) {
        case 'sections': wlRenderSections(content); break;
        case 'design': wlRenderDesign(content); break;
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
// PAGE BUILDER - SECTIONS TAB
// ============================================================
function wlRenderSections(content) {
    if (_wlSections.length === 0) {
        content.innerHTML = `
            <div class="card">
                <div style="padding:48px 24px;text-align:center">
                    <i class="fas fa-puzzle-piece" style="font-size:56px;color:var(--gray-300);margin-bottom:20px;display:block"></i>
                    <h3 style="margin-bottom:8px;color:var(--gray-700)">Construisez votre livret</h3>
                    <p class="text-muted" style="margin-bottom:28px;max-width:500px;margin-left:auto;margin-right:auto">
                        Ajoutez des sections pour composer la page de votre livret d'accueil.
                        Vous pouvez les reorganiser, les masquer ou les supprimer a tout moment.
                    </p>
                    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
                        <button class="btn btn-primary" onclick="wlShowAddSection()">
                            <i class="fas fa-plus"></i> Ajouter une section
                        </button>
                        ${_wlConfig ? `
                        <button class="btn btn-outline" onclick="wlInitSections()">
                            <i class="fas fa-magic"></i> Generer depuis la config existante
                        </button>` : ''}
                    </div>
                </div>
            </div>
        `;
        return;
    }

    content.innerHTML = `
        <div class="card">
            <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
                <h3 class="card-title" style="margin:0"><i class="fas fa-th-list"></i> Sections du livret</h3>
                <button class="btn btn-primary btn-sm" onclick="wlShowAddSection()"><i class="fas fa-plus"></i> Ajouter une section</button>
            </div>
            <div style="padding:16px">
                <p class="text-muted" style="margin-bottom:16px;font-size:13px">
                    <i class="fas fa-arrows-alt-v"></i> Utilisez les fleches pour reorganiser. Cliquez sur une section pour la configurer.
                </p>
                <div id="wl-sections-list" class="wl-sections-list">
                    ${_wlSections.map((sec, i) => wlRenderSectionCard(sec, i)).join('')}
                </div>
            </div>
        </div>
    `;
}

function wlRenderSectionCard(sec, index) {
    const type = WL_SECTION_TYPES[sec.type] || { icon: 'fa-puzzle-piece', label: sec.type, desc: '' };
    const cfg = sec.config ? (typeof sec.config === 'string' ? JSON.parse(sec.config) : sec.config) : {};
    const isExpanded = _wlExpandedSection == sec.id;
    const isVisible = sec.is_visible == 1;
    const isFirst = index === 0;
    const isLast = index === _wlSections.length - 1;

    // Summary line for collapsed state
    let summary = '';
    if (!isExpanded) {
        summary = wlSectionSummary(sec, cfg);
    }

    return `
        <div class="wl-section-card ${isExpanded ? 'expanded' : ''} ${!isVisible ? 'hidden-section' : ''}" data-id="${sec.id}">
            <div class="wl-section-header" onclick="wlToggleExpand(${sec.id})">
                <div class="wl-section-arrows" onclick="event.stopPropagation()">
                    <button class="wl-arrow-btn" ${isFirst ? 'disabled' : ''} onclick="wlMoveSection(${sec.id}, 'up')" title="Monter">
                        <i class="fas fa-chevron-up"></i>
                    </button>
                    <button class="wl-arrow-btn" ${isLast ? 'disabled' : ''} onclick="wlMoveSection(${sec.id}, 'down')" title="Descendre">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                </div>
                <div class="wl-section-type-icon"><i class="fas ${type.icon}"></i></div>
                <div class="wl-section-info">
                    <strong>${esc(type.label)}${sec.title ? ' : ' + esc(sec.title) : ''}</strong>
                    ${summary ? `<small class="text-muted">${summary}</small>` : ''}
                </div>
                <div class="wl-section-actions" onclick="event.stopPropagation()">
                    <label class="wl-toggle" title="${isVisible ? 'Masquer' : 'Afficher'}">
                        <input type="checkbox" ${isVisible ? 'checked' : ''} onchange="wlToggleSectionVisibility(${sec.id}, this.checked)">
                        <span class="wl-toggle-slider"></span>
                    </label>
                    <button class="btn btn-sm btn-outline" onclick="wlDeleteSection(${sec.id})" title="Supprimer" style="color:var(--danger,#dc2626)">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            ${isExpanded ? `<div class="wl-section-body">${wlSectionEditForm(sec, cfg)}</div>` : ''}
        </div>
    `;
}

function wlSectionSummary(sec, cfg) {
    switch (sec.type) {
        case 'banner': return `${cfg.height || 320}px` + (cfg.overlay ? ' + overlay' : '');
        case 'header': return `Style : ${cfg.style || 'card'}`;
        case 'text': return sec.content ? esc(sec.content.substring(0, 60)) + '...' : '';
        case 'image': return sec.image_path ? 'Image configuree' : 'Aucune image';
        case 'schedule': return `${(cfg.checkin||'15:00').substring(0,5)} - ${(cfg.checkout||'11:00').substring(0,5)}`;
        case 'wifi': return cfg.name || '';
        case 'services': return `${_wlTabs.length} onglet(s)`;
        case 'infos': return `${_wlInfos.length} info(s)`;
        case 'contact': return [cfg.phone, cfg.email].filter(Boolean).join(', ') || '';
        case 'social': return [cfg.facebook ? 'FB' : '', cfg.instagram ? 'IG' : '', cfg.website ? 'Web' : ''].filter(Boolean).join(', ');
        case 'separator': return `Style : ${cfg.style || 'line'}`;
        case 'map': return cfg.url ? 'URL configuree' : '';
        case 'spacer': return `${cfg.height || 40}px`;
        default: return '';
    }
}

// ============================================================
// SECTION EDIT FORMS
// ============================================================
function wlSectionEditForm(sec, cfg) {
    switch (sec.type) {
        case 'banner': return wlFormBanner(sec, cfg);
        case 'header': return wlFormHeader(sec, cfg);
        case 'text': return wlFormText(sec, cfg);
        case 'image': return wlFormImage(sec, cfg);
        case 'schedule': return wlFormSchedule(sec, cfg);
        case 'wifi': return wlFormWifi(sec, cfg);
        case 'services': return wlFormServices(sec, cfg);
        case 'infos': return wlFormInfos(sec, cfg);
        case 'contact': return wlFormContact(sec, cfg);
        case 'social': return wlFormSocial(sec, cfg);
        case 'separator': return wlFormSeparator(sec, cfg);
        case 'map': return wlFormMap(sec, cfg);
        case 'spacer': return wlFormSpacer(sec, cfg);
        default: return '<p class="text-muted">Type de section non reconnu.</p>';
    }
}

function wlFormBanner(sec, cfg) {
    return `
        <div class="form-group">
            <label class="form-label">Image de banniere</label>
            ${sec.image_path ? `<div style="margin-bottom:8px"><img src="${esc(sec.image_path)}" style="max-height:80px;border-radius:8px;width:100%;object-fit:cover;border:1px solid var(--gray-200)"></div>` : ''}
            <input type="file" class="form-control" accept="image/jpeg,image/png,image/webp" onchange="wlUploadSectionImage(${sec.id}, this)" style="font-size:13px">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
            <div class="form-group">
                <label class="form-label">Hauteur : <strong id="wl-bh-${sec.id}">${cfg.height || 320}px</strong></label>
                <input type="range" id="wl-cfg-height-${sec.id}" min="180" max="500" step="10" value="${cfg.height || 320}" style="width:100%" oninput="document.getElementById('wl-bh-${sec.id}').textContent=this.value+'px'">
            </div>
            <div class="form-group" style="display:flex;align-items:center;gap:12px;padding-top:24px">
                <label class="wl-toggle" style="flex-shrink:0">
                    <input type="checkbox" id="wl-cfg-overlay-${sec.id}" ${cfg.overlay != 0 ? 'checked' : ''}>
                    <span class="wl-toggle-slider"></span>
                </label>
                <span>Degradee sombre</span>
            </div>
        </div>
        <div style="margin-top:16px">
            <button class="btn btn-primary btn-sm" onclick="wlSaveSectionConfig(${sec.id}, {height: parseInt(document.getElementById('wl-cfg-height-${sec.id}').value), overlay: document.getElementById('wl-cfg-overlay-${sec.id}').checked ? 1 : 0})">
                <i class="fas fa-save"></i> Enregistrer
            </button>
        </div>`;
}

function wlFormHeader(sec, cfg) {
    const style = cfg.style || 'card';
    return `
        <label class="form-label" style="margin-bottom:12px">Style de l'en-tete</label>
        <div class="wl-style-grid" data-group="header_style_${sec.id}">
            ${wlStyleOption('header_style_' + sec.id, 'card', style, 'fas fa-id-card', 'Carte', 'Carte flottante')}
            ${wlStyleOption('header_style_' + sec.id, 'overlay', style, 'fas fa-layer-group', 'Superpose', 'Sur la banniere')}
            ${wlStyleOption('header_style_' + sec.id, 'minimal', style, 'fas fa-minus', 'Minimal', 'Logo centre')}
        </div>
        <div style="margin-top:16px">
            <button class="btn btn-primary btn-sm" onclick="wlSaveSectionConfig(${sec.id}, {style: document.querySelector('input[name=header_style_${sec.id}]:checked').value})">
                <i class="fas fa-save"></i> Enregistrer
            </button>
        </div>`;
}

function wlFormText(sec, cfg) {
    return `
        <div class="form-group">
            <label class="form-label">Titre</label>
            <input type="text" class="form-control" id="wl-sec-title-${sec.id}" value="${esc(sec.title || '')}" placeholder="Ex: Bienvenue dans notre hotel">
        </div>
        <div class="form-group" style="margin-top:12px">
            <label class="form-label">Contenu</label>
            <textarea class="form-control" id="wl-sec-content-${sec.id}" rows="5" placeholder="Texte de la section...">${esc(sec.content || '')}</textarea>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px">
            <div class="form-group">
                <label class="form-label">Alignement</label>
                <select class="form-control" id="wl-cfg-alignment-${sec.id}">
                    <option value="left" ${(cfg.alignment||'left')==='left'?'selected':''}>Gauche</option>
                    <option value="center" ${cfg.alignment==='center'?'selected':''}>Centre</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Image (optionnelle)</label>
                ${sec.image_path ? `<div style="margin-bottom:4px"><img src="${esc(sec.image_path)}" style="max-height:50px;border-radius:6px"></div>` : ''}
                <input type="file" class="form-control" accept="image/jpeg,image/png,image/webp" onchange="wlUploadSectionImage(${sec.id}, this)" style="font-size:12px">
            </div>
        </div>
        <div style="margin-top:16px">
            <button class="btn btn-primary btn-sm" onclick="wlSaveTextSection(${sec.id})"><i class="fas fa-save"></i> Enregistrer</button>
        </div>`;
}

function wlFormImage(sec, cfg) {
    return `
        <div class="form-group">
            <label class="form-label">Image</label>
            ${sec.image_path ? `<div style="margin-bottom:8px"><img src="${esc(sec.image_path)}" style="max-height:120px;border-radius:8px;width:100%;object-fit:cover;border:1px solid var(--gray-200)"></div>` : '<p class="text-muted" style="margin-bottom:8px">Aucune image uploadee</p>'}
            <input type="file" class="form-control" accept="image/jpeg,image/png,image/webp" onchange="wlUploadSectionImage(${sec.id}, this)" style="font-size:13px">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px">
            <div class="form-group">
                <label class="form-label">Legende</label>
                <input type="text" class="form-control" id="wl-sec-title-${sec.id}" value="${esc(sec.title || '')}" placeholder="Description de l'image">
            </div>
            <div class="form-group">
                <label class="form-label">Lien (optionnel)</label>
                <input type="url" class="form-control" id="wl-cfg-link-${sec.id}" value="${esc(cfg.link || '')}" placeholder="https://...">
            </div>
        </div>
        <div style="margin-top:16px">
            <button class="btn btn-primary btn-sm" onclick="wlSaveSection(${sec.id}, {title: document.getElementById('wl-sec-title-${sec.id}').value || null}, {link: document.getElementById('wl-cfg-link-${sec.id}').value || null, caption: document.getElementById('wl-sec-title-${sec.id}').value || null})">
                <i class="fas fa-save"></i> Enregistrer
            </button>
        </div>`;
}

function wlFormSchedule(sec, cfg) {
    return `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div class="form-group">
                <label class="form-label"><i class="fas fa-sign-in-alt"></i> Heure de check-in</label>
                <input type="time" class="form-control" id="wl-cfg-checkin-${sec.id}" value="${(cfg.checkin||'15:00:00').substring(0,5)}">
            </div>
            <div class="form-group">
                <label class="form-label"><i class="fas fa-sign-out-alt"></i> Heure de check-out</label>
                <input type="time" class="form-control" id="wl-cfg-checkout-${sec.id}" value="${(cfg.checkout||'11:00:00').substring(0,5)}">
            </div>
        </div>
        <div style="margin-top:16px">
            <button class="btn btn-primary btn-sm" onclick="wlSaveSectionConfig(${sec.id}, {checkin: document.getElementById('wl-cfg-checkin-${sec.id}').value + ':00', checkout: document.getElementById('wl-cfg-checkout-${sec.id}').value + ':00'})">
                <i class="fas fa-save"></i> Enregistrer
            </button>
        </div>`;
}

function wlFormWifi(sec, cfg) {
    return `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div class="form-group">
                <label class="form-label"><i class="fas fa-wifi"></i> Nom du reseau</label>
                <input type="text" class="form-control" id="wl-cfg-name-${sec.id}" value="${esc(cfg.name || '')}" placeholder="Hotel_Guest">
            </div>
            <div class="form-group">
                <label class="form-label"><i class="fas fa-key"></i> Mot de passe</label>
                <input type="text" class="form-control" id="wl-cfg-password-${sec.id}" value="${esc(cfg.password || '')}" placeholder="bienvenue2026">
            </div>
        </div>
        <div style="margin-top:16px">
            <button class="btn btn-primary btn-sm" onclick="wlSaveSectionConfig(${sec.id}, {name: document.getElementById('wl-cfg-name-${sec.id}').value, password: document.getElementById('wl-cfg-password-${sec.id}').value})">
                <i class="fas fa-save"></i> Enregistrer
            </button>
        </div>`;
}

function wlFormServices(sec, cfg) {
    const tabStyle = cfg.tab_style || 'pills';
    const itemLayout = cfg.item_layout || 'cards';
    return `
        <p class="text-muted" style="margin-bottom:16px">
            Cette section affiche les onglets de services configures dans l'onglet <strong>"Services"</strong>.
            Vous avez actuellement <strong>${_wlTabs.length}</strong> onglet(s).
        </p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div class="form-group">
                <label class="form-label">Style des onglets</label>
                <select class="form-control" id="wl-cfg-tab_style-${sec.id}">
                    <option value="pills" ${tabStyle==='pills'?'selected':''}>Pilules</option>
                    <option value="underline" ${tabStyle==='underline'?'selected':''}>Souligne</option>
                    <option value="cards" ${tabStyle==='cards'?'selected':''}>Cartes</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Affichage des elements</label>
                <select class="form-control" id="wl-cfg-item_layout-${sec.id}">
                    <option value="cards" ${itemLayout==='cards'?'selected':''}>Cartes</option>
                    <option value="list" ${itemLayout==='list'?'selected':''}>Liste</option>
                    <option value="grid" ${itemLayout==='grid'?'selected':''}>Grille</option>
                </select>
            </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:10px">
            <button class="btn btn-primary btn-sm" onclick="wlSaveSectionConfig(${sec.id}, {tab_style: document.getElementById('wl-cfg-tab_style-${sec.id}').value, item_layout: document.getElementById('wl-cfg-item_layout-${sec.id}').value})">
                <i class="fas fa-save"></i> Enregistrer
            </button>
            <button class="btn btn-outline btn-sm" onclick="wlSwitchTab('services')">
                <i class="fas fa-external-link-alt"></i> Gerer les services
            </button>
        </div>`;
}

function wlFormInfos(sec, cfg) {
    return `
        <p class="text-muted" style="margin-bottom:16px">
            Cette section affiche les informations pratiques configurees dans l'onglet <strong>"Infos pratiques"</strong>.
            Vous avez actuellement <strong>${_wlInfos.length}</strong> fiche(s) d'information.
        </p>
        <div class="form-group">
            <label class="form-label">Titre de la section</label>
            <input type="text" class="form-control" id="wl-sec-title-${sec.id}" value="${esc(sec.title || 'Informations pratiques')}" placeholder="Informations pratiques">
        </div>
        <div style="margin-top:16px;display:flex;gap:10px">
            <button class="btn btn-primary btn-sm" onclick="wlSaveSection(${sec.id}, {title: document.getElementById('wl-sec-title-${sec.id}').value})">
                <i class="fas fa-save"></i> Enregistrer
            </button>
            <button class="btn btn-outline btn-sm" onclick="wlSwitchTab('infos')">
                <i class="fas fa-external-link-alt"></i> Gerer les infos
            </button>
        </div>`;
}

function wlFormContact(sec, cfg) {
    return `
        <div class="form-group">
            <label class="form-label">Titre de la section</label>
            <input type="text" class="form-control" id="wl-sec-title-${sec.id}" value="${esc(sec.title || 'Nous contacter')}" placeholder="Nous contacter">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px">
            <div class="form-group">
                <label class="form-label"><i class="fas fa-phone-alt"></i> Telephone</label>
                <input type="tel" class="form-control" id="wl-cfg-phone-${sec.id}" value="${esc(cfg.phone || '')}" placeholder="+33 1 23 45 67 89">
            </div>
            <div class="form-group">
                <label class="form-label"><i class="fas fa-envelope"></i> Email</label>
                <input type="email" class="form-control" id="wl-cfg-email-${sec.id}" value="${esc(cfg.email || '')}" placeholder="contact@hotel.com">
            </div>
        </div>
        <div class="form-group" style="margin-top:12px">
            <label class="form-label"><i class="fas fa-map-marker-alt"></i> Adresse</label>
            <textarea class="form-control" id="wl-cfg-address-${sec.id}" rows="2" placeholder="123 Rue de Paris, 75001 Paris">${esc(cfg.address || '')}</textarea>
        </div>
        <div class="form-group" style="margin-top:12px">
            <label class="form-label"><i class="fas fa-map"></i> Lien Google Maps</label>
            <input type="url" class="form-control" id="wl-cfg-maps_url-${sec.id}" value="${esc(cfg.maps_url || '')}" placeholder="https://maps.google.com/...">
        </div>
        <div style="margin-top:16px">
            <button class="btn btn-primary btn-sm" onclick="wlSaveSection(${sec.id}, {title: document.getElementById('wl-sec-title-${sec.id}').value}, {phone: document.getElementById('wl-cfg-phone-${sec.id}').value, email: document.getElementById('wl-cfg-email-${sec.id}').value, address: document.getElementById('wl-cfg-address-${sec.id}').value, maps_url: document.getElementById('wl-cfg-maps_url-${sec.id}').value})">
                <i class="fas fa-save"></i> Enregistrer
            </button>
        </div>`;
}

function wlFormSocial(sec, cfg) {
    return `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">
            <div class="form-group">
                <label class="form-label"><i class="fab fa-facebook"></i> Facebook</label>
                <input type="url" class="form-control" id="wl-cfg-facebook-${sec.id}" value="${esc(cfg.facebook || '')}" placeholder="https://facebook.com/...">
            </div>
            <div class="form-group">
                <label class="form-label"><i class="fab fa-instagram"></i> Instagram</label>
                <input type="url" class="form-control" id="wl-cfg-instagram-${sec.id}" value="${esc(cfg.instagram || '')}" placeholder="https://instagram.com/...">
            </div>
            <div class="form-group">
                <label class="form-label"><i class="fas fa-globe"></i> Site web</label>
                <input type="url" class="form-control" id="wl-cfg-website-${sec.id}" value="${esc(cfg.website || '')}" placeholder="https://www.hotel.com">
            </div>
        </div>
        <div style="margin-top:16px">
            <button class="btn btn-primary btn-sm" onclick="wlSaveSectionConfig(${sec.id}, {facebook: document.getElementById('wl-cfg-facebook-${sec.id}').value, instagram: document.getElementById('wl-cfg-instagram-${sec.id}').value, website: document.getElementById('wl-cfg-website-${sec.id}').value})">
                <i class="fas fa-save"></i> Enregistrer
            </button>
        </div>`;
}

function wlFormSeparator(sec, cfg) {
    const style = cfg.style || 'line';
    return `
        <div class="form-group">
            <label class="form-label">Style du separateur</label>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
                ${['line','dashed','dots','accent'].map(s => `
                    <label class="wl-sep-option ${style === s ? 'active' : ''}" onclick="this.parentNode.querySelectorAll('.wl-sep-option').forEach(e=>e.classList.remove('active'));this.classList.add('active')">
                        <input type="radio" name="sep_style_${sec.id}" value="${s}" ${style===s?'checked':''} style="display:none">
                        <span>${s === 'line' ? 'Ligne' : s === 'dashed' ? 'Pointilles' : s === 'dots' ? 'Points' : 'Accent'}</span>
                    </label>
                `).join('')}
            </div>
        </div>
        <div style="margin-top:16px">
            <button class="btn btn-primary btn-sm" onclick="wlSaveSectionConfig(${sec.id}, {style: document.querySelector('input[name=sep_style_${sec.id}]:checked').value})">
                <i class="fas fa-save"></i> Enregistrer
            </button>
        </div>`;
}

function wlFormMap(sec, cfg) {
    return `
        <div class="form-group">
            <label class="form-label">URL Google Maps</label>
            <input type="url" class="form-control" id="wl-cfg-url-${sec.id}" value="${esc(cfg.url || '')}" placeholder="https://maps.google.com/...">
            <small class="text-muted">Collez l'URL de la page Google Maps ou un lien d'integration.</small>
        </div>
        <div class="form-group" style="margin-top:12px">
            <label class="form-label">Hauteur : <strong id="wl-map-h-${sec.id}">${cfg.height || 350}px</strong></label>
            <input type="range" id="wl-cfg-height-${sec.id}" min="200" max="600" step="25" value="${cfg.height || 350}" style="width:100%" oninput="document.getElementById('wl-map-h-${sec.id}').textContent=this.value+'px'">
        </div>
        <div style="margin-top:16px">
            <button class="btn btn-primary btn-sm" onclick="wlSaveSectionConfig(${sec.id}, {url: document.getElementById('wl-cfg-url-${sec.id}').value, height: parseInt(document.getElementById('wl-cfg-height-${sec.id}').value)})">
                <i class="fas fa-save"></i> Enregistrer
            </button>
        </div>`;
}

function wlFormSpacer(sec, cfg) {
    return `
        <div class="form-group">
            <label class="form-label">Hauteur : <strong id="wl-spacer-h-${sec.id}">${cfg.height || 40}px</strong></label>
            <input type="range" id="wl-cfg-height-${sec.id}" min="10" max="120" step="5" value="${cfg.height || 40}" style="width:100%" oninput="document.getElementById('wl-spacer-h-${sec.id}').textContent=this.value+'px'">
        </div>
        <div style="margin-top:16px">
            <button class="btn btn-primary btn-sm" onclick="wlSaveSectionConfig(${sec.id}, {height: parseInt(document.getElementById('wl-cfg-height-${sec.id}').value)})">
                <i class="fas fa-save"></i> Enregistrer
            </button>
        </div>`;
}

// ============================================================
// SECTION ACTIONS
// ============================================================
function wlToggleExpand(sectionId) {
    _wlExpandedSection = _wlExpandedSection == sectionId ? null : sectionId;
    wlRenderTab();
}

async function wlMoveSection(sectionId, direction) {
    const idx = _wlSections.findIndex(s => s.id == sectionId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= _wlSections.length) return;

    // Swap locally
    [_wlSections[idx], _wlSections[swapIdx]] = [_wlSections[swapIdx], _wlSections[idx]];

    // Save new order
    const order = _wlSections.map(s => s.id);
    try {
        await API.put('welcome/sections/reorder', { hotel_id: _wlHotelId, order });
        wlRenderTab();
    } catch (err) {
        toast('Erreur : ' + err.message, 'error');
        await wlLoadData();
        wlRenderTab();
    }
}

async function wlToggleSectionVisibility(sectionId, visible) {
    try {
        await API.put(`welcome/sections/${sectionId}`, { is_visible: visible ? 1 : 0 });
        const sec = _wlSections.find(s => s.id == sectionId);
        if (sec) sec.is_visible = visible ? 1 : 0;
        wlRenderTab();
    } catch (err) {
        toast('Erreur : ' + err.message, 'error');
    }
}

async function wlDeleteSection(sectionId) {
    if (!confirm('Supprimer cette section ?')) return;
    try {
        await API.delete(`welcome/sections/${sectionId}`);
        toast('Section supprimee', 'success');
        _wlSections = _wlSections.filter(s => s.id != sectionId);
        if (_wlExpandedSection == sectionId) _wlExpandedSection = null;
        wlRenderTab();
    } catch (err) {
        toast('Erreur : ' + err.message, 'error');
    }
}

async function wlSaveSectionConfig(sectionId, config) {
    try {
        await API.put(`welcome/sections/${sectionId}`, { config: config });
        toast('Section mise a jour', 'success');
        const sec = _wlSections.find(s => s.id == sectionId);
        if (sec) sec.config = JSON.stringify(config);
    } catch (err) {
        toast('Erreur : ' + err.message, 'error');
    }
}

async function wlSaveSection(sectionId, fields, config) {
    try {
        const payload = {};
        if (fields) Object.assign(payload, fields);
        if (config) payload.config = config;
        await API.put(`welcome/sections/${sectionId}`, payload);
        toast('Section mise a jour', 'success');
        const sec = _wlSections.find(s => s.id == sectionId);
        if (sec) {
            if (fields) Object.assign(sec, fields);
            if (config) sec.config = JSON.stringify(config);
        }
    } catch (err) {
        toast('Erreur : ' + err.message, 'error');
    }
}

async function wlSaveTextSection(sectionId) {
    const title = document.getElementById(`wl-sec-title-${sectionId}`).value || null;
    const content = document.getElementById(`wl-sec-content-${sectionId}`).value || null;
    const alignment = document.getElementById(`wl-cfg-alignment-${sectionId}`).value;
    await wlSaveSection(sectionId, { title, content }, { alignment });
}

async function wlUploadSectionImage(sectionId, input) {
    if (!input.files || !input.files[0]) return;
    const formData = new FormData();
    formData.append('file', input.files[0]);

    try {
        const res = await API.upload(`welcome/sections/${sectionId}/image`, formData);
        toast(res.message || 'Image uploadee', 'success');
        const sec = _wlSections.find(s => s.id == sectionId);
        if (sec) sec.image_path = res.path;
        wlRenderTab();
    } catch (err) {
        toast('Erreur upload : ' + err.message, 'error');
    }
}

// ============================================================
// ADD SECTION MODAL
// ============================================================
function wlShowAddSection() {
    const existingTypes = _wlSections.map(s => s.type);

    let grid = '<div class="wl-add-section-grid">';
    for (const [type, info] of Object.entries(WL_SECTION_TYPES)) {
        const disabled = info.unique && existingTypes.includes(type);
        grid += `
            <div class="wl-add-section-item ${disabled ? 'disabled' : ''}" ${disabled ? '' : `onclick="wlAddSection('${type}')"`}>
                <div class="wl-add-section-icon"><i class="fas ${info.icon}"></i></div>
                <strong>${esc(info.label)}</strong>
                <small>${esc(info.desc)}</small>
                ${disabled ? '<span class="wl-add-badge">Deja ajoute</span>' : ''}
            </div>`;
    }
    grid += '</div>';

    openModal('Ajouter une section', `
        <p class="text-muted" style="margin-bottom:16px">Choisissez le type de section a ajouter au livret.</p>
        ${grid}
    `, 'modal-lg');
}

async function wlAddSection(type) {
    try {
        const res = await API.post('welcome/sections', {
            hotel_id: _wlHotelId,
            type: type,
            title: WL_SECTION_TYPES[type]?.label || null
        });
        toast('Section ajoutee', 'success');
        closeModal();
        _wlExpandedSection = res.id;
        await wlLoadData();
        wlRenderTab();
    } catch (err) {
        toast('Erreur : ' + err.message, 'error');
    }
}

async function wlInitSections() {
    if (!confirm('Generer les sections par defaut a partir de votre configuration existante ?')) return;
    try {
        await API.put('welcome/sections/init', { hotel_id: _wlHotelId });
        toast('Sections generees', 'success');
        await wlLoadData();
        wlRenderTab();
    } catch (err) {
        toast('Erreur : ' + err.message, 'error');
    }
}

// ============================================================
// ONGLET DESIGN
// ============================================================
function wlRenderDesign(content) {
    const c = _wlConfig || {};
    const titleFonts = ['Inter','Playfair Display','Cormorant Garamond','DM Serif Display','Libre Baskerville','Montserrat','Poppins','Raleway'];
    const bodyFonts = ['Inter','Roboto','Open Sans','Lato','Montserrat','Poppins','Raleway'];

    content.innerHTML = `
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

        <div class="card" style="margin-bottom:20px">
            <div class="card-header"><h3 class="card-title"><i class="fas fa-image"></i> Logo</h3></div>
            <div style="padding:24px">
                <div class="form-group">
                    <label class="form-label">Logo de l'hotel</label>
                    ${c.logo_path ? `<div style="margin-bottom:8px"><img src="${esc(c.logo_path)}" style="max-height:70px;border-radius:8px;border:1px solid var(--gray-200)"></div>` : ''}
                    <input type="file" class="form-control" accept="image/jpeg,image/png,image/webp" onchange="wlUploadImage('logo', this)" style="font-size:13px">
                </div>
            </div>
        </div>

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

    const pc = document.getElementById('wl-primary-color');
    const sc = document.getElementById('wl-secondary-color');
    if (pc) pc.addEventListener('input', function() { document.getElementById('wl-primary-color-text').value = this.value; });
    if (sc) sc.addEventListener('input', function() { document.getElementById('wl-secondary-color-text').value = this.value; });
}

async function wlSaveDesign() {
    const data = wlBuildConfigPayload({
        primary_color: document.getElementById('wl-primary-color').value,
        secondary_color: document.getElementById('wl-secondary-color').value,
        font_family: document.getElementById('wl-font-family').value,
        title_font: document.getElementById('wl-title-font').value || null,
        title_size: document.getElementById('wl-title-size').value,
        body_font_size: document.getElementById('wl-body-font-size').value,
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
        toast('Veuillez d\'abord configurer le design', 'warning');
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
        /* ===== SECTION BUILDER ===== */
        .wl-sections-list { display:flex; flex-direction:column; gap:6px; }

        .wl-section-card {
            border:1px solid var(--gray-200); border-radius:10px;
            background:white; transition:all 0.2s; overflow:hidden;
        }
        .wl-section-card:hover { border-color:var(--primary-300, #93c5fd); }
        .wl-section-card.expanded { border-color:var(--primary, #1a56db); box-shadow:0 2px 12px rgba(0,0,0,0.08); }
        .wl-section-card.hidden-section { opacity:0.55; }
        .wl-section-card.hidden-section:hover { opacity:0.8; }

        .wl-section-header {
            display:flex; align-items:center; gap:10px; padding:12px 14px;
            cursor:pointer; user-select:none; transition:background 0.15s;
        }
        .wl-section-header:hover { background:var(--gray-50, #f9fafb); }

        .wl-section-arrows { display:flex; flex-direction:column; gap:2px; flex-shrink:0; }
        .wl-arrow-btn {
            display:flex; align-items:center; justify-content:center;
            width:24px; height:18px; border:1px solid var(--gray-200);
            border-radius:4px; background:white; cursor:pointer;
            font-size:10px; color:var(--gray-500); transition:all 0.15s;
            padding:0; line-height:1;
        }
        .wl-arrow-btn:hover:not(:disabled) { background:var(--primary-50, #eff6ff); border-color:var(--primary, #1a56db); color:var(--primary, #1a56db); }
        .wl-arrow-btn:disabled { opacity:0.3; cursor:default; }

        .wl-section-type-icon {
            width:38px; height:38px; border-radius:9px;
            background:var(--primary-50, #eff6ff); color:var(--primary, #1a56db);
            display:flex; align-items:center; justify-content:center;
            font-size:15px; flex-shrink:0;
        }

        .wl-section-info { flex:1; min-width:0; }
        .wl-section-info strong { display:block; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .wl-section-info small { display:block; font-size:11px; margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

        .wl-section-actions { display:flex; align-items:center; gap:8px; flex-shrink:0; }

        .wl-section-body {
            padding:16px 20px 20px;
            border-top:1px solid var(--gray-100);
            background:var(--gray-50, #f9fafb);
            animation: wl-slide-down 0.2s ease;
        }
        @keyframes wl-slide-down {
            from { opacity:0; max-height:0; } to { opacity:1; max-height:1000px; }
        }

        /* ===== ADD SECTION GRID ===== */
        .wl-add-section-grid {
            display:grid; grid-template-columns:repeat(3, 1fr); gap:10px;
        }
        .wl-add-section-item {
            padding:16px; border:2px solid var(--gray-200); border-radius:10px;
            text-align:center; cursor:pointer; transition:all 0.2s; position:relative;
        }
        .wl-add-section-item:hover:not(.disabled) {
            border-color:var(--primary, #1a56db); background:var(--primary-50, #eff6ff); transform:translateY(-2px);
        }
        .wl-add-section-item.disabled {
            opacity:0.4; cursor:not-allowed; background:var(--gray-50, #f9fafb);
        }
        .wl-add-section-icon {
            width:42px; height:42px; border-radius:10px;
            background:var(--gray-100); color:var(--gray-500);
            display:flex; align-items:center; justify-content:center;
            font-size:18px; margin:0 auto 10px;
        }
        .wl-add-section-item:hover:not(.disabled) .wl-add-section-icon {
            background:var(--primary, #1a56db); color:white;
        }
        .wl-add-section-item strong { display:block; font-size:13px; margin-bottom:2px; }
        .wl-add-section-item small { display:block; font-size:10px; color:var(--gray-500); }
        .wl-add-badge {
            position:absolute; top:6px; right:6px;
            background:var(--gray-200); color:var(--gray-500);
            font-size:9px; padding:2px 6px; border-radius:4px;
        }

        /* ===== SEPARATOR OPTIONS ===== */
        .wl-sep-option {
            display:inline-flex; align-items:center; padding:8px 16px;
            border:2px solid var(--gray-200); border-radius:8px; cursor:pointer;
            font-size:13px; transition:all 0.2s;
        }
        .wl-sep-option:hover { border-color:var(--primary-300, #93c5fd); }
        .wl-sep-option.active { border-color:var(--primary, #1a56db); background:var(--primary-50, #eff6ff); }

        /* ===== TABS LIST (services) ===== */
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

        /* ===== STYLE PICKER ===== */
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

        /* ===== TOGGLE SWITCH ===== */
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
            .wl-add-section-grid { grid-template-columns:1fr 1fr; }
            .wl-section-header { flex-wrap:wrap; }
        }
        @media (max-width:480px) {
            .wl-add-section-grid { grid-template-columns:1fr; }
        }
    `;
    document.head.appendChild(style);
}
