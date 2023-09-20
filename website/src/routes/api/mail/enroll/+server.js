// @ts-nocheck
import { json } from "@sveltejs/kit";


export async function POST({ request, cookies }) {

    const { emailAddress } = await request.json();    

    console.log("mail.enroll " + emailAddress);
    
    let result = {
        emailAddress: emailAddress
    }
    
    

    return json(result);

}
