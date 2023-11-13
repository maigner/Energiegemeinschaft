// @ts-nocheck
import { json } from "@sveltejs/kit";
import { TEST_PWD } from "$env/static/private";


export async function POST({ request, cookies }) {

    const { user, pwd } = await request.json();    

    console.log(user);
    
    let result = {
        accepted: false
    }

    if (user === "test@ischlstrom.org" && pwd === TEST_PWD) {
        result.accepted = true;
    } 
    
    return json(result);
}
