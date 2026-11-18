// Korrekturversand des monatlichen Energieberichts: Monate, deren Bericht
// mit falschem Datenstand hinausging und deshalb noch einmal an alle
// Empfaenger geht, diesmal mit einem Hinweis ganz oben und "Korrektur:" im
// Betreff. Der Cron-Job (monthlyEnergyReport.js) arbeitet die Liste mit
// demselben Ratenlimit ab wie den regulaeren Versand und vermerkt jede
// Korrektur in members_energyreportlog.correction_sent_at, damit sie genau
// einmal hinausgeht. Ohne SvelteKit-Importe, das CLI
// (scripts/energy-report.js --correction) liest dieselbe Liste.
//
// Je Monat:
//   sentBefore   nur Berichte, die vor diesem Zeitpunkt verschickt wurden,
//                bekommen die Korrektur (danach stimmte der Datenstand)
//   skipMembers  Mitgliedsnummern, die den korrigierten Bericht schon von
//                Hand bekommen haben
//   note         Hinweis im Bericht; **fett** wie im Inhaltsmodell
//
// Erledigte Eintraege bleiben stehen: sie dokumentieren, was verschickt wurde.

/** @type {Record<string, { sentBefore: string, skipMembers?: number[], note: string }>} */
export const REPORT_CORRECTIONS = {
    // Netz OOe hat den halben 3.10. spaeter geliefert, als der taegliche
    // Import zurueckgreift; der Bericht ging ab 15.11. ohne diesen Tag hinaus.
    // Nachimport am 18.11. vormittags, seither prueft der Versand den
    // Komplettimport (importAllowsSending).
    '2026-10': {
        sentBefore: '2026-11-18T12:00:00+01:00',
        skipMembers: [43],
        note: '**Korrigierter Bericht:** Den Energiebericht für Oktober haben wir zu früh erstellt. '
            + 'Zu diesem Zeitpunkt hatte der Netzbetreiber noch nicht alle Energiedaten geliefert. '
            + 'Dieser Bericht beruht auf den vollständigen Daten und ersetzt den bisherigen.',
    },
};

/**
 * Korrektur fuer den Monat oder null.
 * @param {string} month  'YYYY-MM'
 */
export const correctionFor = (month) => REPORT_CORRECTIONS[month] ?? null;
