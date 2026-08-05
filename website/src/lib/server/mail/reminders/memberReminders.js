
import { getMembersWithPendingMeasurementPointsForFirstReminder, getMembersWithPendingMeasurementPointsForSecondReminder, setActivationReminderSent, setWelcomeMessageSent } from '$lib/server/db/members/member';
import { relayHtml } from '$lib/server/mail/smtp';


/**
 * Sends a welcome email to each unique member in the notifications array.
 */
export async function sendActivationReminders() {


    let pendingActivations = await getMembersWithPendingMeasurementPointsForFirstReminder();
    //pendingActivations = pendingActivations.slice(0, 2); // Limit to 2 for testing purposes

    // Iterate and send emails
    for (const member of pendingActivations) {

        const mailOptions = {
            from: `"EEG ISCHLSTROM" <info@ischlstrom.org>`,
            to: member.email,
            cc: "info@ischlstrom.org",
            subject: `Erinnerung: Datenfreigabe für Zählpunkt ${member.pointIdentifier}`,
            html: `
                <p>Hallo ${member.name},</p>

                <p>
                Sie haben sich mit der E-Mail Adresse ${member.email} bei der
                Erneuerbaren Energiegemeinschaft ISCHL STROM 
                angemeldet. 
                </p>

                <p>
                Betreffender Zählpunkt: ${member.pointIdentifier}
                </p>

                <p>
                Damit Ihr Zählpunkt tatsächlich Energie mit den anderen Mitgliedern 
                austauschen kann, muss der EEG noch der Zugriff auf Ihre Energiedaten 
                gewährt werden.
                </p>

                <p>
                Dies können Sie über das eService Portal der NetzOÖ tun, indem Sie
                im Menüpunkt "Datenfreigabe" bei ISCHLSTROM auf das blaue Häkchen klicken.
                </p>

                <p>
                Link zum eService Portal der NetzOÖ: 
                <a href="https://eservice.netzooe.at">https://eservice.netzooe.at</a>
                </p>

                <p>
                Falls Sie noch keinen Zugang zum eService Portal der NetzOÖ haben, 
                finden Sie auf unserer Webseite eine kurze Anleitung unter 
                <a href="https://ischlstrom.org/mitmachen">https://ischlstrom.org/mitmachen</a>
                </p>

                <p>
                Hilfe bekommen Sie auch bei NetzOÖ unter der Service-Hotline 05 9070
                </p>
                
                <p>Falls Sie noch weitere Fragen haben, kontaktieren Sie uns 
                jederzeit unter info@ischlstrom.org </p>
                
                <p>Beste Grüße,<br />der Vorstand der<br />EEG ISCHL STROM</p>
                <a href="https://ischlstrom.org">https://ischlstrom.org</a>
            `,
        };

        try {
            const result = await relayHtml(mailOptions.from, mailOptions.to, mailOptions.subject, mailOptions.html);

            console.log(`reminder email for point ${member.pointId}: ${result.message}`);

            if (result.message === "OK") {
                await setActivationReminderSent(member.pointId);
            }

        } catch (error) {
            console.error(`Failed to send reminder email for point ${member.pointId}:`, error?.message ?? error);
        }
    }
}


// getMembersWithPendingMeasurementPointsForSecondReminder
// send only to admin as a test and reminder

export async function checkActivationReminders() {


    let pendingActivations = await getMembersWithPendingMeasurementPointsForSecondReminder();
    //pendingActivations = pendingActivations.slice(0, 2); // Limit to 2 for testing purposes

    // Iterate and send emails
    for (const member of pendingActivations) {

        const mailOptions = {
            from: `"EEG ISCHLSTROM" <info@ischlstrom.org>`,
            to: "info@ischlstrom.org",
            subject: `Auf Erinnerung nicht reagiert ${member.pointIdentifier}`,
            html: `
                <p>Hallo Vorstand,</p>

                <p>
                 ${member.email} hat auf erinnerung nicht reagiert. Nur zur Info
                </p>

                <p>
                Betreffender Zählpunkt: ${member.pointIdentifier}
                </p>                
            `,
        };

        try {
            const result = await relayHtml(mailOptions.from, mailOptions.to, mailOptions.subject, mailOptions.html);

            console.log(`check reminder for point ${member.pointId}: ${result.message}`);

        } catch (error) {
            console.error(`Failed to send check reminder for point ${member.pointId}:`, error?.message ?? error);
        }
    }
}