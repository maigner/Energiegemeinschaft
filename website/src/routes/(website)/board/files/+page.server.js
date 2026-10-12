import { env } from "$env/dynamic/private";
const { BOARD_DOCUMENTS, BOARD_UPLOAD } = env;

const docUrl = `${BOARD_DOCUMENTS} `;
const uploadUrl = `${BOARD_UPLOAD} `;


/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, parent }) {

    // member info
    let { session } = await parent();


    return {
        docUrl, uploadUrl
    }

}
