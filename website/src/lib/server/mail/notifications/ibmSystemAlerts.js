// Systemalarme fuer die Pis des Speichermanagements - nur per Signal.
//
// Jede Anlage meldet alle 5 Minuten mit der vollen Statusmeldung ihren
// Systemzustand (status_push.js, collectSystemHealth): CPU-Temperatur,
// Belegung der SD-Karte, RAM und Swap. Das Dashboard faerbt die Werte,
// aber niemand schaut staendig hin. Deshalb prueft der Cron
// checkSystemAlerts (alle 5 Minuten) die zuletzt gemeldeten Werte aller
// Anlagen gegen feste Schwellen und schickt je Anlage und Kennzahl genau
// eine Signal-Nachricht, wenn die Schwelle ueberschritten wird, und eine
// Entwarnung, sobald der Wert wieder darunter liegt. Damit ein Wert, der
// um die Schwelle pendelt, nicht alle paar Minuten eine Meldung ausloest,
// liegt die Entwarnungsschwelle etwas tiefer (Hysterese).
//
// Der Stand der offenen Alarme liegt je Anlage in
// members_openhabstatus.system_alerts ({ kennzahl: ISO-Zeitpunkt }), damit
// er einen Neustart der Website ueberlebt. Ohne SIGNAL_* in .env tut der
// Cron nichts - eine Mail gibt es fuer diese Alarme bewusst nicht, das
// Postfach ist fuer Betriebswarnungen der falsche Ort.

import { findPlantsForSystemCheck, setSystemAlerts } from '$lib/server/db/members/openhabStatus';
import { env } from '$env/dynamic/private';
import { signalConfigFromEnv, sendSignal } from '$lib/server/signal';

// Anlagen, die laenger nichts gemeldet haben, werden nicht geprueft (ihre
// Werte waeren veraltet; fuer den Ausfall selbst gibt es den Offline-Alarm).
const FRESH_MINUTES = 15;

const DASHBOARD_URL = 'https://ischlstrom.org/board/openhab';

/**
 * Die ueberwachten Kennzahlen. `value` liest den Wert aus data->'system'
 * (null = nicht gemeldet, dann keine Aussage), `raise` ist die Schwelle,
 * ab der alarmiert wird, `clear` die, unter der die Entwarnung kommt.
 *
 * @type {Array<{ key: string, label: string, raise: number, clear: number,
 *                value: (system: Record<string, any>) => number | null,
 *                format: (value: number) => string, limit: string }>}
 */
// Auch die Flotten-Gesundheitsseite (/board/openhab/health, $lib/ibmHealth.js)
// faerbt die Systemwerte nach diesen Schwellen.
export const SYSTEM_METRICS = [
    {
        key: 'disk',
        label: 'SD-Karte',
        raise: 70,
        clear: 65,
        value: (system) => numberOrNull(system.disk_used_pct),
        format: (v) => `${Math.round(v)}% belegt`,
        limit: 'Grenze 70%'
    },
    {
        key: 'temp',
        label: 'CPU-Temperatur',
        raise: 60,
        clear: 55,
        value: (system) => numberOrNull(system.cpu_temp_c),
        format: (v) => `${(Math.round(v * 10) / 10).toLocaleString('de-AT')} °C`,
        limit: 'Grenze 60 °C'
    },
    {
        key: 'mem',
        label: 'RAM',
        raise: 50,
        clear: 45,
        value: (system) => {
            const total = numberOrNull(system.mem_total_mb);
            const used = numberOrNull(system.mem_used_mb);
            return total && used !== null ? (used / total) * 100 : null;
        },
        format: (v) => `${Math.round(v)}% belegt`,
        limit: 'Grenze 50%'
    },
    {
        // "Swap wird benutzt": jedes belegte MB loest aus, die Entwarnung
        // kommt erst, wenn der Swap wieder ganz leer ist.
        key: 'swap',
        label: 'Swap',
        raise: 1,
        clear: 1,
        value: (system) => numberOrNull(system.swap_used_mb),
        format: (v) => `${Math.round(v)} MB belegt`,
        limit: 'Grenze: gar keiner'
    }
];

/** @param {unknown} v */
const numberOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Neuen Alarmstand einer Anlage aus den gemeldeten Werten ableiten.
 * Exportiert fuer Tests von Hand; ohne Nebenwirkungen.
 *
 * @param {Record<string, any>} system - data->'system' der Anlage
 * @param {Record<string, string>} current - offene Alarme (Kennzahl -> ISO)
 * @param {Date} now
 * @returns {{ alerts: Record<string, string>, raised: typeof SYSTEM_METRICS, cleared: typeof SYSTEM_METRICS, values: Record<string, number | null> }}
 */
export const evaluateSystemAlerts = (system, current, now) => {
    const alerts = { ...current };
    const raised = [];
    const cleared = [];
    /** @type {Record<string, number | null>} */
    const values = {};
    for (const metric of SYSTEM_METRICS) {
        const value = metric.value(system);
        values[metric.key] = value;
        // Kein Wert gemeldet: Stand unveraendert lassen, weder Alarm noch
        // Entwarnung - die naechste volle Meldung bringt den Wert wieder.
        if (value === null) continue;
        const open = Object.prototype.hasOwnProperty.call(alerts, metric.key);
        if (!open && value >= metric.raise) {
            alerts[metric.key] = now.toISOString();
            raised.push(metric);
        } else if (open && value < metric.clear) {
            delete alerts[metric.key];
            cleared.push(metric);
        }
    }
    return { alerts, raised, cleared, values };
};

/**
 * @param {{ name: string, member_identifier: string, member_name: string }} plant
 */
const plantLabel = (plant) => `${plant.name || 'ohne Namen'} (Mitglied ${plant.member_identifier}, ${plant.member_name})`;

/**
 * Nachricht fuer eine Anlage: erst die neuen Alarme, dann die Entwarnungen,
 * dazu die weiterhin offenen Alarme, damit die Meldung fuer sich steht.
 *
 * @param {Parameters<typeof plantLabel>[0] & { id: number }} plant
 * @param {ReturnType<typeof evaluateSystemAlerts>} result
 */
const buildSignalText = (plant, result) => {
    const lines = [];
    const describe = (/** @type {typeof SYSTEM_METRICS[number]} */ m) => `${m.label} ${m.format(/** @type {number} */ (result.values[m.key]))}`;
    if (result.raised.length) {
        lines.push(`Speichermanagement, Pi ${plantLabel(plant)}:`);
        for (const m of result.raised) lines.push(`- ${describe(m)} (${m.limit})`);
    }
    if (result.cleared.length) {
        lines.push(result.raised.length ? 'Entwarnung:' : `Entwarnung Speichermanagement, Pi ${plantLabel(plant)}:`);
        for (const m of result.cleared) lines.push(`- ${describe(m)} (${m.limit})`);
    }
    const stillOpen = SYSTEM_METRICS.filter((m) => result.alerts[m.key] && !result.raised.includes(m));
    if (stillOpen.length) {
        lines.push(`Weiterhin offen: ${stillOpen.map(describe).join(', ')}.`);
    }
    lines.push(`${DASHBOARD_URL}/${plant.id}`);
    return lines.join('\n');
};

/**
 * Cron (alle 5 Minuten): Systemwerte aller frisch meldenden Anlagen
 * pruefen, Ein- und Austritte per Signal melden und den Stand speichern.
 * Gespeichert wird nur, was auch verschickt wurde - scheitert Signal,
 * versucht es der naechste Lauf mit den dann aktuellen Werten erneut.
 */
export const checkSystemAlerts = async () => {
    const signal = signalConfigFromEnv(env);
    if (!signal) return;
    let plants;
    try {
        plants = await findPlantsForSystemCheck(FRESH_MINUTES);
    } catch (e) {
        console.error('checkSystemAlerts: Abfrage fehlgeschlagen:', e instanceof Error ? e.message : e);
        return;
    }
    const now = new Date();
    for (const plant of plants) {
        const current = plant.system_alerts && typeof plant.system_alerts === 'object' ? plant.system_alerts : {};
        const result = evaluateSystemAlerts(plant.system ?? {}, current, now);
        if (!result.raised.length && !result.cleared.length) continue;
        try {
            await sendSignal(signal, buildSignalText(plant, result));
        } catch (e) {
            console.error(`checkSystemAlerts: Signal fuer Anlage ${plant.id} fehlgeschlagen:`, e instanceof Error ? e.message : e);
            continue;
        }
        try {
            await setSystemAlerts(plant.id, result.alerts);
            console.log(`checkSystemAlerts: Anlage ${plant.id}: Alarm ${result.raised.map((m) => m.key).join(',') || '-'}, Entwarnung ${result.cleared.map((m) => m.key).join(',') || '-'}`);
        } catch (e) {
            console.error(`checkSystemAlerts: Speichern fuer Anlage ${plant.id} fehlgeschlagen:`, e instanceof Error ? e.message : e);
        }
    }
};
