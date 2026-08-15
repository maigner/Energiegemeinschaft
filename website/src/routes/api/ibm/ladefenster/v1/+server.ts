import { json } from '@sveltejs/kit';
import { getLatestForecastRun, getTodayChargeWindow, getIndividualChargeWindowEnd } from '$lib/server/db/energy/forecast';
import { getOpenhabPlantByToken } from '$lib/server/db/members/openhabStatus';

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
 * Abend-Deadline über das Erzeugungsprofil des Prognosetags, siehe
 * getIndividualChargeWindowEnd. `ende` null bei individuell=true heißt: die
 * Anlage braucht laut Profil den ganzen Tag zum Laden, heute keine Sperre.
 * Ohne Schätzwerte kommt das Community-Ende (individuell=false) -- die
 * Steuerung am Pi rechnet dann lokal weiter wie bisher.
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
    let ende = fenster.ende;
    let individuell = false;

    if (fenster.start && fenster.ende
        && Number.isFinite(capacity) && capacity >= 1 && capacity <= 100
        && Number.isFinite(rate) && rate >= 0.3 && rate <= 30) {
        const individualEnde = await getIndividualChargeWindowEnd(run.id, capacity, rate);
        // Ende vor Fensterbeginn (oder gar nicht erreichbar): keine Sperre.
        ende = individualEnde !== null && individualEnde > fenster.start && individualEnde >= '05:00'
            ? individualEnde
            : null;
        individuell = true;
    }

    return json({
        ladefenster: {
            datum: fenster.datum,
            start: fenster.start,
            ende,
            individuell
        }
    });
}
