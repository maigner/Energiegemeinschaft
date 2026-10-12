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
    return createBudget({ max, windowMs });
}

/** @param {{ max: number, windowMs: number }} options */
function createBudget({ max, windowMs }) {
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
        },
        /** Fehlversuche im Fenster. */
        count(now = Date.now()) {
            prune(now);
            return failures.length;
        }
    };
}

/**
 * Budgets je Aufrufer, damit ein einzelner Absender nicht das globale Budget
 * fuer alle verbraucht (sonst sperren 30 Muellanfragen pro Stunde jede
 * echte Provisionierung aus). Der Schluessel ist ein Hash der Client-
 * Adresse mit einem Zufallssalz je Prozess - die Adresse selbst wird weder
 * gespeichert noch protokolliert; nach dem Fenster verfallen die Eintraege.
 *
 * @param {{ max: number, windowMs: number, maxClients?: number }} options
 */
export function createClientBudgets({ max, windowMs, maxClients = 5000 }) {
    /** @type {Map<string, ReturnType<typeof createBudget>>} */
    const budgets = new Map();
    const salt = crypto.randomUUID();

    /** @param {string} client */
    async function keyOf(client) {
        const bytes = new TextEncoder().encode(`${salt}:${client}`);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Buffer.from(digest).toString('base64url').slice(0, 22);
    }

    /** @param {string} client */
    async function budgetFor(client) {
        const key = await keyOf(client);
        let b = budgets.get(key);
        if (!b) {
            if (budgets.size >= maxClients) {
                // Eintraege ohne Fehlversuch im Fenster verwerfen, notfalls den aeltesten
                for (const [k, v] of budgets) if (v.count() === 0) budgets.delete(k);
                if (budgets.size >= maxClients) budgets.delete(budgets.keys().next().value);
            }
            b = createBudget({ max, windowMs });
            budgets.set(key, b);
        }
        return b;
    }

    return {
        /** @param {string} client */
        exhausted: async (client) => (await budgetFor(client)).exhausted(),
        /** @param {string} client */
        fail: async (client) => (await budgetFor(client)).fail(),
        /** @param {string} client */
        retryAfterSeconds: async (client) => (await budgetFor(client)).retryAfterSeconds()
    };
}
