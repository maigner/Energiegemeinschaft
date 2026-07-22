import { redirect } from "@sveltejs/kit";
import { handle as authenticationHandle } from "./auth";
import { authorizationHandle } from "./auth";
import { sequence } from '@sveltejs/kit/hooks';
import cron from 'node-cron';
import { fetchAndStoreWeatherData } from "$lib/server/db/weather/openmeteo";
import { checkActivationReminders, sendActivationReminders } from "$lib/server/mail/reminders/memberReminders";
import { refreshMaterializedViewCrossoverTimes } from "$lib/server/db/energy/overview";
import { dev } from "$app/environment";


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
			if (dev) return;
			console.log('Runs every hour at min 31: fetchAndStoreWeatherData');
			fetchAndStoreWeatherData();
		});


		//sendActivationReminders
		// every hour, call sendActivationReminders
		cron.schedule('59 * * * *', () => {
			if (dev) return;
			console.log('Runs every hour at min 59: sendActivationReminders');
			sendActivationReminders();
		});

		// checkActivationReminders
		// every hour, call checkActivationReminders
		cron.schedule('15 0 * * 1', () => {
			if (dev) return;
			console.log('Runs once a week: checkActivationReminders');
			checkActivationReminders();
		});

		// refreshMaterializedViewCrossoverTimes
		// once a month, refresh the materialized view
		cron.schedule('0 0 1 * *', () => {
			if (dev) return;
			console.log('Runs once a month: refreshMaterializedViewCrossoverTimes');
			refreshMaterializedViewCrossoverTimes();
		});

	}

	return resolve(event);
}