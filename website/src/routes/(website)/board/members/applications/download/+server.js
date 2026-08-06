import * as XLSX from "xlsx";
import { getMembershipApplications } from "$lib/server/db/members/applications";

// Excel-Export der Bewerbungen fuer den Vorstand. Liegt im /board-Routen-
// Baum und ist damit ueber den Hook auf Vorstandsmitglieder beschraenkt.
/** @type {import('./$types').RequestHandler} */
export async function GET() {
    const applications = await getMembershipApplications();

    const rows = applications.map((a) => ({
        "Nr.": a.id,
        "Eingegangen": a.createdAtLabel,
        "Art": a.applicantType === "company" ? "Firma" : "Privatperson",
        "Vorname": a.firstName,
        "Nachname": a.lastName,
        "Firma": a.companyName,
        "E-Mail": a.email,
        "Straße": a.street,
        "HausNr.": a.hnr,
        "PLZ": a.zip,
        "Ort": a.city,
        "IBAN": a.iban,
        "Kontoinhaber": a.accountName,
        "Zählpunkte": (a.measurementPoints ?? [])
            .map((p) => `${p.identifier} (${p.type === "CONSUMPTION" ? "Bezug" : "Einspeisung"})`)
            .join(", "),
        "Statuten": a.acceptedTerms ? "Ja" : "Nein",
        "SEPA-Mandat": a.acceptedSepa ? "Ja" : "Nein",
        "Datenschutz zur Kenntnis": a.acknowledgedPrivacyNotice ? "Ja" : "Nein",
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Bewerbungen");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const today = new Date().toISOString().slice(0, 10);

    return new Response(buffer, {
        status: 200,
        headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="bewerbungen-${today}.xlsx"`,
        },
    });
}
