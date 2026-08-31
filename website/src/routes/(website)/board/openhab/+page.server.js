import { fail } from '@sveltejs/kit';
import { getOpenhabStatuses, createOpenhabToken, requestOpenhabUpdate } from '$lib/server/db/members/openhabStatus';
import { provisionPlant, listProvisioning, deletePlant } from '$lib/server/db/members/openhabProvision';
import { secretsConfigured } from '$lib/server/secrets';
import { mailcowConfigured } from '$lib/server/mailcow';
import { getMembers } from '$lib/server/db/members/member';
import { listConsentStates } from '$lib/server/db/members/consent';
import { SPEICHERMANAGEMENT_CONSENT_SCOPE } from '$lib/consent/speichermanagement';
import { getBatteryGridFeedInByPlant } from '$lib/server/db/energy/batteryGridFeedIn';
import { plantActions, idOf, consentState } from './plant.server';

/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch }) {

    const statuses = await getOpenhabStatuses();
    // Stand des ausgelieferten IBM-Pakets (build-dist.sh schreibt
    // static/ibm/VERSION im Format der Pi-Meldungen, z. B. "2026-08-26 (abc1234)").
    let serverIbmVersion = null;
    try {
        const r = await fetch('/ibm/VERSION');
        if (r.ok) {
            const v = (await r.text()).trim();
            if (/^\d{4}-\d{2}-\d{2}/.test(v)) serverIbmVersion = v;
        }
    } catch {
        serverIbmVersion = null;
    }
    const members = await getMembers();
    const consents = await listConsentStates(SPEICHERMANAGEMENT_CONSENT_SCOPE);
    // Netzeinspeisung aus der Batterie je Anlage (kumulierter Zaehler der
    // Pis plus Tages-Schnappschuesse); siehe batteryGridFeedIn.js.
    const batteryFeedIn = await getBatteryGridFeedInByPlant().catch(() => []);
    const feedInById = new Map(batteryFeedIn.map((/** @type {any} */ r) => [Number(r.plant_id), r]));
    // Provisionierte Anlagen kennt die Uebersicht nur noch dem Zustand nach
    // (Einrichtungsphase fuer die Karten der noch nicht meldenden Anlagen);
    // alle Details samt Geheimnissen zeigt die Detailseite.
    const provisioning = secretsConfigured() ? await listProvisioning() : [];
    const provisioningById = new Map(provisioning.map((/** @type {any} */ p) => [p.id, p]));

    return {
        serverIbmVersion,
        secretsConfigured: secretsConfigured(),
        mailcowConfigured: mailcowConfigured(),
        statuses: statuses.map((/** @type {any} */ s) => {
            const p = provisioningById.get(s.id);
            const f = feedInById.get(Number(s.id));
            return {
                id: s.id,
                token: s.token,
                name: s.name,
                memberName: s.member_name,
                memberIdentifier: s.member_identifier,
                createdAt: s.created_at,
                lastSeen: s.last_seen,
                ageSeconds: s.age_seconds === null ? null : Number(s.age_seconds),
                updateRequestedAt: s.update_requested_at ?? null,
                data: s.data ?? {},
                consent: consentState(consents, Number(s.member_identifier)),
                batteryFeedIn: f ? {
                    week: Number(f.week_kwh ?? 0),
                    month: Number(f.month_kwh ?? 0),
                    total: Number(f.total_kwh ?? 0)
                } : null,
                provisioning: p ? {
                    code: p.provision_code,
                    setupPhase: p.setup_phase
                } : null
            };
        }),
        members: members.map((/** @type {any} */ m) => ({
            id: m.id,
            identifier: m.identifier,
            name: m.name
        }))
    };
}

/** @type {import('./$types').Actions} */
export const actions = {

    ...plantActions,

    // SD-Karte vorbereiten: einzige Pflichtangabe ist das Mitglied. Alles
    // andere (Token, Tunnel-IP, Passwoerter, Cloud-Konto, Mail-Alias)
    // entsteht automatisch; Profil und WLAN sind optionale Vorgaben.
    prepareSd: async ({ request }) => {
        const formData = await request.formData();
        const memberId = idOf(formData, 'memberId');
        if (!memberId) {
            return fail(400, { message: 'Bitte ein Mitglied auswählen.' });
        }
        if (!secretsConfigured()) {
            return fail(500, { message: 'IBM_SECRET_KEY fehlt in der .env der Website (openssl rand -hex 32).' });
        }
        try {
            const id = await provisionPlant({
                memberId,
                inverterType: String(formData.get('inverterType') ?? '').trim(),
                wifiSsid: String(formData.get('wifiSsid') ?? '').trim(),
                wifiPassword: String(formData.get('wifiPassword') ?? '')
            });
            return { prepared: id };
        } catch (e) {
            return fail(500, { message: e instanceof Error ? e.message : 'Vorbereitung fehlgeschlagen.' });
        }
    },

    requestUpdateAll: async () => {
        const n = await requestOpenhabUpdate(null);
        return { updateRequestedAll: n };
    },

    // Klassischer Weg: nur ein Token (Einrichtung per SSH und Assistent).
    createToken: async ({ request }) => {
        const formData = await request.formData();
        const memberId = idOf(formData, 'memberId');

        if (!memberId) {
            return fail(400, { message: 'Bitte ein Mitglied auswählen.' });
        }

        await createOpenhabToken(memberId);
        return { created: true };
    },

    deleteToken: async ({ request }) => {
        const id = idOf(await request.formData());

        if (!id) {
            return fail(400, { message: 'Ungültiges Token.' });
        }

        const result = await deletePlant(id);
        return result === 'deleted' ? { deleted: true } : { markedDeleted: id };
    }
};
