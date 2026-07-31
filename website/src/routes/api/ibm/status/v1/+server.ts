import { json } from '@sveltejs/kit';
import { pushOpenhabStatus, MAX_STATUS_DATA_BYTES } from '$lib/server/db/members/openhabStatus';

/**
 * Live-Status-Push der openHABian-Anlagen (Regel ibm_status_push.js).
 *
 * Body: { "token": "<geheim>", "anlage": "<name>", "data": { ... } }
 *
 * Das Token erzeugt der Vorstand auf /board/openhab je Mitglied; es liegt
 * auf dem Pi in der ibm.conf. Pushes mit unbekanntem Token werden
 * abgewiesen. 'anlage' ist optional und aktualisiert nur den Anzeigenamen.
 */

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Body ist kein gültiges JSON' }, { status: 400 });
    }

    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const anlage = typeof body?.anlage === 'string' ? body.anlage.trim() : '';
    const data = body?.data;

    if (!token || token.length > 200) {
        return json({ error: "Feld 'token' fehlt oder ist ungültig" }, { status: 400 });
    }
    if (anlage.length > 200) {
        return json({ error: "Feld 'anlage' ist zu lang" }, { status: 400 });
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        return json({ error: "Feld 'data' fehlt oder ist kein Objekt" }, { status: 400 });
    }
    if (JSON.stringify(data).length > MAX_STATUS_DATA_BYTES) {
        return json({ error: "Feld 'data' ist zu groß" }, { status: 413 });
    }

    const stored = await pushOpenhabStatus(token, anlage, data);

    if (!stored) {
        console.log(`openhab status push rejected (unknown token): ${anlage || 'ohne Namen'}`);
        return json({ error: 'Unbekanntes Token. Der Vorstand erzeugt Tokens auf ischlstrom.org unter /board/openhab.' }, { status: 401 });
    }

    return json({ ok: true });
}
