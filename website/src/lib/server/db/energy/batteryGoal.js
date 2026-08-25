// Hochrechnung "wie viele Batterien braucht die Nacht", gemeinsam genutzt
// von der Startseite und der IBM-Seite.
//
// Annahmen: rund die Haelfte der Kapazitaet steht am Abend fuer die
// Gemeinschaft zur Verfuegung (Mindest-Ladestand plus Vorrang des eigenen
// Haushalts), und eine weitere Batterie entspricht dem Durchschnitt der
// aktuell online gemeldeten Anlagen (bzw. 10 kWh, solange noch keine Kapazitaeten
// gemeldet sind).
const USABLE_SHARE = 0.5;
const DEFAULT_BATTERY_KWH = 10;

/**
 * Fortschritt zum Ziel "die Nacht aus Batterien decken", aus dem
 * durchschnittlichen Nachtbedarf der Energieprognose (/vorhersage) und der
 * aktuell online gemeldeten Batterieflotte (letzte Stunde).
 *
 * @param {{days: number, avg_night_deficit_kwh: number} | null} deficit
 * @param {{plants: number, capacity_kwh: number} | null} ibm
 */
export const buildBatteryGoal = (deficit, ibm) => {
    if (!deficit?.avg_night_deficit_kwh) return null;
    const nightKwh = deficit.avg_night_deficit_kwh;
    const plants = ibm?.plants ?? 0;
    const capacityKwh = ibm?.capacity_kwh ?? 0;
    const avgBatteryKwh =
        plants > 0 && capacityKwh > 0
            ? capacityKwh / plants
            : DEFAULT_BATTERY_KWH;
    const usableFleetKwh = capacityKwh * USABLE_SHARE;
    const missingKwh = Math.max(0, nightKwh - usableFleetKwh);
    return {
        nightKwh,
        forecastDays: deficit.days,
        plants,
        usableFleetKwh,
        usableShare: USABLE_SHARE,
        avgBatteryKwh,
        additionalBatteries: Math.ceil(
            missingKwh / (avgBatteryKwh * USABLE_SHARE),
        ),
        progressPercent: Math.min(
            100,
            Math.round((usableFleetKwh / nightKwh) * 100),
        ),
    };
};
