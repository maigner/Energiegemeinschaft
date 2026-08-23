import { error } from '@sveltejs/kit';
import { getProvisioning, renderOpenhabianConf, renderProvisionConf, renderUserData, memberNumber } from '$lib/server/db/members/openhabProvision';
import { buildZip } from '$lib/server/zip';

/**
 * Download fuer die SD-Karten-Vorbereitung: sd-<nnn>.zip mit
 *   openhabian.conf     - Boot-Partition (Hostname, Linux-Passwort, WLAN)
 *   ibm-provision.conf  - Boot-Partition (nur Code und Server-URL)
 *   user-data           - Boot-Partition (cloud-init: Autostart ibm-firstboot)
 *   README.txt          - Kurzanleitung
 * Verarbeitet von Batteriemanagement/openhab/setup/prepare-sd.sh (macOS oder
 * Linux), oder von Hand auf die Boot-Partition kopieren - SSH auf den Pi ist
 * in keinem Fall noetig. Nur fuer den Vorstand (Route unter /board).
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

Am Entwicklungsrechner (macOS oder Linux, als root):
  sudo Batteriemanagement/openhab/setup/prepare-sd.sh sd-${nnn}.zip <geraet>
  (<geraet> z. B. /dev/disk4 unter macOS, /dev/sdb unter Linux; ohne
  Angabe listet das Skript die moeglichen Karten auf)

Oder von Hand:
  1. openHABian-Image mit dem Raspberry Pi Imager auf die Karte schreiben
     (64-bit, https://github.com/openhab/openhabian/releases), ohne
     eigene Anpassungen im Imager.
  2. Die drei Konfigurationsdateien aus diesem Zip (openhabian.conf,
     ibm-provision.conf, user-data) auf die erste Partition der Karte
     kopieren (die kleine FAT-Partition "bootfs"; vorhandene Dateien
     ersetzen).

Oder ganz ohne dieses Zip: am Dashboard "Image erstellen" und das fertige
pi-${nnn}.img.gz mit dem Raspberry Pi Imager schreiben (Windows, macOS,
Linux).

Danach die Karte in den Pi, LAN-Kabel (gleiches Netz wie der
Wechselrichter) und Strom anstecken - der Rest laeuft von selbst, SSH ist
nicht noetig: die user-data installiert beim ersten Boot den Autostart
(ibm-firstboot), der nach der openHABian-Erstinstallation die Einrichtung
von ${baseUrl} startet. Fortschritt am Dashboard und im Mitgliederbereich.

Code: ${plant.provision_code} (gueltig bis ${new Date(plant.provision_expires).toLocaleDateString('de-AT')})
`;

    const zip = buildZip([
        { name: 'openhabian.conf', content: renderOpenhabianConf(plant) },
        { name: 'ibm-provision.conf', content: renderProvisionConf(plant, baseUrl) },
        { name: 'user-data', content: renderUserData() },
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
