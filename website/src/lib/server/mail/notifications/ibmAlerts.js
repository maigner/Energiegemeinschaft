// Offline-Alarm fuer IBM-Anlagen (Speichermanagement).
//
// Die Pis melden minuetlich ihren Zustand (ibm_status_push.js). Bleibt die
// Meldung aus, sieht das der Vorstand bisher nur am Dashboard. Bei
// Wechselrichtern, die per Modbus gesteuert werden (alle Profile ausser dem
// GEN24), kann ein Steuerbefehl am Geraet stehen bleiben, wenn der Pi hart
// ausfaellt - ein Entladefenster laeuft dann bis zur Untergrenze der
// Batterie weiter, und nur das Mitglied oder ein Elektriker vor Ort kann
// zuruecksetzen (inverters/failsafe-modbus.md). Deshalb schickt der Cron
// checkSilentPlants (alle 5 Minuten) je Ausfall genau eine Meldung an
// info@ischlstrom.org, mit dem letzten bekannten Zustand; die erste Meldung
// des Pi danach loest die Entwarnung aus (notifyPlantRecovered).

import { findSilentPlants, markOfflineAlerted, getOpenhabStatus } from '$lib/server/db/members/openhabStatus';
import { relayPlain } from '$lib/server/mail/smtp';

// Ab so vielen Minuten ohne Meldung gilt eine Anlage als verstummt. Das
// Dashboard zeigt "verspaetet" ab 15 und "offline" ab 60 Minuten; der
// Alarm liegt dazwischen, damit ein openHAB-Neustart (wenige Minuten) und
// das naechtliche Paket-Update keine Meldung ausloesen.
const SILENT_MINUTES = 30;

// Profile, deren Kommandos am Wechselrichter von selbst ablaufen. Bei allen
// anderen kann ein Steuerbefehl stehen bleiben.
const SELF_EXPIRING_PROFILES = new Set(['fronius']);

const DASHBOARD_URL = 'https://ischlstrom.org/board/openhab';

/** @param {number | null} seconds */
const formatAge = (seconds) => {
    if (seconds === null || !Number.isFinite(seconds)) return 'unbekannt';
    const minutes = Math.round(seconds / 60);
    if (minutes < 120) return `${minutes} min`;
    const hours = Math.round(minutes / 6) / 10;
    return `${String(hours).replace('.', ',')} h`;
};

/** @param {Date | string | null} value */
const formatTime = (value) => {
    if (!value) return 'unbekannt';
    return new Date(value).toLocaleString('de-AT', { timeZone: 'Europe/Vienna' });
};

/**
 * @param {{ name: string, member_name: string, member_identifier: string, last_seen: any, age_seconds: any,
 *           inverter_type: string | null, hauptschalter: string | null, entladung_aktiv: string | null,
 *           ladesperre_aktiv: string | null, soc: string | null, battery_power_w: string | null,
 *           failsafe: any, id: number }} plant
 */
const buildOfflineMail = (plant) => {
    const label = `${plant.name || 'ohne Namen'} (Mitglied ${plant.member_identifier}, ${plant.member_name})`;
    const age = formatAge(plant.age_seconds === null ? null : Number(plant.age_seconds));
    const profile = plant.inverter_type || 'unbekannt';
    const commandsCanStand = !SELF_EXPIRING_PROFILES.has(profile);
    const switchedOn = plant.hauptschalter === 'ON';

    const lines = [
        `Die Anlage ${label} hat seit ${age} keinen Status mehr gemeldet`,
        `(letzte Meldung: ${formatTime(plant.last_seen)}).`,
        ''
    ];

    if (commandsCanStand && switchedOn) {
        lines.push(
            'ACHTUNG: Dieser Wechselrichter wird per Modbus gesteuert, und der',
            'Hauptschalter stand auf EIN. Faellt der Pi hart aus, bleibt der zuletzt',
            'kommandierte Zustand am Geraet stehen (ein Entladefenster laeuft bis zur',
            'Untergrenze der Batterie weiter, eine Ladesperre haelt an). Der',
            'Fail-Safe-Timer am Pi greift nur, solange der Pi selbst laeuft.',
            '',
            'Bitte pruefen, ob der Pi noch erreichbar ist (Fernwartung). Wenn nicht:',
            'das Mitglied bitten, am Datamanager "Datenausgabe ueber Modbus" auf aus',
            'zu stellen oder den Wechselrichter einmal aus- und einzuschalten',
            '(Anleitung: inverters/failsafe-modbus.md, Abschnitt 5).',
            ''
        );
    } else if (commandsCanStand) {
        lines.push(
            'Der Wechselrichter wird per Modbus gesteuert, der Hauptschalter stand',
            'zuletzt auf AUS - der Kern hat den Wechselrichter bei jedem Zyklus',
            'zurueckgesetzt, es sollte kein Steuerbefehl stehen. Trotzdem pruefen.',
            ''
        );
    } else {
        lines.push(
            'Die Kommandos dieses Wechselrichters (GEN24) laufen am Geraet von selbst',
            'ab - es bleibt nichts stehen. Die Anlage ist nur nicht mehr erreichbar.',
            ''
        );
    }

    lines.push(
        'Letzter bekannter Zustand:',
        `  Wechselrichter-Profil: ${profile}`,
        `  Hauptschalter:         ${plant.hauptschalter ?? 'unbekannt'}`,
        `  Entladung aktiv:       ${plant.entladung_aktiv ?? 'unbekannt'}`,
        `  Ladesperre aktiv:      ${plant.ladesperre_aktiv ?? 'unbekannt'}`,
        `  Ladestand:             ${plant.soc !== null && plant.soc !== undefined ? `${Math.round(Number(plant.soc))}%` : 'unbekannt'}`,
        `  Batterieleistung:      ${plant.battery_power_w !== null && plant.battery_power_w !== undefined ? `${Math.round(Number(plant.battery_power_w))} W` : 'unbekannt'}`
    );
    if (plant.failsafe && typeof plant.failsafe === 'object') {
        lines.push(`  Fail-Safe am Pi:       ${plant.failsafe.ergebnis ?? '?'} am ${plant.failsafe.zeit ?? '?'} (${plant.failsafe.grund ?? ''})`);
    }
    lines.push('', `Dashboard: ${DASHBOARD_URL}/${plant.id}`, '', 'Diese Meldung kommt je Ausfall einmal; sobald die Anlage wieder meldet, folgt eine Entwarnung.');

    const urgency = commandsCanStand && switchedOn ? 'DRINGEND: ' : '';
    return {
        subject: `${urgency}[Speichermanagement] Anlage ${plant.name || plant.member_identifier} seit ${age} ohne Meldung`,
        text: lines.join('\n')
    };
};

/**
 * Cron (alle 5 Minuten): verstummte Anlagen melden. Markiert wird erst nach
 * erfolgreichem Versand, ein Mailfehler fuehrt also zum Neuversuch im
 * naechsten Lauf.
 */
export const checkSilentPlants = async () => {
    let plants;
    try {
        plants = await findSilentPlants(SILENT_MINUTES);
    } catch (e) {
        console.error('checkSilentPlants: Abfrage fehlgeschlagen:', e instanceof Error ? e.message : e);
        return;
    }
    for (const plant of plants) {
        const mail = buildOfflineMail(plant);
        try {
            await relayPlain(mail.subject, mail.text);
            await markOfflineAlerted(plant.id);
            console.log(`checkSilentPlants: Offline-Alarm fuer Anlage ${plant.id} verschickt`);
        } catch (e) {
            console.error(`checkSilentPlants: Alarm fuer Anlage ${plant.id} fehlgeschlagen:`, e instanceof Error ? e.message : e);
        }
    }
};

/**
 * Entwarnung nach einem Offline-Alarm: erste Statusmeldung der Anlage
 * (POST /api/ibm/status/v1, `recovered`).
 *
 * @param {number} statusId - members_openhabstatus.id
 */
export const notifyPlantRecovered = async (statusId) => {
    const status = await getOpenhabStatus(statusId);
    if (!status) return;
    const label = `${status.name || 'ohne Namen'} (Mitglied ${status.member_identifier}, ${status.member_name})`;
    const failsafe = status.data?.failsafe;
    const lines = [
        `Die Anlage ${label} meldet wieder (${formatTime(status.last_seen)}).`,
        ''
    ];
    if (failsafe && typeof failsafe === 'object') {
        lines.push(
            `Letzter Eingriff des Fail-Safe-Timers am Pi: ${failsafe.ergebnis ?? '?'} am ${failsafe.zeit ?? '?'} (${failsafe.grund ?? ''}).`,
            ''
        );
    }
    lines.push(`Dashboard: ${DASHBOARD_URL}/${statusId}`);
    await relayPlain(`[Speichermanagement] Anlage ${status.name || status.member_identifier} meldet wieder`, lines.join('\n'));
};
