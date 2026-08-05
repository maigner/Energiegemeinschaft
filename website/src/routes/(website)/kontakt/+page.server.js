
import { relayContactForm } from '$lib/server/mail/smtp';
import { fail } from '@sveltejs/kit';

function validateEmail(email) {
    const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return regex.test(email);
}

// Einfaches In-Memory-Rate-Limit gegen Formular-Spam. Die IP-Adresse wird nur
// fluechtig im Speicher gehalten und nicht protokolliert (Art. 6 Abs. 1 lit. f DSGVO).
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const submissionsByIp = new Map();

function rateLimited(ip) {
    const now = Date.now();
    const timestamps = (submissionsByIp.get(ip) ?? []).filter(
        (t) => now - t < RATE_LIMIT_WINDOW_MS
    );
    if (timestamps.length >= RATE_LIMIT_MAX) {
        return true;
    }
    timestamps.push(now);
    submissionsByIp.set(ip, timestamps);
    // alte Eintraege nicht unbegrenzt ansammeln
    if (submissionsByIp.size > 1000) {
        for (const [key, value] of submissionsByIp) {
            if (value.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) {
                submissionsByIp.delete(key);
            }
        }
    }
    return false;
}

/** @type {import('./$types').Actions} */
export const actions = {
    contact: async ({ request, getClientAddress }) => {
        const data = await request.formData();
        const email = data.get('email');
        const message = data.get('message');

        // Honeypot: das Feld ist unsichtbar, Menschen lassen es leer
        if (data.get('website')) {
            return { message: "OK" };
        }

        if (rateLimited(getClientAddress())) {
            return fail(429, { message: "Zu viele Anfragen. Bitte versuchen Sie es später erneut." });
        }

        if (!validateEmail(email)) {
            return { message: "No" };
        }
        if (email === "test@email.com") {
            return { message: "No" };
        }

        await relayContactForm(email, message);

        return { message: "OK" }
    }
};
