// @ts-nocheck
import { json } from "@sveltejs/kit";
import { SMTP_USER, SMTP_PWD, SMTP_ENDPOINT, SMTP_TLS_PORT } from "$env/static/private";
import nodemailer from 'nodemailer';

//TODO: factor out relay
export async function relay(originEmail, subject, message) {
    let transporter = nodemailer.createTransport({
        host: SMTP_ENDPOINT,
        port: SMTP_TLS_PORT,
        secure: true, // use TLS
        auth: {
            user: SMTP_USER,
            pass: SMTP_PWD,
        },
    });

    transporter.verify(function (error, success) {
        if (error) {
            console.log(error);
        } else {
            console.log("Server is ready to take our messages");
        }
    });


    var mailMessage = {
        from: "info@ischlstrom.org",
        to: "info@ischlstrom.org",
        subject: subject,
        text: JSON.stringify(message)
    };

    await transporter.sendMail(mailMessage);


    let result = { message: "OK" };

    return json(result);
}

export async function relayDebug(subject, message) {
    let transporter = nodemailer.createTransport({
        host: SMTP_ENDPOINT,
        port: SMTP_TLS_PORT,
        secure: true, // use TLS
        auth: {
            user: SMTP_USER,
            pass: SMTP_PWD,
        },
    });

    transporter.verify(function (error, success) {
        if (error) {
            console.log(error);
        } else {
            console.log("Server is ready to take our messages");
        }
    });


    var mailMessage = {
        from: "info@ischlstrom.org",
        to: "info@ischlstrom.org",
        subject: subject,
        text: JSON.stringify(message)
    };

    await transporter.sendMail(mailMessage);


    let result = { message: "OK" };

    return json(result);
}

export async function relayHtml(originEmail, recipientEmail, subject, html) {
    let transporter = nodemailer.createTransport({
        host: SMTP_ENDPOINT,
        port: SMTP_TLS_PORT,
        secure: true, // use TLS
        auth: {
            user: SMTP_USER,
            pass: SMTP_PWD,
        },
    });

    transporter.verify(function (error, success) {
        if (error) {
            console.log(error);
        } else {
            console.log("Server is ready to take our messages");
        }
    });


    var mailMessage = {
        from: originEmail,
        to: recipientEmail,
        cc: originEmail,
        subject: subject,
        html: html
    };


    let result = {};

    try {
        let info = await transporter.sendMail(mailMessage);
        console.log("Email sent: " + info.response);
        result = { message: "OK" };
    } catch (error) {
        // nur die Fehlermeldung loggen, Nodemailer-Fehlerobjekte enthalten den
        // kompletten Umschlag samt Empfaengeradresse
        console.error("Error sending email: ", error?.message ?? error);
        result = { message: "Error sending email", error: error };
    }

    return result;
}

export async function relayContactForm(email, message) {


    let transporter = nodemailer.createTransport({
        host: SMTP_ENDPOINT,
        port: SMTP_TLS_PORT,
        secure: true, // use TLS
        auth: {
            user: SMTP_USER,
            pass: SMTP_PWD,
        },
    });

    transporter.verify(function (error, success) {
        if (error) {
            console.log(error);
        } else {
            console.log("Server is ready to take our messages");
        }
    });


    var mailMessage = {
        from: "info@ischlstrom.org",
        to: "info@ischlstrom.org",
        subject: "EEG Kontaktaufnahme von " + email,
        text: JSON.stringify(message)
    };

    await transporter.sendMail(mailMessage);


    let result = { message: "OK" };

    return json(result);

}

// Interne Benachrichtigung an den Vorstand (info@ischlstrom.org), reiner
// Text. Wirft bei Versandfehler - der Aufrufer entscheidet, ob er es spaeter
// erneut versucht (der Offline-Alarm markiert die Anlage erst danach).
export async function relayPlain(subject, text) {
    let transporter = nodemailer.createTransport({
        host: SMTP_ENDPOINT,
        port: SMTP_TLS_PORT,
        secure: true, // use TLS
        auth: {
            user: SMTP_USER,
            pass: SMTP_PWD,
        },
    });

    await transporter.sendMail({
        from: "info@ischlstrom.org",
        to: "info@ischlstrom.org",
        subject: subject,
        text: text
    });
}

// Serienmail an ein Mitglied (monatlicher Energiebericht): HTML plus
// Textfassung, bewusst ohne cc an info@ (sonst landet je Mitglied eine Kopie
// im Vorstandspostfach). Wirft bei Versandfehler - der Aufrufer protokolliert
// den Versand erst danach.
export async function relayMemberMail(recipientEmail, subject, html, text, attachments = []) {
    let transporter = nodemailer.createTransport({
        host: SMTP_ENDPOINT,
        port: SMTP_TLS_PORT,
        secure: true, // use TLS
        auth: {
            user: SMTP_USER,
            pass: SMTP_PWD,
        },
    });

    await transporter.sendMail({
        from: `"EEG ISCHLSTROM" <info@ischlstrom.org>`,
        to: recipientEmail,
        subject: subject,
        html: html,
        text: text,
        attachments: attachments
    });
}
