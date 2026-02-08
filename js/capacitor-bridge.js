/**
 * ACL GESTION - Capacitor Bridge
 * Gere l'integration avec les APIs natives iOS/Android via Capacitor
 * Ce fichier est charge sur web ET natif, il detecte automatiquement l'environnement
 */

const CapBridge = {
    isNative: false,
    platform: 'web',

    /**
     * Initialise le bridge - detecte si on est dans Capacitor natif
     */
    async init() {
        try {
            if (window.Capacitor && window.Capacitor.isNativePlatform()) {
                this.isNative = true;
                this.platform = window.Capacitor.getPlatform(); // 'ios' | 'android'
                console.log(`[CapBridge] Mode natif: ${this.platform}`);

                await this.setupStatusBar();
                await this.setupKeyboard();
                await this.setupPushNotifications();
                this.setupAppListeners();
                this.setupSafeArea();
            } else {
                console.log('[CapBridge] Mode web');
                this.registerServiceWorker();
            }
        } catch (e) {
            console.warn('[CapBridge] Init error:', e);
        }
    },

    /**
     * Configure la StatusBar pour iOS
     */
    async setupStatusBar() {
        try {
            const { StatusBar } = window.Capacitor.Plugins;
            if (StatusBar) {
                await StatusBar.setStyle({ style: 'LIGHT' });
                await StatusBar.setBackgroundColor({ color: '#1E3A5F' });
            }
        } catch (e) {
            console.warn('[CapBridge] StatusBar non disponible');
        }
    },

    /**
     * Configure le comportement du clavier natif
     */
    async setupKeyboard() {
        try {
            const { Keyboard } = window.Capacitor.Plugins;
            if (Keyboard) {
                // Sur iOS, le clavier pousse le contenu vers le haut
                Keyboard.setAccessoryBarVisible({ isVisible: true });
                Keyboard.setScroll({ isDisabled: false });

                // Ecouter les evenements clavier
                window.addEventListener('keyboardWillShow', (e) => {
                    document.body.classList.add('keyboard-open');
                    document.body.style.setProperty('--keyboard-height', `${e.keyboardHeight}px`);
                });
                window.addEventListener('keyboardWillHide', () => {
                    document.body.classList.remove('keyboard-open');
                    document.body.style.setProperty('--keyboard-height', '0px');
                });
            }
        } catch (e) {
            console.warn('[CapBridge] Keyboard non disponible');
        }
    },

    /**
     * Configure les notifications push natives
     */
    async setupPushNotifications() {
        try {
            const { PushNotifications } = window.Capacitor.Plugins;
            if (!PushNotifications) return;

            // Demander la permission
            const permResult = await PushNotifications.requestPermissions();
            if (permResult.receive !== 'granted') {
                console.warn('[CapBridge] Push notifications refusees');
                return;
            }

            // S'enregistrer
            await PushNotifications.register();

            // Token recu - envoyer au serveur
            PushNotifications.addListener('registration', (token) => {
                console.log('[CapBridge] Push token:', token.value);
                // Envoyer le token au backend pour les notifications
                if (API.token) {
                    API.post('notifications/push-token', {
                        token: token.value,
                        platform: this.platform
                    }).catch(() => {});
                }
            });

            // Erreur d'enregistrement
            PushNotifications.addListener('registrationError', (error) => {
                console.error('[CapBridge] Push registration error:', error);
            });

            // Notification recue en foreground
            PushNotifications.addListener('pushNotificationReceived', (notification) => {
                console.log('[CapBridge] Push recue:', notification);
                // Afficher un toast au lieu de la notification systeme
                if (typeof toast === 'function') {
                    toast(notification.body || notification.title, 'info');
                }
                // Rafraichir le compteur de notifications
                if (typeof loadNotifications === 'function') {
                    loadNotifications();
                }
            });

            // Notification cliquee
            PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
                const data = action.notification.data;
                if (data && data.link) {
                    const parts = data.link.split(':');
                    if (typeof navigateTo === 'function') {
                        navigateTo(parts[0]);
                    }
                }
            });
        } catch (e) {
            console.warn('[CapBridge] Push notifications non disponibles');
        }
    },

    /**
     * Ecoute les evenements d'app (resume, back button, etc.)
     */
    setupAppListeners() {
        try {
            const { App } = window.Capacitor.Plugins;
            if (!App) return;

            // App revient au premier plan - rafraichir les donnees
            App.addListener('appStateChange', ({ isActive }) => {
                if (isActive) {
                    console.log('[CapBridge] App revenue au premier plan');
                    if (typeof loadNotifications === 'function') {
                        loadNotifications();
                    }
                }
            });

            // Back button (Android) - navigation SPA
            App.addListener('backButton', ({ canGoBack }) => {
                if (canGoBack) {
                    window.history.back();
                } else {
                    // Demander confirmation avant de quitter
                    if (confirm('Voulez-vous quitter ACL GESTION ?')) {
                        App.exitApp();
                    }
                }
            });

            // Deep links
            App.addListener('appUrlOpen', (event) => {
                const url = new URL(event.url);
                const path = url.pathname || url.hash;
                if (path && typeof navigateTo === 'function') {
                    const page = path.replace(/^[#/]+/, '');
                    if (page) navigateTo(page);
                }
            });
        } catch (e) {
            console.warn('[CapBridge] App listeners non disponibles');
        }
    },

    /**
     * Applique les safe areas iOS (encoche, barre home)
     */
    setupSafeArea() {
        if (this.platform === 'ios') {
            document.body.classList.add('capacitor-ios');

            // Ajouter les styles safe area
            const style = document.createElement('style');
            style.id = 'capacitor-safe-area';
            style.textContent = `
                .capacitor-ios .sidebar {
                    padding-top: env(safe-area-inset-top, 20px);
                    padding-bottom: env(safe-area-inset-bottom, 0px);
                }
                .capacitor-ios .top-bar {
                    padding-top: env(safe-area-inset-top, 20px);
                }
                .capacitor-ios .landing-nav {
                    padding-top: env(safe-area-inset-top, 20px);
                }
                .capacitor-ios #login-form-container {
                    padding-top: env(safe-area-inset-top, 20px);
                }
                .capacitor-ios .modal-box {
                    padding-bottom: env(safe-area-inset-bottom, 0px);
                }
                body.keyboard-open .modal-box {
                    max-height: calc(100vh - var(--keyboard-height, 0px) - 40px);
                }
                body.keyboard-open .sidebar {
                    display: none;
                }
            `;
            document.head.appendChild(style);
        }

        if (this.platform === 'android') {
            document.body.classList.add('capacitor-android');
        }
    },

    /**
     * Enregistre le service worker pour le mode web/PWA
     */
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                    .then(reg => console.log('[SW] Enregistre:', reg.scope))
                    .catch(err => console.warn('[SW] Erreur:', err));
            });
        }
    },

    /**
     * Retour haptique (vibration courte)
     */
    async haptic(type = 'light') {
        if (!this.isNative) return;
        try {
            const { Haptics } = window.Capacitor.Plugins;
            if (!Haptics) return;
            const styles = {
                light: 'Light',
                medium: 'Medium',
                heavy: 'Heavy'
            };
            await Haptics.impact({ style: styles[type] || 'Light' });
        } catch (e) {}
    },

    /**
     * Ouvre la camera native pour prendre une photo
     * Retourne un objet { dataUrl, format }
     */
    async takePhoto() {
        if (!this.isNative) {
            // Fallback: input file classique
            return null;
        }
        try {
            const { Camera } = window.Capacitor.Plugins;
            if (!Camera) return null;

            const photo = await Camera.getPhoto({
                quality: 80,
                allowEditing: false,
                resultType: 'dataUrl',
                source: 'CAMERA',
                width: 1200,
                correctOrientation: true
            });

            return {
                dataUrl: photo.dataUrl,
                format: photo.format
            };
        } catch (e) {
            console.warn('[CapBridge] Camera error:', e);
            return null;
        }
    }
};

// Auto-init au chargement
document.addEventListener('DOMContentLoaded', () => {
    CapBridge.init();
});
