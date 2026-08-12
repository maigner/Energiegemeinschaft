// Versionsvergleich fuer das openHAB-Anlagen-Dashboard: die Anlagen melden
// Versionsstaende (IBM-Paket "2026-08-12 (1085151)", openHAB "4.3.2", Java,
// OS) im Status-Push; das Dashboard hebt Anlagen hervor, die aelter als der
// neueste Stand der Flotte sind.

/**
 * Natuerlicher Vergleich zweier Versions-/Datumsstrings: Ziffernbloecke
 * werden numerisch verglichen, Text dazwischen alphabetisch - damit ist
 * "4.10.0" neuer als "4.9.0" und "2026-08-12 ..." neuer als "2026-07-30 ...".
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} negativ wenn a aelter, 0 bei gleichem Stand, positiv wenn a neuer
 */
export function compareVersions(a, b) {
    const ta = String(a).match(/\d+|\D+/g) ?? [];
    const tb = String(b).match(/\d+|\D+/g) ?? [];
    for (let i = 0; i < Math.max(ta.length, tb.length); i++) {
        const x = ta[i] ?? "";
        const y = tb[i] ?? "";
        if (x === y) continue;
        const nx = Number(x);
        const ny = Number(y);
        if (Number.isFinite(nx) && Number.isFinite(ny)) {
            if (nx !== ny) return nx - ny;
            continue; // "07" und "7" sind gleich
        }
        return x < y ? -1 : 1;
    }
    return 0;
}

/**
 * Neuester Stand aus einer Liste von Versionsstrings; null/undefined-Eintraege
 * (Anlagen ohne Versionsmeldung) werden ignoriert.
 *
 * @param {(string | null | undefined)[]} values
 * @returns {string | null} null, wenn keine Anlage einen Stand meldet
 */
export function newestVersion(values) {
    let newest = null;
    for (const value of values) {
        if (typeof value !== "string" || value.length === 0) continue;
        if (newest === null || compareVersions(value, newest) > 0) {
            newest = value;
        }
    }
    return newest;
}
