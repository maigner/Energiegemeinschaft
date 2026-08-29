// Gemeinsame Bausteine der Uebersicht (/board/openhab) und der
// Detailseite (/board/openhab/[id]): die Form-Actions je Anlage sowie die
// Aufbereitung der Provisionierungsdaten fuer die Seiten.
import { fail } from '@sveltejs/kit';
import { requestOpenhabUpdate } from '$lib/server/db/members/openhabStatus';
import {
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
import { SPEICHERMANAGEMENT_CONSENT_VERSION } from '$lib/consent/speichermanagement';

/** @param {FormData} formData @param {string} key */
export function idOf(formData, key = 'id') {
    const id = Number(formData.get(key));
    return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Einwilligungsstand eines Mitglieds fuer die Badges:
 * 'ok' | 'veraltet' (aeltere Textversion) | 'widerrufen' | 'fehlt'.
 * @param {Map<number, any>} consents @param {number} identifier
 */
export function consentState(consents, identifier) {
    const c = consents.get(identifier);
    if (!c) return 'fehlt';
    if (c.granted_at) {
        return c.text_version === SPEICHERMANAGEMENT_CONSENT_VERSION ? 'ok' : 'veraltet';
    }
    return c.revoked_at ? 'widerrufen' : 'fehlt';
}

/**
 * Provisionierungszeile (entschluesselt) in die Form bringen, die die
 * Seiten anzeigen. `data` ist die letzte Statusmeldung der Anlage (fuer
 * den Zustand des Wechselrichter-Passworts), `image` der Stand des
 * SD-Karten-Images vom Dateisystem.
 * @param {any} p @param {any} data @param {any} image
 */
export function mapProvisioning(p, data, image) {
    return {
        code: p.provision_code,
        expires: p.provision_expires,
        provisionedAt: p.provisioned_at,
        inverterType: p.inverter_type,
        inverterUsername: p.inverter_username,
        inverterPasswordSet: p.inverter_password_set,
        inverterPasswordState: inverterPasswordState({ ...p, data }),
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
        image: image ?? null
    };
}

/**
 * Form-Actions, die sich auf eine einzelne Anlage beziehen. Beide Seiten
 * binden sie per Spread in ihre `actions` ein, die Formulare posten wie
 * gehabt auf `?/name` der jeweiligen Seite.
 * @type {Record<string, import('@sveltejs/kit').Action>}
 */
export const plantActions = {

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
    }
};
