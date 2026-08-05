import { relayHtml } from '$lib/server/mail/smtp.js';
import { saveMembershipApplication } from '$lib/server/db/members/applications.js';

function obfuscateIBAN(iban) {
    // Remove spaces for processing
    const cleanIBAN = iban.replace(/\s+/g, "");

    // Keep first 4 and last 4 characters visible, mask the rest
    const visibleStart = cleanIBAN.slice(0, 4);
    const visibleEnd = cleanIBAN.slice(-4);
    const maskedMiddle = "*".repeat(cleanIBAN.length - 8); // Replace middle with *

    // Format back with spaces every 4 characters
    const obfuscatedIBAN = (visibleStart + maskedMiddle + visibleEnd).match(/.{1,4}/g).join(" ");

    return obfuscatedIBAN;
}

function summaryEmailExternal(d) {

    let a = d.applicationData;
    let name = d.homeOrCompany === "home" ? a.firstName + " " + a.lastName : a.companyName;

    let html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Ihre Bewerbung bei der Energiegemeinschaft ISCHLSTROM</title>
</head>
<body>
    <p>Sehr geehrte(r) ${name},</p>

    <p>hiermit erhalten Sie eine Zusammenfassung Ihrer angegebenen Daten:</p>

    <h3>Persönliche Informationen:</h3>
    <p><strong>Name:</strong> ${name}</p>
    <p><strong>Anschrift:</strong><br>
       ${a.address.street} ${a.address.number},<br>
       ${a.address.zipCode} ${a.address.city}</p>

    <h3>Bankverbindung:</h3>
    <p><strong>IBAN:</strong> ${obfuscateIBAN(a.iban)}</p>
    <p><strong>Kontoinhaber:</strong> ${a.accountName}</p>

    <h3>Messpunkte:</h3>
    <ul>`;


    for (let i = 0; i < a.measurementPoints.length; i++) {
        html += `
        <li>
            <strong>${a.measurementPoints[i].identifier}</strong>
             - ${a.measurementPoints[i].type === "CONSUMPTION" ? "Bezug" : "Einspeisung"}
        </li>`;
    }

    html += `</ul>

    <h3>Abgegebene Erklärungen:</h3>
    <ul>
        <li>Statuten akzeptiert: ${a.checkBoxes.terms === true ? "Ja" : "Nein"}</li>
        <li>SEPA-Mandat erteilt: ${a.checkBoxes.sepa === true ? "Ja" : "Nein"}</li>
        <li>Datenschutzerklärung zur Kenntnis genommen: ${a.checkBoxes.privacyNotice === true ? "Ja" : "Nein"}</li>
    </ul>

    <p>
        Sie erhalten in den nächsten Tagen ein E-Mail mit dem Betreff
        <strong>Aktivierung im Serviceportal</strong> von unserer Verwaltungssoftware EEGFaktura.
        Darin enthalten ist eine Beschreibung der für Sie abschließenden Schritte zur Datenfreigabe im eService-Portal
        der NetzOÖ. Danach sind Ihre Zählpunkte Teil der Energiegemeinschaft.
    </p>

    <p>Falls Sie Fragen haben, kontaktieren Sie uns bitte unter <strong>info@ischlstrom.org</strong></p>

    <p>Informationen zur Verarbeitung Ihrer Daten finden Sie unter
    <a href="https://ischlstrom.org/datenschutz">https://ischlstrom.org/datenschutz</a></p>

    <p>Mit freundlichen Grüßen,<br>
       Der Vorstand von ISCHLSTROM</p>
</body>
</html>
    `;

    return html;
}


// Interne Benachrichtigung an den Vorstand. Bewusst ohne unmaskierte IBAN:
// die vollstaendigen Daten liegen in members_membershipapplication
// (einsehbar im Django-Admin), E-Mail ist kein sicherer Kanal dafuer.
function summaryEmailInternal(d, applicationId) {

    let a = d.applicationData;
    let name = d.homeOrCompany === "home" ? a.firstName + "<br />" + a.lastName : a.companyName;

    let html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Bewerbung bei der Energiegemeinschaft ISCHLSTROM</title>
</head>
<body>
    <h3>${d.homeOrCompany}</h3>

    <h3>Persönliche Informationen:</h3>
    <p><strong>Name:</strong><br/> ${name}</p>
    <p><strong>Anschrift:</strong><br>
       ${a.address.street}<br/>${a.address.number}<br>
       ${a.address.zipCode}<br/>${a.address.city}</p>

    <h3>E-Mail</h3>
    ${d.email}

    <h3>Bankverbindung:</h3>
    <p><strong>IBAN:</strong> ${obfuscateIBAN(a.iban)}</p>
    <p><strong>Kontoinhaber:</strong> ${a.accountName}</p>
    <p>Die vollständigen Daten sind in der Datenbank gespeichert
    (Bewerbung Nr. ${applicationId}, einsehbar im Django-Admin).</p>

    <h3>Messpunkte:</h3>
    <ul>`;


    for (let i = 0; i < a.measurementPoints.length; i++) {
        html += `
        <li>
            ${a.measurementPoints[i].identifier}
             - ${a.measurementPoints[i].type === "CONSUMPTION" ? "Bezug" : "Einspeisung"}
        </li>`;
    }

    html += `</ul>

    <h3>Abgegebene Erklärungen:</h3>
    <ul>
        <li>Statuten akzeptiert: ${a.checkBoxes.terms === true ? "Ja" : "Nein"}</li>
        <li>SEPA-Mandat erteilt: ${a.checkBoxes.sepa === true ? "Ja" : "Nein"}</li>
        <li>Datenschutzerklärung zur Kenntnis genommen: ${a.checkBoxes.privacyNotice === true ? "Ja" : "Nein"}</li>
    </ul>

</body>
</html>
    `;

    return html;
}


/** @type {import('../../$types').RequestHandler} */
export async function POST(event) {

    const session = await event.locals.auth();

    if (!session?.user?.email) {
        return new Response(null, { status: 401, statusText: "Unauthorized" })
    }

    // Die Bestaetigung geht immer an die angemeldete Adresse, nie an eine
    // frei waehlbare (sonst waere der Endpunkt ein Mail-Relay).
    const email = session.user.email;

    try {
        const { homeOrCompany, applicationData } = await event?.request?.json();

        if (homeOrCompany !== "home" && homeOrCompany !== "company") {
            return new Response(JSON.stringify({ error: "Invalid request" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const a = applicationData;
        if (!a?.address || !a?.iban || !a?.accountName || !Array.isArray(a?.measurementPoints)) {
            return new Response(JSON.stringify({ error: "Invalid request" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Bewerbung samt Erklaerungen dauerhaft speichern (Art. 7 Abs. 1 DSGVO)
        const saved = await saveMembershipApplication({
            email,
            applicantType: homeOrCompany,
            firstName: a.firstName,
            lastName: a.lastName,
            companyName: a.companyName,
            street: a.address.street,
            hnr: a.address.number,
            zip: a.address.zipCode,
            city: a.address.city,
            iban: a.iban,
            accountName: a.accountName,
            measurementPoints: a.measurementPoints,
            acceptedTerms: a.checkBoxes?.terms,
            acceptedSepa: a.checkBoxes?.sepa,
            acknowledgedPrivacyNotice: a.checkBoxes?.privacyNotice,
        });

        const htmlExternal = summaryEmailExternal({ email, homeOrCompany, applicationData });
        const htmlInternal = summaryEmailInternal({ email, homeOrCompany, applicationData }, saved?.id);

        await relayHtml("info@ischlstrom.org", email, "Ihre Bewerbung bei der Energiegemeinschaft ISCHLSTROM", htmlExternal);
        await relayHtml("info@ischlstrom.org", "info@ischlstrom.org", `Neue Bewerbung von ${email}`, htmlInternal);

        console.log(`membership application ${saved?.id} received`);

        return new Response(JSON.stringify({ message: "Data received successfully!" }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    } catch (error) {
        console.error("membership application failed:", error?.message ?? error);
        return new Response(JSON.stringify({ error: "Invalid request" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }
}
