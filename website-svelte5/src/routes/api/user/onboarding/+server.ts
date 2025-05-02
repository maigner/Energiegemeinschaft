import { relayHtml } from '$lib/server/mail/smtp.js';

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

    <h3>Zustimmungen:</h3>
    <ul>
        <li>Statuten akzeptiert: ${a.checkBoxes.terms === true ? "Ja" : "Nein"}</li>
        <li>SEPA-Mandat erteilt: ${a.checkBoxes.sepa === true ? "Ja" : "Nein"}</li>
        <li>Datenverarbeitung zugestimmt: ${a.checkBoxes.dataProcessing === true ? "Ja" : "Nein"}</li>
        <li>Newsletter-Anmeldung: ${a.checkBoxes.newsletter === true ? "Ja" : "Nein"}</li>
    </ul>

    <p>
        Sie erhalten in den nächsten Tagen ein E-Mail mit dem Betreff
        <strong>Aktivierung im Serviceportal</strong> von unserer Verwaltungssoftware EEGFaktura.
        Darin enthalten ist eine Beschreibung der für Sie abschließenden Schritte zur Datenfreigabe im eService-Portal
        der NetzOÖ. Danach sind Ihre Zählpunkte Teil der Energiegemeinschaft.
    </p>
    
    <p>Falls Sie Fragen haben, kontaktieren Sie uns bitte unter <strong>info@ischlstrom.org</strong></p>

    
    <p>Mit freundlichen Grüßen,<br>
       Der Vorstand von ISCHLSTROM</p>
</body>
</html>
    `;

    return html;
}


function summaryEmailInternal(d) {

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
    
    <h3>Bankverbindung:</h3>
    <p><strong>IBAN:</strong> ${a.iban}</p>
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

    <h3>Zustimmungen:</h3>
    <ul>
        <li>Statuten akzeptiert: ${a.checkBoxes.terms === true ? "Ja" : "Nein"}</li>
        <li>SEPA-Mandat erteilt: ${a.checkBoxes.sepa === true ? "Ja" : "Nein"}</li>
        <li>Datenverarbeitung zugestimmt: ${a.checkBoxes.dataProcessing === true ? "Ja" : "Nein"}</li>
        <li>Newsletter-Anmeldung: ${a.checkBoxes.newsletter === true ? "Ja" : "Nein"}</li>
    </ul>

</body>
</html>
    `;

    return html;
}


// authenticate by token
/** @type {import('../../$types').RequestHandler} */
export async function POST(event) {

    //console.log({event});

    const session = await event.locals.auth();

    //session?.user?.email
    //console.log(session.user.email);

    if (!session?.user?.email) {
        return new Response(null, { status: 401, statusText: "Unauthorized" })
    }



    try {
        const { email, homeOrCompany, applicationData } = await event?.request?.json();

        //console.log("Received data:", { email, homeOrCompany, applicationData });

        const htmlExternal = summaryEmailExternal({ email, homeOrCompany, applicationData });
        const htmlInternal = summaryEmailInternal({ email, homeOrCompany, applicationData });

        const sentExternal = await relayHtml("info@ischlstrom.org", email, "Ihre Bewerbung bei der Energiegemeinschaft ISCHLSTROM", htmlExternal);
        console.log(JSON.stringify({sentExternal}));

        const sentInternal = await relayHtml("info@ischlstrom.org", "info@ischlstrom.org", `Neue Bewerbung von ${email}`, htmlInternal);
        console.log(JSON.stringify({sentInternal}));


        //const result = await getAverageMetrics(userId, startDate, endDate);


        return new Response(JSON.stringify({ message: "Data received successfully!", received: { email, homeOrCompany, applicationData } }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: "Invalid request" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }



}