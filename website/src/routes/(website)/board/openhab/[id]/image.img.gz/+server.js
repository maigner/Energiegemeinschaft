import { error } from '@sveltejs/kit';
import { Readable } from 'node:stream';
import { getProvisioning } from '$lib/server/db/members/openhabProvision';
import { imageDownload } from '$lib/server/ibmImage';

/**
 * Download des fertigen SD-Karten-Images (<name>.img.gz), gebaut ueber die
 * Aktion "Image erstellen" am Dashboard. Mit dem Raspberry Pi Imager
 * ("Eigenes Image") oder balenaEtcher auf die Karte schreiben - Windows,
 * macOS und Linux. Nur fuer den Vorstand (Route unter /board).
 */

/** @type {import('./$types').RequestHandler} */
export async function GET({ params }) {
    const id = Number(params.id);
    const plant = Number.isInteger(id) ? await getProvisioning(id) : null;
    if (!plant) error(404, { message: 'Keine Provisionierung fuer diese Anlage.' });

    const download = await imageDownload(plant.name);
    if (!download) error(404, { message: 'Kein Image gebaut - am Dashboard "Image erstellen".' });

    return new Response(/** @type {any} */ (Readable.toWeb(download.stream())), {
        headers: {
            'Content-Type': 'application/gzip',
            'Content-Length': String(download.size),
            'Content-Disposition': `attachment; filename="${plant.name}.img.gz"`,
            'Cache-Control': 'no-store'
        }
    });
}
