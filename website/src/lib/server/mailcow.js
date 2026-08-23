import { env } from '$env/dynamic/private';

// mailcow-API auf s1: legt die Mail-Aliase der openHAB-Cloud-Konten an
// (<nnn>@ischlstrom.org -> info@ischlstrom.org). Entscheidung 2026-08-23:
// Alias statt Postfach - die Cloud prueft die Adresse nie, sie dient allein
// dem Passwort-Reset, dessen Mails so beim Vorstand landen.
//
// website/.env:
//   MAILCOW_URL        https://s1.ischlstrom.org   (mailcow-Weboberflaeche)
//   MAILCOW_API_KEY    API-Key (mailcow: System -> API, Zugriff auf die IP
//                      von s1 beschraenken, Lese-/Schreibzugriff)
//   MAILCOW_ALIAS_GOTO info@ischlstrom.org         (Ziel der Aliase)
// Ohne MAILCOW_API_KEY wird nichts angelegt und der Aufrufer bekommt
// 'skipped' zurueck - die Provisionierung laeuft trotzdem weiter, der
// Zustand steht am Dashboard.

/** Ist die API konfiguriert? */
export function mailcowConfigured() {
    return Boolean(env.MAILCOW_API_KEY && env.MAILCOW_URL);
}

/** Ziel-Adresse der Aliase. */
export function mailcowAliasGoto() {
    return env.MAILCOW_ALIAS_GOTO || 'info@ischlstrom.org';
}

/**
 * Legt einen Alias an. Idempotent: ein bereits vorhandener Alias gilt als
 * Erfolg.
 *
 * @param {string} address - z. B. 007@ischlstrom.org
 * @returns {Promise<'created' | 'exists' | 'skipped'>}
 * @throws {Error} bei Fehlern der API (Text landet in mail_alias_state)
 */
export async function ensureMailcowAlias(address) {
    if (!mailcowConfigured()) return 'skipped';

    const base = String(env.MAILCOW_URL).replace(/\/+$/, '');
    const headers = {
        'X-API-Key': String(env.MAILCOW_API_KEY),
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };

    const response = await fetch(`${base}/api/v1/add/alias`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            address,
            goto: mailcowAliasGoto(),
            active: '1',
            sogo_visible: '0'
        }),
        signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
        throw new Error(`mailcow HTTP ${response.status}`);
    }

    /** @type {any} */
    const result = await response.json();
    // mailcow antwortet mit einem Array von {type, msg}; msg ist ein Array
    // wie ["alias_added", "007@ischlstrom.org"] oder ["object_exists", ...].
    const entries = Array.isArray(result) ? result : [result];
    for (const entry of entries) {
        const msg = Array.isArray(entry?.msg) ? entry.msg.join(' ') : String(entry?.msg ?? '');
        if (entry?.type === 'success') return 'created';
        if (/object_exists|alias_domain_exists|is_alias_or_mailbox/.test(msg)) return 'exists';
    }
    const text = entries.map((e) => (Array.isArray(e?.msg) ? e.msg.join(' ') : String(e?.msg ?? e))).join('; ');
    throw new Error(`mailcow: ${text || 'unbekannte Antwort'}`);
}
