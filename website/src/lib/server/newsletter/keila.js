// Keila-Anbindung (Newsletter, Container `keila` auf s1, siehe
// docs/server-setup.md, Abschnitt Newsletter). Reines Modul ohne
// SvelteKit-Importe, damit scripts/keila-contacts.js es nutzen kann; die
// Konfiguration kommt als Umgebungsobjekt herein:
//
//   KEILA_API_URL   z. B. http://172.17.0.1:4000 (leer = Abgleich aus)
//   KEILA_API_KEY   API-Schluessel des Projekts (Keila: Projekt ->
//                   Einstellungen -> API-Schluessel)
//
// Abgleich (syncKeilaContacts): Soll-Liste sind die Mitglieder mit aktivem
// Zaehlpunkt (db/members/newsletter.js). Fehlende Kontakte werden angelegt,
// vorhandene bei geaenderten Namen oder Daten aktualisiert (die Daten werden
// mit den in Keila vorhandenen zusammengefuehrt, von Hand ergaenzte Felder
// bleiben), und Kontakte mit data.mitglied = true, deren Adresse nicht mehr
// in der Soll-Liste ist, werden geloescht (Austritt: der Zweck der
// Verarbeitung entfaellt). Der Status (active/unsubscribed) wird nie
// mitgeschickt - wer sich in Keila abgemeldet hat, bleibt abgemeldet, und
// von Hand angelegte Kontakte ohne data.mitglied ruehrt der Abgleich nicht an
// (Ausnahme: Option deleteOthers, ein bewusster Aufraeumlauf ueber die CLI,
// der alle Kontakte ausserhalb der Soll-Liste loescht).
//
// Keila-API (REST, /api/v1, Bearer-Token): Liste seitenweise ueber
// paginate[page]/paginate[page_size]; Antworten liegen unter `data`, Listen
// zusaetzlich mit `meta.page_count`. Aendern und Loeschen ueber die Keila-ID
// aus der Liste, nicht per ?id_type=email: dieser Zugriff vergleicht die
// Adresse exakt, und Keila speichert Adressen so, wie sie eingegeben wurden
// (auch mit Grossbuchstaben), waehrend der Abgleich sie kleingeschrieben
// vergleicht.

/**
 * @typedef {{ apiUrl: string, apiKey: string } | null} KeilaConfig
 * @typedef {import('../db/members/newsletter.js').NewsletterContact} NewsletterContact
 * @typedef {{ id: string, email: string, first_name: string | null, last_name: string | null,
 *             status: string, data: Record<string, any> | null }} KeilaContact
 */

const PAGE_SIZE = 200;
const TIMEOUT_MS = 30_000;

/**
 * @param {Record<string, string | undefined>} env
 * @returns {KeilaConfig} null, wenn Keila nicht konfiguriert ist
 */
export const keilaConfigFromEnv = (env) => {
    const apiUrl = (env.KEILA_API_URL ?? '').trim().replace(/\/+$/, '');
    const apiKey = (env.KEILA_API_KEY ?? '').trim();
    if (!apiUrl || !apiKey) return null;
    return { apiUrl, apiKey };
};

/**
 * @param {NonNullable<KeilaConfig>} config
 * @param {string} method
 * @param {string} path - ab /api/v1, inkl. Query
 * @param {object} [body]
 * @returns {Promise<any>} JSON-Antwort (null bei 204)
 */
const request = async (config, method, path, body) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch(`${config.apiUrl}/api/v1${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                Accept: 'application/json',
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Keila ${method} ${path}: HTTP ${response.status} ${text.slice(0, 300)}`);
        }
        if (response.status === 204) return null;
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
};

/**
 * Alle Kontakte des Projekts (seitenweise).
 * @param {NonNullable<KeilaConfig>} config
 * @returns {Promise<KeilaContact[]>}
 */
export const listKeilaContacts = async (config) => {
    /** @type {KeilaContact[]} */
    const contacts = [];
    for (let page = 0; ; page++) {
        const result = await request(config, 'GET', `/contacts?paginate[page]=${page}&paginate[page_size]=${PAGE_SIZE}`);
        const rows = Array.isArray(result?.data) ? result.data : [];
        contacts.push(...rows);
        const pageCount = Number(result?.meta?.page_count);
        const done = Number.isFinite(pageCount) ? page + 1 >= pageCount : rows.length < PAGE_SIZE;
        if (done || rows.length === 0) break;
    }
    return contacts;
};

/**
 * Felder, die der Abgleich in `data` pflegt; alles andere bleibt, wie es
 * in Keila steht.
 * @param {Record<string, any> | null | undefined} data
 */
const managedData = (data) => {
    const d = data ?? {};
    return {
        mitglied: d.mitglied,
        mitgliedsnummer: d.mitgliedsnummer,
        mitgliedsnummern: d.mitgliedsnummern,
        ort: d.ort,
        erzeuger: d.erzeuger,
    };
};

/**
 * @param {KeilaContact} existing
 * @param {NewsletterContact} wanted
 */
const needsUpdate = (existing, wanted) =>
    (existing.first_name ?? '') !== wanted.first_name
    || (existing.last_name ?? '') !== wanted.last_name
    || JSON.stringify(managedData(existing.data)) !== JSON.stringify(managedData(wanted.data));

/**
 * Soll-Liste nach Keila abgleichen (siehe Kopf der Datei).
 *
 * @param {NonNullable<KeilaConfig>} config
 * @param {NewsletterContact[]} wanted
 * @param {{ dryRun?: boolean, deleteOthers?: boolean, log?: (line: string) => void }} [options]
 *   deleteOthers: auch Kontakte ohne data.mitglied loeschen, die nicht in der
 *   Soll-Liste sind (Aufraeumlauf, nur ueber die CLI)
 * @returns {Promise<{ created: number, updated: number, deleted: number, unchanged: number,
 *                     skipped: number, errors: string[] }>}
 *   skipped = Kontakte, die in Keila ohne data.mitglied existieren und deshalb
 *   nur gelesen, nicht angefasst werden
 */
export const syncKeilaContacts = async (config, wanted, { dryRun = false, deleteOthers = false, log = () => {} } = {}) => {
    const existing = await listKeilaContacts(config);
    /** @type {Map<string, KeilaContact>} */
    const byEmail = new Map(existing.map((c) => [c.email.trim().toLowerCase(), c]));
    const wantedEmails = new Set(wanted.map((c) => c.email));
    const result = { created: 0, updated: 0, deleted: 0, unchanged: 0, skipped: 0, errors: /** @type {string[]} */ ([]) };

    /** @param {string} action @param {() => Promise<any>} fn */
    const attempt = async (action, fn) => {
        try {
            if (!dryRun) await fn();
            log(`${dryRun ? '[Probelauf] ' : ''}${action}`);
            return true;
        } catch (e) {
            result.errors.push(`${action}: ${e instanceof Error ? e.message : e}`);
            return false;
        }
    };

    for (const contact of wanted) {
        const current = byEmail.get(contact.email);
        if (!current) {
            if (await attempt(`anlegen ${contact.email} (Mitglied ${contact.data.mitgliedsnummer})`,
                () => request(config, 'POST', '/contacts', { data: contact }))) result.created++;
        } else if (needsUpdate(current, contact)) {
            const body = {
                data: {
                    first_name: contact.first_name,
                    last_name: contact.last_name,
                    data: { ...(current.data ?? {}), ...contact.data },
                },
            };
            if (await attempt(`aktualisieren ${contact.email} (Mitglied ${contact.data.mitgliedsnummer})`,
                () => request(config, 'PATCH', `/contacts/${encodeURIComponent(current.id)}`, body))) result.updated++;
        } else {
            result.unchanged++;
        }
    }

    for (const [email, current] of byEmail) {
        if (wantedEmails.has(email)) continue;
        if (current.data?.mitglied !== true && !deleteOthers) {
            result.skipped++;
            continue;
        }
        const who = current.data?.mitglied === true ? `Mitglied ${current.data?.mitgliedsnummer ?? '?'}` : 'kein Mitgliedskontakt';
        if (await attempt(`loeschen ${email} (${who}, kein aktiver Zaehlpunkt)`,
            () => request(config, 'DELETE', `/contacts/${encodeURIComponent(current.id)}`))) result.deleted++;
    }

    return result;
};

/** @param {unknown} value */
const csvField = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * CSV fuer den Import von Hand in Keila (Kontakte -> Importieren, Haken
 * "Duplikate ersetzen"). Spalten email, first_name, last_name, data; bewusst
 * ohne Spalte status, sonst wuerde der Import Abgemeldete wieder aktivieren.
 * Trennzeichen Komma (RFC 4180): Keila schaltet bei drei Strichpunkten in der
 * Kopfzeile auf Excel-Format um, deshalb keine Strichpunkte dort.
 *
 * @param {NewsletterContact[]} contacts
 */
export const contactsToCsv = (contacts) => {
    const lines = ['email,first_name,last_name,data'];
    for (const c of contacts) {
        lines.push([c.email, c.first_name, c.last_name, JSON.stringify(c.data)].map(csvField).join(','));
    }
    return lines.join('\r\n') + '\r\n';
};
