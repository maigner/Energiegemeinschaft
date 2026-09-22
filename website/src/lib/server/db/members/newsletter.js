// Empfaengerliste fuer den Newsletter (keila auf s1, newsletter.ischlstrom.org):
// alle Mitglieder mit mindestens einem aktiven Zaehlpunkt, zusammengefasst
// je E-Mail-Adresse. Keila kennt je Projekt genau einen Kontakt pro Adresse;
// mehrere Mitgliedsnummern mit derselben Adresse (Betriebe, Familien) werden
// deshalb ein Kontakt, dessen Namen vom Mitglied mit der kleinsten Nummer
// stammen und dessen Daten alle Nummern auffuehren.
//
// Reines Modul ohne SvelteKit-Importe (Pool als Parameter), damit
// scripts/keila-contacts.js dieselbe Abfrage nutzen kann.

/**
 * Kontakt, wie er nach Keila geht. `data` sind die Zusatzfelder des Kontakts
 * (Segmente in Keila filtern darauf, z. B. {"data.mitglied": true}).
 * @typedef {{ email: string, first_name: string, last_name: string,
 *             data: { mitglied: true, mitgliedsnummer: number, mitgliedsnummern: number[],
 *                     ort: string, erzeuger: boolean } }} NewsletterContact
 */

/**
 * @param {{ query: (sql: string) => Promise<{ rows: any[] }> }} db
 * @returns {Promise<NewsletterContact[]>} sortiert nach E-Mail
 */
export const getNewsletterContacts = async (db) => {
    const { rows } = await db.query(`
        SELECT lower(trim(m.email)) AS email,
               m.identifier,
               coalesce(trim(m.first_name), '') AS first_name,
               coalesce(trim(m.last_name), '') AS last_name,
               coalesce(trim(m.name), '') AS name,
               coalesce(trim(m.city), '') AS city,
               bool_or(p.type = 'GENERATION') AS generation
        FROM members_member m
        JOIN members_measurementpoint p ON p.member_id = m.id AND p.status = 'ACTIVE'
        WHERE coalesce(trim(m.email), '') <> ''
        GROUP BY m.id
        ORDER BY lower(trim(m.email)), m.identifier
    `);

    /** @type {Map<string, NewsletterContact>} */
    const byEmail = new Map();
    for (const row of rows) {
        const existing = byEmail.get(row.email);
        if (existing) {
            existing.data.mitgliedsnummern.push(row.identifier);
            existing.data.erzeuger = existing.data.erzeuger || row.generation;
            continue;
        }
        // Betriebe und Vereine haben keinen Nachnamen; ihr Name steht in
        // first_name bzw. name - so bleibt die Anrede "Hallo {{ first_name }}"
        // in Keila fuer beide Faelle brauchbar.
        byEmail.set(row.email, {
            email: row.email,
            first_name: row.first_name || row.name,
            last_name: row.last_name,
            data: {
                mitglied: true,
                mitgliedsnummer: row.identifier,
                mitgliedsnummern: [row.identifier],
                ort: row.city,
                erzeuger: row.generation,
            },
        });
    }
    return [...byEmail.values()];
};
