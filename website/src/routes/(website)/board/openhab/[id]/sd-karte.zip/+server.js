import { error } from '@sveltejs/kit';
import { getProvisioning, renderOpenhabianConf, renderProvisionConf, memberNumber } from '$lib/server/db/members/openhabProvision';
import { buildZip } from '$lib/server/zip';

/**
 * Download fuer die SD-Karten-Vorbereitung: sd-<nnn>.zip mit
 *   openhabian.conf     - Boot-Partition (Hostname, Linux-Passwort, WLAN)
 *   ibm-provision.conf  - Boot-Partition (nur Code und Server-URL)
 *   README.txt          - Kurzanleitung
 * Verarbeitet von Batteriemanagement/openhab/setup/prepare-sd.sh, oder von
 * Hand auf die Boot-Partition kopieren. Nur fuer den Vorstand (Route unter
 * /board).
 */

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, url }) {
    const id = Number(params.id);
    const plant = Number.isInteger(id) ? await getProvisioning(id) : null;
    if (!plant || !plant.provision_code) {
        error(404, { message: 'Keine Provisionierung fuer diese Anlage.' });
    }

    const baseUrl = `${url.protocol}//${url.host}`;
    const nnn = memberNumber(plant.member_identifier);
    const readme = `ISCHLSTROM Speichermanagement - SD-Karte fuer ${plant.name} (Mitglied ${nnn})

Am Entwicklungsrechner (Linux, als root):
  Batteriemanagement/openhab/setup/prepare-sd.sh sd-${nnn}.zip /dev/sdX

Oder von Hand:
  1. openHABian-Image mit dem Raspberry Pi Imager auf die Karte schreiben
     (64-bit, https://github.com/openhab/openhabian/releases).
  2. openhabian.conf und ibm-provision.conf aus diesem Zip auf die erste
     Partition der Karte kopieren (die kleine FAT-Partition "bootfs";
     die vorhandene openhabian.conf ersetzen).
  3. Ohne prepare-sd.sh fehlt der Autostart der Einrichtung: dann nach
     dem ersten Boot per SSH (openhabian / Linux-Passwort vom Dashboard)
       curl -fsSL ${baseUrl}/ibm/install.sh | sudo bash
     ausfuehren - der Code wird von der Karte gelesen, Rueckfragen gibt
     es keine.

Code: ${plant.provision_code} (gueltig bis ${new Date(plant.provision_expires).toLocaleDateString('de-AT')})
`;

    const zip = buildZip([
        { name: 'openhabian.conf', content: renderOpenhabianConf(plant) },
        { name: 'ibm-provision.conf', content: renderProvisionConf(plant, baseUrl) },
        { name: 'README.txt', content: readme }
    ]);

    return new Response(zip, {
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="sd-${nnn}.zip"`,
            'Cache-Control': 'no-store'
        }
    });
}
