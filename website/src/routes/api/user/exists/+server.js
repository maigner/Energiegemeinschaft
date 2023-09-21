// @ts-nocheck
import { json } from "@sveltejs/kit";


export async function POST({ request, cookies }) {

    const { emailAddress } = await request.json();    

    console.log("user.exists " + emailAddress);
    
    let result = {
        emailAddress: emailAddress,
        exists: false
    }
    
    

    return json(result);

}
