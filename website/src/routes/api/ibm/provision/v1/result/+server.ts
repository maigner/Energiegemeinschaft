import { json } from '@sveltejs/kit';
import { reportSetup, SETUP_PHASES } from '$lib/server/db/members/openhabProvision';
import { deleteImage } from '$lib/server/ibmImage';
import { isHostname, isWgPublicKey, isInverterType } from '$lib/ibmNames';

/**
 * Meldungen des Pi waehrend der Einrichtung (report_phase in
 * lib/common.sh der Setup-Skripte).
 *
 * Body: { "token": "<Status-Token>", "phase": "...", "message": "...",
 *         "wg_public_key": "...", "inverter_type": "...", "hostname": "..." }
 * Alle Felder ausser token optional; nur gesetzte werden uebernommen.
 *
 * Antwort: { ok, inverter_type, inverter_password_set, wg_synced,
 *            cloud_account_state } - der Pi wartet bei
 * "wechselrichter_unklar" auf ein vom Vorstand gesetztes inverter_type und
 * bei "wartet_auf_passwort" auf inverter_password_set.
 */

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Body ist kein gültiges JSON' }, { status: 400 });
    }

    const str = (v: unknown, max: number) =>
        typeof v === 'string' ? v.trim().slice(0, max) : '';

    const token = str(body?.token, 200);
    if (!token) {
        return json({ error: "Feld 'token' fehlt oder ist ungültig" }, { status: 400 });
    }

    const phase = str(body?.phase, 50);
    if (phase && !SETUP_PHASES.includes(phase) && !phase.startsWith('fehler')) {
        return json({ error: `Unbekannte Phase '${phase}'` }, { status: 400 });
    }

    // Hostname, Public-Key und Profil landen in Dateipfaden, in der
    // openhabian.conf der naechsten SD-Karte und in der wg0.conf auf s1 -
    // deshalb nur im erwarteten Format (src/lib/ibmNames.js), sonst 400.
    const hostname = str(body?.hostname, 200);
    if (hostname && !isHostname(hostname)) {
        return json({ error: "Feld 'hostname' ist kein gültiger Hostname" }, { status: 400 });
    }
    const wgPublicKey = str(body?.wg_public_key, 100);
    if (wgPublicKey && !isWgPublicKey(wgPublicKey)) {
        return json({ error: "Feld 'wg_public_key' ist kein WireGuard-Public-Key" }, { status: 400 });
    }
    const inverterType = str(body?.inverter_type, 50);
    if (inverterType && !isInverterType(inverterType)) {
        return json({ error: "Feld 'inverter_type' ist kein gültiger Profilname" }, { status: 400 });
    }

    const row = await reportSetup(token, {
        phase,
        message: str(body?.message, 2000),
        wg_public_key: wgPublicKey,
        inverter_type: inverterType,
        hostname
    });

    if (!row) {
        console.log('ibm provision result rejected (unknown token)');
        return json({ error: 'Unbekanntes Token.' }, { status: 401 });
    }

    if (phase) console.log(`ibm setup phase (anlage ${row.id}): ${phase}`);

    // Einrichtung abgeschlossen: das SD-Karten-Image wird nicht mehr
    // gebraucht (rund 1,5 GB je Anlage auf s1). Fuer einen Neuaufbau gibt es
    // ohnehin einen neuen Code und damit ein neues Image.
    if (phase === 'fertig' && row.name) {
        await deleteImage(row.name).catch(() => {});
    }

    return json({
        ok: true,
        inverter_type: row.inverter_type ?? '',
        inverter_password_set: Boolean(row.inverter_password_set),
        wg_synced: row.wg_synced_at !== null,
        cloud_account_state: row.cloud_account_state ?? ''
    });
}
