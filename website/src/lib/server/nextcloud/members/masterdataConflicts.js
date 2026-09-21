// Doppelt vergebene Mitgliedsnummern im EEG-Faktura-Masterdata-Sheet.
//
// Das Sheet "Mitglieder" hat eine Zeile je Zaehlpunkt; der Import legt je
// Zeile ein Mitglied per Upsert auf die Mitgliedsnummer an. Tragen zwei
// verschiedene Personen dieselbe Nummer (EEG-Faktura verhindert das nicht,
// Stand 2026-09-21: Nr. 364 Eisl/Ebner, Nr. 388 Haslinger/Wiener), wuerde
// die spaetere Zeile Name und Adresse der frueheren ueberschreiben und alle
// Zaehlpunkte beider Personen bei einem Datensatz landen - die eine Person
// verschwindet, die andere bekommt fremde Verbrauchsdaten in Portal und
// Energiebericht. Solche Nummern ueberspringt der Import komplett und
// meldet sie auf /board/members/import.
//
// Bewusst ohne $lib/$env-Importe, damit die Erkennung ohne SvelteKit
// testbar bleibt.

/** @param {unknown} value */
const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Name und E-Mail einer Zeile, so wie der Import sie ins Mitglied schreibt.
 * @param {Record<string, any>} row
 */
const identity = (row) => ({
    name: [row['Name 1'], row['Name 2']].filter(Boolean).join(' ').trim(),
    email: String(row['E-Mail'] ?? '').trim(),
});

/**
 * Mitgliedsnummern, unter denen das Sheet verschiedene Personen fuehrt
 * (Name oder E-Mail weichen ab).
 *
 * @param {Array<Record<string, any>>} rows Zeilen des Sheets "Mitglieder"
 * @returns {Array<{ number: number, persons: Array<{ name: string, email: string, points: string[] }> }>}
 */
export function findMemberNumberConflicts(rows) {
    /** @type {Map<number, Map<string, { name: string, email: string, points: string[] }>>} */
    const byNumber = new Map();
    for (const row of rows) {
        const number = Number(row['Mit. Nr.']);
        if (!number) continue;
        const person = identity(row);
        const key = `${normalize(person.name)}|${normalize(person.email)}`;
        const persons = byNumber.get(number) ?? new Map();
        byNumber.set(number, persons);
        const entry = persons.get(key) ?? { ...person, points: [] };
        persons.set(key, entry);
        if (row['Zählpunkt']) entry.points.push(String(row['Zählpunkt']));
    }
    return [...byNumber]
        .filter(([, persons]) => persons.size > 1)
        .sort((a, b) => a[0] - b[0])
        .map(([number, persons]) => ({ number, persons: [...persons.values()] }));
}

/**
 * Meldung fuer das Importprotokoll, eine Zeile je Nummer.
 * @param {ReturnType<typeof findMemberNumberConflicts>[number]} conflict
 */
export function describeConflict(conflict) {
    const persons = conflict.persons
        .map((p) => `${p.name || '(ohne Name)'} <${p.email || 'ohne E-Mail'}> (${p.points.length} ZP)`)
        .join(' / ');
    return `Mit. Nr. ${conflict.number}: ${persons}`;
}
