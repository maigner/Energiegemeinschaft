// Einrichtungsphasen der Zero-Touch-Provisionierung, wie sie der Pi an
// /api/ibm/provision/v1/result meldet (report_phase in lib/common.sh der
// Setup-Skripte). Anzeige fuer Vorstands-Dashboard und Mitgliederbereich.
// In Mitglieder-UIs heisst die Steuerung "Speichermanagement".

/** @type {{ key: string, label: string, progress: number, waiting?: boolean }[]} */
export const SETUP_PHASES = [
    { key: 'konfiguration', label: 'Konfiguration geladen', progress: 10 },
    { key: 'wechselrichter_suche', label: 'Wechselrichter wird gesucht', progress: 15 },
    { key: 'wechselrichter_unklar', label: 'Wechselrichter nicht eindeutig', progress: 15, waiting: true },
    { key: 'tunnel', label: 'Fernwartung', progress: 25 },
    { key: 'passwoerter', label: 'Passwörter', progress: 30 },
    { key: 'cloud', label: 'Cloud-Verbindung', progress: 35 },
    { key: 'addons', label: 'openHAB-Erweiterungen', progress: 45 },
    { key: 'wartet_auf_passwort', label: 'Wartet auf Wechselrichter-Passwort', progress: 50, waiting: true },
    { key: 'wechselrichter', label: 'Wechselrichter wird eingerichtet', progress: 60 },
    { key: 'items', label: 'Datenpunkte', progress: 70 },
    { key: 'regeln', label: 'Steuerung', progress: 80 },
    { key: 'overview', label: 'Oberfläche', progress: 90 },
    { key: 'fertig', label: 'Einrichtung abgeschlossen', progress: 100 }
];

/**
 * @param {string | null | undefined} phase
 * @returns {{ label: string, progress: number, waiting: boolean, failed: boolean, done: boolean }}
 */
export function describePhase(phase) {
    if (!phase) return { label: 'Noch nicht gestartet', progress: 0, waiting: false, failed: false, done: false };
    if (phase === 'geloescht') return { label: 'Wird gelöscht', progress: 0, waiting: true, failed: false, done: false };
    if (phase.startsWith('fehler')) {
        const step = phase.split(':')[1];
        const known = SETUP_PHASES.find((p) => p.key === step);
        return {
            label: `Fehler${known ? ` bei: ${known.label}` : ''}`,
            progress: known?.progress ?? 0,
            waiting: false,
            failed: true,
            done: false
        };
    }
    const known = SETUP_PHASES.find((p) => p.key === phase);
    if (!known) return { label: phase, progress: 0, waiting: false, failed: false, done: false };
    return {
        label: known.label,
        progress: known.progress,
        waiting: Boolean(known.waiting),
        failed: false,
        done: known.key === 'fertig'
    };
}
