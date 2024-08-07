import { handle as authenticationHandle } from "./auth";
import { authorizationHandle } from "./auth";
import { sequence } from '@sveltejs/kit/hooks';


export const handle = sequence(authenticationHandle, authorizationHandle);


/** @type {import('@sveltejs/kit').HandleServerError} */
export async function handleError({ error, event, status, message }) {
	
    const errorId = crypto.randomUUID();

	// example integration with https://sentry.io/
    
    /*
	Sentry.captureException(error, {
		extra: { event, errorId, status }
	});
    */

    console.log("Server ERROR: ");
    console.log({error, event});

	return {
		message: 'Whoops!',
		errorId
	};
}