import { getCurrentWeekCrossoverTime } from '$lib/server/db/energy/overview';
import { json } from '@sveltejs/kit';

/** @type {import('../../$types').RequestHandler} */
export async function GET(event) {

    console.log("public crossover api called");

    const crossover = await getCurrentWeekCrossoverTime();

    if (!crossover) {
        return json(
            { error: "Für die aktuelle Kalenderwoche liegen noch keine Daten vor" },
            { status: 404 }
        );
    }

    return json(
        { crossover }
    );

}
