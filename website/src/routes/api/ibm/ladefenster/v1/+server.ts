import { json } from '@sveltejs/kit';
import {
    getLatestForecastRun,
    getTodayChargeWindow,
    getIndividualChargeWindowEnd,
    getChargeFactorsToday,
    getTodayDischargeStart
} from '$lib/server/db/energy/forecast';
import {
    getOpenhabPlantByToken,
    getActiveFleetDischargeKw
} from '$lib/server/db/members/openhabStatus';

/**
 * Individualisiertes Ladesperre-Fenster für eine IBM-Anlage (Regel
 * ibm_ladesperre.js mit Status-Token).
 *
 * Body: { "token": "<geheim>" } -- dasselbe Token wie beim Status-Push
 * (POST statt GET, damit das Token in keinem Access-Log landet).
 *
 * Antwort: { ladefenster: { datum, start, ende, individuell } }.
 * Datum-Gültigkeit und Fensterbeginn (erster Sonnenschein) sind identisch
 * mit der öffentlichen Community-API (/api/eeginfo/ladefenster/v1). Das Ende
 * wird individualisiert, sobald die Anlage belastbare Schätzwerte gepusht
 * hat (batterie_kapazitaet, ladeleistung_kw): rückwärts von der
 * Abend-Deadline über das Erzeugungsprofil des Prognosetags, für die
 * Energie, die der zuletzt gemeldete Ladestand (soc) bis 95% noch braucht,
 * siehe getIndividualChargeWindowEnd. `ende` null bei individuell=true
 * heißt: heute keine Sperre. Das gilt auch für Anlagen, die noch keine
 * belastbaren Schätzwerte haben (neu eingerichtet, Ladeleistung noch nicht
 * gelernt): sie laden erst einmal ungebremst, statt blind das
 * Community-Fenster zu bekommen. individuell=false kommt nur noch, wenn
 * die Community heute gar kein Fenster hat.
 *
 * Das Nacht-Entladebudget liefert die API nicht mehr: die Steuerung am Pi
 * rechnet es selbst aus Batteriegroesse und gelernter Hauslast (siehe
 * control/core.js, Nacht-Entladebudget) und meldet es per Status-Push
 * (`nachtbudget_kwh`).
 *
 * `entladestart` -- ab wann die Nachteinspeisung heute beginnen soll
 * (siehe getTodayDischargeStart): erst wenn die Gemeinschaft laut Prognose
 * deutlich im Defizit ist, damit die Einspeisung bei den Mitgliedern landet
 * und nicht beim Energielieferanten. null, wenn die Prognose das nicht
 * hergibt; die Steuerung fällt dann auf Crossover plus Abstand zurück.
 *
 * Außerdem: `ladefaktoren` -- die stündlichen Ladefaktoren des heutigen
 * Tages samt Abend-Deadline (siehe getChargeFactorsToday). Die dynamische
 * Laderegelung am Pi integriert daraus die effektive Restladezeit. Die
 * Faktoren sind normiert (0..1) und brauchen keine Schätzwerte der Anlage;
 * null, wenn der Prognosetag keine Berechnung hergibt.
 */

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Body ist kein gültiges JSON' }, { status: 400 });
    }

    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token || token.length > 200) {
        return json({ error: "Feld 'token' fehlt oder ist ungültig" }, { status: 400 });
    }

    const plant = await getOpenhabPlantByToken(token);
    if (!plant) {
        console.log('ibm ladefenster rejected (unknown token)');
        return json({ error: 'Unbekanntes Token. Der Vorstand erzeugt Tokens auf ischlstrom.org unter /board/openhab.' }, { status: 401 });
    }

    console.log(`ibm ladefenster api called (anlage ${plant.id})`);

    const run = await getLatestForecastRun();
    if (!run) {
        return json({ error: 'Es liegt keine Energieprognose vor' }, { status: 404 });
    }

    const fenster = await getTodayChargeWindow(run.id);
    if (!fenster) {
        return json({ error: 'Für heute liegt keine Energieprognose vor' }, { status: 404 });
    }

    // Individualisieren nur mit plausiblen gepushten Schätzwerten (gleiche
    // Plausibilitätsfenster wie in control/core.js) und wenn die Community
    // heute überhaupt ein Fenster hat (sonst gibt es ohnehin keine Sperre).
    const capacity = Number(plant.data?.batterie_kapazitaet);
    const rate = Number(plant.data?.ladeleistung_kw);
    const plausibel = Number.isFinite(capacity) && capacity >= 1 && capacity <= 100
        && Number.isFinite(rate) && rate >= 0.3 && rate <= 30;
    const socRaw = Number(plant.data?.soc);
    const soc = Number.isFinite(socRaw) ? socRaw : null;
    let ende = fenster.ende;
    let individuell = false;

    if (fenster.start && fenster.ende) {
        if (plausibel) {
            const individualEnde = await getIndividualChargeWindowEnd(run.id, capacity, rate, soc);
            // Ende vor Fensterbeginn (oder gar nicht erreichbar): keine Sperre.
            ende = individualEnde !== null && individualEnde > fenster.start && individualEnde >= '05:00'
                ? individualEnde
                : null;
        } else {
            // Noch keine gelernten Kennwerte: erst einmal laden, keine Sperre.
            ende = null;
        }
        individuell = true;
    }

    const ladefaktoren = await getChargeFactorsToday(run.id);
    const entladestart = await getTodayDischargeStart(run.id, await getActiveFleetDischargeKw());

    return json({
        ladefenster: {
            datum: fenster.datum,
            start: fenster.start,
            ende,
            individuell,
            entladestart,
            ladefaktoren
        }
    });
}
