import { getFail2banOverview, PERIODS } from '$lib/server/db/security/fail2ban';

// /board/security: woher die von fail2ban auf s1 gesperrten Adressen
// kommen. Zeitraum und Jail stehen in der URL (?tage=30&jail=sshd), damit
// sich eine Ansicht verlinken laesst.

/** @type {import('./$types').PageServerLoad} */
export async function load({ url }) {
    const requested = Number(url.searchParams.get('tage') ?? 30);
    const days = PERIODS.includes(requested) ? requested : 30;
    // Der Jail-Name geht nur als Parameter in die Abfrage; unbekannte Namen
    // liefern schlicht nichts und fallen unten auf "alle" zurueck.
    const jailParam = (url.searchParams.get('jail') ?? '').slice(0, 64);

    let overview = await getFail2banOverview(days, jailParam);
    let jail = jailParam;
    if (overview.available && jail && !overview.jails?.some((/** @type {any} */ j) => j.jail === jail)) {
        jail = '';
        overview = await getFail2banOverview(days, '');
    }
    return { days, jail, periods: PERIODS, ...overview };
}
