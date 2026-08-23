import { json } from '@sveltejs/kit';
import { consumeProvisionCode } from '$lib/server/db/members/openhabProvision';

/**
 * Provisionierung einer IBM-Anlage (Zero-Touch-Einrichtung): der Pi loest
 * den Code von der SD-Karte (ibm-provision.conf) ein und bekommt alles,
 * was frueher der Einrichtungsassistent abgefragt hat.
 *
 * Body: { "code": "XXXX-XXXX" }  (POST, damit der Code in keinem
 * Access-Log landet)
 *
 * Antwort: { config: { <Schluessel der ibm.conf> }, linux_password }
 * config enthaelt nur Schluessel im Format der ibm.conf (Grossbuchstaben);
 * 00-provision.sh am Pi schreibt sie unveraendert hinein. INVERTER_TYPE=""
 * heisst: der Pi erkennt das Profil selbst. linux_password steht bewusst
 * nicht in der ibm.conf (nur fuer den Lauf als IBM_NEW_PASSWORD).
 *
 * Der Code bleibt bis zum Abschluss der Einrichtung (Phase "fertig") oder
 * bis zum Ablauf gueltig - ein abgebrochener Lauf kann so neu starten.
 */

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, url }) {

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Body ist kein gültiges JSON' }, { status: 400 });
    }

    const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
        return json({ error: "Feld 'code' fehlt oder ist ungültig" }, { status: 400 });
    }

    const plant = await consumeProvisionCode(code);
    if (!plant) {
        console.log('ibm provision rejected (unknown or expired code)');
        return json({ error: 'Unbekannter oder abgelaufener Provisionierungs-Code. Auf ischlstrom.org unter /board/openhab einen neuen Code erzeugen.' }, { status: 401 });
    }

    const apiBase = `${url.protocol}//${url.host}`;
    console.log(`ibm provision delivered (anlage ${plant.id}, ${plant.name})`);

    return json({
        config: {
            IBM_PROVISIONED: '1',
            INVERTER_TYPE: plant.inverter_type ?? '',
            INVERTER_USERNAME: plant.inverter_username ?? '',
            IBM_API_BASE: apiBase,
            INSTALL_STATUS_PUSH: '1',
            IBM_STATUS_TOKEN: plant.token,
            IBM_ANLAGE_NAME: plant.name,
            DEFAULT_MIN_BATTERY_CHARGE: '20',
            DEFAULT_MIN_DISCHARGE_W: '1000',
            DEFAULT_MAX_DISCHARGE_W: '3000',
            DEFAULT_MAIN_SWITCH: 'ON',
            INSTALL_ADDONS: '1',
            INSTALL_PERSISTENCE: '1',
            INSTALL_CLOUD: '1',
            INSTALL_OVERVIEW: '1',
            INSTALL_WATCHDOG: '1',
            INSTALL_WIREGUARD: '1',
            INSTALL_PASSWORD_CHANGE: '1',
            OH_API_TOKEN: 'auto',
            OH_ADMIN_USER: 'openhabian',
            OH_ADMIN_PASSWORD: plant.linux_password,
            WG_ADDRESS: plant.wg_address,
            WG_SERVER_ENDPOINT: 's1.ischlstrom.org:51820',
            CLOUD_UUID: plant.cloud_uuid,
            CLOUD_SECRET: plant.cloud_secret
        },
        linux_password: plant.linux_password
    });
}
