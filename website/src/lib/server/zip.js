// Minimaler Zip-Writer (Methode "stored", ohne Kompression) fuer die
// Download-Datei sd-<nnn>.zip der SD-Karten-Vorbereitung. Bewusst ohne
// Abhaengigkeit: drei kleine Textdateien brauchen keine Kompression, und
// jedes Betriebssystem oeffnet das Ergebnis.

const encoder = new TextEncoder();

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

/** @param {Uint8Array} buf */
function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

/** DOS-Datum/-Zeit fuer die Zip-Header. @param {Date} d */
function dosDateTime(d) {
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, date };
}

/**
 * Little-Endian-Schreiber auf einem Uint8Array.
 * @param {number} size
 */
function record(size) {
    const bytes = new Uint8Array(size);
    const view = new DataView(bytes.buffer);
    return {
        bytes,
        /** @param {number} v @param {number} o */ u16: (v, o) => view.setUint16(o, v, true),
        /** @param {number} v @param {number} o */ u32: (v, o) => view.setUint32(o, v >>> 0, true),
        /** @param {Uint8Array} src @param {number} o */ put: (src, o) => bytes.set(src, o)
    };
}

/**
 * @param {{ name: string, content: string | Uint8Array }[]} files
 * @returns {Uint8Array}
 */
export function buildZip(files) {
    const now = new Date();
    const { time, date } = dosDateTime(now);
    /** @type {Uint8Array[]} */
    const locals = [];
    /** @type {Uint8Array[]} */
    const centrals = [];
    let offset = 0;

    for (const file of files) {
        const name = encoder.encode(file.name);
        const data = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
        const crc = crc32(data);

        const local = record(30 + name.length);
        local.u32(0x04034b50, 0);
        local.u16(20, 4);      // version needed
        local.u16(0x0800, 6);  // flags: UTF-8 names
        local.u16(0, 8);       // method: stored
        local.u16(time, 10);
        local.u16(date, 12);
        local.u32(crc, 14);
        local.u32(data.length, 18);
        local.u32(data.length, 22);
        local.u16(name.length, 26);
        local.u16(0, 28);
        local.put(name, 30);

        const central = record(46 + name.length);
        central.u32(0x02014b50, 0);
        central.u16(20, 4);    // version made by
        central.u16(20, 6);    // version needed
        central.u16(0x0800, 8);
        central.u16(0, 10);
        central.u16(time, 12);
        central.u16(date, 14);
        central.u32(crc, 16);
        central.u32(data.length, 20);
        central.u32(data.length, 24);
        central.u16(name.length, 28);
        central.u16(0, 30);    // extra length
        central.u16(0, 32);    // comment length
        central.u16(0, 34);    // disk number
        central.u16(0, 36);    // internal attrs
        central.u32(0, 38);    // external attrs
        central.u32(offset, 42);
        central.put(name, 46);

        locals.push(local.bytes, data);
        centrals.push(central.bytes);
        offset += local.bytes.length + data.length;
    }

    const centralSize = centrals.reduce((n, b) => n + b.length, 0);
    const eocd = record(22);
    eocd.u32(0x06054b50, 0);
    eocd.u16(0, 4);
    eocd.u16(0, 6);
    eocd.u16(files.length, 8);
    eocd.u16(files.length, 10);
    eocd.u32(centralSize, 12);
    eocd.u32(offset, 16);
    eocd.u16(0, 20);

    const parts = [...locals, ...centrals, eocd.bytes];
    const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
    let pos = 0;
    for (const part of parts) { out.set(part, pos); pos += part.length; }
    return out;
}
