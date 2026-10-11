// Globales Budget fuer Fehlversuche an einem Endpoint, ohne Client-IPs zu
// speichern oder zu protokollieren (Anwendungslogs bleiben frei von
// personenbezogenen Daten, siehe /datenschutz). Gedacht fuer Endpoints,
// an denen berechtigte Aufrufer praktisch nie scheitern (ein Pi loest
// seinen Provisionierungs-Code genau einmal ein): ein globales Limit
// kostet sie nichts, beendet aber jedes Durchprobieren. Ist das Budget
// erschoepft, antwortet der Endpoint allen mit 429, bis das Fenster
// weiterwandert. Zustand nur im Prozess (ein Container, kein Cluster).

/**
 * @param {{ max: number, windowMs: number }} options
 *   max Fehlversuche je Fenster, danach gesperrt
 */
export function createAttemptBudget({ max, windowMs }) {
    /** @type {number[]} Zeitpunkte der Fehlversuche im Fenster */
    let failures = [];

    /** @param {number} now */
    function prune(now) {
        failures = failures.filter((t) => now - t < windowMs);
    }

    return {
        /** True, wenn das Budget verbraucht ist und der Aufruf abzulehnen ist. */
        exhausted(now = Date.now()) {
            prune(now);
            return failures.length >= max;
        },
        /** Einen Fehlversuch zaehlen. */
        fail(now = Date.now()) {
            prune(now);
            failures.push(now);
        },
        /** Sekunden bis wieder ein Versuch frei wird (fuer Retry-After). */
        retryAfterSeconds(now = Date.now()) {
            prune(now);
            if (failures.length < max) return 0;
            return Math.max(1, Math.ceil((failures[0] + windowMs - now) / 1000));
        }
    };
}
