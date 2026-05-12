
import { setWelcomeMessageSent } from '$lib/server/db/members/member';
import { relay, relayDebug, relayHtml } from '$lib/server/mail/smtp';


function formatDateToDDMMYYYY(dateString) {
    const [year, month, day] = dateString.split('-');
    return `${day}.${month}.${year}`;
}

/**
 * Sends a welcome email to each unique member in the notifications array.
 */
export async function sendWelcomeEmails(pendingActiveNotifications) {

    // Iterate and send emails
    for (const member of pendingActiveNotifications) {

        const activationDate = formatDateToDDMMYYYY(member.memberSince);

        const mailOptions = {
            from: `"EEG ISCHLSTROM" <info@ischlstrom.org>`,
            to: member.email,
            //to: "martin.aigner@ischlstrom.org",
            cc: "info@ischlstrom.org",
            subject: `Zählpunkt aktiviert`,
            html: `
                <h1>Willkommen bei ISCHL STROM</h1>
                <p>Hallo ${member.name},</p>

                <p>
                Sie haben sich mit der E-Mail Adresse ${member.email} bei der
                Erneuerbaren Energiegemeinschaft ISCHL STROM 
                angemeldet. 
                </p>

                <p>Wir dürfen Sie darüber informieren, dass Ihr Zählpunkt mit der Nummer</p>
                <p>${member.pointIdentifier}</p>
                <p>am ${activationDate} erfolgreich vom Netzbetreiber für ISCHL STROM aktiviert wurde.</p>
                <p>Der Anmeldeprozess ist damit abgeschlossen und Ihr oben genannter Zählpunkt ist nun Teil der Energiegemeinschaft ISCHL STROM.</p>
                <p>Falls Sie noch weitere Fragen haben, kontaktieren Sie uns jederzeit unter</p>
                <p>info@ischlstrom.org</p>
                <p>Beste Grüße,<br />der Vorstand der<br />EEG ISCHL STROM</p>
                <p>https://ischlstrom.org</p>
            `,
        };

        console.log({ mailOptions });


        try {
            //await transporter.sendMail(mailOptions);
            console.log(`Welcome email sending to ${member.email}`);

            //export async function relayHtml(originEmail, recipientEmail, subject, html) {
            const result = await relayHtml(mailOptions.from, mailOptions.to, mailOptions.subject, mailOptions.html);
            console.log(`Email relay result for ${member.email}:`, result);

            if (result.message === "OK") {
                const r = await setWelcomeMessageSent(member.pointId);
                console.log({r});
            }

            // on success, update the member's welcomeEmailSent status in the database

        } catch (error) {
            console.error(`Failed to send email to ${member.email}:`, error);
        }
    }
}