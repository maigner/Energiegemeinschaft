import { fail } from '@sveltejs/kit';
import { getOpenhabStatuses, createOpenhabToken, deleteOpenhabToken } from '$lib/server/db/members/openhabStatus';
import { getMembers } from '$lib/server/db/members/member';

/** @type {import('./$types').PageServerLoad} */
export async function load() {

    const statuses = await getOpenhabStatuses();
    const members = await getMembers();

    return {
        statuses: statuses.map((/** @type {any} */ s) => ({
            id: s.id,
            token: s.token,
            name: s.name,
            memberName: s.member_name,
            memberIdentifier: s.member_identifier,
            createdAt: s.created_at,
            lastSeen: s.last_seen,
            ageSeconds: s.age_seconds === null ? null : Number(s.age_seconds),
            data: s.data ?? {}
        })),
        members: members.map((/** @type {any} */ m) => ({
            id: m.id,
            identifier: m.identifier,
            name: m.name
        }))
    };
}

/** @type {import('./$types').Actions} */
export const actions = {

    createToken: async ({ request }) => {
        const formData = await request.formData();
        const memberId = Number(formData.get('memberId'));

        if (!Number.isInteger(memberId) || memberId <= 0) {
            return fail(400, { message: 'Bitte ein Mitglied auswählen.' });
        }

        const token = await createOpenhabToken(memberId);
        return { created: token };
    },

    deleteToken: async ({ request }) => {
        const formData = await request.formData();
        const id = Number(formData.get('id'));

        if (!Number.isInteger(id) || id <= 0) {
            return fail(400, { message: 'Ungültiges Token.' });
        }

        await deleteOpenhabToken(id);
        return { deleted: true };
    }
};
