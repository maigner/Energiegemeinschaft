// Gesundheitsbewertung der IBM-Flotte fuer /board/openhab/health - reine
// Logik ohne Datenbank und ohne SvelteKit, damit sie auch gegen echte
// Datensaetze (z. B. aus members_openhabstatus) getestet werden kann.
//
// Jede Anlage bekommt eine feste Liste von Pruefungen (CHECKS), jede mit
// einer Stufe: ok, info (nur Hinweis), warn (ansehen), crit (handeln),
// unknown (keine Daten). Die Flottenpruefungen (fleetChecks) betreffen die
// Server-Seite, von der alle Anlagen abhaengen: Prognoselauf, heutige
// Fenster der Token-API und die woechentlichen Crossover-Zeiten.

import { compareVersions } from "$lib/versions";
import { inverterLabel } from "$lib/inverters";

/** @typedef {'ok' | 'info' | 'warn' | 'crit' | 'unknown'} Level */
/** @typedef {{ key: string, label: string, level: Level, text: string, detail?: string }} Check */

/** @type {Level[]} von harmlos nach dringend */
export const LEVEL_ORDER = ['unknown', 'ok', 'info', 'warn', 'crit'];

/** @type {{ key: string, label: string, title: string }[]} Spalten der Matrix, in dieser Reihenfolge */
export const CHECKS = [
    { key: 'meldung', label: 'Meldung', title: 'Letzte Statusmeldung der Anlage (minuetlich erwartet) und Meldeluecken der letzten 24 h' },
    { key: 'tunnel', label: 'Tunnel', title: 'WireGuard-Fernwartung: letzter Handshake mit s1 (Timer ibm-provision-sync stempelt ihn minuetlich)' },
    { key: 'paket', label: 'Paket', title: 'IBM-Paket der Anlage gegen den auf dem Server ausgelieferten Stand' },
    { key: 'wechselrichter', label: 'Wechselrichter', title: 'Verbindung zum Wechselrichter und Messwerte' },
    { key: 'betrieb', label: 'Betrieb', title: 'Hauptschalter, Pause und die Teilfunktionen Ladesperre/Entladung' },
    { key: 'netz', label: 'Netzladung', title: 'Netzladeschutz: laedt die Batterie aus dem Netz?' },
    { key: 'prognose', label: 'Prognose', title: 'Eingangsdaten der Steuerung: Ladefenster von heute, Wolkenvorschau, Wochen-Crossover, Ertragsprognose' },
    { key: 'nacht', label: 'Letzte Nacht', title: 'Nachteinspeisung der letzten Nacht: Ladestand abends/morgens, eingespeiste Energie, Einhaltung des Mindest-Ladestands' },
    { key: 'einspeisung', label: '7 Tage', title: 'Batterie-Netzeinspeisung der letzten sieben Tage (Zaehler der Anlage)' },
    { key: 'system', label: 'System', title: 'Pi-Systemzustand: SD-Karte, CPU-Temperatur, RAM, Swap, Neustarts, apt' },
    { key: 'log', label: 'Log', title: 'Warnungen und Fehler im openHAB-Log der letzten 24 h, nach Ursache gruppiert' },
];

/** @param {Level} a @param {Level} b */
export function worseLevel(a, b) {
    return LEVEL_ORDER.indexOf(a) >= LEVEL_ORDER.indexOf(b) ? a : b;
}

/** @param {number | null} seconds */
export function formatAge(seconds) {
    if (seconds === null || !Number.isFinite(seconds)) return 'nie';
    if (seconds < 90) return 'vor 1 Minute';
    if (seconds < 3600) return `vor ${Math.round(seconds / 60)} Minuten`;
    if (seconds < 5400) return 'vor 1 Stunde';
    if (seconds < 172800) return `vor ${Math.round(seconds / 3600)} Stunden`;
    return `vor ${Math.round(seconds / 86400)} Tagen`;
}

/** @param {unknown} v */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Sekunden seit einem ISO-Zeitstempel mit Zone, null wenn unlesbar.
 * @param {unknown} v @param {number} now
 */
function secondsSince(v, now) {
    if (typeof v !== 'string' || v.length === 0) return null;
    // openHAB-Zeitstempel: "2026-09-19T14:40:00.145+02:00[Europe/Vienna]"
    const t = new Date(v.replace(/\[.*\]$/, '')).getTime();
    return Number.isFinite(t) ? Math.max(0, (now - t) / 1000) : null;
}

/**
 * Meldungen des openHAB-Logs nach Ursache buendeln. Bekannte Muster
 * bekommen einen Namen und eine Stufe; jline-Konsolenrauschen zaehlt
 * nicht. Der Rest wird nach Level gezaehlt.
 * Verbindungsprobleme (Modbus, ischlstrom.org) sind meist voruebergehend
 * (naechtlicher IP-Wechsel des Datamanagers, kurzer Netzausfall): liegt
 * der letzte Eintrag laenger als eine Stunde zurueck, bleibt nur ein
 * Hinweis. `nowLocal` ist die aktuelle Zeit im Format der Logzeilen
 * ("YYYY-MM-DD HH:MM:SS", Lokalzeit der Anlage).
 * @param {any[]} entries
 * @param {string} [nowLocal]
 * @returns {{ groups: { label: string, count: number, level: Level, last: string }[], errors: number, warnings: number }}
 */
export function groupLogEntries(entries, nowLocal) {
    /** @type {{ test: RegExp, label: string, level: Level, transient?: boolean }[]} */
    const PATTERNS = [
        { test: /Battery control is not available/, label: 'Batteriesteuerung nicht verfügbar', level: 'crit' },
        { test: /Failed to execute battery control action/, label: 'Steuerbefehl fehlgeschlagen', level: 'warn' },
        { test: /Modbus|TCPMasterConnection|slaveId=/, label: 'Modbus-Verbindung', level: 'warn', transient: true },
        { test: /Keine Antwort von der API|UnknownHostException|Fatal transport error|TimeoutException/, label: 'ischlstrom.org nicht erreichbar', level: 'warn', transient: true },
        { test: /Socket\.IO|CloudClient|openhabcloud/, label: 'openHAB-Cloud getrennt', level: 'info' },
        { test: /Unexpected exception occurred while processing REST request/, label: 'REST-Anfrage fehlgeschlagen', level: 'info' },
        { test: /Accessing a closed input stream/, label: '', level: 'ok' },
    ];
    // Grenze fuer "laenger als eine Stunde her" im Format der Logzeilen
    const staleBefore = nowLocal && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(nowLocal)
        ? new Date(new Date(nowLocal.replace(' ', 'T')).getTime() - 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ')
        : null;
    /** @type {Map<string, { label: string, count: number, level: Level, last: string, transient: boolean }>} */
    const groups = new Map();
    let errors = 0;
    let warnings = 0;
    for (const e of entries) {
        const message = typeof e?.message === 'string' ? e.message : '';
        const time = typeof e?.time === 'string' ? e.time : '';
        const level = e?.level === 'ERROR' ? 'ERROR' : 'WARN';
        const known = PATTERNS.find((p) => p.test.test(message));
        if (known && known.label === '') continue;
        if (level === 'ERROR') errors++; else warnings++;
        const label = known ? known.label : (level === 'ERROR' ? 'sonstige Fehler' : 'sonstige Warnungen');
        /** @type {Level} */
        const lvl = known ? known.level : (level === 'ERROR' ? 'warn' : 'info');
        const g = groups.get(label) ?? { label, count: 0, level: lvl, last: '', transient: known?.transient === true };
        g.count++;
        if (time > g.last) g.last = time;
        groups.set(label, g);
    }
    for (const g of groups.values()) {
        if (g.transient && g.level === 'warn' && staleBefore && g.last && g.last < staleBefore) g.level = 'info';
    }
    return {
        groups: [...groups.values()].map(({ transient, ...g }) => g).sort((a, b) => LEVEL_ORDER.indexOf(b.level) - LEVEL_ORDER.indexOf(a.level) || b.count - a.count),
        errors,
        warnings
    };
}

/**
 * Pruefungen einer Anlage.
 *
 * @param {any} plant Zeile aus getFleetHealthPlants (data = letzte Statusmeldung)
 * @param {any} stats Zeile aus getFleetHealthStats oder null
 * @param {{ now: number, today: string, serverIbmVersion: string | null, systemMetrics: any[] }} ctx
 *   now: Zeitpunkt in ms, today: 'YYYY-MM-DD' (Europe/Vienna), systemMetrics:
 *   SYSTEM_METRICS aus ibmSystemAlerts.js (Schwellen der Signal-Alarme)
 * @returns {{ checks: Check[], worst: Level }}
 */
export function plantChecks(plant, stats, ctx) {
    const d = plant.data ?? {};
    /** @type {Check[]} */
    const checks = [];
    /** @param {Check} c */
    const add = (c) => checks.push(c);

    // --- Meldung ------------------------------------------------------------
    const age = num(Number(plant.age_seconds));
    if (plant.last_seen === null || age === null) {
        add({ key: 'meldung', label: 'Meldung', level: 'unknown', text: 'noch nie' });
    } else {
        const pushes = num(stats?.pushes_24h);
        const gaps = pushes !== null && pushes < 270 ? ` · nur ${pushes} von 288 Meldungen in 24 h` : '';
        /** @type {Level} */
        let level = age < 15 * 60 ? 'ok' : age < 3600 ? 'warn' : 'crit';
        if (level === 'ok' && gaps) level = 'warn';
        add({
            key: 'meldung', label: 'Meldung', level,
            text: formatAge(age) + (plant.offline_alerted_at ? ' · Offline-Alarm offen' : ''),
            detail: `Letzte Meldung ${formatAge(age)}${gaps}`
        });
    }

    // --- Tunnel -------------------------------------------------------------
    if (!plant.wg_configured) {
        add({ key: 'tunnel', label: 'Tunnel', level: 'unknown', text: 'nicht eingerichtet' });
    } else {
        const hs = num(Number(plant.handshake_age_seconds));
        if (plant.wg_handshake_at === null || hs === null) {
            add({ key: 'tunnel', label: 'Tunnel', level: 'unknown', text: 'unbekannt', detail: 'Kein Handshake gestempelt: der Timer ibm-provision-sync auf s1 kennt die Spalte wg_handshake_at noch nicht, oder es gab nie einen Handshake.' });
        } else {
            add({
                key: 'tunnel', label: 'Tunnel',
                level: hs < 5 * 60 ? 'ok' : hs < 3600 ? 'warn' : 'crit',
                text: hs < 5 * 60 ? 'steht' : `weg ${formatAge(hs)}`,
                detail: `Letzter Handshake ${formatAge(hs)} (${plant.wg_address})`
            });
        }
    }

    // --- Paket --------------------------------------------------------------
    const ibm = typeof d.versions?.ibm === 'string' ? d.versions.ibm : null;
    if (!ibm) {
        add({ key: 'paket', label: 'Paket', level: 'unknown', text: 'unbekannt' });
    } else if (ctx.serverIbmVersion && compareVersions(ibm, ctx.serverIbmVersion) < 0) {
        add({ key: 'paket', label: 'Paket', level: plant.update_requested_at ? 'info' : 'warn', text: plant.update_requested_at ? 'Update angefordert' : 'veraltet', detail: `Anlage ${ibm}, Server ${ctx.serverIbmVersion}` });
    } else {
        add({ key: 'paket', label: 'Paket', level: 'ok', text: 'aktuell', detail: ibm });
    }

    // --- Wechselrichter -----------------------------------------------------
    const profil = inverterLabel(plant.inverter_type || d.inverter_type || '') ?? 'Profil unbekannt';
    const soc = num(d.soc);
    if (plant.last_seen === null) {
        add({ key: 'wechselrichter', label: 'Wechselrichter', level: 'unknown', text: '-' });
    } else if (d.inverter_status && d.inverter_status !== 'ONLINE') {
        add({ key: 'wechselrichter', label: 'Wechselrichter', level: 'crit', text: String(d.inverter_status), detail: profil });
    } else if (soc === null) {
        add({ key: 'wechselrichter', label: 'Wechselrichter', level: 'warn', text: 'keine Messwerte', detail: `${profil}: die Anlage meldet keinen Ladestand` });
    } else {
        const kap = num(d.batterie_kapazitaet);
        add({ key: 'wechselrichter', label: 'Wechselrichter', level: 'ok', text: `${Math.round(soc)}%`, detail: `${profil}${kap ? `, ~${kap} kWh` : ''}, Ladestand ${Math.round(soc)}%` });
    }

    // --- Betrieb ------------------------------------------------------------
    if (plant.last_seen === null) {
        add({ key: 'betrieb', label: 'Betrieb', level: 'unknown', text: '-' });
    } else if (d.hauptschalter === 'OFF') {
        add({ key: 'betrieb', label: 'Betrieb', level: 'warn', text: 'aus', detail: 'Hauptschalter AUS: das Batteriemanagement ruehrt den Wechselrichter nicht an' });
    } else {
        const pause = num(d.pause_tage) ?? 0;
        const parts = [];
        if (pause > 0) parts.push(`pausiert (${pause} Tag${pause === 1 ? '' : 'e'})`);
        if (d.ladesperre_aktiv === 'OFF') parts.push('Ladesperre aus');
        if (d.entladung_aktiv === 'OFF') parts.push('Entladung aus');
        add({ key: 'betrieb', label: 'Betrieb', level: parts.length ? 'info' : 'ok', text: parts.length ? parts.join(', ') : 'ein', detail: parts.length ? parts.join(', ') : 'Hauptschalter, Ladesperre und Entladung ein' });
    }

    // --- Netzladung ---------------------------------------------------------
    const netzladung = num(d.netzladung_w) ?? 0;
    const netz7 = num(stats?.netzladung_7d) ?? 0;
    if (plant.last_seen === null) {
        add({ key: 'netz', label: 'Netzladung', level: 'unknown', text: '-' });
    } else if (netzladung > 0) {
        add({ key: 'netz', label: 'Netzladung', level: 'crit', text: `${Math.round(netzladung)} W jetzt`, detail: 'Die Batterie laedt gerade netto aus dem Netz (Netzladeschutz greift nach drei Zyklen)' });
    } else if (netz7 > 0) {
        // Einzelne Zyklen sind Messrauschen in der Daemmerung; ab einer
        // Stunde (12 Zyklen) in sieben Tagen lohnt ein Blick.
        add({ key: 'netz', label: 'Netzladung', level: netz7 >= 12 ? 'warn' : 'info', text: `${netz7}× in 7 Tagen`, detail: `${netz7} Zyklen (je 5 min) mit erkannter Netto-Netzladung in den letzten sieben Tagen` });
    } else if (d.netzladeschutz === 'OFF') {
        add({ key: 'netz', label: 'Netzladung', level: 'info', text: 'Schutz aus', detail: 'Netzladeschutz ist abgeschaltet' });
    } else {
        add({ key: 'netz', label: 'Netzladung', level: 'ok', text: 'keine' });
    }

    // --- Prognose-Eingaenge -------------------------------------------------
    if (plant.last_seen === null) {
        add({ key: 'prognose', label: 'Prognose', level: 'unknown', text: '-' });
    } else {
        const probs = [];
        /** @type {Level} */
        let level = 'ok';
        const datum = typeof d.ladesperre_datum === 'string' ? d.ladesperre_datum : '';
        if (datum !== ctx.today) {
            probs.push(datum ? `Ladefenster vom ${datum}` : 'kein Ladefenster');
            level = worseLevel(level, 'warn');
        }
        const wolkenAge = secondsSince(d.wolkenvorschau_zeit, ctx.now);
        if (wolkenAge === null || wolkenAge > 3 * 3600) {
            probs.push(wolkenAge === null ? 'keine Wolkenvorschau' : `Wolkenvorschau ${formatAge(wolkenAge)}`);
            level = worseLevel(level, 'warn');
        }
        if (d.crossover_start === '-' || d.crossover_ende === '-' || !d.crossover_start) {
            probs.push('kein Wochen-Crossover');
            level = worseLevel(level, 'warn');
        }
        if (num(d.ertragsprognose) === null) {
            probs.push('keine Ertragsprognose');
            level = worseLevel(level, 'info');
        }
        const fenster = [
            d.entladestart && d.entladestart !== '-' ? `Entladung ${d.entladestart}-${d.entladeende && d.entladeende !== '-' ? d.entladeende : '?'}` : 'Entladung nach Wochen-Crossover',
            d.crossover_start && d.crossover_start !== '-' ? `Crossover ${String(d.crossover_start).slice(0, 5)}-${String(d.crossover_ende).slice(0, 5)}` : null,
            num(d.ertragsprognose) !== null ? `Ertrag ${Math.round(Number(d.ertragsprognose))}%` : null
        ].filter(Boolean).join(', ');
        add({ key: 'prognose', label: 'Prognose', level, text: probs.length ? probs.join(', ') : 'aktuell', detail: fenster });
    }

    // --- Letzte Nacht -------------------------------------------------------
    const minSoc = num(d.min_battery_charge);
    const morning = num(stats?.soc_morning);
    const evening = num(stats?.soc_evening);
    const nightKwh = num(stats?.night_feed_kwh);
    const nightMin = num(stats?.night_min_soc_feeding);
    const nightHours = num(stats?.night_feed_hours);
    if (!stats || (morning === null && evening === null && nightKwh === null)) {
        add({ key: 'nacht', label: 'Letzte Nacht', level: 'unknown', text: 'keine Daten' });
    } else {
        /** @type {Level} */
        let level = 'ok';
        const parts = [];
        const belowKwh = num(stats?.night_below_min_kwh) ?? 0;
        const below7 = num(stats?.below_min_7d) ?? 0;
        if (nightMin !== null && minSoc !== null && nightMin < minSoc - 1 && belowKwh >= 0.5) {
            level = 'crit';
            parts.push(`bis ${nightMin}% eingespeist (Minimum ${minSoc}%, ${belowKwh.toLocaleString('de-AT')} kWh darunter)`);
        } else if (below7 >= 6) {
            level = 'warn';
            parts.push(`${(below7 * 5 / 60).toLocaleString('de-AT', { maximumFractionDigits: 1 })} h in 7 Tagen unter dem Minimum eingespeist`);
        } else if (morning !== null && minSoc !== null && morning < minSoc + 5 && (nightKwh ?? 0) > 0.5) {
            level = 'warn';
            parts.push(`morgens ${morning}% (Minimum ${minSoc}%)`);
        }
        if (d.hauptschalter === 'OFF' && level === 'ok') level = 'info';
        const summary = `${evening !== null ? `${evening}%` : '?'} → ${morning !== null ? `${morning}%` : '?'}, ${nightKwh !== null ? nightKwh.toLocaleString('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '0'} kWh`;
        add({
            key: 'nacht', label: 'Letzte Nacht', level,
            text: parts.length ? parts[0] : summary,
            detail: `Ladestand 19:00 → 06:00: ${summary}${nightHours ? ` in ${nightHours.toLocaleString('de-AT')} h` : ''}${parts.length ? ` · ${parts.join(', ')}` : ''}`
        });
    }

    // --- Einspeisung 7 Tage -------------------------------------------------
    const feed7 = num(stats?.feed_7d_kwh);
    const kap = num(d.batterie_kapazitaet);
    if (feed7 === null) {
        add({ key: 'einspeisung', label: '7 Tage', level: 'unknown', text: '-' });
    } else {
        const idle = feed7 < 0.5 && d.hauptschalter !== 'OFF' && (kap ?? 0) >= 5 && plant.last_seen !== null;
        add({
            key: 'einspeisung', label: '7 Tage',
            level: idle ? 'warn' : 'ok',
            text: `${feed7.toLocaleString('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh`,
            detail: idle ? `Keine Netzeinspeisung aus der Batterie trotz ~${kap} kWh Speicher und eingeschaltetem Management` : `Batterie-Netzeinspeisung der letzten sieben Tage, ~${(feed7 / 7).toLocaleString('de-AT', { maximumFractionDigits: 1 })} kWh je Tag`
        });
    }

    // --- System -------------------------------------------------------------
    const system = d.system;
    if (!system || typeof system !== 'object') {
        add({ key: 'system', label: 'System', level: 'unknown', text: '-' });
    } else {
        const probs = [];
        /** @type {Level} */
        let level = 'ok';
        for (const m of ctx.systemMetrics) {
            const v = m.value(system);
            if (v === null) continue;
            if (v >= m.raise) {
                probs.push(`${m.label} ${m.format(v)}`);
                level = worseLevel(level, m.key === 'disk' && v >= 90 || m.key === 'temp' && v >= 70 ? 'crit' : 'warn');
            }
        }
        const boots = num(stats?.boots_7d) ?? 0;
        if (boots > 1) { probs.push(`${boots - 1} Neustart${boots - 1 === 1 ? '' : 'e'} in 7 Tagen`); level = worseLevel(level, 'info'); }
        if (system.reboot_required) { probs.push('Neustart erforderlich'); level = worseLevel(level, 'info'); }
        const pending = num(d.apt_updates?.pending) ?? 0;
        if (pending > 0) { probs.push(`${pending} apt-Updates`); level = worseLevel(level, 'info'); }
        const temp = num(system.cpu_temp_c);
        const disk = num(system.disk_used_pct);
        const okText = [temp !== null ? `${Math.round(temp)} °C` : null, disk !== null ? `SD ${Math.round(disk)}%` : null].filter(Boolean).join(', ');
        add({ key: 'system', label: 'System', level, text: probs.length ? probs.join(', ') : okText || 'ok', detail: `${okText}${probs.length ? ` · ${probs.join(', ')}` : ''}` });
    }

    // --- Log ----------------------------------------------------------------
    if (!Array.isArray(d.log_entries)) {
        add({ key: 'log', label: 'Log', level: 'unknown', text: '-' });
    } else {
        // Lokalzeit der Anlage im Format der Logzeilen; alle Anlagen laufen in Europe/Vienna
        const nowLocal = new Date(ctx.now).toLocaleString('sv-SE', { timeZone: 'Europe/Vienna' });
        const g = groupLogEntries(d.log_entries, nowLocal);
        if (g.groups.length === 0) {
            add({ key: 'log', label: 'Log', level: 'ok', text: 'ruhig' });
        } else {
            /** @type {Level} */
            let level = 'ok';
            for (const grp of g.groups) level = worseLevel(level, grp.level);
            add({
                key: 'log', label: 'Log', level,
                text: g.groups.slice(0, 2).map((grp) => `${grp.count}× ${grp.label}`).join(', ') + (g.groups.length > 2 ? ', …' : ''),
                detail: g.groups.map((grp) => `${grp.count}× ${grp.label} (zuletzt ${grp.last.slice(5, 16)})`).join(' · ')
            });
        }
    }

    /** @type {Level} */
    let worst = 'unknown';
    for (const c of checks) worst = worseLevel(worst, c.level);
    return { checks, worst };
}

/**
 * Flottenpruefungen (Server-Seite).
 *
 * @param {{
 *   forecastRun: { ageSeconds: number, dataUntil: string } | null,
 *   windows: { start: string | null, ende: string | null, crossover: string | null, entladestart: string | null, entladeende: string | null, fleetKw: number } | null,
 *   crossoverWeeks: { week: number, morning: string, evening: string, days: number }[],
 *   forecastDays: { day: string, morning: string | null, evening: string | null }[],
 *   currentWeek: number,
 *   plants: { worst: Level, checks: Check[] }[]
 * }} input
 * @returns {Check[]}
 */
export function fleetChecks(input) {
    /** @type {Check[]} */
    const out = [];

    if (!input.forecastRun) {
        out.push({ key: 'prognoselauf', label: 'Prognoselauf', level: 'crit', text: 'keine Prognose gespeichert', detail: 'eeg-forecast.timer auf s1 (taeglich 05:30) hat nichts geschrieben' });
    } else {
        const a = input.forecastRun.ageSeconds;
        out.push({ key: 'prognoselauf', label: 'Prognoselauf', level: a > 36 * 3600 ? 'crit' : a > 26 * 3600 ? 'warn' : 'ok', text: formatAge(a), detail: `Messdaten bis ${input.forecastRun.dataUntil}` });
    }

    const w = input.windows;
    if (w) {
        const lade = w.start && w.ende ? `Ladesperre ${w.start}-${w.ende}` : w.start ? `Sonne ab ${w.start}, kein Sperr-Ende` : 'kein Ladefenster';
        const entl = w.entladestart ? `Entladung ${w.entladestart}-${w.entladeende ?? 'Wochen-Crossover'}` : 'Entladung nach Wochen-Crossover + 60 min';
        const cross = w.crossover ? `Crossover ${w.crossover}` : 'heute kein Gemeinschafts-Ueberschuss';
        out.push({
            key: 'fenster', label: 'Fenster heute',
            level: w.crossover ? 'ok' : 'info',
            text: `${lade} · ${entl} · ${cross}`,
            detail: `Token-API fuer die Anlagen; Flotten-Entladeleistung ${w.fleetKw.toLocaleString('de-AT', { maximumFractionDigits: 1 })} kW`
        });
    }

    const byWeek = new Map(input.crossoverWeeks.map((c) => [c.week, c]));
    const cw = byWeek.get(input.currentWeek);
    if (!cw) {
        out.push({ key: 'crossover', label: `Wochen-Crossover KW ${input.currentWeek}`, level: 'crit', text: 'keine Zeiten', detail: 'Die Sicht energy_community_weekly_crossover_times hat fuer diese Woche keine Zeile: die API antwortet 404, die Anlagen entladen ohne Crossover-Zeiten nicht.' });
    } else {
        out.push({ key: 'crossover', label: `Wochen-Crossover KW ${input.currentWeek}`, level: cw.days < 4 ? 'warn' : 'ok', text: `${cw.morning}-${cw.evening}`, detail: `Klimamittel ueber ${cw.days} Tag${cw.days === 1 ? '' : 'e'} des Jahres` });
    }
    const missing = [];
    for (let i = 1; i <= 8; i++) {
        const wk = ((input.currentWeek - 1 + i) % 52) + 1;
        if (!byWeek.has(wk)) missing.push(wk);
    }
    if (missing.length) {
        out.push({ key: 'winter', label: 'Kommende Wochen', level: missing[0] === ((input.currentWeek % 52) + 1) ? 'warn' : 'info', text: `KW ${missing.join(', ')} ohne Crossover-Zeiten`, detail: 'In diesen Wochen bekommen die Anlagen keine Wochen-Crossover-Zeiten (Winterluecke) und entladen nur, wenn die Tagesprognose Entladestart und -ende liefert.' });
    }

    const noSurplus = input.forecastDays.filter((f) => !f.morning);
    if (noSurplus.length) {
        out.push({ key: 'ueberschuss', label: 'Prognosetage ohne Ueberschuss', level: 'info', text: noSurplus.map((f) => f.day.slice(5)).join(', '), detail: 'Tage, an denen die Gemeinschaft laut Prognose nie mehr erzeugt als verbraucht: keine Ladesperre, Entladung nach Wochen-Crossover' });
    }

    const crit = input.plants.filter((p) => p.worst === 'crit').length;
    const warn = input.plants.filter((p) => p.worst === 'warn').length;
    out.push({ key: 'anlagen', label: 'Anlagen', level: crit ? 'crit' : warn ? 'warn' : 'ok', text: `${input.plants.length} Anlagen, ${crit} kritisch, ${warn} mit Warnung` });

    return out;
}
