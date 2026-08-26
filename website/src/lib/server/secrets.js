import { env } from '$env/dynamic/private';

// Verschluesselung der Geheimnisse in members_openhabstatus (Cloud-Secret,
// Cloud-Passwort, Linux-Passwort, Wechselrichter-Passwort, WLAN-Passwort).
// AES-256-GCM (WebCrypto) mit dem Schluessel IBM_SECRET_KEY aus
// website/.env (64 Hex-Zeichen = 32 Bytes; erzeugen mit
// `openssl rand -hex 32`). Gespeichert wird "enc1:<iv>:<ciphertext+tag>"
// (Base64; der 16-Byte-GCM-Tag haengt am Ciphertext, wie WebCrypto ihn
// liefert). Dasselbe Format entschluesselt
// scripts/ibm-provision/cloud-makeuser.js im Cloud-Container auf s1 - der
// s1-Timer liest den Schluessel dafuer aus der .env der Website.

const PREFIX = 'enc1';
const subtle = globalThis.crypto.subtle;

/** @param {Uint8Array} bytes */
function toBase64(bytes) {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
}

/** @param {string} b64 */
function fromBase64(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/** @param {string} hex */
function fromHex(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
}

function keyHex() {
    const hex = (env.IBM_SECRET_KEY ?? '').trim();
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
        throw new Error('IBM_SECRET_KEY fehlt in website/.env oder hat nicht 64 Hex-Zeichen (openssl rand -hex 32).');
    }
    return hex;
}

/** @type {Promise<CryptoKey> | null} */
let cachedKey = null;

function key() {
    if (!cachedKey) {
        cachedKey = subtle.importKey('raw', fromHex(keyHex()), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    }
    return cachedKey;
}

/** Ist die Verschluesselung konfiguriert? */
export function secretsConfigured() {
    return /^[0-9a-fA-F]{64}$/.test((env.IBM_SECRET_KEY ?? '').trim());
}

/**
 * @param {string} plain
 * @returns {Promise<string>} "enc1:iv:ciphertext" oder '' fuer leere Eingabe
 */
export async function encryptSecret(plain) {
    if (!plain) return '';
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(plain));
    return [PREFIX, toBase64(iv), toBase64(new Uint8Array(ct))].join(':');
}

/**
 * @param {string | null | undefined} stored
 * @returns {Promise<string>} Klartext; '' fuer leer. Unverschluesselte
 *   Altwerte (ohne Praefix) kommen unveraendert zurueck.
 */
export async function decryptSecret(stored) {
    if (!stored) return '';
    if (!stored.startsWith(PREFIX + ':')) return stored;
    const [, ivB64, ctB64] = stored.split(':');
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(ivB64) }, await key(), fromBase64(ctB64));
    return new TextDecoder().decode(plain);
}

// Zeichenvorrat ohne verwechselbare Zeichen (0/O, 1/l/I) - die Werte werden
// abgetippt oder in der openHAB-App eingegeben; nur Buchstaben und Ziffern,
// weil die iOS-App an Sonderzeichen im Cloud-Passwort scheitert.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/**
 * Zufaelliges alphanumerisches Passwort.
 * @param {number} length
 */
export function randomPassword(length = 16) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
    let out = '';
    for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
    return out;
}

/**
 * Passwort fuer die Eingabe am Smartphone (Cloud-Konto in der openHAB-App):
 * 9 Kleinbuchstaben gefolgt von 3 Ziffern, ohne verwechselbare Zeichen
 * (l, o, 0, 1). Kein Shift, keine Sonderzeichen, nur ein Wechsel auf die
 * Zifferntastatur - rund 50 Bit Entropie, fuer das Cloud-Konto ausreichend
 * (das Mitglied kann jederzeit ein neues anfordern).
 */
export function randomPhonePassword() {
    const letters = 'abcdefghijkmnpqrstuvwxyz';
    const digits = '23456789';
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(12));
    let out = '';
    for (let i = 0; i < 9; i++) out += letters[bytes[i] % letters.length];
    for (let i = 9; i < 12; i++) out += digits[bytes[i] % digits.length];
    return out;
}

/**
 * Provisionierungs-Code fuer die SD-Karte: "XXXX-XXXX" aus Grossbuchstaben
 * und Ziffern ohne verwechselbare Zeichen (rund 40 Bit, zeitlich begrenzt
 * gueltig).
 */
export function randomProvisionCode() {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8));
    let s = '';
    for (let i = 0; i < 8; i++) s += upper[bytes[i] % upper.length];
    return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** UUID fuer die openHAB-Cloud-Identitaet der Anlage (userdata/uuid). */
export function randomCloudUuid() {
    return globalThis.crypto.randomUUID();
}

/**
 * Secret des Cloud-Connectors (userdata/openhabcloud/secret). Das Addon
 * erzeugt selbst 20 alphanumerische Zeichen; gleiches Format.
 */
export function randomCloudSecret() {
    return randomPassword(20);
}
