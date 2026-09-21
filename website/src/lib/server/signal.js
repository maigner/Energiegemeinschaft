// Signal-Versand ueber signal-cli-rest-api (Container auf s1, docs/server-setup.md,
// Abschnitt Signal). Reines Modul ohne SvelteKit-Importe, damit auch
// scripts/signal-send.js es nutzen kann; die Konfiguration kommt als
// Umgebungsobjekt herein:
//
//   SIGNAL_API_URL     z. B. http://172.17.0.1:8180 (leer = Signal aus)
//   SIGNAL_NUMBER      Absender, das verknuepfte Konto (+43...)
//   SIGNAL_RECIPIENTS  Empfaenger, kommagetrennt: Nummern (+43...) oder
//                      Gruppen-IDs (group.xxx aus GET /v1/groups/<nummer>);
//                      leer = "Notiz an mich" des Absenders
//
// Fehler werden geworfen, der Aufrufer entscheidet, ob sie den Ablauf
// aufhalten (die Alarme in mail/notifications/ibmAlerts.js behandeln Signal
// als zweiten Kanal neben der Mail, der nie den Mailversand blockiert).

/**
 * @typedef {{ apiUrl: string, number: string, recipients: string[] } | null} SignalConfig
 */

/**
 * @param {Record<string, string | undefined>} env
 * @returns {SignalConfig} null, wenn Signal nicht konfiguriert ist
 */
export const signalConfigFromEnv = (env) => {
    const apiUrl = (env.SIGNAL_API_URL ?? '').trim().replace(/\/+$/, '');
    const number = (env.SIGNAL_NUMBER ?? '').trim();
    if (!apiUrl || !number) return null;
    const recipients = (env.SIGNAL_RECIPIENTS ?? '')
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);
    return { apiUrl, number, recipients: recipients.length ? recipients : [number] };
};

/**
 * Textnachricht an alle konfigurierten Empfaenger schicken.
 *
 * @param {SignalConfig} config - aus signalConfigFromEnv; null = stiller Rueckzug
 * @param {string} text
 * @returns {Promise<boolean>} true, wenn verschickt; false, wenn Signal nicht konfiguriert ist
 */
export const sendSignal = async (config, text) => {
    if (!config) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
        const response = await fetch(`${config.apiUrl}/v2/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: config.number, recipients: config.recipients, message: text }),
            signal: controller.signal
        });
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`signal-cli-rest-api ${response.status}: ${body.slice(0, 300)}`);
        }
        return true;
    } finally {
        clearTimeout(timer);
    }
};
