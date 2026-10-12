/**
 * Pruefmuster fuer Werte, die ein Pi an die Website meldet und die spaeter
 * in Dateipfaden, in der von openHABian als root gelesenen openhabian.conf
 * (hostname=) und in der wg0.conf auf s1 landen (ibm-provision-sync.sh).
 * Ohne diese Pruefung koennte ein kompromittierter Pi mit seinem eigenen
 * Token Pfade verlassen, Shell-Zeilen in die naechste SD-Karte schreiben
 * oder mit einem Zeilenumbruch die WireGuard-Konfiguration der ganzen
 * Flotte unbrauchbar machen (Security-Audit 2026-10-11). Die Muster gelten
 * an den Endpoints (400) und noch einmal in den Senken (Ausnahme).
 *
 * Kein Server-Import, damit die Muster auch im Browser und in Tests
 * verwendbar sind.
 */

/** RFC-1123-Label: Buchstaben, Ziffern, Bindestrich, max. 63 Zeichen. */
export const HOSTNAME_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/;

/** WireGuard-Public-Key: 32 Byte Base64, immer 44 Zeichen mit "=" am Ende. */
export const WG_PUBLIC_KEY_RE = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/;

/** Profilname (inverters/<profil>/), wie ihn auch das Dashboard verlangt. */
export const INVERTER_TYPE_RE = /^[a-z0-9-]{0,50}$/;

/** @param {unknown} v */
export const isHostname = (v) => typeof v === 'string' && HOSTNAME_RE.test(v);
/** @param {unknown} v */
export const isWgPublicKey = (v) => typeof v === 'string' && WG_PUBLIC_KEY_RE.test(v);
/** @param {unknown} v */
export const isInverterType = (v) => typeof v === 'string' && INVERTER_TYPE_RE.test(v);
