import { redirect } from "@sveltejs/kit";
import { handle as authenticationHandle } from "./auth";
import { authorizationHandle } from "./auth";
import { sequence } from '@sveltejs/kit/hooks';
import cron from 'node-cron';
import { fetchAndStoreWeatherData } from "$lib/server/db/weather/openmeteo";


export const handle = sequence(authenticationHandle, authorizationHandle, cronHandle);


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

	console.log({ error });


	//throw redirect(307, '/');


	return {
		message: 'Leider stehen die angeforderten Daten gegenwärtig noch nicht bereit! Bitte versuchen Sie es zu einem späteren Zeitpunkt nocheinmal'
	};
}

// Guard to prevent double-scheduling in dev (HMR restarts the module)
let initialized = false;

export async function cronHandle({ event, resolve }) {
	if (!initialized) {
		initialized = true;

		// every hour, call fetchAndStoreWeatherData
		cron.schedule('31 * * * *', () => {
			console.log('Runs every hour at min 31');
			fetchAndStoreWeatherData();
		});
	}

	return resolve(event);
}