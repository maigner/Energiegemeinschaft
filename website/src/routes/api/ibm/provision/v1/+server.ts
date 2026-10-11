import { json } from '@sveltejs/kit';
import { consumeProvisionCode } from '$lib/server/db/members/openhabProvision';
import { createAttemptBudget } from '$lib/server/attemptBudget';

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
 * Der Code gilt bis zum Ablauf (60 Tage) und nur, solange der Pi seine
 * ibm.conf noch nicht geschrieben hat (Phasen bis "wechselrichter_unklar",
 * CODE_CONSUMABLE_PHASES) - ein in dieser Zeit abgebrochener Lauf kann so
 * neu starten, danach ist der Code verbraucht. Eine zweite Einloesung in
 * dieser Zeit (etwa von einer verlorenen SD-Karte) wird protokolliert und
 * ist am Dashboard an "Code eingeloest" zu sehen.
 *
 * Abgelehnte Codes zaehlen in ein globales Budget (ohne Client-IP): nach
 * MAX_REJECTED_PER_HOUR Fehlversuchen antwortet der Endpoint allen mit 429,
 * bis das Fenster weiterwandert. Berechtigte Pis loesen genau einmal ein;
 * ein Pi mit abgelaufenem Code versucht es alle 10 Minuten, das bleibt
 * unter dem Budget.
 */

const MAX_REJECTED_PER_HOUR = 30;
const rejected = createAttemptBudget({ max: MAX_REJECTED_PER_HOUR, windowMs: 60 * 60 * 1000 });

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, url }) {

    if (rejected.exhausted()) {
        return json(
            { error: 'Zu viele abgelehnte Provisionierungs-Codes. Bitte später erneut versuchen.' },
            { status: 429, headers: { 'Retry-After': String(rejected.retryAfterSeconds()) } }
        );
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Body ist kein gültiges JSON' }, { status: 400 });
    }

    const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
        rejected.fail();
        return json({ error: "Feld 'code' fehlt oder ist ungültig" }, { status: 400 });
    }

    const plant = await consumeProvisionCode(code);
    if (!plant) {
        rejected.fail();
        console.log('ibm provision rejected (unknown, expired or already used code)');
        return json({ error: 'Unbekannter, abgelaufener oder bereits verbrauchter Provisionierungs-Code. Auf ischlstrom.org unter /board/openhab einen neuen Code erzeugen.' }, { status: 401 });
    }

    const apiBase = `${url.protocol}//${url.host}`;
    if (plant.previously_provisioned_at) {
        // Zweite Einloesung vor der ibm.conf: meist ein Neustart des Pi
        // waehrend der Wechselrichter-Suche, sonst ein Fremder mit dem Code.
        console.warn(`ibm provision delivered AGAIN (anlage ${plant.id}, ${plant.name}, erste Einloesung ${new Date(plant.previously_provisioned_at).toISOString()}, Phase '${plant.setup_phase}')`);
    } else {
        console.log(`ibm provision delivered (anlage ${plant.id}, ${plant.name})`);
    }

    return json({
        config: {
            IBM_PROVISIONED: '1',
            INVERTER_TYPE: plant.inverter_type ?? '',
            INVERTER_USERNAME: plant.inverter_username ?? '',
            IBM_API_BASE: apiBase,
            INSTALL_STATUS_PUSH: '1',
            IBM_STATUS_TOKEN: plant.token,
            IBM_ANLAGE_NAME: plant.name,
            IBM_MEMBER_FIRSTNAME: plant.member_first_name ?? '',
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
