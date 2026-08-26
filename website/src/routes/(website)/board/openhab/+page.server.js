import { fail } from '@sveltejs/kit';
import { getOpenhabStatuses, createOpenhabToken, requestOpenhabUpdate } from '$lib/server/db/members/openhabStatus';
import {
    provisionPlant,
    listProvisioning,
    getProvisioning,
    renewProvisionCode,
    setInverterType,
    setInverterCredentials,
    requestCloudPasswordReset,
    retryCloudAccount,
    retryMailAlias,
    deletePlant,
    undeletePlant,
    inverterPasswordState
} from '$lib/server/db/members/openhabProvision';
import { getImageStatus, startImageBuild, deleteImage } from '$lib/server/ibmImage';
import { secretsConfigured } from '$lib/server/secrets';
import { mailcowConfigured } from '$lib/server/mailcow';
import { getMembers } from '$lib/server/db/members/member';
import { listConsentStates } from '$lib/server/db/members/consent';
import {
    SPEICHERMANAGEMENT_CONSENT_VERSION,
    SPEICHERMANAGEMENT_CONSENT_SCOPE
} from '$lib/consent/speichermanagement';

/**
 * Einwilligungsstand eines Mitglieds fuer die Badges:
 * 'ok' | 'veraltet' (aeltere Textversion) | 'widerrufen' | 'fehlt'.
 * @param {Map<number, any>} consents @param {number} identifier
 */
function consentState(consents, identifier) {
    const c = consents.get(identifier);
    if (!c) return 'fehlt';
    if (c.granted_at) {
        return c.text_version === SPEICHERMANAGEMENT_CONSENT_VERSION ? 'ok' : 'veraltet';
    }
    return c.revoked_at ? 'widerrufen' : 'fehlt';
}

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
    // Provisionierungsdaten (Geheimnisse entschluesselt) - nur lesbar, wenn
    // IBM_SECRET_KEY gesetzt ist; sonst bleibt der Abschnitt leer und die
    // Seite zeigt den Hinweis.
    const provisioning = secretsConfigured() ? await listProvisioning() : [];
    const provisioningById = new Map(provisioning.map((/** @type {any} */ p) => [p.id, p]));
    // Stand des fertigen SD-Karten-Images je Anlage (Dateisystem, kein DB-Feld)
    const imageById = new Map();
    for (const p of provisioning) {
        if (p.provision_code) imageById.set(p.id, await getImageStatus(p));
    }

    return {
        serverIbmVersion,
        secretsConfigured: secretsConfigured(),
        mailcowConfigured: mailcowConfigured(),
        statuses: statuses.map((/** @type {any} */ s) => {
            const p = provisioningById.get(s.id);
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
                provisioning: p ? {
                    code: p.provision_code,
                    expires: p.provision_expires,
                    provisionedAt: p.provisioned_at,
                    inverterType: p.inverter_type,
                    inverterUsername: p.inverter_username,
                    inverterPasswordSet: p.inverter_password_set,
                    inverterPasswordState: inverterPasswordState({ ...p, data: s.data }),
                    wgAddress: p.wg_address,
                    wgPublicKey: p.wg_public_key,
                    wgSynced: p.wg_synced_at !== null,
                    cloudUuid: p.cloud_uuid,
                    cloudSecret: p.cloud_secret,
                    cloudUsername: p.cloud_username,
                    cloudPassword: p.cloud_password,
                    cloudAccountState: p.cloud_account_state,
                    cloudAccountError: p.cloud_account_error,
                    mailAliasState: p.mail_alias_state,
                    linuxPassword: p.linux_password,
                    wifiSsid: p.wifi_ssid,
                    setupPhase: p.setup_phase,
                    setupMessage: p.setup_message,
                    setupPhaseAt: p.setup_phase_at,
                    image: imageById.get(s.id) ?? null
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

/** @param {FormData} formData @param {string} key */
function idOf(formData, key = 'id') {
    const id = Number(formData.get(key));
    return Number.isInteger(id) && id > 0 ? id : null;
}

/** @type {import('./$types').Actions} */
export const actions = {

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

    renewCode: async ({ request }) => {
        const id = idOf(await request.formData());
        if (!id) return fail(400, { message: 'Ungültige Anlage.' });
        await renewProvisionCode(id);
        return { renewed: id };
    },

    setInverterType: async ({ request }) => {
        const formData = await request.formData();
        const id = idOf(formData);
        const type = String(formData.get('inverterType') ?? '').trim();
        if (!id || !/^[a-z0-9-]{0,50}$/.test(type)) return fail(400, { message: 'Ungültiges Profil.' });
        await setInverterType(id, type);
        return { inverterTypeSet: id };
    },

    setInverterPassword: async ({ request }) => {
        const formData = await request.formData();
        const id = idOf(formData);
        const username = String(formData.get('username') ?? '').trim();
        const password = String(formData.get('password') ?? '');
        if (!id || !password) return fail(400, { message: 'Passwort fehlt.' });
        if (!secretsConfigured()) return fail(500, { message: 'IBM_SECRET_KEY fehlt in der .env der Website.' });
        await setInverterCredentials(id, username, password);
        return { inverterPasswordSet: id };
    },

    resetCloudPassword: async ({ request }) => {
        const id = idOf(await request.formData());
        if (!id) return fail(400, { message: 'Ungültige Anlage.' });
        if (!secretsConfigured()) return fail(500, { message: 'IBM_SECRET_KEY fehlt in der .env der Website.' });
        await requestCloudPasswordReset(id);
        return { cloudReset: id };
    },

    // Fertiges SD-Karten-Image bauen (laeuft im Hintergrund, Stand kommt
    // ueber load/getImageStatus; nur ein Bau gleichzeitig).
    buildImage: async ({ request, url }) => {
        const id = idOf(await request.formData());
        if (!id) return fail(400, { message: 'Ungültige Anlage.' });
        if (!secretsConfigured()) return fail(500, { message: 'IBM_SECRET_KEY fehlt in der .env der Website.' });
        const plant = await getProvisioning(id);
        if (!plant || !plant.provision_code) return fail(404, { message: 'Keine Provisionierung für diese Anlage.' });
        try {
            await startImageBuild(plant, `${url.protocol}//${url.host}`);
            return { imageBuildStarted: id };
        } catch (e) {
            return fail(409, { message: e instanceof Error ? e.message : 'Image-Bau nicht möglich.' });
        }
    },

    retryAlias: async ({ request }) => {
        const id = idOf(await request.formData());
        if (!id) return fail(400, { message: 'Ungültige Anlage.' });
        const state = await retryMailAlias(id);
        if (state.startsWith('error')) return fail(502, { message: `Mail-Alias: ${state}` });
        return { aliasRetry: id };
    },

    requestUpdate: async ({ request }) => {
        const id = idOf(await request.formData());
        if (!id) return fail(400, { message: 'Ungültige Anlage.' });
        await requestOpenhabUpdate(id);
        return { updateRequested: id };
    },

    requestUpdateAll: async () => {
        const n = await requestOpenhabUpdate(null);
        return { updateRequestedAll: n };
    },

    retryCloud: async ({ request }) => {
        const id = idOf(await request.formData());
        if (!id) return fail(400, { message: 'Ungültige Anlage.' });
        await retryCloudAccount(id);
        return { cloudRetry: id };
    },

    // Anlage loeschen: provisionierte Anlagen werden markiert und vom
    // s1-Timer abgeraeumt (Peer, Cloud-Konto, Zeile); reine Tokens sofort.
    deletePlant: async ({ request }) => {
        const id = idOf(await request.formData());
        if (!id) return fail(400, { message: 'Ungültige Anlage.' });
        const plant = await getProvisioning(id).catch(() => null);
        const result = await deletePlant(id);
        if (plant?.name) await deleteImage(plant.name);
        return result === 'deleted' ? { deleted: true } : { markedDeleted: id };
    },

    undeletePlant: async ({ request }) => {
        const id = idOf(await request.formData());
        if (!id) return fail(400, { message: 'Ungültige Anlage.' });
        await undeletePlant(id);
        return { undeleted: id };
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
