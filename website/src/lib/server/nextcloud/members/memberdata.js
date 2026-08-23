import { nextcloudClient } from "../client";
import * as XLSX from "xlsx";
import { middlewareDbConnection } from "$lib/server/db/db";

/**
 * Datum aus dem Dateinamen (RC101533-EEG-Masterdata-YYYYMMDD.xlsx) als
 * sortierbare Zahl. Dateien ohne Datum im Namen liefern 0.
 * @param {string} basename
 */
const masterdataFileDate = (basename) => {
    const match = /(\d{8})/.exec(basename);
    return match ? Number(match[1]) : 0;
};

/**
 * Importiert das aktuellste EEG-Faktura-Masterdata-Sheet aus Nextcloud.
 * "Aktuellst" ist die Datei mit dem juengsten Datum im Dateinamen; bei
 * gleichem Datum entscheidet die Aenderungszeit. Die Aenderungszeit allein
 * ist nicht verlaesslich, weil der Nextcloud-Desktop-Client die lokale
 * mtime beim Upload beibehaelt.
 *
 * @returns {Promise<{ file: { name: string, lastmod: string }, messages: string[] }>}
 */
export const importMemberDataFromNextcloud = async () => {

    // EEGFaktura Member sheet from Nextcloud
    const dir = "/website/board/members/import";

    const nextcloud = nextcloudClient();
    const directoryItems = await nextcloud.getDirectoryContents(dir);

    const filtered = directoryItems.filter(item =>
        /^RC101533-EEG-Masterdata.*\.xlsx$/.test(item.basename)
    );

    if (filtered.length === 0) {
        throw new Error(`Keine Masterdata-Datei in Nextcloud unter ${dir} gefunden`);
    }

    const latest = filtered.reduce((a, b) => {
        const dateA = masterdataFileDate(a.basename);
        const dateB = masterdataFileDate(b.basename);
        if (dateA !== dateB) return dateA > dateB ? a : b;
        return new Date(a.lastmod) > new Date(b.lastmod) ? a : b;
    });

    // load file to buffer
    const fileContent = await nextcloud.getFileContents(latest.filename, { format: "binary" });

    // open the xlsx, read the data and import to DB

    // sheetname: "Mitglieder"

    const workbook = XLSX.read(fileContent, { type: "buffer" });
    const sheet = workbook.Sheets["Mitglieder"];
    if (!sheet) throw new Error('Sheet "Mitglieder" not found');

    const rows = XLSX.utils.sheet_to_json(sheet);

    // import member data
    const messages = await upsertMembersFromSpreadsheet(rows);

    // import meter point data
    const measurementPointMessages = await upsertMeasurementPointsFromSpreadsheet(rows);

    return {
        file: { name: latest.basename, lastmod: latest.lastmod },
        messages: [...messages, ...measurementPointMessages]
    };
};



/**
 * Identifier von nach Art. 17 DSGVO geloeschten Mitgliedern. Der Import darf
 * diese Zeilen nicht wieder anlegen, solange sie noch im Masterdata-Sheet
 * stehen (sonst wuerde eine Loeschung beim naechsten Import rueckgaengig
 * gemacht). Pflege der Liste: Django-Admin, Tabelle members_membertombstone.
 */
const getTombstonedIdentifiers = async (sql) => {
    const result = await sql.query(`SELECT identifier FROM members_membertombstone`);
    return new Set(result.rows.map((row) => Number(row.identifier)));
};

export const upsertMembersFromSpreadsheet = async (rows) => {
    const sql = await middlewareDbConnection();

    let messages = [];

    try {
        const tombstoned = await getTombstonedIdentifiers(sql);

        for (const row of rows) {
            const identifier = row["Mit. Nr."];
            if (!identifier) continue;
            if (tombstoned.has(Number(identifier))) {
                messages.push(`[SKIPPED] ${identifier}: tombstoned (geloeschtes Mitglied)`);
                continue;
            }

            const firstName = row["Name 1"] ?? null;
            const lastName = row["Name 2"] ?? null;
            const fullName = [firstName, lastName].filter(Boolean).join(" ");

            const result = await sql.query(`
                INSERT INTO members_member (
                identifier, email, name, first_name, last_name,
                street, hnr, zip, city, member_since, board_member
                ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false
                )
                ON CONFLICT (identifier) DO UPDATE SET
                email        = COALESCE(EXCLUDED.email, members_member.email),
                name         = COALESCE(EXCLUDED.name, members_member.name),
                first_name   = COALESCE(EXCLUDED.first_name, members_member.first_name),
                last_name    = COALESCE(EXCLUDED.last_name, members_member.last_name),
                street       = COALESCE(EXCLUDED.street, members_member.street),
                hnr          = COALESCE(EXCLUDED.hnr, members_member.hnr),
                zip          = COALESCE(EXCLUDED.zip, members_member.zip),
                city         = COALESCE(EXCLUDED.city, members_member.city),
                member_since = COALESCE(EXCLUDED.member_since, members_member.member_since)
            RETURNING *, xmax::text::int > 0 AS updated
      `, [
                identifier,
                row["E-Mail"] || null,
                fullName || null,
                firstName,
                lastName,
                row["Straße"] || null,
                row["HausNr."] || null,
                row["PLZ"] || null,
                (row["Ort"] || "").trim().slice(0, 20) || null,
                row["Mitglied seit."] || null,
            ]);

            const record = result.rows[0];
            const action = record.updated ? "UPDATED" : "INSERTED";

            let message = `[${action}] ${record.identifier}: ${record.first_name} ${record.last_name} <${record.email}>`;

            //console.log(message);

            messages.push(message);

        }
    } finally {
        sql.release();
    }
    return messages;
};

export const upsertMeasurementPointsFromSpreadsheet = async (rows) => {
    const sql = await middlewareDbConnection();

    let messages = [];

    try {
        const tombstoned = await getTombstonedIdentifiers(sql);

        for (const row of rows) {
            const identifier = row["Zählpunkt"];
            if (!identifier) continue;
            if (tombstoned.has(Number(row["Mit. Nr."]))) {
                continue;
            }

            // Look up member by identifier
            const memberResult = await sql.query(
                `SELECT id FROM members_member WHERE identifier = $1`,
                [row["Mit. Nr."]]
            );
            if (!memberResult.rows.length) {
                console.warn(`[SKIPPED] No member found for Mit. Nr. ${row["Mit. Nr."]}`);
                continue;
            }
            const memberId = memberResult.rows[0].id;

            const result = await sql.query(`
        INSERT INTO members_measurementpoint (
          identifier, type, status, member_id, welcome_message_sent_at
        ) VALUES (
          $1, $2, $3, $4, null
        )
        ON CONFLICT (identifier) DO UPDATE SET
          type      = EXCLUDED.type,
          status    = EXCLUDED.status,
          member_id = EXCLUDED.member_id
        RETURNING *, xmax::text::int > 0 AS updated
      `, [
                identifier,
                row["Bezugsrichtung"] || null,
                row["ZP-Status"] || null,
                memberId,
            ]);

            const record = result.rows[0];
            const action = record.updated ? "UPDATED" : "INSERTED";
            const message =`[${action}] ${record.identifier} (member_id: ${record.member_id})`;
            messages.push(message);
        }
    } finally {
        sql.release();
    }
    return messages;
};