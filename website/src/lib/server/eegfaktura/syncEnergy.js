// Nachforderung von Energiedaten bei Netz OOe ueber EEG-Faktura
// (`POST /api/meteringpoint/syncenergy`, loest den EDA-Prozess aus). Der
// Endpoint braucht ein Bearer-Token aus der Browser-Anmeldung bei
// EEG-Faktura; der Keycloak-Client erlaubt keinen Passwort-Grant, deshalb
// gibt der Vorstand das Token auf /board/energy/pruefung von Hand ein
// (Workaround, docs/eegfaktura-pruefung-automatisierung.md Stufe 6). Das
// Token wird weder gespeichert noch protokolliert.

const DEFAULT_API_URL = 'https://eegfaktura.at/api';
const DEFAULT_TENANT = 'RC101533';

/**
 * @typedef {{ requested: number | null, skipped: { meteringPoint: string, reason: string, until: number | null }[] }} SyncEnergyResult
 */

/**
 * @param {Record<string, string | undefined>} env
 */
export const eegfakturaConfigFromEnv = (env) => ({
    apiUrl: (env.FAKTURA_API_URL ?? '').trim().replace(/\/+$/, '') || DEFAULT_API_URL,
    tenant: (env.FAKTURA_TENANT ?? '').trim() || DEFAULT_TENANT,
});

/**
 * @param {{ apiUrl: string, tenant: string }} config
 * @param {string} token  Bearer-Token (ohne "Bearer ")
 * @param {{ meteringPoints: { meter: string, direction: string, from: number, to: number }[], from: number, to: number }} body
 * @returns {Promise<SyncEnergyResult>}
 */
export const sendSyncEnergy = async (config, token, body) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
        const response = await fetch(`${config.apiUrl}/meteringpoint/syncenergy`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token.replace(/^Bearer\s+/i, '').trim()}`,
                tenant: config.tenant,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('EEG-Faktura lehnt das Token ab (abgelaufen oder falsch kopiert)');
        }
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`EEG-Faktura antwortet mit HTTP ${response.status}: ${text.slice(0, 200)}`);
        }
        if (response.status === 204) return { requested: null, skipped: [] };
        const data = await response.json().catch(() => ({}));
        return {
            requested: typeof data.requested === 'number' ? data.requested : null,
            skipped: Array.isArray(data.skipped)
                ? data.skipped.map((/** @type {any} */ s) => ({
                      meteringPoint: String(s.meteringPoint ?? ''),
                      reason: String(s.reason ?? ''),
                      until: typeof s.until === 'number' ? s.until : null,
                  }))
                : [],
        };
    } finally {
        clearTimeout(timer);
    }
};
