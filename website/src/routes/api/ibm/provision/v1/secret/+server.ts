import { json } from '@sveltejs/kit';
import { popInverterCredentials } from '$lib/server/db/members/openhabProvision';

/**
 * Zugangsdaten des Wechselrichters (GEN24) einmalig an den Pi ausliefern.
 * Das Mitglied (oder der Vorstand) traegt sie auf ischlstrom.org ein; der
 * Pi fragt in der Phase "wartet_auf_passwort" alle zwei Minuten nach.
 * Nach der Auslieferung loescht der Server das Passwort.
 *
 * Body: { "token": "<Status-Token>" }
 * Antwort: { pending: true } solange nichts hinterlegt ist, sonst
 *          { username, password }.
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
    if (!token || token.length > 200) {
        return json({ error: "Feld 'token' fehlt oder ist ungültig" }, { status: 400 });
    }

    const result = await popInverterCredentials(token);
    if (!result.known) {
        return json({ error: 'Unbekanntes Token.' }, { status: 401 });
    }
    if (!result.credentials) {
        return json({ pending: true });
    }
    console.log('ibm inverter credentials delivered to plant');
    return json({ username: result.credentials.username, password: result.credentials.password });
}
