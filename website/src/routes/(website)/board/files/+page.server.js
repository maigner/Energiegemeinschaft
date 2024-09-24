import { BOARD_DOCUMENTS, BOARD_UPLOAD } from "$env/static/private";

const docUrl = `${BOARD_DOCUMENTS} `;
const uploadUrl = `${BOARD_UPLOAD} `;


/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, parent }) {

    // member info
    let { session, member } = await parent();


    return {
        docUrl, uploadUrl
    }

}
