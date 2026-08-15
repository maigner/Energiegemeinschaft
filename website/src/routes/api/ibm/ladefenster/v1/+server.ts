import { json } from '@sveltejs/kit';
import {
    getLatestForecastRun,
    getTodayChargeWindow,
    getIndividualChargeWindowEnd,
    getNightDischargeBudget,
    IBM_FALLBACK_HOUSE_LOAD_W
} from '$lib/server/db/energy/forecast';
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
 *
 * Zusätzlich (nur mit Schätzwerten): `nachtbudget_kwh` -- wie viel die
 * Anlage heute Nacht ins Netz einspeisen darf, ohne dass das Mitglied am
 * Folgetag selbst Strom zukaufen muss (siehe getNightDischargeBudget). Die
 * Steuerung entlädt nachts nur bis "Abend-Ladestand minus Budget"; bei einer
 * Mehrtages-Schlechtwetterfront ist das Budget 0 und die Batterie bleibt
 * dem eigenen Haushalt.
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
    let ende = fenster.ende;
    let individuell = false;
    let nachtbudgetKwh = null;

    if (plausibel && fenster.start && fenster.ende) {
        const individualEnde = await getIndividualChargeWindowEnd(run.id, capacity, rate);
        // Ende vor Fensterbeginn (oder gar nicht erreichbar): keine Sperre.
        ende = individualEnde !== null && individualEnde > fenster.start && individualEnde >= '05:00'
            ? individualEnde
            : null;
        individuell = true;
    }

    // Das Nachtbudget braucht nur die Ladeleistung; die gelernte Hauslast
    // der Anlage bestimmt die Eigenbedarfsreserve (Fallback, solange sie
    // noch nicht gepusht wird).
    if (plausibel) {
        const houseLoadW = Number(plant.data?.hauslast_w);
        nachtbudgetKwh = await getNightDischargeBudget(
            run.id,
            rate,
            Number.isFinite(houseLoadW) && houseLoadW >= 50 && houseLoadW <= 3000
                ? houseLoadW
                : IBM_FALLBACK_HOUSE_LOAD_W
        );
    }

    return json({
        ladefenster: {
            datum: fenster.datum,
            start: fenster.start,
            ende,
            individuell,
            nachtbudget_kwh: nachtbudgetKwh
        }
    });
}
