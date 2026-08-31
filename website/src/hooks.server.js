import { redirect } from "@sveltejs/kit";
import { handle as authenticationHandle } from "./auth";
import { authorizationHandle } from "./auth";
import { sequence } from '@sveltejs/kit/hooks';
import cron from 'node-cron';
import { fetchAndStoreWeatherData } from "$lib/server/db/weather/openmeteo";
import { checkActivationReminders, sendActivationReminders } from "$lib/server/mail/reminders/memberReminders";
import { refreshMaterializedViewCrossoverTimes } from "$lib/server/db/energy/overview";
import { pruneOpenhabStatusHistory } from "$lib/server/db/members/openhabStatus";
import { rollupOpenhabCounterSnapshots } from "$lib/server/db/energy/batteryGridFeedIn";
import { pruneExpiredAuthData, pruneMemberDataAccessLog } from "$lib/server/db/retention";
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

	// nur Pfad und Fehlermeldung protokollieren, keine Query-Parameter
	// und keine kompletten Objekte (koennten personenbezogene Daten enthalten)
	console.log(`Server ERROR ${errorId} at ${event.url.pathname}:`, error instanceof Error ? error.message : error);


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

		// rollupOpenhabCounterSnapshots
		// Tagesendstaende des Batterie-Einspeisezaehlers sichern - muss vor
		// pruneOpenhabStatusHistory (03:23) laufen, sonst gehen Tage verloren
		cron.schedule('5 3 * * *', () => {
			if (dev) return;
			console.log('Runs daily at 03:05: rollupOpenhabCounterSnapshots');
			rollupOpenhabCounterSnapshots();
		});

		// pruneOpenhabStatusHistory
		// every day, remove openhab status history older than 30 days
		cron.schedule('23 3 * * *', () => {
			if (dev) return;
			console.log('Runs daily at 03:23: pruneOpenhabStatusHistory');
			pruneOpenhabStatusHistory();
		});

		// Datenminimierung: abgelaufene Login-Tokens/Sitzungen und alte
		// Zugriffsprotokolle taeglich loeschen (siehe /datenschutz)
		cron.schedule('41 3 * * *', () => {
			if (dev) return;
			console.log('Runs daily at 03:41: pruneExpiredAuthData + pruneMemberDataAccessLog');
			pruneExpiredAuthData();
			pruneMemberDataAccessLog();
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