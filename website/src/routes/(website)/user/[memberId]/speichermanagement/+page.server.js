import { error, fail } from '@sveltejs/kit';
import {
    getMemberPlants,
    setInverterCredentials,
    requestCloudPasswordReset,
    inverterPasswordState
} from '$lib/server/db/members/openhabProvision';
import { secretsConfigured } from '$lib/server/secrets';
import { getUsersByEmail } from '$lib/server/db/members/member';
import { getConsent, grantConsent, revokeConsent } from '$lib/server/db/members/consent';
import {
    SPEICHERMANAGEMENT_CONSENT_VERSION,
    SPEICHERMANAGEMENT_CONSENT_SCOPE
} from '$lib/consent/speichermanagement';
import { relay } from '$lib/server/mail/smtp';

/**
 * Mitgliederbereich "Speichermanagement": Einrichtungsfortschritt der
 * eigenen Anlage, Zustand, Zugang zur openHAB-App (Cloud-Konto) und das
 * Eingabefeld fuer das Wechselrichter-Passwort. Nur fuer den Standort des
 * angemeldeten Mitglieds (gleiche Pruefung wie /user/[memberId]).
 *
 * Einwilligung (DSGVO): Anlagendaten und Eingaben werden erst gezeigt,
 * wenn das Mitglied dem aktuellen Einwilligungstext (ConsentText.svelte)
 * zugestimmt hat; die Erteilung wird mit Textversion und Zeitpunkt in
 * members_consent festgehalten, ein Widerruf benachrichtigt den Vorstand
 * (der die Steuerung dann deaktiviert).
 */

/**
 * @param {any} params
 * @param {{ session: any, users: any[] | null }} parentData
 */
function requireOwnMember(params, parentData) {
    const { session, users } = parentData;
    const valid = (users ?? []).filter((/** @type {{ identifier: number; email: any; }} */ user) =>
        user.identifier === parseInt(params.memberId)
        && user.email?.toLowerCase() === session?.user?.email?.toLowerCase());
    if (valid.length === 0) {
        console.log(`unauthorized access attempt on /user/${params.memberId}/speichermanagement`);
        error(403, 'not a valid user');
    }
    return valid[0];
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, parent }) {
    const user = requireOwnMember(params, await parent());
    const plants = secretsConfigured() ? await getMemberPlants(user.identifier) : [];
    const consent = await getConsent(user.identifier, SPEICHERMANAGEMENT_CONSENT_SCOPE);
    return {
        user,
        consent: {
            // granted nur, wenn die juengste Zeile aktiv ist und zum
            // aktuellen Text gehoert; sonst (neuer Text, Widerruf, nie
            // erteilt) zeigt die Seite den Text zur Zustimmung.
            granted: Boolean(consent && !consent.revoked_at
                && consent.text_version === SPEICHERMANAGEMENT_CONSENT_VERSION),
            grantedAt: consent && !consent.revoked_at ? consent.granted_at : null,
            revoked: Boolean(consent?.revoked_at),
            outdated: Boolean(consent && !consent.revoked_at
                && consent.text_version !== SPEICHERMANAGEMENT_CONSENT_VERSION)
        },
        plants: plants.map((/** @type {any} */ p) => ({
            id: p.id,
            name: p.name,
            lastSeen: p.last_seen,
            ageSeconds: p.age_seconds === null ? null : Number(p.age_seconds),
            data: p.data ?? {},
            inverterType: p.inverter_type,
            inverterPasswordSet: Boolean(p.inverter_password_set),
            inverterPasswordState: inverterPasswordState(p),
            cloudUsername: p.cloud_username,
            cloudPassword: p.cloud_password,
            cloudAccountState: p.cloud_account_state,
            linuxPassword: p.linux_password,
            provisioned: Boolean(p.provisioned),
            setupPhase: p.setup_phase,
            setupMessage: p.setup_message,
            setupPhaseAt: p.setup_phase_at
        }))
    };
}

/**
 * Das angemeldete Mitglied selbst (Actions haben kein parent(): Session
 * und Mitglied werden hier selbst geladen).
 * @param {any} params @param {any} locals
 */
async function ownMember(params, locals) {
    const session = await locals.auth();
    const users = await getUsersByEmail(session?.user?.email);
    return requireOwnMember(params, { session, users });
}

/**
 * Anlage nur, wenn sie dem angemeldeten Mitglied gehoert.
 * @param {any} params @param {any} locals @param {FormData} formData
 */
async function ownPlantId(params, locals, formData) {
    const user = await ownMember(params, locals);
    const id = Number(formData.get('id'));
    const plants = await getMemberPlants(user.identifier);
    return plants.some((/** @type {any} */ p) => p.id === id) ? id : null;
}

/** @type {import('./$types').Actions} */
export const actions = {
    // Einwilligung erteilen: nur mit gesetztem Haekchen (keine Vorauswahl,
    // Art. 4 Z 11 DSGVO); festgehalten werden Textversion, Zeitpunkt und
    // die E-Mail der Sitzung (Nachweis nach Art. 7 Abs. 1).
    grantConsent: async ({ request, params, locals }) => {
        const user = await ownMember(params, locals);
        const formData = await request.formData();
        if (formData.get('accept') !== 'on') {
            return fail(400, { message: 'Bitte zuerst das Kästchen ankreuzen.' });
        }
        await grantConsent(
            user.identifier,
            SPEICHERMANAGEMENT_CONSENT_SCOPE,
            SPEICHERMANAGEMENT_CONSENT_VERSION,
            user.email
        );
        return { consentGranted: true };
    },

    // Widerruf: stempelt die Einwilligung und benachrichtigt den Vorstand,
    // der die Steuerung deaktiviert und die Daten loescht (die Anlage beim
    // Mitglied schaltet sich nicht selbst ab).
    revokeConsent: async ({ params, locals }) => {
        const user = await ownMember(params, locals);
        const hadConsent = await revokeConsent(user.identifier, SPEICHERMANAGEMENT_CONSENT_SCOPE);
        if (hadConsent) {
            try {
                await relay(user.email,
                    `Speichermanagement: Einwilligung widerrufen (Mitglied ${user.identifier})`,
                    {
                        mitglied: user.identifier,
                        name: user.name,
                        hinweis: 'Bitte Steuerung deaktivieren (Token löschen) und gespeicherte Daten entfernen.'
                    });
            } catch (e) {
                // Der Widerruf ist in der Datenbank festgehalten und am
                // Dashboard sichtbar; eine fehlgeschlagene Mail darf ihn
                // nicht scheitern lassen.
                console.log('revokeConsent: notification mail failed', e);
            }
        }
        return { consentRevoked: true };
    },

    setInverterPassword: async ({ request, params, locals }) => {
        const formData = await request.formData();
        const id = await ownPlantId(params, locals, formData);
        const username = String(formData.get('username') ?? '').trim();
        const password = String(formData.get('password') ?? '');
        if (!id) return fail(403, { message: 'Nicht berechtigt.' });
        if (!password) return fail(400, { message: 'Bitte das Passwort eingeben.' });
        if (!secretsConfigured()) return fail(500, { message: 'Speichern derzeit nicht möglich.' });
        await setInverterCredentials(id, username || 'customer', password);
        return { inverterPasswordSet: true };
    },

    resetCloudPassword: async ({ request, params, locals }) => {
        const formData = await request.formData();
        const id = await ownPlantId(params, locals, formData);
        if (!id) return fail(403, { message: 'Nicht berechtigt.' });
        if (!secretsConfigured()) return fail(500, { message: 'Derzeit nicht möglich.' });
        await requestCloudPasswordReset(id);
        return { cloudReset: true };
    }
};
