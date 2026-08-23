import { error, fail } from '@sveltejs/kit';
import {
    getMemberPlants,
    setInverterCredentials,
    requestCloudPasswordReset
} from '$lib/server/db/members/openhabProvision';
import { secretsConfigured } from '$lib/server/secrets';
import { getUsersByEmail } from '$lib/server/db/members/member';

/**
 * Mitgliederbereich "Speichermanagement": Einrichtungsfortschritt der
 * eigenen Anlage, Zustand, Zugang zur openHAB-App (Cloud-Konto) und das
 * Eingabefeld fuer das Wechselrichter-Passwort. Nur fuer den Standort des
 * angemeldeten Mitglieds (gleiche Pruefung wie /user/[memberId]).
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
    return {
        user,
        plants: plants.map((/** @type {any} */ p) => ({
            id: p.id,
            name: p.name,
            lastSeen: p.last_seen,
            ageSeconds: p.age_seconds === null ? null : Number(p.age_seconds),
            data: p.data ?? {},
            inverterType: p.inverter_type,
            inverterPasswordSet: Boolean(p.inverter_password_set),
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
 * Anlage nur, wenn sie dem angemeldeten Mitglied gehoert (Actions haben
 * kein parent(): Session und Mitglied werden hier selbst geladen).
 * @param {any} params @param {any} locals @param {FormData} formData
 */
async function ownPlantId(params, locals, formData) {
    const session = await locals.auth();
    const users = await getUsersByEmail(session?.user?.email);
    const user = requireOwnMember(params, { session, users });
    const id = Number(formData.get('id'));
    const plants = await getMemberPlants(user.identifier);
    return plants.some((/** @type {any} */ p) => p.id === id) ? id : null;
}

/** @type {import('./$types').Actions} */
export const actions = {
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
