import { error } from '@sveltejs/kit';
import { getBatteryCalculatorSeries, isBatteryCalculatorEnabled } from '$lib/server/db/energy/batteryCalculator';

/**
 * Mitgliederbereich "Speicherrechner": schlaegt aus dem eigenen Bezugs- und
 * Einspeiseprofil eine Speichergroesse vor. Nur fuer den Standort des
 * angemeldeten Mitglieds (gleiche Pruefung wie /user/[memberId]) und in
 * der Pilotphase nur fuer freigeschaltete Mitglieder (PILOT_MEMBERS). Die
 * Viertelstundenwerte eines Jahres gehen an den Browser, gerechnet wird
 * dort ($lib/batteryCalculator.js); die Abfrage dauert rund zwei Sekunden
 * und wird deshalb gestreamt.
 */

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, parent }) {
    const { session, users } = await parent();
    const valid = (users ?? []).filter((/** @type {{ identifier: number; email: any; }} */ user) =>
        user.identifier === parseInt(params.memberId)
        && user.email?.toLowerCase() === session?.user?.email?.toLowerCase());
    if (valid.length === 0) {
        console.log(`unauthorized access attempt on /user/${params.memberId}/speicherrechner`);
        error(403, 'not a valid user');
    }
    const user = valid[0];
    if (!isBatteryCalculatorEnabled(user.identifier)) {
        error(404, 'not found');
    }

    return {
        user,
        series: getBatteryCalculatorSeries(user.identifier).catch((e) => {
            console.error('speicherrechner: failed to load series:', e?.message ?? e);
            return { failed: true };
        }),
    };
}
