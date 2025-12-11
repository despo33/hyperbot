/**
 * Service d'envoi d'emails via EmailJS
 * Utilisé pour la vérification des comptes et reset password
 */

// Configuration EmailJS
const EMAILJS_CONFIG = {
    serviceId: 'service_6l0qdkv',           // Service SMTP Hostinger
    publicKey: '1gU42ltovIyRmP-_F',
    templates: {
        verification: 'template_9lx6dfr',   // Template de vérification
        resetPassword: 'template_9lx6dfr'   // Utilise le même template
    }
};

class EmailService {
    constructor() {
        this.config = EMAILJS_CONFIG;
    }

    /**
     * Génère le payload pour EmailJS (côté client)
     * Note: EmailJS fonctionne côté client, on retourne les données pour le frontend
     */
    getVerificationEmailData(email, username, verificationCode) {
        return {
            serviceId: this.config.serviceId,
            publicKey: this.config.publicKey,
            templateId: this.config.templates.verification,
            templateParams: {
                // Variables pour le template EmailJS
                to_email: email,
                to_name: username,
                passcode: verificationCode,           // Pour {{passcode}}
                verification_code: verificationCode, // Backup
                time: '24 heures',                    // Pour {{time}}
                app_name: 'Hyperliquid Trading Bot',
                valid_hours: '24'
            }
        };
    }

    /**
     * Génère le payload pour reset password
     * Utilise le même template que la vérification avec passcode = lien
     */
    getResetPasswordEmailData(email, username, resetLink) {
        return {
            serviceId: this.config.serviceId,
            publicKey: this.config.publicKey,
            templateId: this.config.templates.resetPassword,
            templateParams: {
                to_email: email,
                to_name: username,
                passcode: resetLink,              // Le lien sera affiché comme "code"
                verification_code: resetLink,
                reset_link: resetLink,
                time: '1 heure',
                app_name: 'Hyperliquid Trading Bot',
                valid_hours: '1'
            }
        };
    }

    /**
     * Retourne la configuration EmailJS pour le frontend
     */
    getConfig() {
        return {
            serviceId: this.config.serviceId,
            publicKey: this.config.publicKey
        };
    }
}

const emailService = new EmailService();
export default emailService;
