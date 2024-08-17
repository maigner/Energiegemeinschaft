
/** @type {import('@sveltejs/kit').HandleClientError} */
export async function handleError({ error, event }) {
	
    const errorId = crypto.randomUUID();

	// example integration with https://sentry.io/
    
    /*
	Sentry.captureException(error, {
		extra: { event, errorId, status }
	});
    */

    console.log("Client ERROR: ");
    //console.log({error, event});

	return {
		message: 'Whoops!'
	};
}