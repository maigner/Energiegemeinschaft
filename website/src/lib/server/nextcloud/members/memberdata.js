import os from "os";
import { nextcloudClient } from "../client";
import path from "path";
import fs from "fs";
import * as XLSX from "xlsx";
import { middlewareDbConnection } from "$lib/server/db/db";

export const importMemberDataFromNextcloud = async () => {

    // EEGFaktura Member sheet from Nextcloud
    const dir = "/website/board/members/import";

    const nextcloud = nextcloudClient();
    const directoryItems = await nextcloud.getDirectoryContents(dir);

    const filtered = directoryItems.filter(item =>
        /^RC101533-EEG-Masterdata.*\.xlsx$/.test(item.basename)
    );

    const latest = filtered.reduce((a, b) =>
        new Date(a.lastmod) > new Date(b.lastmod) ? a : b
    );

    console.log({ latest });

    // download latest to tmp
    const tmpDir = os.tmpdir();

    const localPath = path.join(tmpDir, latest.basename);

    // load file to buffer
    const fileContent = await nextcloud.getFileContents(latest.filename, { format: "binary" });

    //fs.writeFileSync(localPath, fileContent, "binary");

    // open the xlsx, read the data and import to DB

    // sheetname: "Mitglieder"

    const workbook = XLSX.read(fileContent, { type: "buffer" });
    const sheet = workbook.Sheets["Mitglieder"];
    if (!sheet) throw new Error('Sheet "Mitglieder" not found');


    const rows = XLSX.utils.sheet_to_json(sheet);
    console.log(Object.keys(rows[0])); // inspect exact header names

    console.log(rows[0]);

    const messages = await upsertMembersFromSpreadsheet(rows);

    return messages;

};



export const upsertMembersFromSpreadsheet = async (rows) => {
    const sql = await middlewareDbConnection();

    let messages = [];

    try {
        for (const row of rows) {
            const identifier = row["Mit. Nr."];
            if (!identifier) continue;

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
                email        = EXCLUDED.email,
                name         = EXCLUDED.name,
                first_name   = EXCLUDED.first_name,
                last_name    = EXCLUDED.last_name,
                street       = EXCLUDED.street,
                hnr          = EXCLUDED.hnr,
                zip          = EXCLUDED.zip,
                city         = EXCLUDED.city,
                member_since = EXCLUDED.member_since
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

            console.log(message);

            messages.push(message);

        }
    } finally {
        sql.release();
    }
    return messages;
};

