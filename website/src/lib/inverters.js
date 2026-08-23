// Anzeigenamen der Wechselrichter-Typen, die das IBM steuert. Die Slugs
// entsprechen den Profil-Verzeichnissen unter
// Batteriemanagement/openhab/inverters/ und kommen als inverter_type mit
// jeder Statusmeldung (ibm.conf: INVERTER_TYPE).
/** @type {Record<string, string>} */
const INVERTER_LABELS = {
    'fronius': 'Fronius GEN24',
    'fronius-snapinverter': 'Fronius Symo Hybrid (SnapINverter)',
    'sigenergy': 'Sigenergy SigenStor',
    'deye': 'Deye Hybrid',
    'victron': 'Victron Energy'
};

/**
 * Auswahlliste der Profile (fuer Formulare): [{ value, name }].
 */
export function inverterOptions() {
    return Object.entries(INVERTER_LABELS).map(([value, name]) => ({ value, name }));
}

/**
 * Anzeigename zu einem gemeldeten inverter_type; unbekannte Slugs werden
 * unveraendert angezeigt. null, wenn die Anlage (noch) keinen Typ meldet
 * (altes IBM-Paket).
 *
 * @param {unknown} type
 * @returns {string | null}
 */
export function inverterLabel(type) {
    if (typeof type !== 'string' || type.trim() === '') return null;
    return INVERTER_LABELS[type] ?? type;
}
