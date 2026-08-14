import { relayHtml } from '$lib/server/mail/smtp.js';
import { saveMembershipApplication, getMembershipApplicationsByEmail } from '$lib/server/db/members/applications.js';
import { isValidIBAN } from '$lib/iban.js';
import { isValidMeasurementPointIdentifier } from '$lib/measurementPointFormat.js';

// Maximallaengen entsprechen dem Django-Modell MembershipApplication
function isFilled(value: unknown, maxLength: number) {
    return typeof value === "string" && value.trim() !== "" && value.length <= maxLength;
}

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
    <title>Ihr Beitrittsantrag bei der Energiegemeinschaft ISCHLSTROM</title>
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
    <p>Die vollständigen Daten sind in der Datenbank gespeichert:
    <a href="https://ischlstrom.org/board/members/applications#application-${applicationId}">Bewerbung Nr. ${applicationId} im Vorstandsbereich öffnen</a></p>

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

        // Dieselben Regeln wie im Formular; hier erneut geprueft, weil der
        // Endpunkt auch ohne das Formular erreichbar ist.
        const a = applicationData;

        const validBase =
            isFilled(a?.address?.street, 200) &&
            isFilled(a?.address?.number, 20) &&
            isFilled(a?.address?.zipCode, 10) &&
            isFilled(a?.address?.city, 100) &&
            isFilled(a?.accountName, 200) &&
            isFilled(a?.iban, 42) &&
            isValidIBAN(a.iban) &&
            Array.isArray(a?.measurementPoints) &&
            a.measurementPoints.length >= 1 &&
            a.measurementPoints.every((p: { identifier?: string; type?: string }) =>
                isValidMeasurementPointIdentifier(p?.identifier) &&
                // Firmen koennen nur Strom beziehen, nicht einspeisen
                (p?.type === "CONSUMPTION" ||
                    (p?.type === "GENERATION" && homeOrCompany === "home")));

        const validName = homeOrCompany === "home"
            ? isFilled(a?.firstName, 200) && isFilled(a?.lastName, 200)
            : isFilled(a?.companyName, 200);

        // Die Erklaerungen sind Aufnahmevoraussetzung; die gespeicherte Zeile
        // dient als Consent-Nachweis und darf daher nie "false" enthalten.
        const validDeclarations =
            a?.checkBoxes?.terms === true &&
            a?.checkBoxes?.sepa === true &&
            a?.checkBoxes?.privacyNotice === true;

        if (!validBase || !validName || !validDeclarations) {
            return new Response(JSON.stringify({ error: "Invalid request" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const existing = await getMembershipApplicationsByEmail(email);
        if (existing?.length >= 5) {
            return new Response(JSON.stringify({ error: "Too many applications" }), {
                status: 429,
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

        // Ab hier ist die Bewerbung gespeichert; ein Mailfehler darf dem
        // Bewerber nicht als Fehlschlag gemeldet werden (sonst Doppel-Bewerbung).
        try {
            const htmlExternal = summaryEmailExternal({ email, homeOrCompany, applicationData });
            const htmlInternal = summaryEmailInternal({ email, homeOrCompany, applicationData }, saved?.id);

            await relayHtml("info@ischlstrom.org", email, "Ihr Beitrittsantrag bei der Energiegemeinschaft ISCHLSTROM", htmlExternal);
            await relayHtml("info@ischlstrom.org", "info@ischlstrom.org", `Neue Bewerbung von ${email}`, htmlInternal);
        } catch (mailError) {
            console.error(`membership application ${saved?.id} mail failed:`, mailError?.message ?? mailError);
        }

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
