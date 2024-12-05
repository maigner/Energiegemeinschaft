import { redirect } from "@sveltejs/kit";
import { handle as authenticationHandle } from "./auth";
import { authorizationHandle } from "./auth";
import { sequence } from '@sveltejs/kit/hooks';


export const handle = sequence(authenticationHandle, authorizationHandle);


/** @type {import('@sveltejs/kit').HandleServerError} */
export async function handleError({ error, event }) {
	
    const errorId = crypto.randomUUID();

	// example integration with https://sentry.io/
    
    /*
	Sentry.captureException(error, {
		extra: { event, errorId, status }
	});
    */

    console.log("Server ERROR: ");
    
	console.log(event.url.href);

	console.log({error});


	//throw redirect(307, '/');


	return {
		message: 'Leider stehen die angeforderten Daten gegenwärtig nicht bereit! Bitte versuchen Sie es zu einem späteren Zeitpunkt nocheinmal'
	};
}